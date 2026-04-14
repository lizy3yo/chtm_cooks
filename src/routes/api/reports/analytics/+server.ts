/**
 * GET /api/reports/analytics
 *
 * Role-based analytics endpoint for staff dashboards.
 * Aggregates data from borrow_requests, replacement_obligations, donations,
 * and inventory_items into a single analytics payload.
 *
 * Query params:
 *   period  — "week" | "month" | "semester" (default: "month")
 *   from    — ISO date string override (optional)
 *   to      — ISO date string override (optional)
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDatabase } from '$lib/server/db/mongodb';
import { ObjectId } from 'mongodb';
import { getUserFromToken } from '$lib/server/middleware/auth/verify';
import { rateLimit, RateLimitPresets } from '$lib/server/middleware/rateLimit';
import { cacheService } from '$lib/server/cache';
import { logger } from '$lib/server/utils/logger';
import { parallelAggregations, ANALYTICS_AGGREGATION_OPTIONS } from '$lib/server/utils/queryOptimizer';
import { UserRole, type User } from '$lib/server/models/User';

const ANALYTICS_CACHE_TAG = 'reports-analytics';
const CACHE_TTL = 3600; // 1 hour - aligned with session timeout
const ANALYTICS_CACHE_VERSION = 'v7';
const TRUST_SCORE_STUDENT_LIMIT = 50; // Reduced from 200 for faster analytics response.

const ALLOWED_ROLES = new Set(['instructor', 'custodian', 'superadmin']);

type TrustScoreRow = {
	_id: string;
	studentName: string;
	studentEmail: string;
	profilePhotoUrl: string | null;
	trustScore: number;
	trustTier: string;
	trustTierLabel: string;
	totalPenalties: number;
	totalBonuses: number;
	requestsTotal: number;
	requestsReturned: number;
	activeObligations: number;
	dataQuality: {
		inspectionCoverage: number;
		returnTimestampCoverage: number;
		inspectedReturnCount: number;
		returnedCount: number;
	};
	duplicateCount?: number;
};

type BorrowRequestLite = {
	studentId?: unknown;
	status?: string;
	approvedAt?: Date | null;
	returnedAt?: Date | null;
	returnDate?: Date | null;
	items?: Array<{
		inspection?: {
			status?: string;
		};
	}>;
};

type ReplacementObligationLite = {
	studentId?: unknown;
	status?: string;
};

type BatchedTrustStats = {
	trustScore: number;
	trustTier: string;
	trustTierLabel: string;
	totalPenalties: number;
	totalBonuses: number;
	requestsTotal: number;
	requestsReturned: number;
	activeObligations: number;
	dataQuality: {
		inspectionCoverage: number;
		returnTimestampCoverage: number;
		inspectedReturnCount: number;
		returnedCount: number;
	};
};

function getPeriodRange(period: string, from?: string, to?: string): { start: Date; end: Date } {
	const end = to ? new Date(to) : new Date();
	end.setHours(23, 59, 59, 999);

	if (from) {
		const start = new Date(from);
		start.setHours(0, 0, 0, 0);
		return { start, end };
	}

	const start = new Date(end);
	if (period === 'week') {
		start.setDate(start.getDate() - 7);
	} else if (period === 'semester') {
		start.setMonth(start.getMonth() - 6);
	} else {
		// default: month
		start.setMonth(start.getMonth() - 1);
	}
	start.setHours(0, 0, 0, 0);
	return { start, end };
}

function trustTierFromScore(score: number): { tier: string; label: string } {
	if (score >= 90) return { tier: 'excellent', label: 'Excellent' };
	if (score >= 75) return { tier: 'good', label: 'Good Standing' };
	if (score >= 60) return { tier: 'fair', label: 'Fair' };
	if (score >= 40) return { tier: 'poor', label: 'Poor' };
	return { tier: 'critical', label: 'Critical' };
}

function computeTrustStatsForStudent(
	requests: BorrowRequestLite[],
	obligations: ReplacementObligationLite[]
): BatchedTrustStats {
	let missingItemPenalty = 0;
	let damagedItemPenalty = 0;
	let lateReturnPenalty = 0;
	let cancelledAfterApprovalPenalty = 0;
	let pendingObligationPenalty = 0;
	let cleanReturnBonus = 0;
	let resolvedObligationBonus = 0;

	let requestsReturned = 0;
	let returnedCount = 0;
	let inspectedReturnCount = 0;
	let returnTimestampCoverageCount = 0;

	for (const req of requests) {
		const status = req.status ?? '';
		if (status === 'returned') {
			requestsReturned += 1;
			returnedCount += 1;
		}

		// Check for cancelled after approval (before terminal status check)
		if (status === 'cancelled' && req.approvedAt) {
			cancelledAfterApprovalPenalty += 3;
		}

		const isTerminal = status === 'returned' || status === 'missing';
		if (!isTerminal) continue;

		const items = req.items ?? [];
		let hasIssue = false;
		let allItemsInspected = items.length > 0;
		let allInspectionsGood = items.length > 0;

		for (const item of items) {
			const inspection = item.inspection;
			if (!inspection) {
				allItemsInspected = false;
				allInspectionsGood = false;
				continue;
			}

			inspectedReturnCount += 1;

			if (inspection.status === 'missing') {
				missingItemPenalty += 15;
				hasIssue = true;
				allInspectionsGood = false;
			} else if (inspection.status === 'damaged') {
				damagedItemPenalty += 10;
				hasIssue = true;
				allInspectionsGood = false;
			} else if (inspection.status !== 'good') {
				allInspectionsGood = false;
			}
		}

		let returnedOnTime = false;
		if (status === 'returned' && req.returnedAt && req.returnDate) {
			returnTimestampCoverageCount += 1;
			const returnedAt = new Date(req.returnedAt);
			const dueDate = new Date(req.returnDate);
			if (returnedAt > dueDate) {
				const daysLate = Math.ceil((returnedAt.getTime() - dueDate.getTime()) / 86_400_000);
				lateReturnPenalty += Math.min(daysLate * 2, 15);
				hasIssue = true;
			} else {
				returnedOnTime = true;
			}
		}

		if (
			status === 'returned' &&
			returnedOnTime &&
			allItemsInspected &&
			allInspectionsGood &&
			!hasIssue
		) {
			cleanReturnBonus += 3;
		}
	}

	let activeObligations = 0;
	for (const obl of obligations) {
		if (obl.status === 'pending') {
			pendingObligationPenalty += 3;
			activeObligations += 1;
		} else if (obl.status === 'replaced' || obl.status === 'waived') {
			resolvedObligationBonus += 2;
		}
	}

	const totalPenalties =
		missingItemPenalty +
		damagedItemPenalty +
		lateReturnPenalty +
		cancelledAfterApprovalPenalty +
		pendingObligationPenalty;
	const totalBonuses = cleanReturnBonus + resolvedObligationBonus;
	const trustScore = Math.max(0, Math.min(100, 100 - totalPenalties + totalBonuses));
	const trustTier = trustTierFromScore(trustScore);

	return {
		trustScore,
		trustTier: trustTier.tier,
		trustTierLabel: trustTier.label,
		totalPenalties,
		totalBonuses,
		requestsTotal: requests.length,
		requestsReturned,
		activeObligations,
		dataQuality: {
			inspectionCoverage:
				returnedCount > 0
					? Math.round((inspectedReturnCount / returnedCount) * 100)
					: 100,
			returnTimestampCoverage:
				returnedCount > 0
					? Math.round((returnTimestampCoverageCount / returnedCount) * 100)
					: 100,
			inspectedReturnCount,
			returnedCount
		}
	};
}

export const GET: RequestHandler = async (event) => {
	const requestStart = Date.now();
	logger.info('reports-analytics', 'Analytics request started');
	
	const rateLimitResult = await rateLimit(event, RateLimitPresets.API);
	if (rateLimitResult instanceof Response) return rateLimitResult;

	try {
		const user = getUserFromToken(event);
		if (!user) return json({ error: 'Unauthorized' }, { status: 401 });
		if (!ALLOWED_ROLES.has(user.role)) return json({ error: 'Forbidden' }, { status: 403 });

		const url = new URL(event.request.url);
		const period = url.searchParams.get('period') || 'month';
		const from = url.searchParams.get('from') || undefined;
		const to = url.searchParams.get('to') || undefined;
		const skipCache = url.searchParams.has('_t');

		logger.info('reports-analytics', 'Request params', { period, from, to, skipCache });

		if (!['week', 'month', 'semester'].includes(period)) {
			return json({ error: 'Invalid period. Use week, month, or semester.' }, { status: 400 });
		}

		const { start, end } = getPeriodRange(period, from, to);
		const cacheKey = `reports:analytics:${ANALYTICS_CACHE_VERSION}:${period}:${start.toISOString()}:${end.toISOString()}`;

		if (!skipCache) {
			const cached = await cacheService.get(cacheKey);
			if (cached) {
				logger.info('reports-analytics', 'Cache hit - returning cached data', { duration: Date.now() - requestStart });
				return json(cached);
			}
		}

		logger.info('reports-analytics', 'Cache miss, querying database');
		const db = await getDatabase();
		const borrowRequests = db.collection('borrow_requests');
		const obligations = db.collection('replacement_obligations');
		const donationsCol = db.collection('donations');
		const inventory = db.collection('inventory_items');
		const inventoryHistory = db.collection('inventory_history');

		const now = new Date();
		
		const queryStartTime = Date.now();
		logger.info('reports-analytics', 'Starting parallel queries');

		// ── 1. Borrow Request Operations (Parallel Execution) ────────────────

		// Execute borrow request queries in parallel for better performance
		logger.info('reports-analytics', 'Executing borrow request queries');
		const borrowQueryStart = Date.now();
		const borrowRequestData = await parallelAggregations<{
			requestsOverTime: any[];
			statusBreakdown: any[];
			turnaroundPipeline: any[];
			peakHeatmap: any[];
		}>({
			requestsOverTime: {
				name: 'requestsOverTime',
				promise: borrowRequests.aggregate([
					{ $match: { createdAt: { $gte: start, $lte: end } } },
					{
						$group: {
							_id: {
								year: { $year: '$createdAt' },
								month: { $month: '$createdAt' },
								day: { $dayOfMonth: '$createdAt' }
							},
							count: { $sum: 1 }
						}
					},
					{ $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1 } },
					{ $limit: 366 }
				], ANALYTICS_AGGREGATION_OPTIONS).toArray()
			},
			statusBreakdown: {
				name: 'statusBreakdown',
				promise: borrowRequests.aggregate([
					{ $match: { createdAt: { $gte: start, $lte: end } } },
					{ $group: { _id: '$status', count: { $sum: 1 } } }
				], ANALYTICS_AGGREGATION_OPTIONS).toArray()
			},
			turnaroundPipeline: {
				name: 'turnaroundPipeline',
				promise: borrowRequests.aggregate([
					{
						$match: {
							createdAt: { $gte: start, $lte: end },
							returnedAt: { $exists: true }
						}
					},
					{
						$project: {
							approvalTime: {
								$cond: [
									{ $and: [{ $ifNull: ['$approvedAt', false] }, { $ifNull: ['$createdAt', false] }] },
									{ $divide: [{ $subtract: ['$approvedAt', '$createdAt'] }, 3600000] },
									null
								]
							},
							releaseTime: {
								$cond: [
									{ $and: [{ $ifNull: ['$releasedAt', false] }, { $ifNull: ['$approvedAt', false] }] },
									{ $divide: [{ $subtract: ['$releasedAt', '$approvedAt'] }, 3600000] },
									null
								]
							},
							returnTime: {
								$cond: [
									{ $and: [{ $ifNull: ['$returnedAt', false] }, { $ifNull: ['$releasedAt', false] }] },
									{ $divide: [{ $subtract: ['$returnedAt', '$releasedAt'] }, 3600000] },
									null
								]
							}
						}
					},
					{
						$group: {
							_id: null,
							avgApprovalHours: { $avg: '$approvalTime' },
							avgReleaseHours: { $avg: '$releaseTime' },
							avgReturnHours: { $avg: '$returnTime' }
						}
					}
				], ANALYTICS_AGGREGATION_OPTIONS).toArray()
			},
			peakHeatmap: {
				name: 'peakHeatmap',
				promise: borrowRequests.aggregate([
					{ $match: { createdAt: { $gte: start, $lte: end } } },
					{
						$group: {
							_id: {
								dayOfWeek: { $dayOfWeek: '$createdAt' },
								hour: { $hour: '$createdAt' }
							},
							count: { $sum: 1 }
						}
					},
					{ $sort: { '_id.dayOfWeek': 1, '_id.hour': 1 } },
					{ $limit: 168 }
				], ANALYTICS_AGGREGATION_OPTIONS).toArray()
			}
		});
		logger.info('reports-analytics', 'Borrow request queries completed', { duration: Date.now() - borrowQueryStart });

		const requestsOverTime = borrowRequestData.requestsOverTime;
		const statusBreakdown = borrowRequestData.statusBreakdown;
		const turnaroundPipeline = borrowRequestData.turnaroundPipeline;
		const peakHeatmap = borrowRequestData.peakHeatmap;

		// Overdue returns (separate queries due to different match criteria)
		logger.info('reports-analytics', 'Querying overdue requests');
		const overdueStart = Date.now();
		const overdueCount = await borrowRequests.countDocuments({
			status: 'borrowed',
			returnDate: { $lt: now }
		});

		const overdueRequests = await borrowRequests.aggregate([
			{ $match: { status: 'borrowed', returnDate: { $lt: now } } },
			{
				$lookup: {
					from: 'users',
					localField: 'studentId',
					foreignField: '_id',
					as: 'studentDoc'
				}
			},
			{ $unwind: { path: '$studentDoc', preserveNullAndEmptyArrays: true } },
			{
				$project: {
					_id: { $toString: '$_id' },
					studentName: {
						$concat: [
							{ $ifNull: ['$studentDoc.firstName', ''] },
							' ',
							{ $ifNull: ['$studentDoc.lastName', ''] }
						]
					},
					returnDate: 1,
					daysOverdue: {
						$divide: [{ $subtract: [now, '$returnDate'] }, 86400000]
					},
					itemCount: { $size: '$items' }
				}
			},
			{ $sort: { daysOverdue: -1 } },
			{ $limit: 20 }
		], ANALYTICS_AGGREGATION_OPTIONS).toArray();
		logger.info('reports-analytics', 'Overdue queries completed', { duration: Date.now() - overdueStart });

		// ── Enhanced Borrowing Analytics (Optimized) ──────────────────────────────────────

		// Calculate time boundaries once
		const todayStart = new Date(now);
		todayStart.setHours(0, 0, 0, 0);
		
		const last7DaysStart = new Date(now);
		last7DaysStart.setDate(last7DaysStart.getDate() - 7);
		last7DaysStart.setHours(0, 0, 0, 0);

		const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
		monthStart.setHours(0, 0, 0, 0);

		// Parallel execution of borrowing analytics queries
		logger.info('reports-analytics', 'Executing borrowing analytics queries');
		const borrowingAnalyticsStart = Date.now();
		const borrowingAnalyticsData = await parallelAggregations<{
			itemsBorrowed: any[];
			borrowers: any[];
			borrowingAverages: any[];
		}>({
			itemsBorrowed: {
				name: 'itemsBorrowed',
				promise: borrowRequests.aggregate([
					{ $match: { createdAt: { $gte: start, $lte: end } } },
					{ $unwind: '$items' },
					{
						$group: {
							_id: '$items.itemId',
							name: { $first: '$items.name' },
							category: { $first: '$items.category' },
							totalQuantity: { $sum: '$items.quantity' },
							borrowCount: { $sum: 1 }
						}
					},
					{ $sort: { totalQuantity: -1 } }
				], { allowDiskUse: true }).toArray()
			},
			borrowers: {
				name: 'borrowers',
				promise: borrowRequests.aggregate([
					{ $match: { createdAt: { $gte: start, $lte: end } } },
					{
						$group: {
							_id: '$studentId',
							requestCount: { $sum: 1 },
							totalItems: { $sum: { $size: '$items' } }
						}
					},
					{
						$lookup: {
							from: 'users',
							localField: '_id',
							foreignField: '_id',
							as: 'studentDoc'
						}
					},
					{ $unwind: { path: '$studentDoc', preserveNullAndEmptyArrays: true } },
					{
						$project: {
							_id: { $toString: '$_id' },
							studentName: {
								$concat: [
									{ $ifNull: ['$studentDoc.firstName', ''] },
									' ',
									{ $ifNull: ['$studentDoc.lastName', ''] }
								]
							},
							studentEmail: { $ifNull: ['$studentDoc.email', 'N/A'] },
							requestCount: 1,
							totalItems: 1
						}
					},
					{ $sort: { requestCount: -1 } }
				], { allowDiskUse: true }).toArray()
			},
			borrowingAverages: {
				name: 'borrowingAverages',
				promise: borrowRequests.aggregate([
					{ $match: { createdAt: { $gte: start, $lte: end } } },
					{
						$group: {
							_id: null,
							avgItemsPerRequest: { $avg: { $size: '$items' } },
							avgQuantityPerRequest: {
								$avg: {
									$sum: {
										$map: {
											input: '$items',
											as: 'item',
											in: '$$item.quantity'
										}
									}
								}
							},
							totalRequests: { $sum: 1 }
						}
					}
				], ANALYTICS_AGGREGATION_OPTIONS).toArray()
			}
		});

		const itemsBorrowed = borrowingAnalyticsData.itemsBorrowed;
		const borrowers = borrowingAnalyticsData.borrowers;
		const borrowingAverages = borrowingAnalyticsData.borrowingAverages;
		logger.info('reports-analytics', 'Borrowing analytics queries completed', { duration: Date.now() - borrowingAnalyticsStart });

		// ── Loss/Damage Analytics (Optimized with Parallel Execution) ─────────────────

		logger.info('reports-analytics', 'Executing loss and damage queries');
		const lossAndDamageStart = Date.now();
		const lossAndDamageData = await parallelAggregations<{
			lossAndDamageTracking: any[];
			lossAndDamageSummary: any[];
		}>({
			lossAndDamageTracking: {
				name: 'lossAndDamageTracking',
				promise: obligations.aggregate([
					{ $match: { incidentDate: { $gte: start, $lte: end } } },
					{
						$lookup: {
							from: 'borrow_requests',
							localField: 'borrowRequestId',
							foreignField: '_id',
							as: 'requestDoc'
						}
					},
					{ $unwind: { path: '$requestDoc', preserveNullAndEmptyArrays: true } },
					{
						$lookup: {
							from: 'users',
							localField: 'studentId',
							foreignField: '_id',
							as: 'studentDoc'
						}
					},
					{ $unwind: { path: '$studentDoc', preserveNullAndEmptyArrays: true } },
					{
						$project: {
							_id: { $toString: '$_id' },
							type: 1,
							status: 1,
							itemName: 1,
							itemCategory: 1,
							amount: 1,
							amountPaid: 1,
							incidentDate: 1,
							resolutionDate: 1,
							resolutionType: 1,
							studentName: {
								$concat: [
									{ $ifNull: ['$studentDoc.firstName', ''] },
									' ',
									{ $ifNull: ['$studentDoc.lastName', ''] }
								]
							},
							requestId: { $toString: '$borrowRequestId' },
							requestStatus: '$requestDoc.status',
							requestCreatedAt: '$requestDoc.createdAt',
							requestReturnedAt: '$requestDoc.returnedAt',
							daysToResolve: {
								$cond: [
									{ $and: [{ $ifNull: ['$resolutionDate', false] }, { $ifNull: ['$incidentDate', false] }] },
									{ $divide: [{ $subtract: ['$resolutionDate', '$incidentDate'] }, 86400000] },
									null
								]
							}
						}
					},
					{ $sort: { incidentDate: -1 } },
					{ $limit: 30 }
				], { allowDiskUse: true }).toArray()
			},
			lossAndDamageSummary: {
				name: 'lossAndDamageSummary',
				promise: obligations.aggregate([
					// Use incident date index to reduce collection scope first
					{ $match: { incidentDate: { $gte: start, $lte: end } } },
					{
						$group: {
							_id: null,
							todayTotal: {
								$sum: {
									$cond: [
										{ $gte: ['$incidentDate', todayStart] },
										1,
										0
									]
								}
							},
							todayMissing: {
								$sum: {
									$cond: [
										{ $and: [{ $gte: ['$incidentDate', todayStart] }, { $eq: ['$type', 'missing'] }] },
										1,
										0
									]
								}
							},
							todayDamaged: {
								$sum: {
									$cond: [
										{ $and: [{ $gte: ['$incidentDate', todayStart] }, { $eq: ['$type', 'damaged'] }] },
										1,
										0
									]
								}
							},
							last7DaysTotal: {
								$sum: {
									$cond: [
										{ $gte: ['$incidentDate', last7DaysStart] },
										1,
										0
									]
								}
							},
							last7DaysMissing: {
								$sum: {
									$cond: [
										{ $and: [{ $gte: ['$incidentDate', last7DaysStart] }, { $eq: ['$type', 'missing'] }] },
										1,
										0
									]
								}
							},
							last7DaysDamaged: {
								$sum: {
									$cond: [
										{ $and: [{ $gte: ['$incidentDate', last7DaysStart] }, { $eq: ['$type', 'damaged'] }] },
										1,
										0
									]
								}
							},
							mtdTotal: {
								$sum: {
									$cond: [
										{ $gte: ['$incidentDate', monthStart] },
										1,
										0
									]
								}
							},
							mtdMissing: {
								$sum: {
									$cond: [
										{ $and: [{ $gte: ['$incidentDate', monthStart] }, { $eq: ['$type', 'missing'] }] },
										1,
										0
									]
								}
							},
							mtdDamaged: {
								$sum: {
									$cond: [
										{ $and: [{ $gte: ['$incidentDate', monthStart] }, { $eq: ['$type', 'damaged'] }] },
										1,
										0
									]
								}
							},
							periodTotal: {
								$sum: 1
							},
							periodMissing: {
								$sum: { $cond: [{ $eq: ['$type', 'missing'] }, 1, 0] }
							},
							periodDamaged: {
								$sum: { $cond: [{ $eq: ['$type', 'damaged'] }, 1, 0] }
							}
						}
					}
				], ANALYTICS_AGGREGATION_OPTIONS).toArray()
			}
		});

		const lossAndDamageTracking = lossAndDamageData.lossAndDamageTracking;
		const lossAndDamageSummary = lossAndDamageData.lossAndDamageSummary;
		logger.info('reports-analytics', 'Loss and damage queries completed', { duration: Date.now() - lossAndDamageStart });

		// ── 2. Inventory Utilization ──────────────────────────────────────────

		logger.info('reports-analytics', 'Executing inventory queries');
		const inventoryStart = Date.now();

		// Most borrowed items (by frequency in borrow requests within period)
		const mostBorrowedItems = await borrowRequests.aggregate([
			{ $match: { createdAt: { $gte: start, $lte: end } } },
			{ $unwind: '$items' },
			{
				$group: {
					_id: '$items.itemId',
					name: { $first: '$items.name' },
					category: { $first: '$items.category' },
					totalBorrows: { $sum: 1 },
					totalQuantity: { $sum: '$items.quantity' }
				}
			},
			{ $sort: { totalBorrows: -1 } },
			{ $limit: 10 }
		], { allowDiskUse: true }).toArray();

		// Date-scoped inventory activity derived from inventory_history
		const inventoryActivityByItem = await inventoryHistory.aggregate([
			{
				$match: {
					entityType: 'item',
					timestamp: { $gte: start, $lte: end }
				}
			},
			{
				$project: {
					entityId: 1,
					delta: {
						$subtract: [
							{ $ifNull: ['$metadata.newQuantity', { $ifNull: ['$metadata.previousQuantity', 0] }] },
							{ $ifNull: ['$metadata.previousQuantity', { $ifNull: ['$metadata.newQuantity', 0] }] }
						]
					}
				}
			},
			{
				$group: {
					_id: '$entityId',
					itemNetChange: { $sum: '$delta' },
					itemQuantityAdded: {
						$sum: {
							$cond: [{ $gt: ['$delta', 0] }, '$delta', 0]
						}
					},
					itemQuantityDeducted: {
						$sum: {
							$cond: [{ $lt: ['$delta', 0] }, { $abs: '$delta' }, 0]
						}
					}
				}
			}
		], ANALYTICS_AGGREGATION_OPTIONS).toArray();

		const touchedItemIds = inventoryActivityByItem
			.map((row: any) => row._id)
			.filter((id: unknown) => Boolean(id));

		const scopedInventoryMatch = touchedItemIds.length > 0
			? { archived: false, _id: { $in: touchedItemIds } }
			: { archived: false, _id: { $in: [] } };

		// Inventory totals scoped to selected date range activity
		const inventorySummary = await inventory.aggregate([
			{ $match: scopedInventoryMatch },
			{
				$group: {
					_id: null,
					currentCount: { $sum: { $ifNull: ['$quantity', 0] } },
					eomCount: { $sum: { $ifNull: ['$eomCount', 0] } },
					donations: { $sum: { $ifNull: ['$donations', 0] } },
					constantCount: { $sum: { $cond: [{ $eq: ['$isConstant', true] }, 1, 0] } },
					lowStockCount: {
						$sum: { $cond: [{ $in: ['$status', ['Low Stock', 'Out of Stock']] }, 1, 0] }
					},
					touchedItems: { $sum: 1 }
				}
			},
			{
				$addFields: {
					variance: { $subtract: ['$currentCount', '$eomCount'] }
				}
			}
		]).toArray();

		const constantItems = await inventory.aggregate([
			{ $match: { archived: false, isConstant: true } },
			{
				$project: {
					_id: { $toString: '$_id' },
					name: 1,
					category: 1,
					quantity: 1,
					eomCount: { $ifNull: ['$eomCount', 0] },
					donations: { $ifNull: ['$donations', 0] },
					status: 1,
					variance: { $subtract: ['$quantity', { $ifNull: ['$eomCount', 0] }] }
				}
			},
			{ $sort: { quantity: -1 } },
			{ $limit: 20 }
		]).toArray();

		// Items currently out (status = borrowed)
		const itemsCurrentlyOut = await borrowRequests.aggregate([
			{ $match: { status: 'borrowed' } },
			{ $unwind: '$items' },
			{
				$group: {
					_id: '$items.itemId',
					name: { $first: '$items.name' },
					category: { $first: '$items.category' },
					quantityOut: { $sum: '$items.quantity' }
				}
			},
			{ $sort: { quantityOut: -1 } },
			{ $limit: 20 },
			{
				$lookup: {
					from: 'inventory_items',
					localField: '_id',
					foreignField: '_id',
					as: 'inventoryDoc'
				}
			},
			{ $unwind: { path: '$inventoryDoc', preserveNullAndEmptyArrays: true } },
			{
				$project: {
					_id: { $toString: '$_id' },
					name: 1,
					category: 1,
					quantityOut: 1,
					totalStock: { $ifNull: ['$inventoryDoc.quantity', 0] }
				}
			}
		], { allowDiskUse: true }).toArray();

		// Items with highest damage/missing rate
		const damageRateItems = await borrowRequests.aggregate([
			{ $match: { createdAt: { $gte: start, $lte: end } } },
			{ $unwind: '$items' },
			{ $match: { 'items.inspection': { $exists: true } } },
			{
				$group: {
					_id: '$items.itemId',
					name: { $first: '$items.name' },
					category: { $first: '$items.category' },
					totalInspected: { $sum: 1 },
					damaged: {
						$sum: { $cond: [{ $eq: ['$items.inspection.status', 'damaged'] }, 1, 0] }
					},
					missing: {
						$sum: { $cond: [{ $eq: ['$items.inspection.status', 'missing'] }, 1, 0] }
					}
				}
			},
			{
				$addFields: {
					incidentRate: {
						$multiply: [
							{ $divide: [{ $add: ['$damaged', '$missing'] }, '$totalInspected'] },
							100
						]
					}
				}
			},
			{ $match: { totalInspected: { $gte: 2 } } },
			{ $sort: { incidentRate: -1 } },
			{ $limit: 10 }
		], { allowDiskUse: true }).toArray();

		// EOM variance (quantity vs eomCount)
		const eomVariance = await inventory.aggregate([
			{ $match: scopedInventoryMatch },
			{
				$project: {
					_id: { $toString: '$_id' },
					name: 1,
					category: 1,
					quantity: 1,
					eomCount: { $ifNull: ['$eomCount', 0] },
					variance: { $subtract: ['$quantity', { $ifNull: ['$eomCount', 0] }] }
				}
			},
			{ $match: { variance: { $ne: 0 } } },
			{ $addFields: { varianceAbs: { $abs: '$variance' } } },
			{ $sort: { varianceAbs: -1, variance: -1 } },
			{ $limit: 200 },
			{ $project: { varianceAbs: 0 } }
		]).toArray();

		const varianceDrivers = await borrowRequests.aggregate([
			{ $match: { createdAt: { $gte: start, $lte: end } } },
			{ $sort: { createdAt: -1 } },
			{ $unwind: '$items' },
			{
				$group: {
					_id: '$items.itemId',
					name: { $first: '$items.name' },
					category: { $first: '$items.category' },
					requestCount: { $sum: 1 },
					totalBorrowedQuantity: { $sum: '$items.quantity' },
					latestRequestId: { $first: '$_id' },
					latestRequestDate: { $first: '$createdAt' },
					latestRequestStatus: { $first: '$status' },
					latestStudentId: { $first: '$studentId' }
				}
			},
			{
				$lookup: {
					from: 'users',
					localField: 'latestStudentId',
					foreignField: '_id',
					as: 'studentDoc'
				}
			},
			{ $unwind: { path: '$studentDoc', preserveNullAndEmptyArrays: true } },
			{
				$project: {
					_id: { $toString: '$_id' },
					name: 1,
					category: 1,
					requestCount: 1,
					totalBorrowedQuantity: 1,
					latestRequestId: { $toString: '$latestRequestId' },
					latestRequestDate: 1,
					latestRequestStatus: 1,
					studentName: {
						$concat: [
							{ $ifNull: ['$studentDoc.firstName', ''] },
							' ',
							{ $ifNull: ['$studentDoc.lastName', ''] }
						]
					},
					studentEmail: { $ifNull: ['$studentDoc.email', 'N/A'] },
					studentProfilePhotoUrl: { $ifNull: ['$studentDoc.profilePhotoUrl', null] }
				}
			},
			{ $sort: { totalBorrowedQuantity: -1, requestCount: -1 } },
			{ $limit: 20 }
		]).toArray();

		// Low stock / out of stock alerts
		const stockAlerts = await inventory.aggregate([
			{ $match: { archived: false, status: { $in: ['Low Stock', 'Out of Stock'] } } },
			{
				$project: {
					_id: { $toString: '$_id' },
					name: 1,
					category: 1,
					quantity: 1,
					status: 1
				}
			},
			{ $sort: { quantity: 1 } },
			{ $limit: 20 }
		]).toArray();

		logger.info('reports-analytics', 'Inventory queries completed', { duration: Date.now() - inventoryStart });

		// ── 3. replacement Overview ─────────────────────────────────────────────

		logger.info('reports-analytics', 'Executing replacement obligation queries');
		const replacementStart = Date.now();

		// Outstanding vs collected (total)
		const replacementSummary = await obligations.aggregate([
			{
				$group: {
					_id: null,
					totalItemsPending: {
						$sum: {
							$cond: [
								{ $eq: ['$status', 'pending'] },
								{ $subtract: ['$amount', '$amountPaid'] },
								0
							]
						}
					},
					totalItemsReplaced: {
						$sum: { $cond: [{ $ne: ['$status', 'pending'] }, '$amountPaid', 0] }
					},
					totalObligations: { $sum: 1 },
					pendingCount: {
						$sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] }
					}
				}
			}
		]).toArray();

		// Resolution breakdown (paid / replaced / waived)
		const resolutionBreakdown = await obligations.aggregate([
			{ $match: { status: { $ne: 'pending' } } },
			{ $group: { _id: '$resolutionType', count: { $sum: 1 }, total: { $sum: '$amountPaid' } } }
		]).toArray();

		// Average days to resolve
		const avgResolutionDays = await obligations.aggregate([
			{
				$match: {
					status: { $ne: 'pending' },
					resolutionDate: { $exists: true },
					incidentDate: { $exists: true }
				}
			},
			{
				$group: {
					_id: null,
					avgDays: {
						$avg: {
							$divide: [{ $subtract: ['$resolutionDate', '$incidentDate'] }, 86400000]
						}
					}
				}
			}
		]).toArray();

		// Obligations by item category
		const obligationsByCategory = await obligations.aggregate([
			{
				$group: {
					_id: '$itemCategory',
					count: { $sum: 1 },
					totalAmount: { $sum: '$amount' },
					pendingAmount: {
						$sum: {
							$cond: [
								{ $eq: ['$status', 'pending'] },
								{ $subtract: ['$amount', '$amountPaid'] },
								0
							]
						}
					}
				}
			},
			{ $sort: { count: -1 } },
			{ $limit: 10 }
		]).toArray();

		// Monthly revenue from replacement payments (last 6 months)
		const sixMonthsAgo = new Date();
		sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

		const monthlyActivity = await obligations.aggregate([
			{
				$match: {
					status: { $ne: 'pending' },
					resolutionDate: { $gte: sixMonthsAgo }
				}
			},
			{
				$group: {
					_id: {
						year: { $year: '$resolutionDate' },
						month: { $month: '$resolutionDate' }
					},
					collected: { $sum: '$amountPaid' },
					count: { $sum: 1 }
				}
			},
			{ $sort: { '_id.year': 1, '_id.month': 1 } }
		]).toArray();

		// Donation totals — by item name (last 6 months)
		const donationTotals = await donationsCol.aggregate([
			{ $match: { createdAt: { $gte: sixMonthsAgo } } },
			{
				$group: {
					_id: {
						year: { $year: '$createdAt' },
						month: { $month: '$createdAt' },
						itemName: '$itemName'
					},
					count: { $sum: 1 },
					totalQuantity: { $sum: { $ifNull: ['$quantity', 0] } }
				}
			},
			{ $sort: { '_id.year': 1, '_id.month': 1 } },
			{ $limit: 100 } // Limit results for performance
		]).toArray();

		logger.info('reports-analytics', 'Replacement queries completed', { duration: Date.now() - replacementStart });

		// ── 4. Student Trust / Risk ───────────────────────────────────────────

		logger.info('reports-analytics', 'Executing student trust score queries (limit=' + TRUST_SCORE_STUDENT_LIMIT + ')');
		const trustScoreStart = Date.now();

		// Students with most active obligations
		const repeatOffenders = await obligations.aggregate([
			{ $match: { status: 'pending' } },
			{
				$group: {
					_id: '$studentId',
					activeObligations: { $sum: 1 },
					totalBalance: { $sum: { $subtract: ['$amount', '$amountPaid'] } }
				}
			},
			{
				$lookup: {
					from: 'users',
					localField: '_id',
					foreignField: '_id',
					as: 'studentDoc'
				}
			},
			{ $unwind: { path: '$studentDoc', preserveNullAndEmptyArrays: true } },
			{
				$project: {
					_id: { $toString: '$_id' },
					studentName: {
						$concat: [
							{ $ifNull: ['$studentDoc.firstName', ''] },
							' ',
							{ $ifNull: ['$studentDoc.lastName', ''] }
						]
					},
					studentEmail: { $ifNull: ['$studentDoc.email', 'N/A'] },
					profilePhotoUrl: { $ifNull: ['$studentDoc.profilePhotoUrl', null] },
					activeObligations: 1,
					totalBalance: 1
				}
			},
			{ $sort: { activeObligations: -1 } },
			{ $limit: 10 }
		]).toArray();

		// Students with highest incident rate (damage/missing)
		const highIncidentStudents = await obligations.aggregate([
			{ $match: { incidentDate: { $gte: start, $lte: end } } },
			{
				$group: {
					_id: '$studentId',
					incidents: { $sum: 1 },
					missingCount: {
						$sum: { $cond: [{ $eq: ['$type', 'missing'] }, 1, 0] }
					},
					damagedCount: {
						$sum: { $cond: [{ $eq: ['$type', 'damaged'] }, 1, 0] }
					}
				}
			},
			{
				$lookup: {
					from: 'users',
					localField: '_id',
					foreignField: '_id',
					as: 'studentDoc'
				}
			},
			{ $unwind: { path: '$studentDoc', preserveNullAndEmptyArrays: true } },
			{
				$project: {
					_id: { $toString: '$_id' },
					studentName: {
						$concat: [
							{ $ifNull: ['$studentDoc.firstName', ''] },
							' ',
							{ $ifNull: ['$studentDoc.lastName', ''] }
						]
					},
					studentEmail: { $ifNull: ['$studentDoc.email', 'N/A'] },
					profilePhotoUrl: { $ifNull: ['$studentDoc.profilePhotoUrl', null] },
					incidents: 1,
					missingCount: 1,
					damagedCount: 1
				}
			},
			{ $sort: { incidents: -1 } },
			{ $limit: 10 }
		]).toArray();

		// Students with overdue returns
		const overdueStudents = await borrowRequests.aggregate([
			{ $match: { status: 'borrowed', returnDate: { $lt: now } } },
			{
				$group: {
					_id: '$studentId',
					overdueCount: { $sum: 1 },
					oldestDue: { $min: '$returnDate' }
				}
			},
			{
				$lookup: {
					from: 'users',
					localField: '_id',
					foreignField: '_id',
					as: 'studentDoc'
				}
			},
			{ $unwind: { path: '$studentDoc', preserveNullAndEmptyArrays: true } },
			{
				$project: {
					_id: { $toString: '$_id' },
					studentName: {
						$concat: [
							{ $ifNull: ['$studentDoc.firstName', ''] },
							' ',
							{ $ifNull: ['$studentDoc.lastName', ''] }
						]
					},
					studentEmail: { $ifNull: ['$studentDoc.email', 'N/A'] },
					profilePhotoUrl: { $ifNull: ['$studentDoc.profilePhotoUrl', null] },
					overdueCount: 1,
					oldestDue: 1,
					daysOverdue: {
						$divide: [{ $subtract: [now, '$oldestDue'] }, 86400000]
					}
				}
			},
			{ $sort: { daysOverdue: -1 } },
			{ $limit: 10 }
		]).toArray();

		// Trust scores are scoped to active students in the selected period.
		// This keeps dashboard latency predictable and avoids full-database scans.
		const activeStudentIds = await borrowRequests.aggregate([
			{ $match: { createdAt: { $gte: start, $lte: end }, studentId: { $exists: true } } },
			{ $group: { _id: '$studentId', latestRequest: { $max: '$createdAt' } } },
			{ $sort: { latestRequest: -1 } },
			{ $limit: TRUST_SCORE_STUDENT_LIMIT }
		], ANALYTICS_AGGREGATION_OPTIONS).toArray();

		const studentObjectIds = activeStudentIds
			.map((row) => row._id)
			.filter((id): id is ObjectId => id instanceof ObjectId);

		const studentRecords = await db.collection<User>('users')
			.find(
				{
					role: UserRole.STUDENT,
					...(studentObjectIds.length > 0 ? { _id: { $in: studentObjectIds } } : {})
				},
				{
					projection: {
						password: 0,
						emailVerificationToken: 0,
						passwordResetToken: 0
					}
				}
			)
			.sort({ updatedAt: -1, createdAt: -1, lastName: 1, firstName: 1 })
			.limit(TRUST_SCORE_STUDENT_LIMIT)
			.toArray();

		const [allStudentRequests, allStudentObligations] = await Promise.all([
			borrowRequests
				.find(
					{
						studentId: { $in: studentObjectIds },
						createdAt: { $gte: start, $lte: end }
					},
					{
						projection: {
							studentId: 1,
							status: 1,
							approvedAt: 1,
							returnedAt: 1,
							returnDate: 1,
							'items.inspection.status': 1
						}
					}
				)
				.toArray(),
			obligations
				.find(
					{ studentId: { $in: studentObjectIds } },
					{ projection: { studentId: 1, status: 1 } }
				)
				.toArray()
		]);

		const requestsByStudent = new Map<string, BorrowRequestLite[]>();
		for (const req of allStudentRequests as BorrowRequestLite[]) {
			if (!req.studentId) continue;
			const key = String(req.studentId);
			const bucket = requestsByStudent.get(key) ?? [];
			bucket.push(req);
			requestsByStudent.set(key, bucket);
		}

		const obligationsByStudent = new Map<string, ReplacementObligationLite[]>();
		for (const obl of allStudentObligations as ReplacementObligationLite[]) {
			if (!obl.studentId) continue;
			const key = String(obl.studentId);
			const bucket = obligationsByStudent.get(key) ?? [];
			bucket.push(obl);
			obligationsByStudent.set(key, bucket);
		}

		const trustScores = studentRecords.map((student) => {
			if (!student._id) return null;
			const studentId = student._id.toString();
			const stats = computeTrustStatsForStudent(
				requestsByStudent.get(studentId) ?? [],
				obligationsByStudent.get(studentId) ?? []
			);

			return {
				_id: studentId,
				studentName: `${student.firstName} ${student.lastName}`.trim() || 'Unknown',
				studentEmail: student.email,
				profilePhotoUrl: student.profilePhotoUrl ?? null,
				trustScore: stats.trustScore,
				trustTier: stats.trustTier,
				trustTierLabel: stats.trustTierLabel,
				totalPenalties: stats.totalPenalties,
				totalBonuses: stats.totalBonuses,
				requestsTotal: stats.requestsTotal,
				requestsReturned: stats.requestsReturned,
				activeObligations: stats.activeObligations,
				dataQuality: stats.dataQuality
			};
		}) as Array<TrustScoreRow | null>;

		const uniqueTrustScores = new Map<string, NonNullable<(typeof trustScores)[number]>>();
		for (const entry of trustScores) {
			if (!entry) continue;
			const key = entry.studentEmail.trim().toLowerCase();
			const existing = uniqueTrustScores.get(key);
			if (!existing) {
				uniqueTrustScores.set(key, { ...entry, duplicateCount: 1 });
				continue;
			}

			uniqueTrustScores.set(key, {
				...existing,
				duplicateCount: (existing.duplicateCount ?? 1) + 1,
				// Keep the newest record when duplicates exist so the report shows one canonical row per email.
				_id: existing._id,
				studentName: existing.studentName,
				studentEmail: existing.studentEmail,
				profilePhotoUrl: existing.profilePhotoUrl
			});
		}

		logger.info('reports-analytics', 'Student trust scores calculated', { duration: Date.now() - trustScoreStart, recordsCalculated: trustScores.length });

		// ── Assemble response ─────────────────────────────────────────────────

		logger.info('reports-analytics', 'Assembling response payload');
		const turnaround = turnaroundPipeline[0] ?? {};
		const replacement = replacementSummary[0] ?? { totalItemsPending: 0, totalItemsReplaced: 0, totalObligations: 0, pendingCount: 0 };

		const borrowingAvg = borrowingAverages[0] ?? { avgItemsPerRequest: 0, avgQuantityPerRequest: 0, totalRequests: 0 };
		const lossAndDamageSummaryData = lossAndDamageSummary[0] ?? {
			todayTotal: 0,
			todayMissing: 0,
			todayDamaged: 0,
			last7DaysTotal: 0,
			last7DaysMissing: 0,
			last7DaysDamaged: 0,
			mtdTotal: 0,
			mtdMissing: 0,
			mtdDamaged: 0,
			periodTotal: 0,
			periodMissing: 0,
			periodDamaged: 0
		};

		const response = {
			meta: {
				period,
				from: start.toISOString(),
				to: end.toISOString(),
				generatedAt: now.toISOString()
			},
			borrowRequests: {
				requestsOverTime: requestsOverTime.map((r: any) => ({
					date: `${r._id.year}-${String(r._id.month).padStart(2, '0')}-${String(r._id.day).padStart(2, '0')}`,
					count: r.count
				})),
				statusBreakdown: statusBreakdown.map((s: any) => ({ status: s._id, count: s.count })),
				turnaround: {
					avgApprovalHours: Math.round((turnaround.avgApprovalHours ?? 0) * 10) / 10,
					avgReleaseHours: Math.round((turnaround.avgReleaseHours ?? 0) * 10) / 10,
					avgReturnHours: Math.round((turnaround.avgReturnHours ?? 0) * 10) / 10
				},
				overdueCount,
				overdueRequests: overdueRequests.map((r: any) => ({
					...r,
					daysOverdue: Math.round(r.daysOverdue * 10) / 10
				})),
				peakHeatmap: peakHeatmap.map((p: any) => ({
					dayOfWeek: p._id.dayOfWeek,
					hour: p._id.hour,
					count: p.count
				})),
				// Enhanced borrowing analytics
				borrowingAverages: {
					avgItemsPerRequest: Math.round((borrowingAvg.avgItemsPerRequest ?? 0) * 10) / 10,
					avgQuantityPerRequest: Math.round((borrowingAvg.avgQuantityPerRequest ?? 0) * 10) / 10,
					totalRequests: borrowingAvg.totalRequests ?? 0
				},
				itemsBorrowed: itemsBorrowed.map((i: any) => ({
					id: i._id?.toString() ?? '',
					name: i.name,
					category: i.category,
					totalQuantity: i.totalQuantity,
					borrowCount: i.borrowCount
				})),
				borrowers: borrowers
			},
			lossAndDamage: {
				summary: lossAndDamageSummaryData,
				tracking: lossAndDamageTracking.map((item: any) => ({
					...item,
					daysToResolve: item.daysToResolve ? Math.round(item.daysToResolve * 10) / 10 : null
				}))
			},
			inventory: {
				summary: {
					currentCount: inventorySummary[0]?.currentCount ?? 0,
					eomCount: inventorySummary[0]?.eomCount ?? 0,
					variance: inventorySummary[0]?.variance ?? 0,
					donations: inventorySummary[0]?.donations ?? 0,
					constantCount: inventorySummary[0]?.constantCount ?? 0,
					lowStockCount: inventorySummary[0]?.lowStockCount ?? 0
				},
				constantItems: constantItems.map((item) => ({
					id: item._id?.toString() ?? '',
					name: item.name,
					category: item.category,
					quantity: item.quantity,
					eomCount: item.eomCount,
					variance: item.variance,
					donations: item.donations,
					status: item.status
				})),
				mostBorrowedItems: mostBorrowedItems.map((i) => ({
					id: i._id?.toString() ?? '',
					name: i.name,
					category: i.category,
					totalBorrows: i.totalBorrows,
					totalQuantity: i.totalQuantity
				})),
				itemsCurrentlyOut: itemsCurrentlyOut,
				damageRateItems: damageRateItems.map((i) => ({
					id: i._id?.toString() ?? '',
					name: i.name,
					category: i.category,
					totalInspected: i.totalInspected,
					damaged: i.damaged,
					missing: i.missing,
					incidentRate: Math.round(i.incidentRate * 10) / 10
				})),
				eomVariance,
				varianceDrivers: varianceDrivers.map((item) => ({
					id: item._id?.toString() ?? '',
					name: item.name,
					category: item.category,
					requestCount: item.requestCount,
					totalBorrowedQuantity: item.totalBorrowedQuantity,
					latestRequestId: item.latestRequestId,
					latestRequestDate: item.latestRequestDate,
					latestRequestStatus: item.latestRequestStatus,
					studentName: item.studentName,
					studentEmail: item.studentEmail,
					studentProfilePhotoUrl: item.studentProfilePhotoUrl
				})),
				stockAlerts
			},
			replacement: {
				summary: {
					totalItemsPending: replacement.totalItemsPending ?? 0,
					totalItemsReplaced: replacement.totalItemsReplaced ?? 0,
					totalObligations: replacement.totalObligations ?? 0,
					pendingCount: replacement.pendingCount ?? 0
				},
				resolutionBreakdown: resolutionBreakdown.map((r) => ({
					type: r._id,
					count: r.count,
					total: r.total,
					totalAmount: r.total
				})),
				avgResolutionDays: Math.round(((avgResolutionDays[0]?.avgDays ?? 0)) * 10) / 10,
				obligationsByCategory: obligationsByCategory.map((o) => ({
					category: o._id ?? 'Uncategorized',
					count: o.count,
					totalAmount: o.totalAmount,
					pendingAmount: o.pendingAmount
				})),
				monthlyActivity: monthlyActivity.map((m) => ({
					year: m._id.year,
					month: m._id.month,
					collected: m.collected,
					totalAmount: m.collected,
					count: m.count
				})),
				donationTotals: donationTotals.map((d) => ({
					year: d._id.year,
					month: d._id.month,
					itemName: d._id.itemName,
					count: d.count,
					totalQuantity: d.totalQuantity
				}))
			},
			studentRisk: {
				repeatOffenders,
				highIncidentStudents,
				overdueStudents: overdueStudents.map((s) => ({
					...s,
					daysOverdue: Math.round(s.daysOverdue * 10) / 10
				})),
				trustScores: [...uniqueTrustScores.values()]
			}
		};

		await cacheService.set(cacheKey, response, {
			ttl: CACHE_TTL,
			tags: [ANALYTICS_CACHE_TAG]
		});

		const totalDuration = Date.now() - requestStart;
		const queryDuration = Date.now() - queryStartTime;
		logger.info('reports-analytics', 'Analytics report generated and cached', {
			period,
			queryDuration,
			totalDuration,
			cacheKey
		});

		return json(response);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		logger.error('reports-analytics', 'Failed to generate analytics', { error: message });
		return json({ error: 'Failed to generate analytics report', detail: message }, { status: 500 });
	}
};

/**
 * GET /api/reports/analytics
 *
 * Custodian / superadmin analytics endpoint.
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
import { getUserFromToken } from '$lib/server/middleware/auth/verify';
import { rateLimit, RateLimitPresets } from '$lib/server/middleware/rateLimit';
import { cacheService } from '$lib/server/cache';
import { logger } from '$lib/server/utils/logger';
import { parallelAggregations, ANALYTICS_AGGREGATION_OPTIONS } from '$lib/server/utils/queryOptimizer';

const ANALYTICS_CACHE_TAG = 'reports-analytics';
const CACHE_TTL = 180; // 3 minutes - increased for better performance

const ALLOWED_ROLES = new Set(['custodian', 'superadmin']);

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

export const GET: RequestHandler = async (event) => {
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

		if (!['week', 'month', 'semester'].includes(period)) {
			return json({ error: 'Invalid period. Use week, month, or semester.' }, { status: 400 });
		}

		const { start, end } = getPeriodRange(period, from, to);
		const cacheKey = `reports:analytics:${period}:${start.toISOString()}:${end.toISOString()}`;

		if (!skipCache) {
			const cached = await cacheService.get(cacheKey);
			if (cached) return json(cached);
		}

		const db = await getDatabase();
		const borrowRequests = db.collection('borrow_requests');
		const obligations = db.collection('replacement_obligations');
		const donationsCol = db.collection('donations');
		const inventory = db.collection('inventory_items');

		const now = new Date();
		
		const queryStartTime = Date.now();

		// ── 1. Borrow Request Operations (Parallel Execution) ────────────────

		// Execute borrow request queries in parallel for better performance
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

		const requestsOverTime = borrowRequestData.requestsOverTime;
		const statusBreakdown = borrowRequestData.statusBreakdown;
		const turnaroundPipeline = borrowRequestData.turnaroundPipeline;
		const peakHeatmap = borrowRequestData.peakHeatmap;

		// Overdue returns (separate queries due to different match criteria)
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

		// ── 2. Inventory Utilization ──────────────────────────────────────────

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
					totalStock: { $ifNull: ['$inventoryDoc.quantity', 0] },
					condition: { $ifNull: ['$inventoryDoc.condition', 'Unknown'] }
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
			{ $match: { archived: false } },
			{
				$project: {
					_id: { $toString: '$_id' },
					name: 1,
					category: 1,
					quantity: 1,
					eomCount: { $ifNull: ['$eomCount', 0] },
					variance: { $subtract: ['$quantity', { $ifNull: ['$eomCount', 0] }] },
					condition: 1
				}
			},
			{ $sort: { variance: 1 } },
			{ $limit: 20 }
		]).toArray();

		// Condition distribution
		const conditionDistribution = await inventory.aggregate([
			{ $match: { archived: false } },
			{ $group: { _id: '$condition', count: { $sum: 1 } } }
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
					status: 1,
					condition: 1
				}
			},
			{ $sort: { quantity: 1 } },
			{ $limit: 20 }
		]).toArray();

		// ── 3. replacement Overview ─────────────────────────────────────────────

		// Outstanding vs collected (total)
		const replacementSummary = await obligations.aggregate([
			{
				$group: {
					_id: null,
					totalOutstanding: {
						$sum: {
							$cond: [
								{ $eq: ['$status', 'pending'] },
								{ $subtract: ['$amount', '$amountPaid'] },
								0
							]
						}
					},
					totalCollected: {
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

		const monthlyRevenue = await obligations.aggregate([
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

		// ── 4. Student Trust / Risk ───────────────────────────────────────────

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

		// Trust scores: clean returns / total completed borrows per student
		const trustScores = await borrowRequests.aggregate([
			{
				$match: {
					status: { $in: ['returned', 'missing', 'resolved'] },
					createdAt: { $gte: start, $lte: end }
				}
			},
			{ $unwind: '$items' },
			{
				$group: {
					_id: '$studentId',
					totalItems: { $sum: 1 },
					cleanItems: {
						$sum: {
							$cond: [
								{
									$or: [
										{ $eq: [{ $ifNull: ['$items.inspection', null] }, null] },
										{ $eq: ['$items.inspection.status', 'good'] }
									]
								},
								1,
								0
							]
						}
					}
				}
			},
			{
				$addFields: {
					trustScore: {
						$multiply: [
							{ $divide: ['$cleanItems', { $max: ['$totalItems', 1] }] },
							100
						]
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
					totalItems: 1,
					cleanItems: 1,
					trustScore: { $round: ['$trustScore', 1] }
				}
			},
			{ $match: { totalItems: { $gte: 3 } } },
			{ $sort: { trustScore: 1 } }, // lowest trust first
			{ $limit: 10 }
		]).toArray();

		// ── Assemble response ─────────────────────────────────────────────────

		const turnaround = turnaroundPipeline[0] ?? {};
		const replacement = replacementSummary[0] ?? { totalOutstanding: 0, totalCollected: 0, totalObligations: 0, pendingCount: 0 };

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
				}))
			},
			inventory: {
				mostBorrowedItems: mostBorrowedItems.map((i) => ({
					id: i._id?.toString() ?? '',
					name: i.name,
					category: i.category,
					totalBorrows: i.totalBorrows,
					totalQuantity: i.totalQuantity
				})),
				itemsCurrentlyOut,
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
				conditionDistribution: conditionDistribution.map((c) => ({ condition: c._id, count: c.count })),
				stockAlerts
			},
			replacement: {
				summary: {
					totalOutstanding: replacement.totalOutstanding ?? 0,
					totalCollected: replacement.totalCollected ?? 0,
					totalObligations: replacement.totalObligations ?? 0,
					pendingCount: replacement.pendingCount ?? 0
				},
				resolutionBreakdown: resolutionBreakdown.map((r) => ({
					type: r._id,
					count: r.count,
					total: r.total
				})),
				avgResolutionDays: Math.round(((avgResolutionDays[0]?.avgDays ?? 0)) * 10) / 10,
				obligationsByCategory: obligationsByCategory.map((o) => ({
					category: o._id ?? 'Uncategorized',
					count: o.count,
					totalAmount: o.totalAmount,
					pendingAmount: o.pendingAmount
				})),
				monthlyRevenue: monthlyRevenue.map((m) => ({
					year: m._id.year,
					month: m._id.month,
					collected: m.collected,
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
				trustScores
			}
		};

		await cacheService.set(cacheKey, response, {
			ttl: CACHE_TTL,
			tags: [ANALYTICS_CACHE_TAG]
		});

		const totalDuration = Date.now() - queryStartTime;
		logger.info('reports-analytics', 'Analytics report generated', {
			period,
			duration: totalDuration,
			cacheKey
		});

		return json(response);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		logger.error('reports-analytics', 'Failed to generate analytics', { error: message });
		return json({ error: 'Failed to generate analytics report', detail: message }, { status: 500 });
	}
};

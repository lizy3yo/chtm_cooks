/**
 * Student Statistics Service
 *
 * Enterprise-grade student analytics focused on what students need most:
 * - Trust score transparency (penalties + bonuses)
 * - Return discipline and item-care performance
 * - Current replacement risk and obligations
 * - Period-based activity trends and categories actually fulfilled
 * - Actionable insights (what to do next)
 */

import { getDatabase } from '$lib/server/db/mongodb';
import { ObjectId } from 'mongodb';
import type { Collection } from 'mongodb';
import type { BorrowRequest } from '$lib/server/models/BorrowRequest';
import type { ReplacementObligation } from '$lib/server/models/ReplacementObligation';

export type TrustTier = 'excellent' | 'good' | 'fair' | 'poor' | 'critical';
export type StatisticsPeriod = '7d' | '30d' | '90d' | '180d' | '365d' | 'all';

export interface TrustScoreBreakdown {
	missingItemPenalty: number;
	damagedItemPenalty: number;
	lateReturnPenalty: number;
	cancelledAfterApprovalPenalty: number;
	pendingObligationPenalty: number;
	cleanReturnBonus: number;
	resolvedObligationBonus: number;
}

export interface TrustScore {
	score: number;
	tier: TrustTier;
	tierLabel: string;
	breakdown: TrustScoreBreakdown;
	totalPenalties: number;
	totalBonuses: number;
}

export interface RequestStatistics {
	total: number;
	pending: number;
	active: number;
	returned: number;
	cancelled: number;
	rejected: number;
	missing: number;
}

export interface ReturnPerformance {
	totalReturned: number;
	onTime: number;
	late: number;
	unknown: number;
	onTimeRate: number | null;
	avgDaysLate: number;
	maxDaysLate: number;
}

export interface ItemHealthStats {
	totalInspected: number;
	goodCondition: number;
	damaged: number;
	missing: number;
	goodRate: number | null;
}

export interface ReplacementStats {
	totalObligations: number;
	pendingCount: number;
	resolvedCount: number;
	totalAmount: number;
	amountPaid: number;
	balance: number;
	periodIncurredAmount: number;
}

export interface ActivityMonth {
	month: string;
	label: string;
	requests: number;
	returned: number;
}

export interface CategoryStat {
	category: string;
	count: number;
	percentage: number;
}

export interface DataQuality {
	inspectionCoverage: number;
	returnTimestampCoverage: number;
	inspectedReturnCount: number;
	returnedCount: number;
}

export interface StudentInsight {
	id: string;
	severity: 'success' | 'info' | 'warning' | 'critical';
	title: string;
	description: string;
	actionLabel?: string;
	href?: string;
}

export interface StudentStatisticsData {
	period: StatisticsPeriod;
	periodLabel: string;
	chartGranularity: 'day' | 'month';
	trustScore: TrustScore;
	requests: RequestStatistics;
	returnPerformance: ReturnPerformance;
	itemHealth: ItemHealthStats;
	replacement: ReplacementStats;
	dataQuality: DataQuality;
	activityTimeline: ActivityMonth[];
	topCategories: CategoryStat[];
	insights: StudentInsight[];
	computedAt: string;
}

const BORROW_REQUESTS_COLLECTION = 'borrow_requests';
const REPLACEMENT_OBLIGATIONS_COLLECTION = 'replacement_obligations';
const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const PERIOD_CONFIG: Record<StatisticsPeriod, { label: string; days: number | null; timelineMonths: number }> = {
	'7d': { label: 'Last 7 Days', days: 7, timelineMonths: 1 },
	'30d': { label: 'Last 30 Days', days: 30, timelineMonths: 2 },
	'90d': { label: 'Last 90 Days', days: 90, timelineMonths: 3 },
	'180d': { label: 'Last 6 Months', days: 180, timelineMonths: 6 },
	'365d': { label: 'Last 12 Months', days: 365, timelineMonths: 12 },
	all: { label: 'All Time', days: null, timelineMonths: 12 }
};

function periodStart(period: StatisticsPeriod): Date | null {
	const cfg = PERIOD_CONFIG[period];
	if (!cfg || cfg.days === null) return null;
	const d = new Date();
	d.setHours(0, 0, 0, 0);
	d.setDate(d.getDate() - cfg.days);
	return d;
}

function filterByPeriod<T extends { createdAt: Date }>(rows: T[], start: Date | null): T[] {
	if (!start) return rows;
	return rows.filter((row) => new Date(row.createdAt) >= start);
}

function getTier(score: number): TrustTier {
	if (score >= 90) return 'excellent';
	if (score >= 75) return 'good';
	if (score >= 60) return 'fair';
	if (score >= 40) return 'poor';
	return 'critical';
}

function getTierLabel(score: number): string {
	if (score >= 90) return 'Excellent';
	if (score >= 75) return 'Good Standing';
	if (score >= 60) return 'Fair';
	if (score >= 40) return 'Poor';
	return 'Critical';
}

function computeTrustScore(allRequests: BorrowRequest[], allObligations: ReplacementObligation[]): TrustScore {
	const breakdown: TrustScoreBreakdown = {
		missingItemPenalty: 0,
		damagedItemPenalty: 0,
		lateReturnPenalty: 0,
		cancelledAfterApprovalPenalty: 0,
		pendingObligationPenalty: 0,
		cleanReturnBonus: 0,
		resolvedObligationBonus: 0
	};

	for (const req of allRequests) {
		const isTerminal = req.status === 'returned' || req.status === 'missing';
		if (!isTerminal) continue;

		let hasIssue = false;
		let allItemsInspected = req.items.length > 0;
		let allInspectionsGood = req.items.length > 0;

		for (const item of req.items) {
			if (!item.inspection) {
				allItemsInspected = false;
				allInspectionsGood = false;
				continue;
			}

			if (item.inspection.status === 'missing') {
				breakdown.missingItemPenalty += 15;
				hasIssue = true;
				allInspectionsGood = false;
			} else if (item.inspection.status === 'damaged') {
				breakdown.damagedItemPenalty += 10;
				hasIssue = true;
				allInspectionsGood = false;
			} else if (item.inspection.status !== 'good') {
				allInspectionsGood = false;
			}
		}

		let returnedOnTime = false;
		if (req.status === 'returned' && req.returnedAt && req.returnDate) {
			const returnedAt = new Date(req.returnedAt);
			const dueDate = new Date(req.returnDate);
			if (returnedAt > dueDate) {
				const daysLate = Math.ceil((returnedAt.getTime() - dueDate.getTime()) / 86_400_000);
				breakdown.lateReturnPenalty += Math.min(daysLate * 2, 15);
				hasIssue = true;
			} else {
				returnedOnTime = true;
			}
		}

		if (req.status === 'cancelled' && req.approvedAt) {
			breakdown.cancelledAfterApprovalPenalty += 3;
		}

		// Bonus is only granted when data is complete and clean.
		if (
			req.status === 'returned' &&
			returnedOnTime &&
			allItemsInspected &&
			allInspectionsGood &&
			!hasIssue
		) {
			breakdown.cleanReturnBonus += 3;
		}
	}

	for (const obl of allObligations) {
		if (obl.status === 'pending') {
			breakdown.pendingObligationPenalty += 3;
		} else if (obl.status === 'replaced' || obl.status === 'waived') {
			breakdown.resolvedObligationBonus += 2;
		}
	}

	const totalPenalties =
		breakdown.missingItemPenalty +
		breakdown.damagedItemPenalty +
		breakdown.lateReturnPenalty +
		breakdown.cancelledAfterApprovalPenalty +
		breakdown.pendingObligationPenalty;

	const totalBonuses = breakdown.cleanReturnBonus + breakdown.resolvedObligationBonus;
	const score = Math.max(0, Math.min(100, 100 - totalPenalties + totalBonuses));

	return { score, tier: getTier(score), tierLabel: getTierLabel(score), breakdown, totalPenalties, totalBonuses };
}

function computeRequestStats(requests: BorrowRequest[]): RequestStatistics {
	let pending = 0;
	let active = 0;
	let returned = 0;
	let cancelled = 0;
	let rejected = 0;
	let missing = 0;

	for (const r of requests) {
		switch (r.status) {
			case 'pending_instructor':
			case 'approved_instructor':
			case 'ready_for_pickup':
				pending++;
				break;
			case 'borrowed':
			case 'pending_return':
				active++;
				break;
			case 'returned':
				returned++;
				break;
			case 'cancelled':
				cancelled++;
				break;
			case 'rejected':
				rejected++;
				break;
			case 'missing':
				missing++;
				break;
		}
	}

	return { total: requests.length, pending, active, returned, cancelled, rejected, missing };
}

function computeReturnPerformance(requests: BorrowRequest[]): ReturnPerformance {
	const returned = requests.filter((r) => r.status === 'returned');
	let onTime = 0;
	let late = 0;
	let unknown = 0;
	let totalLateDays = 0;
	let maxDaysLate = 0;
	let eligible = 0;

	for (const req of returned) {
		if (!req.returnedAt || !req.returnDate) {
			unknown++;
			continue;
		}

		eligible++;
		const returnedAt = new Date(req.returnedAt);
		const dueDate = new Date(req.returnDate);

		if (returnedAt <= dueDate) {
			onTime++;
		} else {
			late++;
			const daysLate = Math.ceil((returnedAt.getTime() - dueDate.getTime()) / 86_400_000);
			totalLateDays += daysLate;
			if (daysLate > maxDaysLate) maxDaysLate = daysLate;
		}
	}

	return {
		totalReturned: returned.length,
		onTime,
		late,
		unknown,
		onTimeRate: eligible === 0 ? null : Math.round((onTime / eligible) * 100),
		avgDaysLate: late === 0 ? 0 : Math.round(totalLateDays / late),
		maxDaysLate
	};
}

function computeItemHealth(requests: BorrowRequest[]): ItemHealthStats {
	let goodCondition = 0;
	let damaged = 0;
	let missing = 0;
	let totalInspected = 0;

	for (const req of requests) {
		if (req.status !== 'returned' && req.status !== 'missing') continue;

		for (const item of req.items) {
			if (!item.inspection) continue;
			totalInspected++;
			switch (item.inspection.status) {
				case 'good':
					goodCondition++;
					break;
				case 'damaged':
					damaged++;
					break;
				case 'missing':
					missing++;
					break;
			}
		}
	}

	return {
		totalInspected,
		goodCondition,
		damaged,
		missing,
		goodRate: totalInspected === 0 ? null : Math.round((goodCondition / totalInspected) * 100)
	};
}

function computeReplacementStats(allObligations: ReplacementObligation[], periodObligations: ReplacementObligation[]): ReplacementStats {
	let pendingCount = 0;
	let resolvedCount = 0;
	let totalAmount = 0;
	let amountPaid = 0;

	for (const obl of allObligations) {
		totalAmount += obl.amount ?? 0;
		amountPaid += obl.amountPaid ?? 0;
		if (obl.status === 'pending') pendingCount++;
		else resolvedCount++;
	}

	const periodIncurredAmount = periodObligations.reduce((sum, obl) => sum + (obl.amount ?? 0), 0);

	return {
		totalObligations: allObligations.length,
		pendingCount,
		resolvedCount,
		totalAmount,
		amountPaid,
		balance: totalAmount - amountPaid,
		periodIncurredAmount
	};
}

function computeActivityTimeline(requests: BorrowRequest[], timelineMonths: number): ActivityMonth[] {
	const now = new Date();
	const months: ActivityMonth[] = [];

	for (let i = timelineMonths - 1; i >= 0; i--) {
		const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
		const year = date.getFullYear();
		const monthIdx = date.getMonth();
		months.push({
			month: `${year}-${String(monthIdx + 1).padStart(2, '0')}`,
			label: `${MONTHS_SHORT[monthIdx]} ${year}`,
			requests: 0,
			returned: 0
		});
	}

	const monthMap = new Map(months.map((m) => [m.month, m]));
	for (const req of requests) {
		const d = new Date(req.createdAt);
		const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
		const entry = monthMap.get(key);
		if (!entry) continue;
		entry.requests++;
		if (req.status === 'returned') entry.returned++;
	}

	return months;
}

function computeActivityTimelineDaily(requests: BorrowRequest[]): ActivityMonth[] {
	const now = new Date();
	now.setHours(23, 59, 59, 999);
	const days: ActivityMonth[] = [];
	for (let i = 6; i >= 0; i--) {
		const d = new Date(now);
		d.setDate(d.getDate() - i);
		const year = d.getFullYear();
		const month = d.getMonth() + 1;
		const day = d.getDate();
		const key = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
		days.push({
			month: key,
			label: DAYS_SHORT[d.getDay()],
			requests: 0,
			returned: 0
		});
	}
	const dayMap = new Map(days.map((d) => [d.month, d]));
	for (const req of requests) {
		const d = new Date(req.createdAt);
		const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
		const entry = dayMap.get(key);
		if (!entry) continue;
		entry.requests++;
		if (req.status === 'returned') entry.returned++;
	}
	return days;
}

function computeTopCategories(requests: BorrowRequest[]): CategoryStat[] {
	const fulfilledStatuses = new Set(['borrowed', 'pending_return', 'returned', 'missing']);
	const counts = new Map<string, number>();
	let total = 0;

	for (const req of requests) {
		if (!fulfilledStatuses.has(req.status)) continue;
		for (const item of req.items) {
			const category = item.category?.trim() || 'Uncategorised';
			counts.set(category, (counts.get(category) ?? 0) + item.quantity);
			total += item.quantity;
		}
	}

	return Array.from(counts.entries())
		.sort((a, b) => b[1] - a[1])
		.slice(0, 5)
		.map(([category, count]) => ({
			category,
			count,
			percentage: total === 0 ? 0 : Math.round((count / total) * 100)
		}));
}

function computeDataQuality(requests: BorrowRequest[]): DataQuality {
	const terminal = requests.filter((r) => r.status === 'returned' || r.status === 'missing');
	const returned = requests.filter((r) => r.status === 'returned');

	let terminalItems = 0;
	let inspectedItems = 0;
	for (const req of terminal) {
		terminalItems += req.items.length;
		for (const item of req.items) {
			if (item.inspection) inspectedItems++;
		}
	}

	let returnTimestampComplete = 0;
	for (const req of returned) {
		if (req.returnedAt && req.returnDate) returnTimestampComplete++;
	}

	return {
		inspectionCoverage: terminalItems === 0 ? 100 : Math.round((inspectedItems / terminalItems) * 100),
		returnTimestampCoverage: returned.length === 0 ? 100 : Math.round((returnTimestampComplete / returned.length) * 100),
		inspectedReturnCount: inspectedItems,
		returnedCount: returned.length
	};
}

function buildInsights(data: {
	trustScore: TrustScore;
	requests: RequestStatistics;
	returnPerformance: ReturnPerformance;
	replacement: ReplacementStats;
	dataQuality: DataQuality;
}): StudentInsight[] {
	const insights: StudentInsight[] = [];

	if (data.replacement.pendingCount > 0 || data.replacement.balance > 0) {
		insights.push({
			id: 'resolve-replacement-obligations',
			severity: data.replacement.balance > 0 ? 'critical' : 'warning',
			title: 'Resolve outstanding obligations',
			description: `You have ${data.replacement.pendingCount} pending obligation(s) with ${data.replacement.balance.toFixed(0)} outstanding balance.`,
			actionLabel: 'Review obligations',
			href: '/student/borrowed'
		});
	}

	if (data.returnPerformance.onTimeRate !== null && data.returnPerformance.onTimeRate < 80) {
		insights.push({
			id: 'improve-on-time-rate',
			severity: 'warning',
			title: 'Improve return punctuality',
			description: `Your on-time return rate is ${data.returnPerformance.onTimeRate}%. Returning items on time helps preserve your trust score.`
		});
	}

	if (data.trustScore.score >= 90) {
		insights.push({
			id: 'excellent-trust',
			severity: 'success',
			title: 'Excellent trust standing',
			description: 'You have an excellent reliability profile. Continue timely and careful returns.'
		});
	} else if (data.trustScore.score < 60) {
		insights.push({
			id: 'trust-recovery',
			severity: 'critical',
			title: 'Trust recovery needed',
			description: 'Your trust score is below 60. Focus on clean returns and resolving obligations to recover eligibility.'
		});
	}

	if (data.dataQuality.inspectionCoverage < 80 || data.dataQuality.returnTimestampCoverage < 90) {
		insights.push({
			id: 'data-quality-warning',
			severity: 'info',
			title: 'Some analytics are still stabilizing',
			description: 'A portion of historical requests has incomplete return metadata, so some rates may improve as records are completed.'
		});
	}

	if (insights.length === 0) {
		insights.push({
			id: 'healthy-profile',
			severity: 'success',
			title: 'Healthy borrowing profile',
			description: 'No major risk signals detected in your current statistics window.'
		});
	}

	return insights.slice(0, 4);
}

export async function computeStudentStatistics(
	studentId: string,
	period: StatisticsPeriod = '180d'
): Promise<StudentStatisticsData> {
	const db = await getDatabase();
	const studentObjectId = new ObjectId(studentId);

	const borrowCollection: Collection<BorrowRequest> = db.collection(BORROW_REQUESTS_COLLECTION);
	const obligationsCollection: Collection<ReplacementObligation> = db.collection(REPLACEMENT_OBLIGATIONS_COLLECTION);

	const [allRequests, allObligations] = await Promise.all([
		borrowCollection.find({ studentId: studentObjectId }).toArray(),
		obligationsCollection.find({ studentId: studentObjectId }).toArray()
	]);

	const cfg = PERIOD_CONFIG[period];
	const start = periodStart(period);
	const periodRequests = filterByPeriod(allRequests, start);
	const periodObligations = filterByPeriod(allObligations, start);

	const trustScore = computeTrustScore(allRequests, allObligations);
	const requests = computeRequestStats(periodRequests);
	const returnPerformance = computeReturnPerformance(periodRequests);
	const itemHealth = computeItemHealth(periodRequests);
	const replacement = computeReplacementStats(allObligations, periodObligations);
	const dataQuality = computeDataQuality(periodRequests);
	const chartGranularity: 'day' | 'month' = period === '7d' ? 'day' : 'month';
	const activityTimeline =
		period === '7d'
			? computeActivityTimelineDaily(periodRequests)
			: computeActivityTimeline(periodRequests, cfg.timelineMonths);
	const topCategories = computeTopCategories(periodRequests);
	const insights = buildInsights({ trustScore, requests, returnPerformance, replacement, dataQuality });

	return {
		period,
		periodLabel: cfg.label,
		chartGranularity,
		trustScore,
		requests,
		returnPerformance,
		itemHealth,
		replacement,
		dataQuality,
		activityTimeline,
		topCategories,
		insights,
		computedAt: new Date().toISOString()
	};
}


/**
 * Analytics Reports API Client
 * Client-side cache + SSE subscription for the custodian reports page.
 */

import { browser } from '$app/environment';

// â”€â”€ Types â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export type AnalyticsPeriod = 'week' | 'month' | 'semester';

export interface RequestsOverTimePoint {
	date: string;
	count: number;
}

export interface StatusBreakdownItem {
	status: string;
	count: number;
}

export interface TurnaroundStats {
	avgApprovalHours: number;
	avgReleaseHours: number;
	avgReturnHours: number;
}

export interface OverdueRequest {
	_id: string;
	studentName: string;
	returnDate: string;
	daysOverdue: number;
	itemCount: number;
}

export interface PeakHeatmapPoint {
	dayOfWeek: number; // 1=Sun â€¦ 7=Sat
	hour: number;
	count: number;
}

export interface MostBorrowedItem {
	id: string;
	name: string;
	category: string;
	totalBorrows: number;
	totalQuantity: number;
}

export interface ItemCurrentlyOut {
	_id: string;
	name: string;
	category: string;
	quantityOut: number;
	totalStock: number;
	condition: string;
}

export interface DamageRateItem {
	id: string;
	name: string;
	category: string;
	totalInspected: number;
	damaged: number;
	missing: number;
	incidentRate: number;
}

export interface EomVarianceItem {
	_id: string;
	name: string;
	category: string;
	quantity: number;
	eomCount: number;
	variance: number;
	condition: string;
}

export interface ConditionDistributionItem {
	condition: string;
	count: number;
}

export interface StockAlert {
	_id: string;
	name: string;
	category: string;
	quantity: number;
	status: string;
	condition: string;
}

export interface replacementntSummary {
	totalOutstanding: number;
	totalCollected: number;
	totalObligations: number;
	pendingCount: number;
}

export interface ResolutionBreakdownItem {
	type: string;
	count: number;
	total: number;
}

export interface ObligationByCategory {
	category: string;
	count: number;
	totalAmount: number;
	pendingAmount: number;
}

export interface MonthlyRevenuePoint {
	year: number;
	month: number;
	collected: number;
	count: number;
}

export interface DonationTotalPoint {
	year: number;
	month: number;
	itemName: string;
	count: number;
	totalQuantity: number;
}

export interface StudentRiskEntry {
	_id: string;
	studentName: string;
	studentEmail: string;
	profilePhotoUrl: string | null;
	activeObligations?: number;
	totalBalance?: number;
	incidents?: number;
	missingCount?: number;
	damagedCount?: number;
	overdueCount?: number;
	daysOverdue?: number;
	totalItems?: number;
	cleanItems?: number;
	trustScore?: number;
}

export interface AnalyticsReport {
	meta: {
		period: AnalyticsPeriod;
		from: string;
		to: string;
		generatedAt: string;
	};
	borrowRequests: {
		requestsOverTime: RequestsOverTimePoint[];
		statusBreakdown: StatusBreakdownItem[];
		turnaround: TurnaroundStats;
		overdueCount: number;
		overdueRequests: OverdueRequest[];
		peakHeatmap: PeakHeatmapPoint[];
	};
	inventory: {
		mostBorrowedItems: MostBorrowedItem[];
		itemsCurrentlyOut: ItemCurrentlyOut[];
		damageRateItems: DamageRateItem[];
		eomVariance: EomVarianceItem[];
		conditionDistribution: ConditionDistributionItem[];
		stockAlerts: StockAlert[];
	};
	replacement: {
		summary: replacementntSummary;
		resolutionBreakdown: ResolutionBreakdownItem[];
		avgResolutionDays: number;
		obligationsByCategory: ObligationByCategory[];
		monthlyRevenue: MonthlyRevenuePoint[];
		donationTotals: DonationTotalPoint[];
	};
	studentRisk: {
		repeatOffenders: StudentRiskEntry[];
		highIncidentStudents: StudentRiskEntry[];
		overdueStudents: StudentRiskEntry[];
		trustScores: StudentRiskEntry[];
	};
}

// â”€â”€ Cache â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

interface CacheEntry {
	data: AnalyticsReport;
	expiresAt: number;
}

const CLIENT_CACHE_TTL_MS = 180_000; // 3 minutes - aligned with server cache
const cache = new Map<string, CacheEntry>();

function getCached(key: string): AnalyticsReport | null {
	if (!browser) return null;
	const entry = cache.get(key);
	if (!entry || Date.now() > entry.expiresAt) {
		cache.delete(key);
		return null;
	}
	return entry.data;
}

function setCached(key: string, data: AnalyticsReport): void {
	if (!browser) return;
	cache.set(key, { data, expiresAt: Date.now() + CLIENT_CACHE_TTL_MS });
}

export function clearAnalyticsCache(): void {
	cache.clear();
}

// â”€â”€ API â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export interface FetchAnalyticsOptions {
	period?: AnalyticsPeriod;
	from?: string;
	to?: string;
	forceRefresh?: boolean;
}

export async function fetchAnalytics(opts: FetchAnalyticsOptions = {}): Promise<AnalyticsReport> {
	const { period = 'month', from, to, forceRefresh = false } = opts;
	const cacheKey = `analytics:${period}:${from ?? ''}:${to ?? ''}`;

	if (!forceRefresh) {
		const cached = getCached(cacheKey);
		if (cached) return cached;
	}

	const params = new URLSearchParams({ period });
	if (from) params.set('from', from);
	if (to) params.set('to', to);
	if (forceRefresh) params.set('_t', String(Date.now()));

	// Retry logic for transient failures
	let lastError: Error | null = null;
	const maxRetries = 2;
	
	for (let attempt = 0; attempt <= maxRetries; attempt++) {
		try {
			const res = await fetch(`/api/reports/analytics?${params}`, {
				credentials: 'include',
				signal: AbortSignal.timeout(45000) // 45 second timeout
			});

			if (!res.ok) {
				const body = await res.json().catch(() => ({})) as { error?: string };
				throw new Error(body.error ?? `Analytics request failed: ${res.status}`);
			}

			const data = (await res.json()) as AnalyticsReport;
			setCached(cacheKey, data);
			return data;
		} catch (error) {
			lastError = error instanceof Error ? error : new Error(String(error));
			
			// Don't retry on client errors (4xx) or last attempt
			if (attempt === maxRetries || (error instanceof Error && error.message.includes('4'))) {
				break;
			}
			
			// Wait before retry (exponential backoff)
			await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
		}
	}

	throw lastError ?? new Error('Analytics request failed');
}

// â”€â”€ SSE subscription â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export function subscribeToAnalyticsChanges(onRefresh: () => void): () => void {
	if (!browser) return () => {};

	let es: EventSource | null = null;
	let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
	let stopped = false;

	function connect() {
		if (stopped) return;
		es = new EventSource('/api/reports/analytics/stream', { withCredentials: true });

		es.addEventListener('analytics_change', () => {
			clearAnalyticsCache();
			onRefresh();
		});

		es.addEventListener('error', () => {
			es?.close();
			if (!stopped) {
				reconnectTimer = setTimeout(connect, 5000);
			}
		});
	}

	connect();

	return () => {
		stopped = true;
		if (reconnectTimer) clearTimeout(reconnectTimer);
		es?.close();
	};
}


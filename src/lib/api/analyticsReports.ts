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
}

export interface InventorySummary {
	currentCount: number;
	eomCount: number;
	variance: number;
	donations: number;
	constantCount: number;
	lowStockCount: number;
}

export interface ConstantInventoryItem {
	id: string;
	name: string;
	category: string;
	quantity: number;
	eomCount: number;
	variance: number;
	donations: number;
	status: string;
}

export interface StockAlert {
	_id: string;
	name: string;
	category: string;
	quantity: number;
	status: string;
}

export interface ReplacementSummary {
	totalItemsPending: number; // Total items awaiting replacement
	totalItemsReplaced: number; // Total items already replaced
	totalObligations: number;
	pendingCount: number;
}

export interface ResolutionBreakdownItem {
	type: string;
	count: number;
	total: number;
	totalAmount?: number;
}

export interface ObligationByCategory {
	category: string;
	count: number;
	totalAmount: number;
	pendingAmount: number;
}

export interface MonthlyReplacementActivity {
	year: number;
	month: number;
	totalAmount: number; // Total items replaced this month
	collected?: number;
	count: number; // Number of obligations resolved
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
	trustTier?: 'excellent' | 'good' | 'fair' | 'poor' | 'critical';
	trustTierLabel?: string;
	duplicateCount?: number;
	totalPenalties?: number;
	totalBonuses?: number;
	requestsTotal?: number;
	requestsReturned?: number;
	activeObligations?: number;
	dataQuality?: {
		inspectionCoverage: number;
		returnTimestampCoverage: number;
		inspectedReturnCount: number;
		returnedCount: number;
	};
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
		summary: InventorySummary;
		constantItems: ConstantInventoryItem[];
		mostBorrowedItems: MostBorrowedItem[];
		itemsCurrentlyOut: ItemCurrentlyOut[];
		damageRateItems: DamageRateItem[];
		eomVariance: EomVarianceItem[];
		stockAlerts: StockAlert[];
	};
	replacement: {
		summary: ReplacementSummary;
		resolutionBreakdown: ResolutionBreakdownItem[];
		avgResolutionDays: number;
		obligationsByCategory: ObligationByCategory[];
		monthlyActivity: MonthlyReplacementActivity[];
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

const CLIENT_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour - aligned with server cache and session timeout
const CLIENT_CACHE_VERSION = 'v3';
const cache = new Map<string, CacheEntry>();
const inFlight = new Map<string, Promise<AnalyticsReport>>();

function buildAnalyticsCacheKey(period: AnalyticsPeriod, from?: string, to?: string): string {
	return `analytics:${CLIENT_CACHE_VERSION}:${period}:${from ?? ''}:${to ?? ''}`;
}

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
	inFlight.clear();
}

export function peekCachedAnalytics(opts: FetchAnalyticsOptions = {}): AnalyticsReport | null {
	const { period = 'month', from, to } = opts;
	const cacheKey = buildAnalyticsCacheKey(period, from, to);
	return getCached(cacheKey);
}

// â”€â”€ API â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export interface FetchAnalyticsOptions {
	period?: AnalyticsPeriod;
	from?: string;
	to?: string;
	forceRefresh?: boolean;
}

function normalizeAnalyticsReport(raw: AnalyticsReport): AnalyticsReport {
	const inventory = raw.inventory ?? ({} as AnalyticsReport['inventory']);
	const replacement = raw.replacement ?? ({} as AnalyticsReport['replacement']);

	return {
		...raw,
		inventory: {
			...inventory,
			summary: inventory.summary ?? {
				currentCount: 0,
				eomCount: 0,
				variance: 0,
				donations: 0,
				constantCount: 0,
				lowStockCount: 0
			},
			constantItems: inventory.constantItems ?? [],
			mostBorrowedItems: inventory.mostBorrowedItems ?? [],
			itemsCurrentlyOut: inventory.itemsCurrentlyOut ?? [],
			damageRateItems: inventory.damageRateItems ?? [],
			eomVariance: inventory.eomVariance ?? [],
			stockAlerts: inventory.stockAlerts ?? []
		},
		replacement: {
			...replacement,
			summary: replacement.summary ?? {
				totalItemsPending: 0,
				totalItemsReplaced: 0,
				totalObligations: 0,
				pendingCount: 0
			},
			resolutionBreakdown: (replacement.resolutionBreakdown ?? []).map((row) => ({
				...row,
				totalAmount: row.totalAmount ?? row.total ?? 0
			})),
			monthlyActivity: (replacement.monthlyActivity ?? []).map((row) => ({
				...row,
				totalAmount: row.totalAmount ?? row.collected ?? 0
			})),
			donationTotals: replacement.donationTotals ?? [],
			obligationsByCategory: replacement.obligationsByCategory ?? [],
			avgResolutionDays: replacement.avgResolutionDays ?? 0
		}
	};
}

export async function fetchAnalytics(opts: FetchAnalyticsOptions = {}): Promise<AnalyticsReport> {
	const { period = 'month', from, to, forceRefresh = false } = opts;
	const cacheKey = buildAnalyticsCacheKey(period, from, to);

	if (!forceRefresh) {
		const cached = getCached(cacheKey);
		if (cached) return cached;

		const existingRequest = inFlight.get(cacheKey);
		if (existingRequest) return existingRequest;
	}

	const params = new URLSearchParams({ period });
	if (from) params.set('from', from);
	if (to) params.set('to', to);
	if (forceRefresh) params.set('_t', String(Date.now()));

	const requestPromise = (async () => {
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

				const data = normalizeAnalyticsReport((await res.json()) as AnalyticsReport);
				setCached(cacheKey, data);
				return data;
			} catch (error) {
				lastError = error instanceof Error ? error : new Error(String(error));

				// Don't retry on client errors (4xx) or last attempt
				if (attempt === maxRetries || (error instanceof Error && error.message.includes('4'))) {
					break;
				}

				// Wait before retry (exponential backoff)
				await new Promise((resolve) => setTimeout(resolve, Math.pow(2, attempt) * 1000));
			}
		}

		throw lastError ?? new Error('Analytics request failed');
	})();

	inFlight.set(cacheKey, requestPromise);
	try {
		return await requestPromise;
	} finally {
		inFlight.delete(cacheKey);
	}
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


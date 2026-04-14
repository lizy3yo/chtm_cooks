/**
 * Analytics Reports API Client
 * Client-side cache + SSE subscription for the custodian reports page.
 */

import { browser } from '$app/environment';
import { getApiErrorMessage } from './session';

// ── Types ─────────────────────────────────────────────────────────────────────

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
	dayOfWeek: number; // 1=Sun … 7=Sat
	hour: number;
	count: number;
}

export interface BorrowingAverages {
	avgItemsPerRequest: number;
	avgQuantityPerRequest: number;
	totalRequests: number;
}

export interface ItemBorrowed {
	id: string;
	name: string;
	category: string;
	totalQuantity: number;
	borrowCount: number;
}

export interface BorrowedItemEntry {
	id: string;
	requestId: string;
	requestDate: string;
	requestStatus: string;
	name: string;
	category: string;
	quantity: number;
	studentName: string;
	studentEmail: string;
}

export interface BorrowerEntry {
	_id: string;
	studentName: string;
	studentEmail: string;
	requestCount: number;
	totalItems: number;
}

export interface LossAndDamageSummary {
	todayTotal: number;
	todayMissing: number;
	todayDamaged: number;
	last7DaysTotal: number;
	last7DaysMissing: number;
	last7DaysDamaged: number;
	mtdTotal: number;
	mtdMissing: number;
	mtdDamaged: number;
	periodTotal: number;
	periodMissing: number;
	periodDamaged: number;
}

export interface LossAndDamageTrackingItem {
	_id: string;
	type: 'missing' | 'damaged';
	status: string;
	itemName: string;
	itemCategory: string;
	amount: number;
	amountPaid: number;
	incidentDate: string;
	resolutionDate?: string;
	resolutionType?: string;
	studentName: string;
	requestId: string;
	requestStatus?: string;
	requestCreatedAt?: string;
	requestReturnedAt?: string;
	daysToResolve?: number | null;
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

export interface InventoryVarianceDriver {
	id: string;
	name: string;
	category: string;
	requestCount: number;
	totalBorrowedQuantity: number;
	latestRequestId: string;
	latestRequestDate: string;
	latestRequestStatus: string;
	studentName: string;
	studentEmail: string;
	studentProfilePhotoUrl: string | null;
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
		borrowingAverages: BorrowingAverages;
		itemsBorrowed: ItemBorrowed[];
		itemEntries: BorrowedItemEntry[];
		borrowers: BorrowerEntry[];
	};
	lossAndDamage: {
		summary: LossAndDamageSummary;
		tracking: LossAndDamageTrackingItem[];
	};
	inventory: {
		summary: InventorySummary;
		constantItems: ConstantInventoryItem[];
		mostBorrowedItems: MostBorrowedItem[];
		itemsCurrentlyOut: ItemCurrentlyOut[];
		damageRateItems: DamageRateItem[];
		eomVariance: EomVarianceItem[];
		varianceDrivers: InventoryVarianceDriver[];
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

interface CacheEntry {
	data: AnalyticsReport;
	expiresAt: number;
}

const CLIENT_CACHE_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours - aligned with server cache and session timeout
const CLIENT_CACHE_VERSION = 'v8';
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

// ── API ───────────────────────────────────────────────────────────────────────

export interface FetchAnalyticsOptions {
	period?: AnalyticsPeriod;
	from?: string;
	to?: string;
	forceRefresh?: boolean;
}

function normalizeAnalyticsReport(raw: AnalyticsReport): AnalyticsReport {
	const inventory = raw.inventory ?? ({} as AnalyticsReport['inventory']);
	const replacement = raw.replacement ?? ({} as AnalyticsReport['replacement']);
	const borrowRequests = raw.borrowRequests ?? ({} as AnalyticsReport['borrowRequests']);
	const lossAndDamage = raw.lossAndDamage ?? ({} as AnalyticsReport['lossAndDamage']);

	return {
		...raw,
		borrowRequests: {
			...borrowRequests,
			requestsOverTime: borrowRequests.requestsOverTime ?? [],
			statusBreakdown: borrowRequests.statusBreakdown ?? [],
			turnaround: borrowRequests.turnaround ?? { avgApprovalHours: 0, avgReleaseHours: 0, avgReturnHours: 0 },
			overdueCount: borrowRequests.overdueCount ?? 0,
			overdueRequests: borrowRequests.overdueRequests ?? [],
			peakHeatmap: borrowRequests.peakHeatmap ?? [],
			borrowingAverages: borrowRequests.borrowingAverages ?? { avgItemsPerRequest: 0, avgQuantityPerRequest: 0, totalRequests: 0 },
			itemsBorrowed: borrowRequests.itemsBorrowed ?? [],
			itemEntries: borrowRequests.itemEntries ?? [],
			borrowers: borrowRequests.borrowers ?? []
		},
		lossAndDamage: {
			summary: lossAndDamage.summary ?? {
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
			},
			tracking: lossAndDamage.tracking ?? []
		},
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
			varianceDrivers: inventory.varianceDrivers ?? [],
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

	console.log('[Analytics API] Fetching analytics...', { period, from, to, forceRefresh });

	if (!forceRefresh) {
		const cached = getCached(cacheKey);
		if (cached) {
			console.log('[Analytics API] Returning cached data');
			return cached;
		}

		const existingRequest = inFlight.get(cacheKey);
		if (existingRequest) {
			console.log('[Analytics API] Returning in-flight request');
			return existingRequest;
		}
	}

	const params = new URLSearchParams({ period });
	if (from) params.set('from', from);
	if (to) params.set('to', to);
	if (forceRefresh) params.set('_t', String(Date.now()));

	const requestPromise = (async () => {
		// Retry logic for transient failures
		let lastError: Error | null = null;
		const maxRetries = 1; // Reduced from 2

		for (let attempt = 0; attempt <= maxRetries; attempt++) {
			try {
				console.log('[Analytics API] Fetching from server, attempt', attempt + 1);
				const fetchStart = Date.now();
				const res = await fetch(`/api/reports/analytics?${params}`, {
					credentials: 'include',
					signal: AbortSignal.timeout(60000) // Increased to 60 seconds
				});

				console.log('[Analytics API] Fetch completed in', Date.now() - fetchStart, 'ms, status:', res.status);

				if (!res.ok) {
					const body = await res.json().catch(() => ({})) as { error?: string };
					throw new Error(
						await getApiErrorMessage(res, body.error ?? `Analytics request failed: ${res.status}`)
					);
				}

				const data = normalizeAnalyticsReport((await res.json()) as AnalyticsReport);
				console.log('[Analytics API] Data normalized successfully');
				setCached(cacheKey, data);
				return data;
			} catch (error) {
				console.error('[Analytics API] Fetch error:', error);
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

// ── SSE subscription ──────────────────────────────────────────────────────────

export function subscribeToAnalyticsChanges(onRefresh: () => void): () => void {
	if (!browser) return () => {};

	let es: EventSource | null = null;
	let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
	let refreshTimer: ReturnType<typeof setTimeout> | null = null;
	let stopped = false;

	const scheduleRefresh = () => {
		if (refreshTimer) return;
		refreshTimer = setTimeout(() => {
			refreshTimer = null;
			clearAnalyticsCache();
			onRefresh();
		}, 300);
	};

	function connect() {
		if (stopped) return;
		es = new EventSource('/api/reports/analytics/stream', { withCredentials: true });

		es.addEventListener('analytics_change', () => {
			scheduleRefresh();
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
		if (refreshTimer) clearTimeout(refreshTimer);
		es?.close();
	};
}


/**
 * Financial Obligations API Client
 *
 * Client-side cache + SSE subscription — mirrors the donations.ts pattern.
 * Credentials are sent via httpOnly cookies (credentials: 'include').
 */

import { browser } from '$app/environment';

export type ObligationType = 'missing' | 'damaged';
export type ObligationStatus = 'pending' | 'paid' | 'replaced' | 'waived';
export type ResolutionType = 'payment' | 'replacement' | 'waiver';

export interface FinancialObligation {
	id: string;
	borrowRequestId: string;
	studentId: string;
	studentName?: string;
	studentEmail?: string;
	studentProfilePhotoUrl?: string;
	itemId: string;
	itemName: string;
	itemCategory?: string;
	quantity: number;
	type: ObligationType;
	status: ObligationStatus;
	amount: number;
	amountPaid: number;
	balance: number;
	resolutionType?: ResolutionType;
	resolutionDate?: string;
	resolutionNotes?: string;
	paymentReference?: string;
	incidentDate: string;
	incidentNotes?: string;
	dueDate: string;
	createdAt: string;
	updatedAt: string;
}

export interface FinancialObligationsListResponse {
	obligations: FinancialObligation[];
	total: number;
	page: number;
	limit: number;
	pages: number;
}

export interface ResolveObligationRequest {
	resolutionType: ResolutionType;
	amountPaid?: number;
	resolutionNotes?: string;
	paymentReference?: string;
}

// ─── Internal types ──────────────────────────────────────────────────────────

interface ApiError {
	error?: string;
	message?: string;
}

interface RequestOptions {
	forceRefresh?: boolean;
}

interface CacheEntry<T> {
	data: T;
	expiresAt: number;
}

// ─── Client-side cache ───────────────────────────────────────────────────────

const CLIENT_CACHE_TTL_MS = 60_000;
const listCache = new Map<string, CacheEntry<FinancialObligationsListResponse>>();
const detailCache = new Map<string, CacheEntry<{ obligation: FinancialObligation }>>();
const inFlight = new Map<string, Promise<unknown>>();

function getFetchOptions(method: string, body?: unknown): RequestInit {
	const opts: RequestInit = {
		method,
		credentials: 'include',
		headers: { 'Content-Type': 'application/json' }
	};
	if (body !== undefined) opts.body = JSON.stringify(body);
	return opts;
}

async function handleResponse<T>(response: Response): Promise<T> {
	const payload = (await response.json().catch(() => ({}))) as T & ApiError;
	if (!response.ok) {
		const message =
			payload.message || payload.error || `Request failed with status ${response.status}`;
		throw new Error(message);
	}
	return payload;
}

function getFreshCache<T>(cache: Map<string, CacheEntry<T>>, key: string): T | null {
	if (!browser) return null;
	const entry = cache.get(key);
	if (!entry) return null;
	if (Date.now() > entry.expiresAt) {
		cache.delete(key);
		return null;
	}
	return entry.data;
}

function setCache<T>(cache: Map<string, CacheEntry<T>>, key: string, data: T): void {
	if (!browser) return;
	cache.set(key, { data, expiresAt: Date.now() + CLIENT_CACHE_TTL_MS });
}

function buildListCacheKey(
	params: {
		status?: ObligationStatus;
		studentId?: string;
		page?: number;
		limit?: number;
	} = {}
): string {
	return [
		params.status || 'all',
		params.studentId || 'self',
		String(params.page || 1),
		String(params.limit || 50)
	].join(':');
}

function invalidateAllCaches(): void {
	listCache.clear();
	detailCache.clear();
	inFlight.clear();
}

// ─── Public API ───────────────────────────────────────────────────────────────

export const financialObligationsAPI = {
	/**
	 * Fetch paginated financial obligations with optional filters.
	 */
	async getObligations(
		params: {
			status?: ObligationStatus;
			studentId?: string;
			page?: number;
			limit?: number;
		} = {},
		options: RequestOptions = {}
	): Promise<FinancialObligationsListResponse> {
		const searchParams = new URLSearchParams();
		if (params.status) searchParams.set('status', params.status);
		if (params.studentId) searchParams.set('studentId', params.studentId);
		if (params.page) searchParams.set('page', String(params.page));
		if (params.limit) searchParams.set('limit', String(params.limit));
		if (options.forceRefresh) searchParams.set('_t', String(Date.now()));

		const query = searchParams.toString();
		const url = `/api/financial-obligations${query ? `?${query}` : ''}`;
		const cacheKey = buildListCacheKey(params);
		const inFlightKey = `list:${cacheKey}`;

		if (!options.forceRefresh) {
			const cached = getFreshCache(listCache, cacheKey);
			if (cached) return cached;

			const existing = inFlight.get(inFlightKey) as
				| Promise<FinancialObligationsListResponse>
				| undefined;
			if (existing) return existing;
		}

		const req = (async () => {
			const res = await fetch(url, getFetchOptions('GET'));
			const data = await handleResponse<FinancialObligationsListResponse>(res);
			setCache(listCache, cacheKey, data);
			return data;
		})();

		inFlight.set(inFlightKey, req);
		try {
			return await req;
		} finally {
			inFlight.delete(inFlightKey);
		}
	},

	/**
	 * Fetch a single financial obligation by ID.
	 */
	async getObligation(
		id: string,
		options: RequestOptions = {}
	): Promise<{ obligation: FinancialObligation }> {
		const inFlightKey = `detail:${id}`;

		if (!options.forceRefresh) {
			const cached = getFreshCache(detailCache, id);
			if (cached) return cached;

			const existing = inFlight.get(inFlightKey) as
				| Promise<{ obligation: FinancialObligation }>
				| undefined;
			if (existing) return existing;
		}

		const url = options.forceRefresh
			? `/api/financial-obligations/${id}?_t=${Date.now()}`
			: `/api/financial-obligations/${id}`;

		const req = (async () => {
			const res = await fetch(url, getFetchOptions('GET'));
			const data = await handleResponse<{ obligation: FinancialObligation }>(res);
			setCache(detailCache, id, data);
			return data;
		})();

		inFlight.set(inFlightKey, req);
		try {
			return await req;
		} finally {
			inFlight.delete(inFlightKey);
		}
	},

	/**
	 * Resolve a financial obligation (payment, replacement, or waiver).
	 * Invalidates all client-side caches on success.
	 */
	async resolveObligation(
		id: string,
		resolution: ResolveObligationRequest
	): Promise<{ success: boolean; message: string }> {
		const res = await fetch(
			`/api/financial-obligations/${id}`,
			getFetchOptions('PATCH', resolution)
		);
		const data = await handleResponse<{ success: boolean; message: string }>(res);
		invalidateAllCaches();
		return data;
	},

	/**
	 * Reconcile stale 'missing' borrow requests where all obligations are already resolved.
	 * Call once on page mount to fix any records that pre-date the auto-resolve logic.
	 * Fails silently — non-critical path.
	 */
	async reconcile(): Promise<{ reconciled: number }> {
		try {
			const res = await fetch(
				'/api/financial-obligations/reconcile',
				getFetchOptions('POST')
			);
			return await handleResponse<{ reconciled: number }>(res);
		} catch {
			return { reconciled: 0 };
		}
	},

	/**
	 * Subscribe to real-time financial obligation changes via SSE.
	 * Invalidates client cache and calls `onEvent` on every change.
	 * Returns an unsubscribe function — call it in component cleanup.
	 */
	subscribeToChanges(onEvent: () => void): () => void {
		if (!browser) return () => {};

		const es = new EventSource('/api/financial-obligations/stream', {
			withCredentials: true
		});

		es.addEventListener('financial_obligation_change', () => {
			invalidateAllCaches();
			onEvent();
		});

		es.addEventListener('error', () => {
			// EventSource auto-reconnects; no action needed.
		});

		return () => es.close();
	},

	// ─── Cache utilities ────────────────────────────────────────────────────

	peekCachedObligations(
		params: {
			status?: ObligationStatus;
			studentId?: string;
			page?: number;
			limit?: number;
		} = {}
	): FinancialObligationsListResponse | null {
		return getFreshCache(listCache, buildListCacheKey(params));
	},

	peekCachedObligation(id: string): { obligation: FinancialObligation } | null {
		return getFreshCache(detailCache, id);
	},

	invalidateCache(): void {
		invalidateAllCaches();
	}
};

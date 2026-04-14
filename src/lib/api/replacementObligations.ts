/**
 * replacement Obligations API Client
 *
 * Client-side cache + SSE subscription — mirrors the donations.ts pattern.
 * Credentials are sent via httpOnly cookies (credentials: 'include').
 */

import { browser } from '$app/environment';
import { getApiErrorMessage } from './session';

export type ObligationType = 'missing' | 'damaged';
export type ObligationStatus = 'pending' | 'replaced' | 'waived';
export type ResolutionType = 'replacement' | 'waiver';

export interface ReplacementObligation {
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
	amount: number; // Quantity of items to be replaced
	amountPaid: number; // Quantity of items already replaced
	balance: number; // Remaining items to be replaced
	resolutionType?: ResolutionType;
	resolutionDate?: string;
	resolutionNotes?: string;
	paymentReference?: string; // Replacement tracking reference
	incidentDate: string;
	incidentNotes?: string;
	dueDate: string;
	createdAt: string;
	updatedAt: string;
}

export interface ReplacementObligationsListResponse {
	obligations: ReplacementObligation[];
	total: number;
	page: number;
	limit: number;
	pages: number;
}

export interface ResolveReplacementObligationRequest {
	resolutionType: ResolutionType;
	amountPaid?: number; // Quantity of items being replaced
	resolutionNotes?: string;
	paymentReference?: string; // Replacement tracking reference
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

const CLIENT_CACHE_TTL_MS = 12 * 60 * 60 * 1000;
const listCache = new Map<string, CacheEntry<ReplacementObligationsListResponse>>();
const detailCache = new Map<string, CacheEntry<{ obligation: ReplacementObligation }>>();
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
		const message = await getApiErrorMessage(
			response,
			payload.message || payload.error || `Request failed with status ${response.status}`
		);
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

export const replacementObligationsAPI = {
	/**
	 * Fetch paginated replacement obligations with optional filters.
	 */
	async getObligations(
		params: {
			status?: ObligationStatus;
			studentId?: string;
			page?: number;
			limit?: number;
		} = {},
		options: RequestOptions = {}
	): Promise<ReplacementObligationsListResponse> {
		const searchParams = new URLSearchParams();
		if (params.status) searchParams.set('status', params.status);
		if (params.studentId) searchParams.set('studentId', params.studentId);
		if (params.page) searchParams.set('page', String(params.page));
		if (params.limit) searchParams.set('limit', String(params.limit));
		if (options.forceRefresh) searchParams.set('_t', String(Date.now()));

		const query = searchParams.toString();
		const url = `/api/replacement-obligations${query ? `?${query}` : ''}`;
		const cacheKey = buildListCacheKey(params);
		const inFlightKey = `list:${cacheKey}`;

		if (!options.forceRefresh) {
			const cached = getFreshCache(listCache, cacheKey);
			if (cached) return cached;

			const existing = inFlight.get(inFlightKey) as
				| Promise<ReplacementObligationsListResponse>
				| undefined;
			if (existing) return existing;
		}

		const req = (async () => {
			const res = await fetch(url, getFetchOptions('GET'));
			const data = await handleResponse<ReplacementObligationsListResponse>(res);
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
	 * Fetch a single replacement obligation by ID.
	 */
	async getObligation(
		id: string,
		options: RequestOptions = {}
	): Promise<{ obligation: ReplacementObligation }> {
		const inFlightKey = `detail:${id}`;

		if (!options.forceRefresh) {
			const cached = getFreshCache(detailCache, id);
			if (cached) return cached;

			const existing = inFlight.get(inFlightKey) as
				| Promise<{ obligation: ReplacementObligation }>
				| undefined;
			if (existing) return existing;
		}

		const url = options.forceRefresh
			? `/api/replacement-obligations/${id}?_t=${Date.now()}`
			: `/api/replacement-obligations/${id}`;

		const req = (async () => {
			const res = await fetch(url, getFetchOptions('GET'));
			const data = await handleResponse<{ obligation: ReplacementObligation }>(res);
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
	 * Resolve a replacement obligation (payment, replacement, or waiver).
	 * Invalidates all client-side caches on success.
	 */
	async resolveObligation(
		id: string,
		resolution: ResolveReplacementObligationRequest
	): Promise<{ success: boolean; message: string }> {
		const res = await fetch(
			`/api/replacement-obligations/${id}`,
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
				'/api/replacement-obligations/reconcile',
				getFetchOptions('POST')
			);
			return await handleResponse<{ reconciled: number }>(res);
		} catch {
			return { reconciled: 0 };
		}
	},

	/**
	 * Subscribe to real-time replacement obligation changes via SSE.
	 * Invalidates client cache and calls `onEvent` on every change.
	 * Returns an unsubscribe function — call it in component cleanup.
	 */
	subscribeToChanges(onEvent: () => void): () => void {
		if (!browser) return () => {};

		const es = new EventSource('/api/replacement-obligations/stream', {
			withCredentials: true
		});

		es.addEventListener('replacement_obligation_change', () => {
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
	): ReplacementObligationsListResponse | null {
		return getFreshCache(listCache, buildListCacheKey(params));
	},

	peekCachedObligation(id: string): { obligation: ReplacementObligation } | null {
		return getFreshCache(detailCache, id);
	},

	invalidateCache(): void {
		invalidateAllCaches();
	}
};

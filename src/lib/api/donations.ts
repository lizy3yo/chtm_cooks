/**
 * Donations API Client
 * Item-based donations — client-side cache + SSE subscription.
 */

import { browser } from '$app/environment';
import { getApiErrorMessage } from './session';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DonationResponse {
	id: string;
	receiptNumber: string;
	donorName: string;
	itemName: string;
	quantity: number;
	unit?: string;
	purpose: string;
	date: string;
	notes?: string;
	inventoryAction: 'new_item' | 'add_to_existing';
	inventoryItemId?: string;
	createdAt: string;
	updatedAt: string;
}

/** Donation that creates a new inventory item */
export interface CreateDonationNewItemRequest {
	inventoryAction: 'new_item';
	donorName: string;
	quantity: number;
	unit?: string;
	purpose: string;
	date: string;
	notes?: string;
	// Inventory item fields
	itemName: string;
	category: string;
	categoryId?: string;
	specification?: string;
	toolsOrEquipment?: string;
}

/** Donation that adds quantity to an existing inventory item */
export interface CreateDonationAddToExistingRequest {
	inventoryAction: 'add_to_existing';
	donorName: string;
	quantity: number;
	purpose: string;
	date: string;
	notes?: string;
	inventoryItemId: string;
}

export type CreateDonationRequest = CreateDonationNewItemRequest | CreateDonationAddToExistingRequest;

export interface AddDonationQuantityRequest {
	quantityToAdd: number;
	notes?: string;
}

export interface DonationsListResponse {
	donations: DonationResponse[];
	total: number;
	page: number;
	limit: number;
	pages: number;
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

interface ApiError {
	error?: string;
	message?: string;
}

interface CacheEntry<T> {
	data: T;
	expiresAt: number;
}

const CLIENT_CACHE_TTL_MS = 12 * 60 * 60 * 1000;
const listCache = new Map<string, CacheEntry<DonationsListResponse>>();
const detailCache = new Map<string, CacheEntry<{ donation: DonationResponse }>>();
const inFlight = new Map<string, Promise<unknown>>();

function getFetchOptions(method: string, body?: unknown): RequestInit {
	const options: RequestInit = {
		method,
		credentials: 'include',
		headers: { 'Content-Type': 'application/json' }
	};
	if (body !== undefined) options.body = JSON.stringify(body);
	return options;
}

async function handleResponse<T>(response: Response): Promise<T> {
	const payload = (await response.json().catch(() => ({}))) as T & ApiError;
	if (!response.ok) {
		const message = await getApiErrorMessage(response, payload.message || payload.error || `Request failed: ${response.status}`);
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

function buildListCacheKey(params: { search?: string; page?: number; limit?: number }): string {
	return [params.search || 'all', String(params.page || 1), String(params.limit || 50)].join(':');
}

function invalidateAllCaches(): void {
	listCache.clear();
	detailCache.clear();
	inFlight.clear();
}

// ─── Public API ───────────────────────────────────────────────────────────────

export const donationsAPI = {
	/**
	 * Fetch paginated donations list.
	 */
	async getAll(
		params: { search?: string; page?: number; limit?: number; forceRefresh?: boolean } = {}
	): Promise<DonationsListResponse> {
		const searchParams = new URLSearchParams();
		if (params.search) searchParams.set('search', params.search);
		if (params.page) searchParams.set('page', String(params.page));
		if (params.limit) searchParams.set('limit', String(params.limit));
		if (params.forceRefresh) searchParams.set('_t', String(Date.now()));

		const query = searchParams.toString();
		const url = `/api/donations${query ? `?${query}` : ''}`;
		const cacheKey = buildListCacheKey(params);
		const inFlightKey = `list:${cacheKey}`;

		if (!params.forceRefresh) {
			const cached = getFreshCache(listCache, cacheKey);
			if (cached) return cached;

			const existing = inFlight.get(inFlightKey) as Promise<DonationsListResponse> | undefined;
			if (existing) return existing;
		}

		const req = (async () => {
			const res = await fetch(url, getFetchOptions('GET'));
			const data = await handleResponse<DonationsListResponse>(res);
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
	 * Fetch a single donation by ID.
	 */
	async getById(id: string, forceRefresh = false): Promise<{ donation: DonationResponse }> {
		const inFlightKey = `detail:${id}`;

		if (!forceRefresh) {
			const cached = getFreshCache(detailCache, id);
			if (cached) return cached;

			const existing = inFlight.get(inFlightKey) as
				| Promise<{ donation: DonationResponse }>
				| undefined;
			if (existing) return existing;
		}

		const url = forceRefresh ? `/api/donations/${id}?_t=${Date.now()}` : `/api/donations/${id}`;
		const req = (async () => {
			const res = await fetch(url, getFetchOptions('GET'));
			const data = await handleResponse<{ donation: DonationResponse }>(res);
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
	 * Create a new item donation record.
	 */
	async create(payload: CreateDonationRequest): Promise<DonationResponse> {
		const res = await fetch('/api/donations', getFetchOptions('POST', payload));
		const data = await handleResponse<DonationResponse>(res);
		invalidateAllCaches();
		return data;
	},

	/**
	 * Add quantity to an existing donation record.
	 */
	async addQuantity(id: string, payload: AddDonationQuantityRequest): Promise<DonationResponse> {
		const res = await fetch(`/api/donations/${id}`, getFetchOptions('PATCH', payload));
		const data = await handleResponse<DonationResponse>(res);
		invalidateAllCaches();
		return data;
	},

	/**
	 * Delete a donation by ID.
	 */
	async delete(id: string): Promise<{ success: boolean; message: string }> {
		const res = await fetch(`/api/donations/${id}`, getFetchOptions('DELETE'));
		const data = await handleResponse<{ success: boolean; message: string }>(res);
		invalidateAllCaches();
		return data;
	},

	/**
	 * Subscribe to real-time donation changes via SSE.
	 * Returns an unsubscribe function.
	 * 
	 * Opens an SSE connection to `/api/donations/stream` and invokes
	 * `callback` whenever the server emits a `donation_change` event.
	 * 
	 * Safe to call from SSR context (no-ops when not in browser).
	 * EventSource automatically reconnects on connection loss.
	 */
	subscribeToChanges(callback: () => void): () => void {
		if (!browser) {
			console.log('[DONATION-SSE] Not in browser, skipping subscription');
			return () => {};
		}

		console.log('[DONATION-SSE] Creating EventSource connection to /api/donations/stream');
		const source = new EventSource('/api/donations/stream', { withCredentials: true });

		source.addEventListener('open', () => {
			console.log('[DONATION-SSE] ✓ Connection opened');
		});

		source.addEventListener('connected', (e: MessageEvent) => {
			console.log('[DONATION-SSE] ✓ Connected event received:', e.data);
		});

		source.addEventListener('donation_change', (e: MessageEvent) => {
			console.log('[DONATION-SSE] ✓ donation_change event received:', e.data);
			try {
				const eventData = JSON.parse(e.data);
				console.log('[DONATION-SSE] Parsed event data:', eventData);
				console.log('[DONATION-SSE] Calling callback function...');
				callback();
				console.log('[DONATION-SSE] Callback completed');
			} catch (err) {
				console.error('[DONATION-SSE] ✗ Error handling event:', err);
			}
		});

		source.addEventListener('heartbeat', (e: MessageEvent) => {
			console.log('[DONATION-SSE] ♥ Heartbeat received');
		});

		source.addEventListener('error', (e) => {
			console.error('[DONATION-SSE] ✗ Connection error:', e);
			console.error('[DONATION-SSE] ReadyState:', source.readyState);
			// EventSource will attempt to reconnect automatically
		});

		console.log('[DONATION-SSE] EventSource created, readyState:', source.readyState);

		return () => {
			console.log('[DONATION-SSE] Disconnecting...');
			source.close();
			console.log('[DONATION-SSE] Disconnected');
		};
	},

	// ─── Cache utilities ────────────────────────────────────────────────────

	peekCachedDonations(
		params: { search?: string; page?: number; limit?: number } = {}
	): DonationsListResponse | null {
		return getFreshCache(listCache, buildListCacheKey(params));
	},

	peekCachedDonation(id: string): { donation: DonationResponse } | null {
		return getFreshCache(detailCache, id);
	},

	invalidateCache(): void {
		invalidateAllCaches();
	}
};
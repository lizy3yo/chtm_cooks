/**
 * Offline-First API Wrapper
 * 
 * Industry Standard: Cache-first strategy with background sync
 * Implements stale-while-revalidate pattern
 * 
 * @see https://web.dev/stale-while-revalidate/
 */

import { browser } from '$app/environment';
import { db } from '$lib/db/schema';
import { queueAction } from '$lib/services/syncService';

// ────────────────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────────────────

export interface OfflineFetchOptions extends RequestInit {
	/**
	 * Cache strategy
	 * - cache-first: Return cache immediately, update in background
	 * - network-first: Try network first, fallback to cache
	 * - network-only: Always use network (no cache)
	 */
	strategy?: 'cache-first' | 'network-first' | 'network-only';

	/**
	 * Cache table to use
	 */
	cacheTable?: 'catalog' | 'requests' | 'inventory' | 'donations' | 'users' | 'analytics';

	/**
	 * Cache key for analytics
	 */
	cacheKey?: string;

	/**
	 * TTL for cache (milliseconds)
	 */
	cacheTTL?: number;

	/**
	 * Queue action if offline (for mutations)
	 */
	queueIfOffline?: boolean;

	/**
	 * Action type for queue
	 */
	actionType?:
		| 'CREATE_REQUEST'
		| 'UPDATE_REQUEST'
		| 'CANCEL_REQUEST'
		| 'APPROVE_REQUEST'
		| 'REJECT_REQUEST'
		| 'RETURN_REQUEST'
		| 'CREATE_DONATION'
		| 'UPDATE_INVENTORY'
		| 'UPDATE_PROFILE';
}

// ────────────────────────────────────────────────────────────────────────────────
// Main API Function
// ────────────────────────────────────────────────────────────────────────────────

/**
 * Offline-first fetch wrapper
 * Industry Standard: Implements multiple caching strategies
 */
export async function offlineFetch<T = any>(
	url: string,
	options: OfflineFetchOptions = {}
): Promise<T> {
	const {
		strategy = 'cache-first',
		cacheTable,
		cacheKey,
		cacheTTL = 5 * 60 * 1000, // 5 minutes default
		queueIfOffline = true,
		actionType,
		...fetchOptions
	} = options;

	const method = (fetchOptions.method || 'GET').toUpperCase();
	const isOnline = browser ? navigator.onLine : true;

	// ── GET Requests: Use caching strategies ────────────────────────────────────
	if (method === 'GET') {
		if (strategy === 'cache-first') {
			return await cacheFirstStrategy<T>(url, fetchOptions, cacheTable, cacheKey, cacheTTL);
		} else if (strategy === 'network-first') {
			return await networkFirstStrategy<T>(url, fetchOptions, cacheTable, cacheKey);
		} else {
			// network-only
			return await networkOnlyStrategy<T>(url, fetchOptions);
		}
	}

	// ── POST/PUT/PATCH/DELETE: Handle mutations ─────────────────────────────────
	if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
		if (!isOnline && queueIfOffline) {
			return await handleOfflineMutation<T>(url, fetchOptions, actionType);
		}

		// Online: Execute mutation
		return await executeMutation<T>(url, fetchOptions, cacheTable);
	}

	// Fallback: Standard fetch
	return await standardFetch<T>(url, fetchOptions);
}

// ────────────────────────────────────────────────────────────────────────────────
// Caching Strategies
// ────────────────────────────────────────────────────────────────────────────────

/**
 * Cache-first strategy: Return cache immediately, update in background
 * Industry Standard: Best for frequently accessed, slowly changing data
 */
async function cacheFirstStrategy<T>(
	url: string,
	options: RequestInit,
	cacheTable?: string,
	cacheKey?: string,
	cacheTTL?: number
): Promise<T> {
	// Try to get from cache
	const cached = await getCachedData<T>(cacheTable, cacheKey, cacheTTL);

	if (cached !== null) {
		// Return cached data immediately
		console.log(`[OfflineAPI] Cache hit: ${url}`);

		// Update cache in background if online
		if (browser && navigator.onLine) {
			fetchAndUpdateCache(url, options, cacheTable, cacheKey).catch((error) => {
				console.warn('[OfflineAPI] Background update failed:', error);
			});
		}

		return cached;
	}

	// Cache miss: Fetch from network
	console.log(`[OfflineAPI] Cache miss: ${url}`);
	return await networkOnlyStrategy<T>(url, options);
}

/**
 * Network-first strategy: Try network first, fallback to cache
 * Industry Standard: Best for data that must be fresh
 */
async function networkFirstStrategy<T>(
	url: string,
	options: RequestInit,
	cacheTable?: string,
	cacheKey?: string
): Promise<T> {
	try {
		// Try network first
		const data = await standardFetch<T>(url, options);

		// Update cache
		if (cacheTable) {
			await updateCache(cacheTable, data, cacheKey);
		}

		return data;
	} catch (error) {
		console.warn('[OfflineAPI] Network failed, trying cache:', error);

		// Fallback to cache
		const cached = await getCachedData<T>(cacheTable, cacheKey);
		if (cached !== null) {
			return cached;
		}

		// No cache available
		throw error;
	}
}

/**
 * Network-only strategy: Always use network
 */
async function networkOnlyStrategy<T>(url: string, options: RequestInit): Promise<T> {
	return await standardFetch<T>(url, options);
}

// ────────────────────────────────────────────────────────────────────────────────
// Mutation Handling
// ────────────────────────────────────────────────────────────────────────────────

/**
 * Handle offline mutation: Queue for later sync
 * Industry Standard: Optimistic updates with background sync
 */
async function handleOfflineMutation<T>(
	url: string,
	options: RequestInit,
	actionType?: string
): Promise<T> {
	const method = (options.method || 'POST') as 'POST' | 'PUT' | 'PATCH' | 'DELETE';
	const payload = options.body ? JSON.parse(options.body as string) : {};

	console.log(`[OfflineAPI] Offline mutation queued: ${method} ${url}`);

	// Determine action type from URL if not provided
	const inferredActionType = actionType || inferActionType(url, method);

	// Create optimistic local record
	const optimisticResult = await createOptimisticRecord(url, method, payload, inferredActionType);

	// Queue for sync
	await queueAction(inferredActionType as any, url, method, payload);

	return optimisticResult as T;
}

/**
 * Execute mutation online
 */
async function executeMutation<T>(
	url: string,
	options: RequestInit,
	cacheTable?: string
): Promise<T> {
	const result = await standardFetch<T>(url, options);

	// Update cache after successful mutation
	if (cacheTable) {
		await updateCache(cacheTable, result);
	}

	return result;
}

/**
 * Create optimistic local record for offline mutations
 */
async function createOptimisticRecord(
	url: string,
	method: string,
	payload: any,
	actionType: string
): Promise<any> {
	const tempId = `offline_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

	try {
		if (actionType === 'CREATE_REQUEST') {
			const record = {
				_id: tempId,
				...payload,
				status: 'pending',
				createdAt: Date.now(),
				updatedAt: Date.now(),
				lastSynced: 0,
				_offline: true
			};

			await db.requests.add(record);
			return record;
		}

		if (actionType === 'CREATE_DONATION') {
			const record = {
				_id: tempId,
				...payload,
				status: 'pending',
				createdAt: Date.now(),
				lastSynced: 0,
				_offline: true
			};

			await db.donations.add(record);
			return record;
		}

		if (actionType === 'UPDATE_REQUEST' || actionType.includes('REQUEST')) {
			// Update existing request in cache
			const existingRequest = await db.requests.get(payload._id);
			if (existingRequest) {
				const updated = {
					...existingRequest,
					...payload,
					updatedAt: Date.now(),
					_offline: true
				};
				await db.requests.put(updated);
				return updated;
			}
		}

		if (actionType === 'UPDATE_INVENTORY') {
			const existingItem = await db.inventory.get(payload._id);
			if (existingItem) {
				const updated = {
					...existingItem,
					...payload,
					lastSynced: 0
				};
				await db.inventory.put(updated);
				return updated;
			}
		}

		// Default: Return payload with temp ID
		return { _id: tempId, ...payload };
	} catch (error) {
		console.error('[OfflineAPI] Failed to create optimistic record:', error);
		return { _id: tempId, ...payload };
	}
}

/**
 * Infer action type from URL and method
 */
function inferActionType(url: string, method: string): string {
	if (url.includes('/borrow-requests')) {
		if (method === 'POST') return 'CREATE_REQUEST';
		if (method === 'PUT' || method === 'PATCH') return 'UPDATE_REQUEST';
		if (url.includes('/approve')) return 'APPROVE_REQUEST';
		if (url.includes('/reject')) return 'REJECT_REQUEST';
		if (url.includes('/return')) return 'RETURN_REQUEST';
		if (method === 'DELETE') return 'CANCEL_REQUEST';
	}

	if (url.includes('/donations')) {
		if (method === 'POST') return 'CREATE_DONATION';
	}

	if (url.includes('/inventory')) {
		return 'UPDATE_INVENTORY';
	}

	if (url.includes('/profile') || url.includes('/users')) {
		return 'UPDATE_PROFILE';
	}

	return 'UPDATE_REQUEST'; // Default
}

// ────────────────────────────────────────────────────────────────────────────────
// Cache Management
// ────────────────────────────────────────────────────────────────────────────────

/**
 * Get data from cache
 */
async function getCachedData<T>(
	cacheTable?: string,
	cacheKey?: string,
	cacheTTL?: number
): Promise<T | null> {
	if (!cacheTable) return null;

	try {
		if (cacheTable === 'catalog') {
			const items = await db.catalog.toArray();
			return items as any;
		}

		if (cacheTable === 'requests') {
			const requests = await db.requests.toArray();
			return requests as any;
		}

		if (cacheTable === 'inventory') {
			const items = await db.inventory.toArray();
			return items as any;
		}

		if (cacheTable === 'donations') {
			const donations = await db.donations.toArray();
			return donations as any;
		}

		if (cacheTable === 'analytics' && cacheKey) {
			const cached = await db.analytics.get(cacheKey);
			if (cached) {
				// Check if expired
				if (cacheTTL && Date.now() - cached.createdAt > cacheTTL) {
					return null;
				}
				return cached.data as T;
			}
		}

		return null;
	} catch (error) {
		console.error('[OfflineAPI] Failed to get cached data:', error);
		return null;
	}
}

/**
 * Update cache with fresh data
 */
async function updateCache(cacheTable: string, data: any, cacheKey?: string): Promise<void> {
	try {
		const timestamp = Date.now();

		if (cacheTable === 'catalog' && Array.isArray(data)) {
			await db.catalog.bulkPut(
				data.map((item) => ({
					...item,
					lastSynced: timestamp,
					_version: item._version || 1
				}))
			);
		}

		if (cacheTable === 'requests' && Array.isArray(data)) {
			await db.requests.bulkPut(
				data.map((req) => ({
					...req,
					lastSynced: timestamp,
					_offline: false,
					_version: req._version || 1
				}))
			);
		}

		if (cacheTable === 'inventory' && Array.isArray(data)) {
			await db.inventory.bulkPut(
				data.map((item) => ({
					...item,
					lastSynced: timestamp,
					_version: item._version || 1
				}))
			);
		}

		if (cacheTable === 'donations' && Array.isArray(data)) {
			await db.donations.bulkPut(
				data.map((donation) => ({
					...donation,
					lastSynced: timestamp,
					_offline: false,
					_version: donation._version || 1
				}))
			);
		}

		if (cacheTable === 'analytics' && cacheKey) {
			await db.analytics.put({
				key: cacheKey,
				data,
				createdAt: timestamp,
				expiresAt: timestamp + 12 * 60 * 60 * 1000, // 12 hours
				lastSynced: timestamp
			});
		}
	} catch (error) {
		console.error('[OfflineAPI] Failed to update cache:', error);
	}
}

/**
 * Fetch and update cache in background
 */
async function fetchAndUpdateCache(
	url: string,
	options: RequestInit,
	cacheTable?: string,
	cacheKey?: string
): Promise<void> {
	try {
		const data = await standardFetch(url, options);
		if (cacheTable) {
			await updateCache(cacheTable, data, cacheKey);
		}
	} catch (error) {
		console.warn('[OfflineAPI] Background fetch failed:', error);
	}
}

// ────────────────────────────────────────────────────────────────────────────────
// Standard Fetch
// ────────────────────────────────────────────────────────────────────────────────

/**
 * Standard fetch with error handling
 */
async function standardFetch<T>(url: string, options: RequestInit): Promise<T> {
	const token = localStorage.getItem('auth_token');

	const response = await fetch(url, {
		...options,
		headers: {
			'Content-Type': 'application/json',
			...(token && { Authorization: `Bearer ${token}` }),
			...options.headers
		}
	});

	if (!response.ok) {
		const errorText = await response.text();
		throw new Error(`HTTP ${response.status}: ${errorText}`);
	}

	return await response.json();
}

// ────────────────────────────────────────────────────────────────────────────────
// Utility Functions
// ────────────────────────────────────────────────────────────────────────────────

/**
 * Clear all caches
 */
export async function clearAllCaches(): Promise<void> {
	await db.clearAllData();
	console.log('[OfflineAPI] All caches cleared');
}

/**
 * Prefetch data for offline use
 */
export async function prefetchForOffline(): Promise<void> {
	console.log('[OfflineAPI] Prefetching data for offline use...');

	await Promise.allSettled([
		offlineFetch('/api/catalog', { strategy: 'network-first', cacheTable: 'catalog' }),
		offlineFetch('/api/borrow-requests', { strategy: 'network-first', cacheTable: 'requests' }),
		offlineFetch('/api/inventory', { strategy: 'network-first', cacheTable: 'inventory' }),
		offlineFetch('/api/donations', { strategy: 'network-first', cacheTable: 'donations' })
	]);

	console.log('[OfflineAPI] Prefetch completed');
}

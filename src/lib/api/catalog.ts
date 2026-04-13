import { browser } from '$app/environment';
import type { InventoryItem, InventoryCategory } from './inventory';
import { getApiErrorMessage } from './session';

/**
 * Catalog types for unified data fetching
 */

export interface CatalogItem extends InventoryItem {
	categoryName?: string;
}

export interface CatalogCategory extends InventoryCategory {}

export interface CatalogFilters {
	search?: string;
	category?: string;
	availability?: 'all' | 'available' | 'borrowed' | 'maintenance' | 'outofstock';
	sortBy?: 'name' | 'category' | 'availability' | 'recent' | 'updated';
	page?: number;
	limit?: number;
}

export interface CatalogResponse {
	categories: CatalogCategory[];
	items: CatalogItem[];
	total: number;
	page: number;
	limit: number;
	pages: number;
	summary: {
		totalItems: number;
		categoriesCount: number;
		filteredItemsCount?: number;
	};
	meta?: {
		userRole?: string;
		timestamp?: string;
		cached?: boolean;
	};
	error?: string;
	message?: string;
}

export interface CatalogError {
	error: string;
	message?: string;
	status?: number;
}

interface CatalogRequestOptions {
	forceRefresh?: boolean;
}

interface CatalogCacheEntry {
	data: CatalogResponse;
	expiresAt: number;
}

const CATALOG_CLIENT_CACHE_TTL_MS = 60 * 60 * 1000;
const catalogResponseCache = new Map<string, CatalogCacheEntry>();
const catalogInFlightRequests = new Map<string, Promise<CatalogResponse>>();

function buildCatalogQuery(filters: CatalogFilters = {}): string {
	const params = new URLSearchParams();

	if (filters.search) params.set('search', filters.search);
	if (filters.category) params.set('category', filters.category);
	if (filters.availability) params.set('availability', filters.availability);
	if (filters.sortBy) params.set('sortBy', filters.sortBy);
	if (filters.page) params.set('page', filters.page.toString());
	if (filters.limit) params.set('limit', filters.limit.toString());

	return params.toString();
}

function buildCatalogCacheKey(filters: CatalogFilters = {}): string {
	const query = buildCatalogQuery(filters);
	return query || 'default';
}

function getFreshCatalogFromClientCache(filters: CatalogFilters = {}): CatalogResponse | null {
	if (!browser) return null;

	const cacheKey = buildCatalogCacheKey(filters);
	const entry = catalogResponseCache.get(cacheKey);

	if (!entry) return null;
	if (Date.now() > entry.expiresAt) {
		catalogResponseCache.delete(cacheKey);
		return null;
	}

	return entry.data;
}

/**
 * Fetch helper with automatic cookie credentials
 */
function getFetchOptions(method: string, body?: unknown): RequestInit {
	const options: RequestInit = {
		method,
		credentials: 'include', // Automatically send httpOnly cookies
		headers: {
			'Content-Type': 'application/json'
		}
	};

	if (body !== undefined) {
		options.body = JSON.stringify(body);
	}

	return options;
}

/**
 * Handle API response
 */
async function handleResponse<T>(response: Response): Promise<T> {
	const data = await response.json();

	if (!response.ok) {
		const error: CatalogError = data;
		throw new Error(
			await getApiErrorMessage(response, error.message || error.error || `Request failed with status ${response.status}`)
		);
	}

	return data;
}

/**
 * Catalog API client
 * Professional, industry-standard API for catalog data fetching
 */
export const catalogAPI = {
	/**
	 * Fetch catalog with categories and items
	 * Optimized for performance with caching
	 *
	 * @param filters - Filter, sort, and pagination options
	 * @returns Catalog data with categories and items
	 * @throws Error if request fails
	 *
	 * @example
	 * ```ts
	 * const catalog = await catalogAPI.getCatalog({
	 *   category: 'all',
	 *   availability: 'all',
	 *   sortBy: 'name',
	 *   page: 1,
	 *   limit: 50
	 * });
	 * ```
	 */
	async getCatalog(filters: CatalogFilters = {}, options: CatalogRequestOptions = {}): Promise<CatalogResponse> {
		try {
			const query = buildCatalogQuery(filters);
			const url = `/api/inventory/catalog${query ? `?${query}` : ''}`;
			const cacheKey = buildCatalogCacheKey(filters);

			if (!options.forceRefresh) {
				const cached = getFreshCatalogFromClientCache(filters);
				if (cached) {
					return cached;
				}

				const inFlight = catalogInFlightRequests.get(cacheKey);
				if (inFlight) {
					return inFlight;
				}
			}

			const requestPromise = (async () => {
				const response = await fetch(url, getFetchOptions('GET'));
				const data = await handleResponse<CatalogResponse>(response);

				if (browser) {
					catalogResponseCache.set(cacheKey, {
						data,
						expiresAt: Date.now() + CATALOG_CLIENT_CACHE_TTL_MS
					});
				}

				return data;
			})();

			catalogInFlightRequests.set(cacheKey, requestPromise);

			try {
				return await requestPromise;
			} finally {
				catalogInFlightRequests.delete(cacheKey);
			}
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Failed to fetch catalog';
			throw new Error(message);
		}
	},

	/**
	 * Return cached catalog response if present and fresh.
	 * Useful for instant render when revisiting the page.
	 */
	peekCachedCatalog(filters: CatalogFilters = {}): CatalogResponse | null {
		return getFreshCatalogFromClientCache(filters);
	},

	/**
	 * Invalidate all client-side catalog cache entries.
	 */
	invalidateCatalogCache(): void {
		catalogResponseCache.clear();
		catalogInFlightRequests.clear();
	},

	/**
	 * Get categories only (lightweight operation)
	 * Useful for populating filter dropdowns
	 */
	async getCategories(): Promise<CatalogCategory[]> {
		try {
			const response = await fetch(
				'/api/inventory/categories',
				getFetchOptions('GET')
			);
			const data = await handleResponse<{ categories: CatalogCategory[] }>(response);
			return data.categories;
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Failed to fetch categories';
			throw new Error(message);
		}
	},

	/**
	 * Get items only (lightweight operation)
	 * Useful for list view or pagination
	 */
	async getItems(filters: Omit<CatalogFilters, 'category'> & { category?: string } = {}): Promise<{
		items: CatalogItem[];
		total: number;
		page: number;
		limit: number;
		pages: number;
	}> {
		try {
			const params = new URLSearchParams();

			if (filters.search) params.set('search', filters.search);
			if (filters.category) params.set('category', filters.category);
			if (filters.availability) params.set('availability', filters.availability);
			if (filters.sortBy) params.set('sortBy', filters.sortBy);
			if (filters.page) params.set('page', filters.page.toString());
			if (filters.limit) params.set('limit', filters.limit.toString());

			const query = params.toString();
			const url = `/api/inventory/items${query ? `?${query}` : ''}`;

			const response = await fetch(url, getFetchOptions('GET'));
			return handleResponse<{
				items: CatalogItem[];
				total: number;
				page: number;
				limit: number;
				pages: number;
			}>(response);
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Failed to fetch items';
			throw new Error(message);
		}
	}
};

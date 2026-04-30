/**
 * Offline-First Catalog API
 * 
 * Wraps existing catalog API with offline capabilities
 */

import { offlineFetch } from './offlineFirst';
import { catalogAPI, type CatalogResponse, type CatalogFilters, type CatalogCategory, type CatalogItem } from '../catalog';

export const catalogOfflineAPI = {
	/**
	 * Get catalog with offline support
	 * Industry Standard: Cache-first with background refresh
	 */
	async getCatalog(filters: CatalogFilters = {}, options: { forceRefresh?: boolean } = {}): Promise<CatalogResponse> {
		try {
			const params = new URLSearchParams();
			if (filters.search) params.set('search', filters.search);
			if (filters.category) params.set('category', filters.category);
			if (filters.availability) params.set('availability', filters.availability);
			if (filters.sortBy) params.set('sortBy', filters.sortBy);
			if (filters.page) params.set('page', filters.page.toString());
			if (filters.limit) params.set('limit', filters.limit.toString());
			if (options.forceRefresh) params.set('_t', Date.now().toString());

			const query = params.toString();
			const url = `/api/inventory/catalog${query ? `?${query}` : ''}`;

			const data = await offlineFetch<CatalogResponse>(url, {
				strategy: 'cache-first',
				cacheTable: 'catalog',
				method: 'GET'
			});

			return data;
		} catch (error) {
			console.error('[CatalogOffline] GetCatalog failed:', error);
			throw error;
		}
	},

	/**
	 * Get categories with offline support
	 */
	async getCategories(): Promise<CatalogCategory[]> {
		try {
			const data = await offlineFetch<{ categories: CatalogCategory[] }>('/api/inventory/categories', {
				strategy: 'cache-first',
				cacheTable: 'catalog',
				method: 'GET'
			});

			return data.categories;
		} catch (error) {
			console.error('[CatalogOffline] GetCategories failed:', error);
			throw error;
		}
	},

	/**
	 * Get items with offline support
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

			const data = await offlineFetch<{
				items: CatalogItem[];
				total: number;
				page: number;
				limit: number;
				pages: number;
			}>(url, {
				strategy: 'cache-first',
				cacheTable: 'catalog',
				method: 'GET'
			});

			return data;
		} catch (error) {
			console.error('[CatalogOffline] GetItems failed:', error);
			throw error;
		}
	},

	/**
	 * Peek cached catalog (synchronous)
	 */
	peekCachedCatalog(filters: CatalogFilters = {}): CatalogResponse | null {
		return catalogAPI.peekCachedCatalog(filters);
	},

	/**
	 * Invalidate cache
	 */
	invalidateCatalogCache(): void {
		catalogAPI.invalidateCatalogCache();
	}
};

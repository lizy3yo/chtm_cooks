/**
 * Inventory Store - Client-side data caching
 * 
 * Implements client-side caching to reduce unnecessary API calls
 * when navigating between pages. Follows industry-standard patterns
 * for SPA state management:
 * 
 * - In-memory cache with TTL (Time To Live)
 * - Automatic cache invalidation after mutations
 * - Stale-while-revalidate pattern
 * - Loading states management
 * 
 * Benefits:
 * - Reduces server load
 * - Improves user experience (instant navigation)
 * - Reduces bandwidth usage
 * - Maintains data freshness
 */

import { writable, derived } from 'svelte/store';
import { browser } from '$app/environment';
import type { InventoryItem, InventoryCategory } from '$lib/api/inventory';

interface InventoryCache {
	items: InventoryItem[];
	categories: InventoryCategory[];
	lastFetchedItems: number | null;
	lastFetchedCategories: number | null;
	isLoading: boolean;
}

const CACHE_TTL = 12 * 60 * 60 * 1000; // 12 hours

const initialState: InventoryCache = {
	items: [],
	categories: [],
	lastFetchedItems: null,
	lastFetchedCategories: null,
	isLoading: false
};

function createInventoryStore() {
	const { subscribe, update, set } = writable<InventoryCache>(initialState);

	return {
		subscribe,

		/**
		 * Set items in cache
		 */
		setItems: (items: InventoryItem[]) => {
			update(state => ({
				...state,
				items,
				lastFetchedItems: Date.now()
			}));
		},

		/**
		 * Set categories in cache
		 */
		setCategories: (categories: InventoryCategory[]) => {
			update(state => ({
				...state,
				categories,
				lastFetchedCategories: Date.now()
			}));
		},

		/**
		 * Check if items cache is still valid
		 */
		isItemsCacheValid: (): boolean => {
			if (!browser) return false;
			
			let isValid = false;
			update(state => {
				const now = Date.now();
				isValid = state.lastFetchedItems !== null && 
				         (now - state.lastFetchedItems) < CACHE_TTL;
				return state;
			});
			return isValid;
		},

		/**
		 * Check if categories cache is still valid
		 */
		isCategoriesCacheValid: (): boolean => {
			if (!browser) return false;
			
			let isValid = false;
			update(state => {
				const now = Date.now();
				isValid = state.lastFetchedCategories !== null && 
				         (now - state.lastFetchedCategories) < CACHE_TTL;
				return state;
			});
			return isValid;
		},

		/**
		 * Invalidate items cache (after create/update/delete)
		 */
		invalidateItems: () => {
			update(state => ({
				...state,
				lastFetchedItems: null
			}));
		},

		/**
		 * Invalidate categories cache (after create/update/delete)
		 */
		invalidateCategories: () => {
			update(state => ({
				...state,
				lastFetchedCategories: null
			}));
		},

		/**
		 * Invalidate all caches
		 */
		invalidateAll: () => {
			update(state => ({
				...state,
				lastFetchedItems: null,
				lastFetchedCategories: null
			}));
		},

		/**
		 * Set loading state
		 */
		setLoading: (isLoading: boolean) => {
			update(state => ({
				...state,
				isLoading
			}));
		},

		/**
		 * Clear all cache and reset
		 */
		reset: () => {
			set(initialState);
		},

		/**
		 * Get cache stats (for debugging)
		 */
		getStats: () => {
			let stats = {
				itemsCount: 0,
				categoriesCount: 0,
				itemsCacheAge: 0,
				categoriesCacheAge: 0,
				itemsCacheValid: false,
				categoriesCacheValid: false
			};

			update(state => {
				const now = Date.now();
				stats = {
					itemsCount: state.items.length,
					categoriesCount: state.categories.length,
					itemsCacheAge: state.lastFetchedItems ? now - state.lastFetchedItems : 0,
					categoriesCacheAge: state.lastFetchedCategories ? now - state.lastFetchedCategories : 0,
					itemsCacheValid: state.lastFetchedItems !== null && (now - state.lastFetchedItems) < CACHE_TTL,
					categoriesCacheValid: state.lastFetchedCategories !== null && (now - state.lastFetchedCategories) < CACHE_TTL
				};
				return state;
			});

			return stats;
		}
	};
}

export const inventoryStore = createInventoryStore();

/**
 * Derived stores for convenient access
 */
export const items = derived(inventoryStore, $store => $store.items);
export const categories = derived(inventoryStore, $store => $store.categories);
export const isLoading = derived(inventoryStore, $store => $store.isLoading);

/**
 * Computed values
 */
export const activeItems = derived(items, $items => 
	$items.filter(item => !item.archived)
);

export const archivedItems = derived(items, $items => 
	$items.filter(item => item.archived)
);

export const lowStockItems = derived(activeItems, $items => 
	$items.filter(item => item.status === 'Low Stock' || item.status === 'Out of Stock')
);

export const outOfStockItems = derived(activeItems, $items => 
	$items.filter(item => item.quantity === 0)
);

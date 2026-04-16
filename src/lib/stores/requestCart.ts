import { derived, writable } from 'svelte/store';
import { browser } from '$app/environment';
import { cartAPI, type CartItemResponse } from '$lib/api/cart';
import { subscribeToCartUpdates } from '$lib/api/cartStream';

export interface RequestCartItem {
	itemId: string;
	name: string;
	quantity: number;
	maxQuantity: number;
	categoryId?: string;
	picture?: string;
}

interface RequestCartState {
	items: RequestCartItem[];
	loading: boolean;
	initialized: boolean;
	sseConnected: boolean;
}

type AddItemPayload = Omit<RequestCartItem, 'quantity'> & { quantity?: number };

type AddItemResult = 'added' | 'incremented' | 'capped';

const initialState: RequestCartState = {
	items: [],
	loading: false,
	initialized: false,
	sseConnected: false
};

/**
 * Convert API cart item to store format
 */
function toStoreItem(apiItem: CartItemResponse): RequestCartItem {
	return {
		itemId: apiItem.itemId,
		name: apiItem.name,
		quantity: apiItem.quantity,
		maxQuantity: apiItem.maxQuantity,
		categoryId: apiItem.categoryId,
		picture: apiItem.picture
	};
}

function createRequestCartStore() {
	const { subscribe, update, set } = writable<RequestCartState>(initialState);
	let sseUnsubscribe: (() => void) | null = null;

	return {
		subscribe,

		/**
		 * Initialize cart by loading from database and setting up SSE
		 * Should be called once on app mount
		 */
		async init(): Promise<void> {
			if (!browser) return;

			update((state) => ({ ...state, loading: true }));

			try {
				const cart = await cartAPI.getCart();
				const items = cart.items.map(toStoreItem);

				update((state) => ({
					...state,
					items,
					loading: false,
					initialized: true
				}));

				// Setup SSE for real-time updates
				this.connectSSE();
			} catch (error) {
				console.error('Failed to load cart from database:', error);
				update((state) => ({
					...state,
					loading: false,
					initialized: true
				}));
			}
		},

		/**
		 * Connect to SSE stream for real-time cart updates
		 */
		connectSSE(): void {
			if (!browser || sseUnsubscribe) return;

			console.log('[CART-STORE] Connecting to SSE stream...');

			sseUnsubscribe = subscribeToCartUpdates(
				(event) => {
					console.log('[CART-STORE] Received cart update from SSE:', event);
					const items = event.items.map(toStoreItem);
					
					update((state) => ({
						...state,
						items,
						sseConnected: true
					}));
				},
				(error) => {
					console.error('[CART-STORE] SSE error:', error);
					update((state) => ({
						...state,
						sseConnected: false
					}));
				}
			);

			update((state) => ({ ...state, sseConnected: true }));
		},

		/**
		 * Disconnect from SSE stream
		 */
		disconnectSSE(): void {
			if (sseUnsubscribe) {
				sseUnsubscribe();
				sseUnsubscribe = null;
				update((state) => ({ ...state, sseConnected: false }));
				console.log('[CART-STORE] Disconnected from SSE stream');
			}
		},

		/**
		 * Add item to cart (persists to database)
		 */
		async addItem(item: AddItemPayload): Promise<AddItemResult> {
			if (!browser) return 'added';

			try {
				const response = await cartAPI.addItem({
					itemId: item.itemId,
					name: item.name,
					quantity: item.quantity ?? 1,
					maxQuantity: item.maxQuantity,
					categoryId: item.categoryId,
					picture: item.picture
				});

				const items = response.items.map(toStoreItem);
				update((state) => ({ ...state, items }));

				// Broadcast update event for same-page synchronization
				if (browser) {
					window.dispatchEvent(new CustomEvent('cart-updated', {
						detail: { items, source: 'addItem' }
					}));
				}

				return response.result;
			} catch (error) {
				console.error('Failed to add item to cart:', error);
				throw error;
			}
		},

		/**
		 * Update item quantity (persists to database)
		 */
		async setQuantity(itemId: string, quantity: number): Promise<void> {
			if (!browser) return;

			try {
				const response = await cartAPI.updateQuantity(itemId, quantity);
				const items = response.items.map(toStoreItem);
				update((state) => ({ ...state, items }));

				// Broadcast update event for same-page synchronization
				if (browser) {
					window.dispatchEvent(new CustomEvent('cart-updated', {
						detail: { items, source: 'setQuantity' }
					}));
				}
			} catch (error) {
				console.error('Failed to update cart quantity:', error);
				throw error;
			}
		},

		/**
		 * Remove item from cart (persists to database)
		 * Note: Constant items cannot be removed
		 */
		async removeItem(itemId: string): Promise<void> {
			if (!browser) return;

			try {
				const response = await cartAPI.removeItem(itemId);
				const items = response.items.map(toStoreItem);
				update((state) => ({ ...state, items }));

				// Broadcast update event for same-page synchronization
				if (browser) {
					window.dispatchEvent(new CustomEvent('cart-updated', {
						detail: { items, source: 'removeItem' }
					}));
				}
			} catch (error) {
				console.error('Failed to remove item from cart:', error);
				// Re-throw with more context for UI to handle
				const errorMessage = error instanceof Error ? error.message : 'Failed to remove item';
				throw new Error(errorMessage);
			}
		},

		/**
		 * Clear entire cart (persists to database)
		 */
		async clear(): Promise<void> {
			if (!browser) return;

			try {
				await cartAPI.clearCart();
				update((state) => ({ ...state, items: [] }));

				// Broadcast update event for same-page synchronization
				if (browser) {
					window.dispatchEvent(new CustomEvent('cart-updated', {
						detail: { items: [], source: 'clear' }
					}));
				}
			} catch (error) {
				console.error('Failed to clear cart:', error);
				throw error;
			}
		},

		/**
		 * Refresh cart from database
		 */
		async refresh(): Promise<void> {
			if (!browser) return;

			try {
				const cart = await cartAPI.getCart();
				const items = cart.items.map(toStoreItem);
				update((state) => ({ ...state, items }));
			} catch (error) {
				console.error('Failed to refresh cart:', error);
			}
		}
	};
}

export const requestCartStore = createRequestCartStore();

export const requestCartItems = derived(requestCartStore, ($store) => $store.items);

export const requestCartCount = derived(requestCartItems, ($items) =>
	$items.reduce((total, item) => total + item.quantity, 0)
);

export const requestCartLoading = derived(requestCartStore, ($store) => $store.loading);

export const requestCartInitialized = derived(requestCartStore, ($store) => $store.initialized);

export const requestCartSSEConnected = derived(requestCartStore, ($store) => $store.sseConnected);

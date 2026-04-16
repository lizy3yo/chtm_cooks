import { browser } from '$app/environment';
import type { CartItemResponse } from './cart';

/**
 * Cart Update Event from SSE
 */
export interface CartUpdateEvent {
	items: CartItemResponse[];
	updatedAt: string;
	timestamp: string;
}

/**
 * SSE Event Types
 */
type CartSSEEvent = 
	| { type: 'connected'; data: { message: string; timestamp: string } }
	| { type: 'heartbeat'; data: { timestamp: string } }
	| { type: 'cart-updated'; data: CartUpdateEvent }
	| { type: 'error'; data: { message: string } };

/**
 * Subscribe to real-time cart updates via Server-Sent Events
 * 
 * @param onUpdate - Callback when cart is updated
 * @param onError - Optional error callback
 * @returns Cleanup function to close the connection
 * 
 * @example
 * ```ts
 * const unsubscribe = subscribeToCartUpdates(
 *   (event) => {
 *     console.log('Cart updated:', event.items);
 *     // Update your UI with new cart data
 *   },
 *   (error) => {
 *     console.error('Cart stream error:', error);
 *   }
 * );
 * 
 * // Later, cleanup
 * unsubscribe();
 * ```
 */
export function subscribeToCartUpdates(
	onUpdate: (event: CartUpdateEvent) => void,
	onError?: (error: Error) => void
): () => void {
	if (!browser) {
		return () => {};
	}

	let eventSource: EventSource | null = null;
	let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
	let isManualClose = false;
	const MAX_RECONNECT_DELAY = 30000; // 30 seconds
	let reconnectDelay = 1000; // Start with 1 second

	const connect = () => {
		if (isManualClose) return;

		try {
			eventSource = new EventSource('/api/cart/stream', {
				withCredentials: true
			});

			eventSource.addEventListener('connected', (event) => {
				const data = JSON.parse(event.data);
				console.log('[CART-STREAM] Connected:', data.message);
				reconnectDelay = 1000; // Reset reconnect delay on successful connection
			});

			eventSource.addEventListener('heartbeat', (event) => {
				const data = JSON.parse(event.data);
				console.log('[CART-STREAM] Heartbeat:', data.timestamp);
			});

			eventSource.addEventListener('cart-updated', (event) => {
				try {
					const data: CartUpdateEvent = JSON.parse(event.data);
					console.log('[CART-STREAM] Cart updated:', data);
					onUpdate(data);
				} catch (error) {
					console.error('[CART-STREAM] Failed to parse cart update:', error);
					onError?.(error instanceof Error ? error : new Error('Failed to parse cart update'));
				}
			});

			eventSource.onerror = (event) => {
				console.error('[CART-STREAM] Connection error:', event);
				
				if (eventSource?.readyState === EventSource.CLOSED) {
					console.log('[CART-STREAM] Connection closed, attempting reconnect...');
					
					// Exponential backoff for reconnection
					reconnectTimer = setTimeout(() => {
						reconnectDelay = Math.min(reconnectDelay * 2, MAX_RECONNECT_DELAY);
						connect();
					}, reconnectDelay);
				}

				onError?.(new Error('Cart stream connection error'));
			};

		} catch (error) {
			console.error('[CART-STREAM] Failed to create EventSource:', error);
			onError?.(error instanceof Error ? error : new Error('Failed to create cart stream'));
		}
	};

	// Initial connection
	connect();

	// Return cleanup function
	return () => {
		isManualClose = true;
		
		if (reconnectTimer) {
			clearTimeout(reconnectTimer);
			reconnectTimer = null;
		}

		if (eventSource) {
			eventSource.close();
			eventSource = null;
			console.log('[CART-STREAM] Connection closed');
		}
	};
}

/**
 * Simple hook-style wrapper for Svelte components
 * Automatically manages subscription lifecycle
 * 
 * @example
 * ```svelte
 * <script>
 *   import { onMount } from 'svelte';
 *   import { subscribeToCartUpdates } from '$lib/api/cartStream';
 *   
 *   onMount(() => {
 *     return subscribeToCartUpdates((event) => {
 *       // Update your local state
 *       cartItems = event.items;
 *     });
 *   });
 * </script>
 * ```
 */
export function useCartStream(
	onUpdate: (event: CartUpdateEvent) => void,
	onError?: (error: Error) => void
): () => void {
	return subscribeToCartUpdates(onUpdate, onError);
}

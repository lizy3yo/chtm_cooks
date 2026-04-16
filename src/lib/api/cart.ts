import { getApiErrorMessage } from './session';

/**
 * Cart Item from API
 */
export interface CartItemResponse {
	itemId: string;
	name: string;
	quantity: number;
	maxQuantity: number;
	categoryId?: string;
	picture?: string;
	addedAt: string;
	updatedAt: string;
}

/**
 * Cart Response from API
 */
export interface CartResponse {
	items: CartItemResponse[];
	updatedAt: string;
}

/**
 * Add Item Request
 */
export interface AddCartItemRequest {
	itemId: string;
	name: string;
	quantity?: number;
	maxQuantity: number;
	categoryId?: string;
	picture?: string;
}

/**
 * Update Quantity Request
 */
export interface UpdateCartQuantityRequest {
	itemId: string;
	quantity: number;
}

/**
 * Add Item Response
 */
export interface AddCartItemResponse extends CartResponse {
	result: 'added' | 'incremented' | 'capped';
}

/**
 * Fetch helper with automatic cookie credentials
 */
function getFetchOptions(method: string, body?: unknown): RequestInit {
	const options: RequestInit = {
		method,
		credentials: 'include',
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
		const error = data as { error?: string; message?: string };
		throw new Error(
			await getApiErrorMessage(
				response,
				error.message || error.error || `Request failed with status ${response.status}`
			)
		);
	}

	return data;
}

/**
 * Cart API Client
 * Professional, industry-standard API for cart management with database persistence
 */
export const cartAPI = {
	/**
	 * Get student's cart from database
	 * 
	 * @returns Cart data with items
	 * @throws Error if request fails
	 * 
	 * @example
	 * ```ts
	 * const cart = await cartAPI.getCart();
	 * console.log(cart.items);
	 * ```
	 */
	async getCart(): Promise<CartResponse> {
		try {
			const response = await fetch('/api/cart', getFetchOptions('GET'));
			return handleResponse<CartResponse>(response);
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Failed to fetch cart';
			throw new Error(message);
		}
	},

	/**
	 * Add item to cart or increment quantity if already exists
	 * 
	 * @param item - Item to add to cart
	 * @returns Updated cart with result indicator
	 * @throws Error if request fails
	 * 
	 * @example
	 * ```ts
	 * const result = await cartAPI.addItem({
	 *   itemId: '507f1f77bcf86cd799439011',
	 *   name: 'Baking Pan',
	 *   quantity: 1,
	 *   maxQuantity: 5,
	 *   categoryId: '507f1f77bcf86cd799439012',
	 *   picture: '/uploads/baking-pan.jpg'
	 * });
	 * 
	 * if (result.result === 'added') {
	 *   console.log('Item added to cart');
	 * } else if (result.result === 'incremented') {
	 *   console.log('Item quantity increased');
	 * } else {
	 *   console.log('Item already at max quantity');
	 * }
	 * ```
	 */
	async addItem(item: AddCartItemRequest): Promise<AddCartItemResponse> {
		try {
			const response = await fetch('/api/cart', getFetchOptions('POST', item));
			return handleResponse<AddCartItemResponse>(response);
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Failed to add item to cart';
			throw new Error(message);
		}
	},

	/**
	 * Update item quantity in cart
	 * 
	 * @param itemId - ID of item to update
	 * @param quantity - New quantity (will be clamped to 1-maxQuantity)
	 * @returns Updated cart
	 * @throws Error if request fails
	 * 
	 * @example
	 * ```ts
	 * const cart = await cartAPI.updateQuantity('507f1f77bcf86cd799439011', 3);
	 * ```
	 */
	async updateQuantity(itemId: string, quantity: number): Promise<CartResponse> {
		try {
			const response = await fetch(
				'/api/cart',
				getFetchOptions('PATCH', { itemId, quantity })
			);
			return handleResponse<CartResponse>(response);
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Failed to update cart item';
			throw new Error(message);
		}
	},

	/**
	 * Remove item from cart
	 * 
	 * @param itemId - ID of item to remove
	 * @returns Updated cart
	 * @throws Error if request fails
	 * 
	 * @example
	 * ```ts
	 * const cart = await cartAPI.removeItem('507f1f77bcf86cd799439011');
	 * ```
	 */
	async removeItem(itemId: string): Promise<CartResponse> {
		try {
			const response = await fetch(
				`/api/cart?itemId=${encodeURIComponent(itemId)}`,
				getFetchOptions('DELETE')
			);
			return handleResponse<CartResponse>(response);
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Failed to remove item from cart';
			throw new Error(message);
		}
	},

	/**
	 * Clear entire cart
	 * 
	 * @returns Empty cart
	 * @throws Error if request fails
	 * 
	 * @example
	 * ```ts
	 * await cartAPI.clearCart();
	 * ```
	 */
	async clearCart(): Promise<CartResponse> {
		try {
			const response = await fetch('/api/cart', getFetchOptions('DELETE'));
			return handleResponse<CartResponse>(response);
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Failed to clear cart';
			throw new Error(message);
		}
	}
};

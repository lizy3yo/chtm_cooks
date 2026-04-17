import { browser } from '$app/environment';
import { getApiErrorMessage } from './session';

export interface InventoryItem {
	id: string;
	name: string;
	category: string;
	categoryId?: string;
	specification: string;
	toolsOrEquipment: string;
	picture?: string;
	quantity: number;
	donations?: number;
	eomCount: number;
	currentCount?: number;
	variance: number;
	description?: string;
	status: string;
	archived: boolean;
	isConstant?: boolean; // Items that always appear on student request forms
	maxQuantityPerRequest?: number; // Maximum quantity allowed per request for constant items
	createdAt: Date;
	updatedAt: Date;
}

export interface InventoryCategory {
	id: string;
	name: string;
	description?: string;
	picture?: string;
	itemCount: number;
	archived: boolean;
	createdAt: Date;
	updatedAt: Date;
}

export interface CreateItemRequest {
	name: string;
	category: string;
	categoryId?: string;
	specification?: string;
	toolsOrEquipment?: string;
	picture?: string;
	quantity: number;
	donations?: number;
	eomCount?: number;
	isConstant?: boolean;
	maxQuantityPerRequest?: number;
}

export interface UpdateItemRequest extends Partial<CreateItemRequest> {
	archived?: boolean;
	replacePicture?: boolean;
}

export interface BulkCreateItemsRequest {
	items: CreateItemRequest[];
}

export interface BulkCreateItemsResponse {
	createdCount: number;
	failedCount: number;
	failures: Array<{
		index: number;
		name?: string;
		error: string;
	}>;
}

export interface CreateCategoryRequest {
	name: string;
	description?: string;
	picture?: string;
}

export interface UpdateCategoryRequest extends Partial<CreateCategoryRequest> {
	archived?: boolean;
}

/**
 * Fetch helper with automatic cookie credentials
 */
function getFetchOptionsWithFlags(
	method: string,
	body?: unknown,
	options?: { importContext?: boolean }
): RequestInit {
	const requestOptions: RequestInit = {
		method,
		credentials: 'include', // Automatically send httpOnly cookies
		headers: {
			'Content-Type': 'application/json',
			...(options?.importContext ? { 'X-Import-Context': '1' } : {})
		}
	};

	if (body !== undefined) {
		requestOptions.body = JSON.stringify(body);
	}

	return requestOptions;
}

function getFetchOptions(method: string, body?: unknown): RequestInit {
	return getFetchOptionsWithFlags(method, body);
}

let refreshAccessTokenPromise: Promise<boolean> | null = null;

async function refreshAccessToken(): Promise<boolean> {
	if (!browser) return false;
	if (!refreshAccessTokenPromise) {
		refreshAccessTokenPromise = fetch('/api/auth/refresh', {
			method: 'POST',
			credentials: 'include'
		})
			.then((response) => response.ok)
			.catch(() => false)
			.finally(() => {
				refreshAccessTokenPromise = null;
			});
	}

	return refreshAccessTokenPromise;
}

async function fetchWithAuthRetry(url: string, options: RequestInit, retryOnUnauthorized = true): Promise<Response> {
	const response = await fetch(url, options);

	if (response.status !== 401 || !retryOnUnauthorized) {
		return response;
	}

	const refreshed = await refreshAccessToken();
	if (!refreshed) {
		return response;
	}

	return await fetch(url, options);
}

/**
 * Handle API response
 */
async function handleResponse<T>(response: Response): Promise<T> {
	if (!response.ok) {
		const error = await response.json().catch(() => ({ error: 'An error occurred' }));
		throw new Error(
			await getApiErrorMessage(response, error.error || `Request failed with status ${response.status}`)
		);
	}
	return response.json();
}

/**
 * Inventory Items API
 */
export const inventoryItemsAPI = {
	/**
	 * Get all inventory items
	 */
	async getAll(params?: {
		includeArchived?: boolean;
		category?: string;
		status?: string;
		search?: string;
		page?: number;
		limit?: number;
		forceRefresh?: boolean;
	}): Promise<{ items: InventoryItem[]; total: number; page: number; limit: number; pages: number }> {
		console.log('[INVENTORY-API] 🌐 getAll called with params:', params);
		
		const queryParams = new URLSearchParams();
		if (params?.includeArchived) queryParams.set('includeArchived', 'true');
		if (params?.category) queryParams.set('category', params.category);
		if (params?.status) queryParams.set('status', params.status);
		if (params?.search) queryParams.set('search', params.search);
		if (params?.page) queryParams.set('page', params.page.toString());
		if (params?.limit) queryParams.set('limit', params.limit.toString());
		// Optional cache-bypass for force refresh (adds a timestamp query param)
		if (params?.forceRefresh) {
			const timestamp = String(Date.now());
			queryParams.set('_t', timestamp);
			console.log('[INVENTORY-API] 🔄 Force refresh enabled, adding timestamp:', timestamp);
		}

		const query = queryParams.toString();
		const url = `/api/inventory/items${query ? `?${query}` : ''}`;
		console.log('[INVENTORY-API] 📡 Fetching from URL:', url);

		const response = await fetchWithAuthRetry(url, getFetchOptions('GET'));

		const result = await handleResponse(response);
		console.log('[INVENTORY-API] ✅ Received', result.items?.length || 0, 'items');
		return result;
	},

	/**
	 * Get a single inventory item
	 */
	async getById(id: string): Promise<InventoryItem> {
		const response = await fetchWithAuthRetry(`/api/inventory/items/${id}`, getFetchOptions('GET'));

		return handleResponse(response);
	},

	/**
	 * Create a new inventory item
	 */
	async create(data: CreateItemRequest): Promise<InventoryItem> {
		const response = await fetchWithAuthRetry('/api/inventory/items', getFetchOptionsWithFlags('POST', data));

		return handleResponse(response);
	},

	async createForImport(data: CreateItemRequest): Promise<InventoryItem> {
		const response = await fetchWithAuthRetry('/api/inventory/items', getFetchOptionsWithFlags('POST', data, { importContext: true }));

		return handleResponse(response);
	},

	/**
	 * Bulk create inventory items
	 */
	async bulkCreate(data: BulkCreateItemsRequest): Promise<BulkCreateItemsResponse> {
		const response = await fetchWithAuthRetry(
			'/api/inventory/items/bulk',
			getFetchOptionsWithFlags('POST', data, { importContext: true })
		);

		return handleResponse(response);
	},

	/**
	 * Update an inventory item
	 */
	async update(id: string, data: UpdateItemRequest): Promise<InventoryItem> {
		const response = await fetchWithAuthRetry(`/api/inventory/items/${id}`, getFetchOptionsWithFlags('PATCH', data));

		return handleResponse(response);
	},

	async updateForImport(id: string, data: UpdateItemRequest): Promise<InventoryItem> {
		const response = await fetchWithAuthRetry(`/api/inventory/items/${id}`, getFetchOptionsWithFlags('PATCH', data, { importContext: true }));

		return handleResponse(response);
	},

	/**
	 * Delete an inventory item (soft delete)
	 */
	async delete(id: string): Promise<{ success: boolean; message: string }> {
		const response = await fetchWithAuthRetry(`/api/inventory/items/${id}`, getFetchOptions('DELETE'));

		return handleResponse(response);
	}
};

/**
 * Inventory Categories API
 */
export const inventoryCategoriesAPI = {
	/**
	 * Get all categories
	 */
	async getAll(params?: {
		includeArchived?: boolean;
		search?: string;
	}): Promise<{ categories: InventoryCategory[]; total: number }> {
		const queryParams = new URLSearchParams();
		if (params?.includeArchived) queryParams.set('includeArchived', 'true');
		if (params?.search) queryParams.set('search', params.search);

		const query = queryParams.toString();
		const url = `/api/inventory/categories${query ? `?${query}` : ''}`;

		const response = await fetchWithAuthRetry(url, getFetchOptions('GET'));

		return handleResponse(response);
	},

	/**
	 * Create a new category
	 */
	async create(data: CreateCategoryRequest): Promise<InventoryCategory> {
		const response = await fetchWithAuthRetry('/api/inventory/categories', getFetchOptions('POST', data));

		return handleResponse(response);
	},

	/**
	 * Update a category
	 */
	async update(id: string, data: UpdateCategoryRequest): Promise<InventoryCategory> {
		const response = await fetchWithAuthRetry(`/api/inventory/categories/${id}`, getFetchOptions('PATCH', data));

		return handleResponse(response);
	},

	/**
	 * Delete a category (soft delete)
	 */
	async delete(id: string): Promise<{ success: boolean; message: string }> {
		const response = await fetchWithAuthRetry(`/api/inventory/categories/${id}`, getFetchOptions('DELETE'));

		return handleResponse(response);
	}
};

/**
 * Upload an image for inventory item
 */
export async function uploadInventoryImage(file: File): Promise<{ success: boolean; url: string; filename: string }> {
	if (!browser) {
		throw new Error('File upload only available in browser');
	}

	const formData = new FormData();
	formData.append('file', file);
	const maxRetries = 4;
	let lastError: Error | null = null;

	for (let attempt = 0; attempt <= maxRetries; attempt++) {
		try {
			const response = await fetchWithAuthRetry('/api/inventory/upload', {
				method: 'POST',
				credentials: 'include', // Automatically send httpOnly cookies
				body: formData
			}, true);

			if (!response.ok && (response.status === 429 || response.status >= 500) && attempt < maxRetries) {
				const retryAfterHeader = response.headers.get('retry-after');
				const retryAfterSeconds = retryAfterHeader ? Number(retryAfterHeader) : NaN;
				const backoffMs = Number.isFinite(retryAfterSeconds)
					? Math.max(500, retryAfterSeconds * 1000)
					: Math.min(8000, 500 * Math.pow(2, attempt));
				await new Promise((resolve) => setTimeout(resolve, backoffMs));
				continue;
			}

			return handleResponse(response);
		} catch (error) {
			lastError = error instanceof Error ? error : new Error('Image upload failed');
			if (attempt >= maxRetries) break;
			const backoffMs = Math.min(8000, 500 * Math.pow(2, attempt));
			await new Promise((resolve) => setTimeout(resolve, backoffMs));
		}
	}

	throw lastError ?? new Error('Image upload failed after retries');
}

// ─── Constant Items API ───────────────────────────────────────────────────────

export interface ConstantItemsResponse {
	items: InventoryItem[];
	total: number;
	meta: {
		cached: boolean;
		timestamp: string;
	};
}

export interface BulkUpdateConstantRequest {
	itemIds: string[];
	isConstant: boolean;
}

export interface BulkUpdateConstantResponse {
	success: boolean;
	message: string;
	items: InventoryItem[];
	updatedCount: number;
}

/**
 * Constant Items API
 * For managing frequently requested items
 */
export const constantItemsAPI = {
	/**
	 * Get all constant items
	 */
	async getAll(): Promise<ConstantItemsResponse> {
		const response = await fetch('/api/inventory/constant', getFetchOptions('GET'));
		return handleResponse(response);
	},

	/**
	 * Bulk update constant status for items
	 */
	async bulkUpdate(data: BulkUpdateConstantRequest): Promise<BulkUpdateConstantResponse> {
		const response = await fetch('/api/inventory/constant', getFetchOptions('PATCH', data));
		return handleResponse(response);
	},

	/**
	 * Set item as constant
	 */
	async setConstant(itemId: string): Promise<InventoryItem> {
		return inventoryItemsAPI.update(itemId, { isConstant: true });
	},

	/**
	 * Remove item from constant
	 */
	async removeConstant(itemId: string): Promise<InventoryItem> {
		return inventoryItemsAPI.update(itemId, { isConstant: false });
	}
};

// ─── Inventory Real-Time ──────────────────────────────────────────────────────

export type InventoryRealtimeAction =
	| 'item_created'
	| 'item_updated'
	| 'item_archived'
	| 'item_restored'
	| 'item_deleted'
	| 'category_created'
	| 'category_updated'
	| 'category_deleted';

export interface InventoryRealtimeEvent {
	action: InventoryRealtimeAction;
	entityType: 'item' | 'category';
	entityId: string;
	entityName: string;
	occurredAt: string;
}

/**
 * Subscribe to real-time inventory change events via Server-Sent Events.
 * Returns an unsubscribe function that closes the connection.
 * 
 * @param callback - Function to call when inventory changes
 * @param options - Optional configuration
 * @param options.onConnect - Called when SSE connection is established
 * @param options.onDisconnect - Called when SSE connection is lost
 * @param options.onError - Called when an error occurs
 */
export function subscribeToInventoryChanges(
	callback: (event: InventoryRealtimeEvent) => void,
	options?: {
		onConnect?: () => void;
		onDisconnect?: () => void;
		onError?: (error: Event | Error) => void;
	}
): () => void {
	if (!browser) return () => {};

	console.log('[INVENTORY-SSE-CLIENT] 🚀 Creating EventSource connection to /api/inventory/stream');

	// Use credentials so httpOnly session cookie is sent with the EventSource
	// (required for authenticated SSE endpoints).
	const source = new EventSource('/api/inventory/stream', { withCredentials: true });

	console.log('[INVENTORY-SSE-CLIENT] EventSource created, readyState:', source.readyState);

	// Connection opened
	source.addEventListener('open', () => {
		console.log('[INVENTORY-SSE-CLIENT] ✓ Connection opened');
		options?.onConnect?.();
	});

	// Server-side acknowledgement
	source.addEventListener('connected', (e: MessageEvent) => {
		console.log('[INVENTORY-SSE-CLIENT] ✓ Connected event received:', e.data);
		options?.onConnect?.();
	});

	// Inventory change events
	source.addEventListener('inventory_change', (e: MessageEvent) => {
		console.log('[INVENTORY-SSE-CLIENT] ✓ inventory_change event received');
		console.log('[INVENTORY-SSE-CLIENT] Raw event data:', e.data);
		try {
			const payload = JSON.parse(e.data) as InventoryRealtimeEvent;
			console.log('[INVENTORY-SSE-CLIENT] Parsed payload:', payload);
			console.log('[INVENTORY-SSE-CLIENT] Calling callback function...');
			callback(payload);
			console.log('[INVENTORY-SSE-CLIENT] ✓ Callback executed successfully');
		} catch (err) {
			console.error('[INVENTORY-SSE-CLIENT] ✗ Failed to parse event data:', err);
			// Ignore malformed events but surface error handler
			options?.onError?.(err instanceof Error ? err : new Error('Malformed SSE payload'));
		}
	});

	// Errors: EventSource does automatic reconnects; notify consumer
	source.addEventListener('error', (e) => {
		console.error('[INVENTORY-SSE-CLIENT] ✗ Error event:', e);
		console.error('[INVENTORY-SSE-CLIENT] EventSource readyState:', source.readyState);
		options?.onError?.(e);
	});

	console.log('[INVENTORY-SSE-CLIENT] ✓ Event listeners attached');

	// Cleanup function
	return () => {
		console.log('[INVENTORY-SSE-CLIENT] 🛑 Closing connection');
		try {
			options?.onDisconnect?.();
		} catch {
			// swallow
		}
		source.close();
	};
}

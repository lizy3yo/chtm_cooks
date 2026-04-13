import { browser } from '$app/environment';
import { getApiErrorMessage } from './session';

/**
 * Inventory history entry
 */
export interface InventoryHistoryEntry {
	id: string;
	action: string;
	entityType: 'item' | 'category';
	entityId: string;
	entityName: string;
	userId: string;
	userName: string;
	userRole: string;
	changes?: {
		field: string;
		oldValue: any;
		newValue: any;
	}[];
	metadata?: Record<string, any>;
	ipAddress?: string;
	timestamp: Date;
}

/**
 * Deleted item or category
 */
export interface DeletedItem {
	id: string;
	originalId: string;
	type: 'item' | 'category';
	itemData?: any;
	categoryData?: any;
	deletedBy: string;
	deletedByName: string;
	deletedByRole: string;
	deletedAt: Date;
	scheduledDeletion: Date;
	daysRemaining: number;
	reason?: string;
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
	if (!response.ok) {
		const error = await response.json().catch(() => ({ error: 'An error occurred' }));
		throw new Error(
			await getApiErrorMessage(response, error.error || `Request failed with status ${response.status}`)
		);
	}
	return response.json();
}

/**
 * Inventory History API
 */
export const inventoryHistoryAPI = {
	/**
	 * Get activity logs (audit trail)
	 */
	async getHistory(params?: {
		action?: string;
		entityType?: 'item' | 'category';
		entityId?: string;
		userId?: string;
		startDate?: string;
		endDate?: string;
		page?: number;
		limit?: number;
	}): Promise<{ history: InventoryHistoryEntry[]; total: number; page: number; limit: number; pages: number }> {
		const queryParams = new URLSearchParams();
		if (params?.action) queryParams.set('action', params.action);
		if (params?.entityType) queryParams.set('entityType', params.entityType);
		if (params?.entityId) queryParams.set('entityId', params.entityId);
		if (params?.userId) queryParams.set('userId', params.userId);
		if (params?.startDate) queryParams.set('startDate', params.startDate);
		if (params?.endDate) queryParams.set('endDate', params.endDate);
		if (params?.page) queryParams.set('page', params.page.toString());
		if (params?.limit) queryParams.set('limit', params.limit.toString());

		const query = queryParams.toString();
		const url = `/api/inventory/history${query ? `?${query}` : ''}`;

		const response = await fetch(url, getFetchOptions('GET'));
		return handleResponse(response);
	}
};

/**
 * Archived Items API
 */
export const archivedItemsAPI = {
	/**
	 * Get all archived items
	 */
	async getArchived(params?: {
		search?: string;
		category?: string;
		page?: number;
		limit?: number;
	}): Promise<{ items: any[]; total: number; page: number; limit: number; pages: number }> {
		const queryParams = new URLSearchParams();
		if (params?.search) queryParams.set('search', params.search);
		if (params?.category) queryParams.set('category', params.category);
		if (params?.page) queryParams.set('page', params.page.toString());
		if (params?.limit) queryParams.set('limit', params.limit.toString());

		const query = queryParams.toString();
		const url = `/api/inventory/archived${query ? `?${query}` : ''}`;

		const response = await fetch(url, getFetchOptions('GET'));
		return handleResponse(response);
	},

	/**
	 * Restore an archived item
	 */
	async restore(itemId: string): Promise<{ success: boolean; message: string }> {
		const response = await fetch('/api/inventory/archived', getFetchOptions('POST', { itemId }));
		return handleResponse(response);
	}
};

/**
 * Deleted Items API
 */
export const deletedItemsAPI = {
	/**
	 * Get recently deleted items
	 */
	async getDeleted(params?: {
		search?: string;
		page?: number;
		limit?: number;
	}): Promise<{ items: DeletedItem[]; total: number; page: number; limit: number; pages: number }> {
		const queryParams = new URLSearchParams();
		if (params?.search) queryParams.set('search', params.search);
		if (params?.page) queryParams.set('page', params.page.toString());
		if (params?.limit) queryParams.set('limit', params.limit.toString());

		const query = queryParams.toString();
		const url = `/api/inventory/deleted${query ? `?${query}` : ''}`;

		const response = await fetch(url, getFetchOptions('GET'));
		return handleResponse(response);
	},

	/**
	 * Restore a deleted item or category
	 */
	async restore(deletedId: string, type: 'item' | 'category'): Promise<{ success: boolean; message: string }> {
		const response = await fetch('/api/inventory/deleted', getFetchOptions('POST', { deletedId, type }));
		return handleResponse(response);
	},

	/**
	 * Permanently delete an item or category (superadmin only)
	 */
	async permanentlyDelete(deletedId: string, type: 'item' | 'category'): Promise<{ success: boolean; message: string }> {
		const response = await fetch('/api/inventory/deleted', getFetchOptions('DELETE', { deletedId, type }));
		return handleResponse(response);
	}
};

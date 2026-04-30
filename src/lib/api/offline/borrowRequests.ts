/**
 * Offline-First Borrow Requests API
 * 
 * Industry Standard: Wraps existing API with offline capabilities
 * Maintains backward compatibility while adding offline-first features
 */

import { browser } from '$app/environment';
import { db } from '$lib/db/schema';
import { offlineFetch } from './offlineFirst';
import { borrowRequestsAPI, type BorrowRequestRecord, type BorrowRequestListResponse, type CreateBorrowRequestInput, type BorrowRequestStatus } from '../borrowRequests';

// ────────────────────────────────────────────────────────────────────────────────
// Offline-First API Wrapper
// ────────────────────────────────────────────────────────────────────────────────

export const borrowRequestsOfflineAPI = {
	/**
	 * List borrow requests with offline support
	 * Industry Standard: Cache-first with background refresh
	 */
	async list(
		params: {
			status?: BorrowRequestStatus;
			statuses?: BorrowRequestStatus[];
			search?: string;
			sortBy?: 'createdAt' | 'returnDate';
			page?: number;
			limit?: number;
		} = {},
		options: { forceRefresh?: boolean } = {}
	): Promise<BorrowRequestListResponse> {
		try {
			// Use offline-first fetch
			const data = await offlineFetch<BorrowRequestListResponse>(
				buildListUrl(params, options.forceRefresh),
				{
					strategy: 'cache-first',
					cacheTable: 'requests',
					method: 'GET'
				}
			);

			return data;
		} catch (error) {
			console.error('[BorrowRequestsOffline] List failed:', error);

			// Fallback to cached data
			const cached = await db.requests.toArray();
			return {
				requests: cached.map(mapCachedToRecord),
				total: cached.length,
				page: params.page || 1,
				limit: params.limit || 20,
				pages: Math.ceil(cached.length / (params.limit || 20))
			};
		}
	},

	/**
	 * Get request by ID with offline support
	 */
	async getById(id: string, options: { forceRefresh?: boolean } = {}): Promise<BorrowRequestRecord> {
		try {
			const data = await offlineFetch<BorrowRequestRecord>(`/api/borrow-requests/${id}`, {
				strategy: 'cache-first',
				cacheTable: 'requests',
				method: 'GET'
			});

			return data;
		} catch (error) {
			console.error('[BorrowRequestsOffline] GetById failed:', error);

			// Fallback to cached data
			const cached = await db.requests.get(id);
			if (cached) {
				return mapCachedToRecord(cached);
			}

			throw error;
		}
	},

	/**
	 * Create request with offline support
	 * Industry Standard: Optimistic update with queue
	 */
	async create(payload: CreateBorrowRequestInput): Promise<BorrowRequestRecord> {
		// Validate required classCodeId
		if (!payload.classCodeId || payload.classCodeId.trim() === '') {
			throw new Error(
				'Class code is required. You must be enrolled in a class to submit equipment requests.'
			);
		}

		try {
			const data = await offlineFetch<BorrowRequestRecord>('/api/borrow-requests', {
				method: 'POST',
				body: JSON.stringify(payload),
				queueIfOffline: true,
				actionType: 'CREATE_REQUEST',
				cacheTable: 'requests'
			});

			// Invalidate existing API cache
			borrowRequestsAPI.invalidateCache();

			return data;
		} catch (error) {
			console.error('[BorrowRequestsOffline] Create failed:', error);
			throw error;
		}
	},

	/**
	 * Approve request with offline support
	 */
	async approve(id: string): Promise<BorrowRequestRecord> {
		try {
			const data = await offlineFetch<BorrowRequestRecord>(`/api/borrow-requests/${id}/approve`, {
				method: 'POST',
				queueIfOffline: true,
				actionType: 'APPROVE_REQUEST',
				cacheTable: 'requests'
			});

			borrowRequestsAPI.invalidateCache();
			return data;
		} catch (error) {
			console.error('[BorrowRequestsOffline] Approve failed:', error);
			throw error;
		}
	},

	/**
	 * Reject request with offline support
	 */
	async reject(id: string, reason: string, notes?: string): Promise<BorrowRequestRecord> {
		try {
			const data = await offlineFetch<BorrowRequestRecord>(`/api/borrow-requests/${id}/reject`, {
				method: 'POST',
				body: JSON.stringify({ reason, notes }),
				queueIfOffline: true,
				actionType: 'REJECT_REQUEST',
				cacheTable: 'requests'
			});

			borrowRequestsAPI.invalidateCache();
			return data;
		} catch (error) {
			console.error('[BorrowRequestsOffline] Reject failed:', error);
			throw error;
		}
	},

	/**
	 * Cancel request with offline support
	 */
	async cancel(id: string): Promise<BorrowRequestRecord> {
		try {
			const data = await offlineFetch<BorrowRequestRecord>(`/api/borrow-requests/${id}`, {
				method: 'DELETE',
				queueIfOffline: true,
				actionType: 'CANCEL_REQUEST',
				cacheTable: 'requests'
			});

			borrowRequestsAPI.invalidateCache();
			return data;
		} catch (error) {
			console.error('[BorrowRequestsOffline] Cancel failed:', error);
			throw error;
		}
	},

	/**
	 * Release request with offline support
	 */
	async release(id: string): Promise<BorrowRequestRecord> {
		try {
			const data = await offlineFetch<BorrowRequestRecord>(`/api/borrow-requests/${id}/release`, {
				method: 'POST',
				queueIfOffline: true,
				actionType: 'UPDATE_REQUEST',
				cacheTable: 'requests'
			});

			borrowRequestsAPI.invalidateCache();
			return data;
		} catch (error) {
			console.error('[BorrowRequestsOffline] Release failed:', error);
			throw error;
		}
	},

	/**
	 * Mark as returned with offline support
	 */
	async markReturned(id: string): Promise<BorrowRequestRecord> {
		try {
			const data = await offlineFetch<BorrowRequestRecord>(`/api/borrow-requests/${id}/return`, {
				method: 'POST',
				queueIfOffline: true,
				actionType: 'RETURN_REQUEST',
				cacheTable: 'requests'
			});

			borrowRequestsAPI.invalidateCache();
			return data;
		} catch (error) {
			console.error('[BorrowRequestsOffline] MarkReturned failed:', error);
			throw error;
		}
	},

	/**
	 * Initiate return with offline support
	 */
	async initiateReturn(id: string): Promise<BorrowRequestRecord> {
		try {
			const data = await offlineFetch<BorrowRequestRecord>(
				`/api/borrow-requests/${id}/initiate-return`,
				{
					method: 'POST',
					queueIfOffline: true,
					actionType: 'UPDATE_REQUEST',
					cacheTable: 'requests'
				}
			);

			borrowRequestsAPI.invalidateCache();
			return data;
		} catch (error) {
			console.error('[BorrowRequestsOffline] InitiateReturn failed:', error);
			throw error;
		}
	},

	/**
	 * Inspect items with offline support
	 */
	async inspectItems(
		id: string,
		items: Array<{
			itemId: string;
			status: 'good' | 'damaged' | 'missing';
			notes?: string;
			replacementQuantity?: number;
		}>
	): Promise<{
		success: boolean;
		message: string;
		status: BorrowRequestStatus;
		obligationsCreated: number;
	}> {
		try {
			const data = await offlineFetch<{
				success: boolean;
				message: string;
				status: BorrowRequestStatus;
				obligationsCreated: number;
			}>(`/api/borrow-requests/${id}/inspect-items`, {
				method: 'POST',
				body: JSON.stringify({ items }),
				queueIfOffline: true,
				actionType: 'UPDATE_REQUEST',
				cacheTable: 'requests'
			});

			borrowRequestsAPI.invalidateCache();
			return data;
		} catch (error) {
			console.error('[BorrowRequestsOffline] InspectItems failed:', error);
			throw error;
		}
	},

	/**
	 * Get cached list (synchronous)
	 */
	peekCachedList(params: {
		status?: BorrowRequestStatus;
		statuses?: BorrowRequestStatus[];
		search?: string;
		sortBy?: 'createdAt' | 'returnDate';
		page?: number;
		limit?: number;
	} = {}): BorrowRequestListResponse | null {
		// Try existing API cache first
		const apiCached = borrowRequestsAPI.peekCachedList(params);
		if (apiCached) return apiCached;

		// Fallback to IndexedDB (synchronous peek not possible, return null)
		return null;
	},

	/**
	 * Get cached detail (synchronous)
	 */
	peekCachedDetail(id: string): BorrowRequestRecord | null {
		// Try existing API cache first
		return borrowRequestsAPI.peekCachedDetail(id);
	},

	/**
	 * Invalidate all caches
	 */
	invalidateCache(): void {
		borrowRequestsAPI.invalidateCache();
	},

	/**
	 * Subscribe to real-time changes
	 * Delegates to existing API
	 */
	subscribeToChanges(callback: (event: any) => void): () => void {
		return borrowRequestsAPI.subscribeToChanges(callback);
	}
};

// ────────────────────────────────────────────────────────────────────────────────
// Utility Functions
// ────────────────────────────────────────────────────────────────────────────────

function buildListUrl(
	params: {
		status?: BorrowRequestStatus;
		statuses?: BorrowRequestStatus[];
		search?: string;
		sortBy?: 'createdAt' | 'returnDate';
		page?: number;
		limit?: number;
	},
	forceRefresh?: boolean
): string {
	const query = new URLSearchParams();
	if (params.status) query.set('status', params.status);
	if (params.statuses && params.statuses.length > 0) {
		query.set('statuses', params.statuses.join(','));
	}
	if (params.search) query.set('search', params.search);
	if (params.sortBy) query.set('sortBy', params.sortBy);
	if (params.page) query.set('page', String(params.page));
	if (params.limit) query.set('limit', String(params.limit));

	if (forceRefresh) {
		query.set('_t', Date.now().toString());
	}

	return `/api/borrow-requests${query.toString() ? `?${query.toString()}` : ''}`;
}

function mapCachedToRecord(cached: any): BorrowRequestRecord {
	return {
		id: cached._id,
		studentId: cached.studentId,
		instructorId: cached.instructorId,
		custodianId: cached.custodianId,
		classCodeId: cached.classCodeId,
		student: cached.student,
		instructor: cached.instructor,
		custodian: cached.custodian,
		items: cached.items || [],
		purpose: cached.purpose || '',
		usageLocation: cached.usageLocation,
		borrowDate: cached.borrowDate || cached.createdAt,
		returnDate: cached.returnDate || cached.expectedReturnDate,
		status: cached.status as BorrowRequestStatus,
		rejectReason: cached.rejectReason,
		rejectionNotes: cached.rejectionNotes,
		approvedAt: cached.approvedAt,
		rejectedAt: cached.rejectedAt,
		releasedAt: cached.releasedAt,
		pickedUpAt: cached.pickedUpAt,
		returnedAt: cached.returnedAt || cached.actualReturnDate,
		missingAt: cached.missingAt,
		resolvedAt: cached.resolvedAt,
		lastReminderAt: cached.lastReminderAt,
		reminderCount: cached.reminderCount,
		createdAt: new Date(cached.createdAt).toISOString(),
		updatedAt: new Date(cached.updatedAt).toISOString()
	};
}

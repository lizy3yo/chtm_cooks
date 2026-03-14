import { browser } from '$app/environment';

export type BorrowRequestStatus =
	| 'pending_instructor'
	| 'approved_instructor'
	| 'ready_for_pickup'
	| 'borrowed'
	| 'pending_return'
	| 'missing'
	| 'returned'
	| 'cancelled'
	| 'rejected';

export type BorrowRequestRealtimeAction =
	| 'created'
	| 'approved'
	| 'rejected'
	| 'released'
	| 'picked_up'
	| 'return_initiated'
	| 'returned'
	| 'missing'
	| 'cancelled'
	| 'items_inspected'
	| 'obligation_updated'
	| 'reminder_sent';

export interface BorrowRequestRealtimeEvent {
	action: BorrowRequestRealtimeAction;
	requestId: string;
	studentId: string;
	status: string;
	occurredAt: string;
}

export interface BorrowRequestItemInput {
	itemId: string;
	quantity: number;
}

export interface CreateBorrowRequestInput {
	items: BorrowRequestItemInput[];
	purpose: string;
	borrowDate: string;
	returnDate: string;
}

export interface BorrowRequestItem {
	itemId: string;
	name: string;
	quantity: number;
	category?: string;
	picture?: string;
	inspection?: {
		status: 'good' | 'damaged' | 'missing';
		inspectedAt: Date;
		inspectedBy: string;
		notes?: string;
		unitPrice?: number;
	};
}

export interface BorrowRequestUserSummary {
	id: string;
	email?: string;
	firstName?: string;
	lastName?: string;
	fullName?: string;
	yearLevel?: string;
	block?: string;
}

export interface BorrowRequestRecord {
	id: string;
	studentId: string;
	instructorId?: string;
	custodianId?: string;
	student?: BorrowRequestUserSummary;
	instructor?: BorrowRequestUserSummary;
	custodian?: BorrowRequestUserSummary;
	items: BorrowRequestItem[];
	purpose: string;
	borrowDate: string;
	returnDate: string;
	status: BorrowRequestStatus;
	rejectReason?: string;
	rejectionNotes?: string;
	approvedAt?: string;
	rejectedAt?: string;
	releasedAt?: string;
	pickedUpAt?: string;
	returnedAt?: string;
	missingAt?: string;
	lastReminderAt?: string;
	reminderCount?: number;
	createdAt: string;
	updatedAt: string;
}

export interface BorrowRequestListResponse {
	requests: BorrowRequestRecord[];
	total: number;
	page: number;
	limit: number;
	pages: number;
}

interface ApiError {
	error?: string;
	message?: string;
}

interface RequestOptions {
	forceRefresh?: boolean;
}

interface CacheEntry<T> {
	data: T;
	expiresAt: number;
}

const CLIENT_CACHE_TTL_MS = 60 * 1000;
const listCache = new Map<string, CacheEntry<BorrowRequestListResponse>>();
const detailCache = new Map<string, CacheEntry<BorrowRequestRecord>>();
const inFlight = new Map<string, Promise<unknown>>();

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

async function handleResponse<T>(response: Response): Promise<T> {
	const payload = (await response.json().catch(() => ({}))) as T & ApiError;

	if (!response.ok) {
		const message = payload.message || payload.error || `Request failed with status ${response.status}`;
		throw new Error(message);
	}

	return payload;
}

function getFreshCache<T>(cache: Map<string, CacheEntry<T>>, key: string): T | null {
	if (!browser) {
		return null;
	}

	const entry = cache.get(key);
	if (!entry) {
		return null;
	}

	if (Date.now() > entry.expiresAt) {
		cache.delete(key);
		return null;
	}

	return entry.data;
}

function setCache<T>(cache: Map<string, CacheEntry<T>>, key: string, data: T): void {
	if (!browser) {
		return;
	}

	cache.set(key, {
		data,
		expiresAt: Date.now() + CLIENT_CACHE_TTL_MS
	});
}

function buildListCacheKey(params: {
	status?: BorrowRequestStatus;
	statuses?: BorrowRequestStatus[];
	search?: string;
	sortBy?: 'createdAt' | 'returnDate';
	page?: number;
	limit?: number;
} = {}): string {
	const statuses = params.statuses && params.statuses.length > 0
		? [...params.statuses].sort().join(',')
		: 'none';

	return [
		params.status || 'all',
		statuses,
		params.search?.trim().toLowerCase() || 'none',
		params.sortBy || 'createdAt',
		String(params.page || 1),
		String(params.limit || 20)
	].join(':');
}

function invalidateAllCaches(): void {
	listCache.clear();
	detailCache.clear();
	inFlight.clear();
}

export const borrowRequestsAPI = {
	async list(
		params: {
			status?: BorrowRequestStatus;
			statuses?: BorrowRequestStatus[];
			search?: string;
			sortBy?: 'createdAt' | 'returnDate';
			page?: number;
			limit?: number;
		} = {},
		options: RequestOptions = {}
	): Promise<BorrowRequestListResponse> {
		const query = new URLSearchParams();
		if (params.status) query.set('status', params.status);
		if (params.statuses && params.statuses.length > 0) {
			query.set('statuses', params.statuses.join(','));
		}
		if (params.search) query.set('search', params.search);
		if (params.sortBy) query.set('sortBy', params.sortBy);
		if (params.page) query.set('page', String(params.page));
		if (params.limit) query.set('limit', String(params.limit));
		
		// Add cache-busting parameter when forcing refresh
		if (options.forceRefresh) {
			query.set('_t', Date.now().toString());
		}

		const url = `/api/borrow-requests${query.toString() ? `?${query.toString()}` : ''}`;
		const cacheKey = buildListCacheKey(params);
		const inFlightKey = `list:${cacheKey}`;

		if (!options.forceRefresh) {
			const cached = getFreshCache(listCache, cacheKey);
			if (cached) {
				return cached;
			}

			const existingRequest = inFlight.get(inFlightKey) as Promise<BorrowRequestListResponse> | undefined;
			if (existingRequest) {
				return existingRequest;
			}
		}

		const requestPromise = (async () => {
			const response = await fetch(url, getFetchOptions('GET'));
			const data = await handleResponse<BorrowRequestListResponse>(response);
			setCache(listCache, cacheKey, data);
			return data;
		})();

		inFlight.set(inFlightKey, requestPromise);
		try {
			return await requestPromise;
		} finally {
			inFlight.delete(inFlightKey);
		}
	},

	async getById(id: string, options: RequestOptions = {}): Promise<BorrowRequestRecord> {
		const inFlightKey = `detail:${id}`;
		if (!options.forceRefresh) {
			const cached = getFreshCache(detailCache, id);
			if (cached) {
				return cached;
			}

			const existingRequest = inFlight.get(inFlightKey) as Promise<BorrowRequestRecord> | undefined;
			if (existingRequest) {
				return existingRequest;
			}
		}

		const requestPromise = (async () => {
			const response = await fetch(`/api/borrow-requests/${id}`, getFetchOptions('GET'));
			const data = await handleResponse<BorrowRequestRecord>(response);
			setCache(detailCache, id, data);
			return data;
		})();

		inFlight.set(inFlightKey, requestPromise);
		try {
			return await requestPromise;
		} finally {
			inFlight.delete(inFlightKey);
		}
	},

	async create(payload: CreateBorrowRequestInput): Promise<BorrowRequestRecord> {
		const response = await fetch('/api/borrow-requests', getFetchOptions('POST', payload));
		const data = await handleResponse<BorrowRequestRecord>(response);
		invalidateAllCaches();
		setCache(detailCache, data.id, data);
		return data;
	},

	async approve(id: string): Promise<BorrowRequestRecord> {
		const response = await fetch(`/api/borrow-requests/${id}/approve`, getFetchOptions('POST'));
		const data = await handleResponse<BorrowRequestRecord>(response);
		invalidateAllCaches();
		setCache(detailCache, id, data);
		return data;
	},

	async reject(id: string, reason: string, notes?: string): Promise<BorrowRequestRecord> {
		const response = await fetch(
			`/api/borrow-requests/${id}/reject`,
			getFetchOptions('POST', { reason, notes })
		);
		const data = await handleResponse<BorrowRequestRecord>(response);
		invalidateAllCaches();
		setCache(detailCache, id, data);
		return data;
	},

	async cancel(id: string): Promise<BorrowRequestRecord> {
		const response = await fetch(`/api/borrow-requests/${id}`, getFetchOptions('DELETE'));
		const data = await handleResponse<BorrowRequestRecord>(response);
		invalidateAllCaches();
		setCache(detailCache, id, data);
		return data;
	},

	async release(id: string): Promise<BorrowRequestRecord> {
		const response = await fetch(`/api/borrow-requests/${id}/release`, getFetchOptions('POST'));
		const data = await handleResponse<BorrowRequestRecord>(response);
		invalidateAllCaches();
		setCache(detailCache, id, data);
		return data;
	},

	async pickup(id: string): Promise<BorrowRequestRecord> {
		const response = await fetch(`/api/borrow-requests/${id}/pickup`, getFetchOptions('POST'));
		const data = await handleResponse<BorrowRequestRecord>(response);
		invalidateAllCaches();
		setCache(detailCache, id, data);
		return data;
	},

	async markReturned(id: string): Promise<BorrowRequestRecord> {
		const response = await fetch(`/api/borrow-requests/${id}/return`, getFetchOptions('POST'));
		const data = await handleResponse<BorrowRequestRecord>(response);
		invalidateAllCaches();
		setCache(detailCache, id, data);
		return data;
	},

	async markMissing(id: string): Promise<BorrowRequestRecord> {
		const response = await fetch(`/api/borrow-requests/${id}/missing`, getFetchOptions('POST'));
		const data = await handleResponse<BorrowRequestRecord>(response);
		invalidateAllCaches();
		setCache(detailCache, id, data);
		return data;
	},

	async sendOverdueReminder(id: string): Promise<{ success: boolean; message: string; reminderCount: number }> {
		const response = await fetch(`/api/borrow-requests/${id}/send-reminder`, getFetchOptions('POST'));
		const data = await handleResponse<{ success: boolean; message: string; reminderCount: number }>(response);
		invalidateAllCaches();
		return data;
	},

	async initiateReturn(id: string): Promise<BorrowRequestRecord> {
		const response = await fetch(`/api/borrow-requests/${id}/initiate-return`, getFetchOptions('POST'));
		const data = await handleResponse<BorrowRequestRecord>(response);
		invalidateAllCaches();
		setCache(detailCache, id, data);
		return data;
	},

	/**
	 * Inspect items during return process
	 * Creates financial obligations for damaged/missing items
	 */
	async inspectItems(
		id: string,
		items: Array<{
			itemId: string;
			status: 'good' | 'damaged' | 'missing';
			notes?: string;
			unitPrice?: number;
		}>
	): Promise<{ success: boolean; message: string; status: BorrowRequestStatus; obligationsCreated: number }> {
		const response = await fetch(`/api/borrow-requests/${id}/inspect-items`, getFetchOptions('POST', { items }));
		const data = await handleResponse<{
			success: boolean;
			message: string;
			status: BorrowRequestStatus;
			obligationsCreated: number;
		}>(response);
		
		invalidateAllCaches();
		return data;
	},

	peekCachedList(params: {
		status?: BorrowRequestStatus;
		statuses?: BorrowRequestStatus[];
		search?: string;
		sortBy?: 'createdAt' | 'returnDate';
		page?: number;
		limit?: number;
	} = {}): BorrowRequestListResponse | null {
		return getFreshCache(listCache, buildListCacheKey(params));
	},

	peekCachedDetail(id: string): BorrowRequestRecord | null {
		return getFreshCache(detailCache, id);
	},

	invalidateCache(): void {
		invalidateAllCaches();
	},

	/**
	 * Open an SSE connection to `/api/borrow-requests/stream` and invoke
	 * `callback` whenever the server emits a `borrow_request_change` event.
	 *
	 * Returns an unsubscribe function — call it in `onDestroy` / cleanup.
	 * Safe to call from SSR context (no-ops when not in browser).
	 */
	subscribeToChanges(callback: (event: BorrowRequestRealtimeEvent) => void): () => void {
		if (!browser) return () => {};

		const source = new EventSource('/api/borrow-requests/stream');

		source.addEventListener('borrow_request_change', (e: MessageEvent) => {
			try {
				const data = JSON.parse(e.data) as BorrowRequestRealtimeEvent;
				callback(data);
			} catch {
				// Malformed payload — ignore.
			}
		});

		source.addEventListener('error', () => {
			// EventSource auto-reconnects after error; nothing to do here.
		});

		return () => {
			source.close();
		};
	}
};

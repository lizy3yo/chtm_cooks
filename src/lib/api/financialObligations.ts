import { browser } from '$app/environment';

export type ObligationType = 'missing' | 'damaged';
export type ObligationStatus = 'pending' | 'paid' | 'replaced' | 'waived';
export type ResolutionType = 'payment' | 'replacement' | 'waiver';

export interface FinancialObligation {
	id: string;
	borrowRequestId: string;
	studentId: string;
	studentName?: string;
	studentEmail?: string;
	studentProfilePhotoUrl?: string;
	itemId: string;
	itemName: string;
	itemCategory?: string;
	quantity: number;
	type: ObligationType;
	status: ObligationStatus;
	amount: number;
	amountPaid: number;
	balance: number;
	resolutionType?: ResolutionType;
	resolutionDate?: string;
	resolutionNotes?: string;
	paymentReference?: string;
	incidentDate: string;
	incidentNotes?: string;
	dueDate: string;
	createdAt: string;
	updatedAt: string;
}

export interface FinancialObligationsListResponse {
	obligations: FinancialObligation[];
	total: number;
	page: number;
	limit: number;
	pages: number;
}

export interface ResolveObligationRequest {
	resolutionType: ResolutionType;
	amountPaid?: number;
	resolutionNotes?: string;
	paymentReference?: string;
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
const listCache = new Map<string, CacheEntry<FinancialObligationsListResponse>>();
const detailCache = new Map<string, CacheEntry<{ obligation: FinancialObligation }>>();
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
	status?: ObligationStatus;
	studentId?: string;
	page?: number;
	limit?: number;
} = {}): string {
	return [
		params.status || 'all',
		params.studentId || 'self',
		String(params.page || 1),
		String(params.limit || 50)
	].join(':');
}

function invalidateAllCaches(): void {
	listCache.clear();
	detailCache.clear();
	inFlight.clear();
}

/**
 * Financial Obligations API Client
 * Industry-standard client for managing financial obligations
 */
export const financialObligationsAPI = {
	/**
	 * Get financial obligations with optional filters
	 */
	async getObligations(params: {
		status?: ObligationStatus;
		studentId?: string;
		page?: number;
		limit?: number;
	} = {}, options: RequestOptions = {}): Promise<FinancialObligationsListResponse> {
		try {
			const searchParams = new URLSearchParams();

			if (params.status) searchParams.set('status', params.status);
			if (params.studentId) searchParams.set('studentId', params.studentId);
			if (params.page) searchParams.set('page', params.page.toString());
			if (params.limit) searchParams.set('limit', params.limit.toString());
			if (options.forceRefresh) searchParams.set('_t', Date.now().toString());

			const query = searchParams.toString();
			const url = `/api/financial-obligations${query ? `?${query}` : ''}`;
			const cacheKey = buildListCacheKey(params);
			const inFlightKey = `list:${cacheKey}`;

			if (!options.forceRefresh) {
				const cached = getFreshCache(listCache, cacheKey);
				if (cached) {
					return cached;
				}

				const existingRequest = inFlight.get(inFlightKey) as Promise<FinancialObligationsListResponse> | undefined;
				if (existingRequest) {
					return existingRequest;
				}
			}

			const requestPromise = (async () => {
				const response = await fetch(url, getFetchOptions('GET'));
				const data = await handleResponse<FinancialObligationsListResponse>(response);
				setCache(listCache, cacheKey, data);
				return data;
			})();

			inFlight.set(inFlightKey, requestPromise);
			try {
				return await requestPromise;
			} finally {
				inFlight.delete(inFlightKey);
			}
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Failed to fetch obligations';
			throw new Error(message);
		}
	},

	/**
	 * Get a specific financial obligation
	 */
	async getObligation(id: string, options: RequestOptions = {}): Promise<{ obligation: FinancialObligation }> {
		try {
			const inFlightKey = `detail:${id}`;
			if (!options.forceRefresh) {
				const cached = getFreshCache(detailCache, id);
				if (cached) {
					return cached;
				}

				const existingRequest = inFlight.get(inFlightKey) as Promise<{ obligation: FinancialObligation }> | undefined;
				if (existingRequest) {
					return existingRequest;
				}
			}

			const url = options.forceRefresh
				? `/api/financial-obligations/${id}?_t=${Date.now()}`
				: `/api/financial-obligations/${id}`;
			const requestPromise = (async () => {
				const response = await fetch(url, getFetchOptions('GET'));
				const data = await handleResponse<{ obligation: FinancialObligation }>(response);
				setCache(detailCache, id, data);
				return data;
			})();

			inFlight.set(inFlightKey, requestPromise);
			try {
				return await requestPromise;
			} finally {
				inFlight.delete(inFlightKey);
			}
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Failed to fetch obligation';
			throw new Error(message);
		}
	},

	/**
	 * Resolve a financial obligation (payment, replacement, or waiver)
	 */
	async resolveObligation(
		id: string,
		resolution: ResolveObligationRequest
	): Promise<{ success: boolean; message: string }> {
		try {
			const response = await fetch(`/api/financial-obligations/${id}`, getFetchOptions('PATCH', resolution));
			const data = await handleResponse<{ success: boolean; message: string }>(response);
			invalidateAllCaches();
			return data;
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Failed to resolve obligation';
			throw new Error(message);
		}
	},

	peekCachedObligations(params: {
		status?: ObligationStatus;
		studentId?: string;
		page?: number;
		limit?: number;
	} = {}): FinancialObligationsListResponse | null {
		return getFreshCache(listCache, buildListCacheKey(params));
	},

	peekCachedObligation(id: string): { obligation: FinancialObligation } | null {
		return getFreshCache(detailCache, id);
	},

	invalidateCache(): void {
		invalidateAllCaches();
	}
};

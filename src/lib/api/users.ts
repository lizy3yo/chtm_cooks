/**
 * Users API Client
 * Professional, industry-standard API for user management with client-side caching and SSE
 */

import { browser } from '$app/environment';
import { getApiErrorMessage } from './session';

// ─── Types ────────────────────────────────────────────────────────────────────

export type UserRole = 'student' | 'custodian' | 'instructor' | 'superadmin';
export type UserStatus = 'active' | 'inactive';

export interface UserResponse {
	id: string;
	email: string;
	role: UserRole;
	firstName: string;
	lastName: string;
	profilePhotoUrl?: string;
	isActive: boolean;
	emailVerified: boolean;
	createdAt: string;
	lastLogin?: string;
	yearLevel?: string;
	block?: string;
}

export interface UsersListResponse {
	users: UserResponse[];
	pagination: {
		page: number;
		limit: number;
		total: number;
		totalPages: number;
	};
}

export interface CreateUserRequest {
	email: string;
	password: string;
	role: UserRole;
	firstName: string;
	lastName: string;
	yearLevel?: string;
	block?: string;
}

export interface UpdateUserRequest {
	firstName?: string;
	lastName?: string;
	isActive?: boolean;
	role?: UserRole;
	yearLevel?: string;
	block?: string;
}

export interface UserRealtimeEvent {
	action: 'user_created' | 'user_updated' | 'user_deleted';
	userId: string;
	occurredAt: string;
}

export interface ProfilePhotoUpdatedEvent {
	action: 'photo_updated';
	userId: string;
	occurredAt: string;
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

interface ApiError {
	error?: string;
	message?: string;
}

interface CacheEntry<T> {
	data: T;
	expiresAt: number;
}

const CLIENT_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes for user data
const listCache = new Map<string, CacheEntry<UsersListResponse>>();
const detailCache = new Map<string, CacheEntry<UserResponse>>();
const inFlight = new Map<string, Promise<unknown>>();

function getFetchOptions(method: string, body?: unknown): RequestInit {
	const options: RequestInit = {
		method,
		credentials: 'include',
		headers: { 'Content-Type': 'application/json' }
	};
	if (body !== undefined) options.body = JSON.stringify(body);
	return options;
}

async function handleResponse<T>(response: Response): Promise<T> {
	const payload = (await response.json().catch(() => ({}))) as T & ApiError;
	if (!response.ok) {
		const message = await getApiErrorMessage(
			response,
			payload.message || payload.error || `Request failed: ${response.status}`
		);
		throw new Error(message);
	}
	return payload;
}

function getFreshCache<T>(cache: Map<string, CacheEntry<T>>, key: string): T | null {
	if (!browser) return null;
	const entry = cache.get(key);
	if (!entry) return null;
	if (Date.now() > entry.expiresAt) {
		cache.delete(key);
		return null;
	}
	return entry.data;
}

function setCache<T>(cache: Map<string, CacheEntry<T>>, key: string, data: T): void {
	if (!browser) return;
	cache.set(key, { data, expiresAt: Date.now() + CLIENT_CACHE_TTL_MS });
}

function buildListCacheKey(params: {
	role?: UserRole;
	search?: string;
	page?: number;
	limit?: number;
}): string {
	return [
		params.role || 'all',
		params.search || 'none',
		String(params.page || 1),
		String(params.limit || 50)
	].join(':');
}

function invalidateAllCaches(): void {
	listCache.clear();
	detailCache.clear();
	inFlight.clear();
}

// ─── Public API ───────────────────────────────────────────────────────────────

export const usersAPI = {
	/**
	 * Fetch paginated users list with optional filters
	 */
	async getAll(
		params: {
			role?: UserRole;
			search?: string;
			page?: number;
			limit?: number;
			forceRefresh?: boolean;
		} = {}
	): Promise<UsersListResponse> {
		const searchParams = new URLSearchParams();
		if (params.role) searchParams.set('role', params.role);
		if (params.search) searchParams.set('search', params.search);
		if (params.page) searchParams.set('page', String(params.page));
		if (params.limit) searchParams.set('limit', String(params.limit));
		if (params.forceRefresh) searchParams.set('_t', String(Date.now()));

		const query = searchParams.toString();
		const url = `/api/users${query ? `?${query}` : ''}`;
		const cacheKey = buildListCacheKey(params);
		const inFlightKey = `list:${cacheKey}`;

		if (!params.forceRefresh) {
			const cached = getFreshCache(listCache, cacheKey);
			if (cached) return cached;

			const existing = inFlight.get(inFlightKey) as Promise<UsersListResponse> | undefined;
			if (existing) return existing;
		}

		const req = (async () => {
			const res = await fetch(url, getFetchOptions('GET'));
			const data = await handleResponse<UsersListResponse>(res);
			setCache(listCache, cacheKey, data);
			return data;
		})();

		inFlight.set(inFlightKey, req);
		try {
			return await req;
		} finally {
			inFlight.delete(inFlightKey);
		}
	},

	/**
	 * Fetch a single user by ID
	 */
	async getById(userId: string, forceRefresh = false): Promise<UserResponse> {
		const inFlightKey = `detail:${userId}`;

		if (!forceRefresh) {
			const cached = getFreshCache(detailCache, userId);
			if (cached) return cached;

			const existing = inFlight.get(inFlightKey) as Promise<UserResponse> | undefined;
			if (existing) return existing;
		}

		const url = forceRefresh ? `/api/users/${userId}?_t=${Date.now()}` : `/api/users/${userId}`;
		const req = (async () => {
			const res = await fetch(url, getFetchOptions('GET'));
			const data = await handleResponse<{ user: UserResponse }>(res);
			setCache(detailCache, userId, data.user);
			return data.user;
		})();

		inFlight.set(inFlightKey, req);
		try {
			return await req;
		} finally {
			inFlight.delete(inFlightKey);
		}
	},

	/**
	 * Create a new user
	 */
	async create(payload: CreateUserRequest): Promise<UserResponse> {
		const res = await fetch('/api/users', getFetchOptions('POST', payload));
		const data = await handleResponse<{ user: UserResponse }>(res);
		invalidateAllCaches();
		return data.user;
	},

	/**
	 * Update an existing user
	 */
	async update(userId: string, payload: UpdateUserRequest): Promise<UserResponse> {
		const res = await fetch(`/api/users?userId=${userId}`, getFetchOptions('PATCH', payload));
		const data = await handleResponse<{ user: UserResponse }>(res);
		invalidateAllCaches();
		setCache(detailCache, userId, data.user);
		return data.user;
	},

	/**
	 * Delete a user
	 */
	async delete(userId: string): Promise<{ success: boolean; message: string }> {
		const res = await fetch(`/api/users?userId=${userId}`, getFetchOptions('DELETE'));
		const data = await handleResponse<{ success: boolean; message: string }>(res);
		invalidateAllCaches();
		return data;
	},

	/**
	 * Subscribe to real-time user changes via SSE
	 * Returns an unsubscribe function
	 */
	subscribeToChanges(
		callback: (event: UserRealtimeEvent) => void,
		onPhotoUpdate?: (event: ProfilePhotoUpdatedEvent) => void
	): () => void {
		if (!browser) {
			console.log('[USER-SSE] Not in browser, skipping subscription');
			return () => {};
		}

		console.log('[USER-SSE] Creating EventSource connection to /api/users/stream');
		const source = new EventSource('/api/users/stream', { withCredentials: true });

		source.addEventListener('connected', (e: MessageEvent) => {
			console.log('[USER-SSE] ✓ Connected:', e.data);
		});

		// User CRUD events (create / update / delete)
		source.addEventListener('user_change', (e: MessageEvent) => {
			try {
				callback(JSON.parse(e.data) as UserRealtimeEvent);
			} catch (err) {
				console.error('[USER-SSE] ✗ Error handling user_change event:', err);
			}
		});

		// Profile photo events — handled in-place without a full reload
		source.addEventListener('profile_photo_updated', (e: MessageEvent) => {
			try {
				const photoEvent = JSON.parse(e.data) as ProfilePhotoUpdatedEvent;
				console.log('[USER-SSE] 📸 Profile photo updated for user:', photoEvent.userId);
				onPhotoUpdate?.(photoEvent);
			} catch (err) {
				console.error('[USER-SSE] ✗ Error handling profile_photo_updated event:', err);
			}
		});

		source.addEventListener('heartbeat', () => {
			// Keep-alive — no action needed
		});

		source.addEventListener('error', () => {
			console.warn('[USER-SSE] Connection error — browser will auto-reconnect.');
		});

		return () => {
			console.log('[USER-SSE] Disconnecting...');
			source.close();
		};
	},

	// ─── Cache utilities ────────────────────────────────────────────────────

	peekCachedUsers(params: {
		role?: UserRole;
		search?: string;
		page?: number;
		limit?: number;
	} = {}): UsersListResponse | null {
		return getFreshCache(listCache, buildListCacheKey(params));
	},

	peekCachedUser(userId: string): UserResponse | null {
		return getFreshCache(detailCache, userId);
	},

	invalidateCache(): void {
		invalidateAllCaches();
	}
};

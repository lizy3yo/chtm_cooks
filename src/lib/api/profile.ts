import { browser } from '$app/environment';
import type { UserResponse } from '$lib/types/auth';

interface ApiError {
	error?: string;
	message?: string;
}

interface ProfileResponse {
	user: UserResponse;
}

interface CacheEntry {
	user: UserResponse;
	expiresAt: number;
}

const PROFILE_CACHE_TTL_MS = 3_600_000;
let profileCache: CacheEntry | null = null;
let inFlight: Promise<UserResponse> | null = null;

function getCachedProfile(): UserResponse | null {
	if (!browser || !profileCache) return null;
	if (Date.now() > profileCache.expiresAt) {
		profileCache = null;
		return null;
	}
	return profileCache.user;
}

function setCachedProfile(user: UserResponse): void {
	if (!browser) return;
	profileCache = {
		user,
		expiresAt: Date.now() + PROFILE_CACHE_TTL_MS
	};
}

async function parseError(response: Response): Promise<string> {
	const payload = (await response.json().catch(() => ({}))) as ApiError;
	return payload.error || payload.message || `Request failed with status ${response.status}`;
}

export const profileApi = {
	async get(forceRefresh = false): Promise<UserResponse> {
		if (!forceRefresh) {
			const cached = getCachedProfile();
			if (cached) return cached;
		}

		if (inFlight) return inFlight;

		const url = forceRefresh ? `/api/auth/profile?_t=${Date.now()}` : '/api/auth/profile';
		inFlight = fetch(url, { credentials: 'include' })
			.then(async (response) => {
				if (!response.ok) {
					throw new Error(await parseError(response));
				}
				const payload = (await response.json()) as ProfileResponse;
				setCachedProfile(payload.user);
				inFlight = null;
				return payload.user;
			})
			.catch((error) => {
				inFlight = null;
				throw error;
			});

		return inFlight;
	},

	async update(input: {
		firstName: string;
		lastName: string;
		yearLevel: string;
		block: string;
	}): Promise<UserResponse> {
		const response = await fetch('/api/auth/profile', {
			method: 'PATCH',
			credentials: 'include',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(input)
		});

		if (!response.ok) {
			throw new Error(await parseError(response));
		}

		const payload = (await response.json()) as ProfileResponse;
		setCachedProfile(payload.user);
		return payload.user;
	},

	async uploadPhoto(file: File): Promise<UserResponse> {
		const formData = new FormData();
		formData.append('file', file);

		const response = await fetch('/api/auth/profile/photo', {
			method: 'POST',
			credentials: 'include',
			body: formData
		});

		if (!response.ok) {
			throw new Error(await parseError(response));
		}

		const payload = (await response.json()) as ProfileResponse;
		setCachedProfile(payload.user);
		return payload.user;
	},

	async removePhoto(): Promise<UserResponse> {
		const response = await fetch('/api/auth/profile/photo', {
			method: 'DELETE',
			credentials: 'include'
		});

		if (!response.ok) {
			throw new Error(await parseError(response));
		}

		const payload = (await response.json()) as ProfileResponse;
		setCachedProfile(payload.user);
		return payload.user;
	},

	async changePassword(input: { currentPassword: string; newPassword: string }): Promise<void> {
		const response = await fetch('/api/auth/profile/password', {
			method: 'PATCH',
			credentials: 'include',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(input)
		});

		if (!response.ok) {
			throw new Error(await parseError(response));
		}

		this.clearCache();
	},

	clearCache(): void {
		profileCache = null;
		inFlight = null;
	},

	subscribeToProfileChanges(onChange: () => void): () => void {
		if (!browser) return () => {};

		const source = new EventSource('/api/auth/profile/stream', { withCredentials: true });
		source.addEventListener('profile_change', () => {
			this.clearCache();
			onChange();
		});

		source.onerror = () => {
			// Browser handles retries. Keep handler no-op to avoid noise.
		};

		return () => {
			source.close();
		};
	}
};

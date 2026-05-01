import { writable } from 'svelte/store';
import type { UserResponse } from '$lib/types/auth';

/**
 * Profile Store - Persistent cache for user profile data
 * Survives component unmount/remount during navigation
 * Industry-standard pattern for client-side caching
 */

interface ProfileCache {
	profile: UserResponse | null;
	timestamp: number;
	loaded: boolean;
}

const CACHE_TTL_MS = 2 * 60 * 1000; // 2 minutes

const initialState: ProfileCache = {
	profile: null,
	timestamp: 0,
	loaded: false
};

function createProfileStore() {
	const { subscribe, update, set } = writable<ProfileCache>(initialState);

	return {
		subscribe,
		
		/**
		 * Set profile data in cache
		 */
		setProfile: (profile: UserResponse) => {
			update(state => ({
				...state,
				profile,
				timestamp: Date.now(),
				loaded: true
			}));
		},
		
		/**
		 * Check if cached profile is still valid
		 */
		isProfileCacheValid: (): boolean => {
			let isValid = false;
			update(state => {
				isValid = state.loaded && 
					state.profile !== null &&
					(Date.now() - state.timestamp) < CACHE_TTL_MS;
				return state;
			});
			return isValid;
		},
		
		/**
		 * Clear profile cache
		 */
		clearCache: () => {
			set(initialState);
		},
		
		/**
		 * Invalidate cache (mark as expired but keep data)
		 */
		invalidate: () => {
			update(state => ({
				...state,
				timestamp: 0
			}));
		}
	};
}

export const profileStore = createProfileStore();

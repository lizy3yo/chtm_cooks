/**
 * Authentication Store - Cookie-Based (Production-Grade)
 * 
 * Industry-standard authentication using httpOnly cookies
 * - No localStorage usage (immune to XSS)
 * - Automatic token refresh
 * - Session persistence via remember-me
 * - Proper error handling
 */

import { writable } from 'svelte/store';
import { browser } from '$app/environment';
import type { UserResponse } from '$lib/types/auth';

// Store state interface (simplified - no tokens in frontend)
interface AuthState {
	user: UserResponse | null;
	isAuthenticated: boolean;
	isLoading: boolean;
	error: string | null;
}

// Initial state
const initialState: AuthState = {
	user: null,
	isAuthenticated: false,
	isLoading: true,
	error: null
};

// Create the auth store
function createAuthStore() {
	const { subscribe, set, update } = writable<AuthState>(initialState);

	return {
		subscribe,

		/**
		 * Initialize authentication state
		 * Checks if user is authenticated via cookies
		 */
		init: async () => {
			if (!browser) return;

			try {
				// Try to get current user (will work if auth cookies exist)
				const response = await fetch('/api/auth/me', {
					credentials: 'include' // Include cookies
				});

				if (response.ok) {
					const data = await response.json();
					update((state) => ({
						...state,
						user: data.user,
						isAuthenticated: true,
						isLoading: false
					}));
				} else {
					// No active session, try auto-login with remember-me
					await authStore.tryAutoLogin();
				}
			} catch (error) {
				console.error('Auth initialization failed:', error);
				update((state) => ({
					...initialState,
					isLoading: false
				}));
			}
		},

		/**
		 * Login with credentials
		 * Tokens are automatically set in httpOnly cookies by backend
		 */
		login: (user: UserResponse) => {
			update((state) => ({
				...state,
				user,
				isAuthenticated: true,
				isLoading: false,
				error: null
			}));
		},

		/**
		 * Logout - clears cookies on server
		 */
		logout: async () => {
			try {
				await fetch('/api/auth/logout', {
					method: 'POST',
					credentials: 'include'
				});
			} catch (error) {
				console.error('Logout API call failed:', error);
			}
			
			// Clear local state
			update((state) => ({
				...initialState,
				isLoading: false
			}));
		},

		/**
		 * Update user data
		 */
		updateUser: (user: UserResponse) => {
			update((state) => ({
				...state,
				user
			}));
		},

		/**
		 * Set loading state
		 */
		setLoading: (isLoading: boolean) => {
			update((state) => ({
				...state,
				isLoading
			}));
		},

		/**
		 * Set error
		 */
		setError: (error: string | null) => {
			update((state) => ({
				...state,
				error
			}));
		},

		/**
		 * Clear error
		 */
		clearError: () => {
			update((state) => ({
				...state,
				error: null
			}));
		},

		/**
		 * Refresh tokens (access token expired)
		 * Called automatically by API client on 401
		 */
		refreshTokens: async (): Promise<boolean> => {
			try {
				const response = await fetch('/api/auth/refresh', {
					method: 'POST',
					credentials: 'include'
				});

				if (response.ok) {
					// Tokens automatically refreshed in cookies
					return true;
				}
				
				// Refresh failed - logout
				await authStore.logout();
				return false;
			} catch (error) {
				console.error('Token refresh failed:', error);
				await authStore.logout();
				return false;
			}
		},

		/**
		 * Try auto-login with remember-me cookie
		 */
		tryAutoLogin: async () => {
			try {
				const response = await fetch('/api/auth/auto-login', {
					method: 'POST',
					credentials: 'include'
				});

				if (response.ok) {
					const data = await response.json();
					update((state) => ({
						...state,
						user: data.user,
						isAuthenticated: true,
						isLoading: false
					}));
				} else {
					update((state) => ({
						...initialState,
						isLoading: false
					}));
				}
			} catch (error) {
				console.error('Auto-login failed:', error);
				update((state) => ({
					...initialState,
					isLoading: false
				}));
			}
		},

		/**
		 * Verify current session
		 */
		verifySession: async () => {
			try {
				const response = await fetch('/api/auth/me', {
					credentials: 'include'
				});

				if (response.ok) {
					const data = await response.json();
					update((state) => ({
						...state,
						user: data.user,
						isAuthenticated: true
					}));
					return true;
				} else {
					// Session invalid
					await authStore.logout();
					return false;
				}
			} catch (error) {
				console.error('Session verification failed:', error);
				return false;
			}
		},

		/**
		 * Logout from all devices
		 */
		logoutAllDevices: async (userId: string) => {
			try {
				await fetch('/api/auth/logout', {
					method: 'DELETE',
					credentials: 'include',
					headers: {
						'Content-Type': 'application/json'
					},
					body: JSON.stringify({ userId })
				});
				
				// Clear local state
				update((state) => ({
					...initialState,
					isLoading: false
				}));
			} catch (error) {
				console.error('Logout all devices failed:', error);
				throw error;
			}
		}
	};
}

// Export store instance
export const authStore = createAuthStore();

// Export derived store for user
export const user = {
	subscribe: (handler: (value: UserResponse | null) => void) => {
		return authStore.subscribe((state) => handler(state.user));
	}
};

// Export derived store for authentication status
export const isAuthenticated = {
	subscribe: (handler: (value: boolean) => void) => {
		return authStore.subscribe((state) => handler(state.isAuthenticated));
	}
};

// Export derived store for loading status
export const isLoading = {
	subscribe: (handler: (value: boolean) => void) => {
		return authStore.subscribe((state) => handler(state.isLoading));
	}
};

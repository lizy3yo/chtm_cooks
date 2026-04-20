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
	justLoggedIn: boolean; // Flag to track fresh login
}

// Initial state
const initialState: AuthState = {
	user: null,
	isAuthenticated: false,
	isLoading: true,
	error: null,
	justLoggedIn: false
};

// Create the auth store
function createAuthStore() {
	const { subscribe, set, update } = writable<AuthState>(initialState);

	return {
		subscribe,

		/**
		 * Initialize authentication state
		 * Checks if user is authenticated via cookies
		 * 
		 * Flow:
		 * 1. Check for active session (access token)
		 * 2. If no session, try auto-login with remember-me token
		 * 3. If both fail, user needs to login manually
		 */
		init: async () => {
			if (!browser) return;

			console.log('[AuthStore] Initializing authentication...');
			
			try {
				// First, try to get current user (checks if access token is valid)
				const meResponse = await fetch('/api/auth/me', {
					credentials: 'include',
					headers: {
						'Cache-Control': 'no-cache'
					}
				});

				if (meResponse.ok) {
					// User has valid access token
					const data = await meResponse.json();
					console.log('[AuthStore] Active session found for:', data.user.email);
					update((state) => ({
						...state,
						user: data.user,
						isAuthenticated: true,
						isLoading: false
					}));
					return;
				}

				// No active session - try auto-login with remember-me token
				console.log('[AuthStore] No active session, attempting auto-login...');
				const autoLoginResponse = await fetch('/api/auth/auto-login', {
					method: 'POST',
					credentials: 'include',
					headers: {
						'Content-Type': 'application/json',
						'Cache-Control': 'no-cache'
					}
				});

				if (autoLoginResponse.ok) {
					const data = await autoLoginResponse.json();
					console.log('[AuthStore] Auto-login successful for:', data.user.email);
					update((state) => ({
						...state,
						user: data.user,
						isAuthenticated: true,
						isLoading: false
					}));
					return;
				}

				// Both methods failed - user needs to login
				console.log('[AuthStore] No valid session or remember-me token found');
				update((state) => ({
					...initialState,
					isLoading: false
				}));

			} catch (error) {
				// Network error or unexpected error
				console.error('[AuthStore] Authentication initialization error:', error);
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
		console.log('[AuthStore.login] Received user:', user);
		console.log('[AuthStore.login] User type:', typeof user);
		console.log('[AuthStore.login] User keys:', user ? Object.keys(user) : 'null');
		console.log('[AuthStore.login] User JSON:', JSON.stringify(user, null, 2));
		
		update((state) => ({
			...state,
			user,
			isAuthenticated: true,
			isLoading: false,
			error: null,
			justLoggedIn: true // Set flag on login
		}));
	},
	
	/**
	 * Clear the justLoggedIn flag
	 */
	clearJustLoggedIn: () => {
		update((state) => ({
			...state,
			justLoggedIn: false
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
		 * This is a standalone method that can be called independently
		 * 
		 * @returns Promise<boolean> - true if auto-login succeeded, false otherwise
		 */
		tryAutoLogin: async (): Promise<boolean> => {
			try {
				console.log('[AuthStore] Attempting auto-login...');
				const response = await fetch('/api/auth/auto-login', {
					method: 'POST',
					credentials: 'include',
					headers: {
						'Content-Type': 'application/json',
						'Cache-Control': 'no-cache'
					}
				});

				if (response.ok) {
					const data = await response.json();
					console.log('[AuthStore] Auto-login successful for:', data.user.email);
					update((state) => ({
						...state,
						user: data.user,
						isAuthenticated: true,
						isLoading: false
					}));
					return true;
				}

				// Auto-login failed (no remember-me token or expired)
				console.log('[AuthStore] Auto-login failed:', response.status);
				update((state) => ({
					...initialState,
					isLoading: false
				}));
				return false;

			} catch (error) {
				console.error('[AuthStore] Auto-login error:', error);
				update((state) => ({
					...initialState,
					isLoading: false
				}));
				return false;
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

// Export derived store for justLoggedIn status
export const justLoggedIn = {
	subscribe: (handler: (value: boolean) => void) => {
		return authStore.subscribe((state) => handler(state.justLoggedIn));
	}
};

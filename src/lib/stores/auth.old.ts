import { writable, derived, get } from 'svelte/store';
import { browser } from '$app/environment';
import type { AuthResponse, UserResponse } from '$lib/types/auth';

// Constants
const TOKEN_KEY = 'auth_token';
const REFRESH_TOKEN_KEY = 'refresh_token';
const USER_KEY = 'user_data';

// Store state interface
interface AuthState {
	user: UserResponse | null;
	accessToken: string | null;
	refreshToken: string | null;
	isAuthenticated: boolean;
	isLoading: boolean;
	error: string | null;
}

// Initial state
const initialState: AuthState = {
	user: null,
	accessToken: null,
	refreshToken: null,
	isAuthenticated: false,
	isLoading: true,
	error: null
};

// Helper functions for localStorage
const storage = {
	get: (key: string): string | null => {
		if (!browser) return null;
		return localStorage.getItem(key);
	},
	set: (key: string, value: string): void => {
		if (!browser) return;
		localStorage.setItem(key, value);
	},
	remove: (key: string): void => {
		if (!browser) return;
		localStorage.removeItem(key);
	},
	clear: (): void => {
		if (!browser) return;
		localStorage.removeItem(TOKEN_KEY);
		localStorage.removeItem(REFRESH_TOKEN_KEY);
		localStorage.removeItem(USER_KEY);
	}
};

// Create the auth store
function createAuthStore() {
	const { subscribe, set, update } = writable<AuthState>(initialState);

	return {
		subscribe,

		// Initialize auth state from localStorage
		init: async () => {
			if (!browser) return;

			const accessToken = storage.get(TOKEN_KEY);
			const refreshToken = storage.get(REFRESH_TOKEN_KEY);
			const userData = storage.get(USER_KEY);

			if (accessToken && refreshToken && userData) {
				try {
					const user = JSON.parse(userData) as UserResponse;
					update((state) => ({
						...state,
						user,
						accessToken,
						refreshToken,
						isAuthenticated: true,
						isLoading: false
					}));

					// Verify token is still valid
					await authStore.verifySession();
				} catch (error) {
					console.error('Failed to parse user data:', error);
					authStore.logout();
				}
			} else {
				// No tokens in localStorage, try auto-login with remember-me cookie
				await authStore.tryAutoLogin();
			}
		},

		// Login
		login: (authData: AuthResponse) => {
			storage.set(TOKEN_KEY, authData.accessToken);
			storage.set(REFRESH_TOKEN_KEY, authData.refreshToken);
			storage.set(USER_KEY, JSON.stringify(authData.user));

			update((state) => ({
				...state,
				user: authData.user,
				accessToken: authData.accessToken,
				refreshToken: authData.refreshToken,
				isAuthenticated: true,
				isLoading: false,
				error: null
			}));
		},

		// Logout
		logout: async () => {
			try {
				// Call logout API to clear remember-me token
				await fetch('/api/auth/logout', {
					method: 'POST',
					credentials: 'include'
				});
			} catch (error) {
				console.error('Logout API call failed:', error);
				// Continue with local cleanup even if API call fails
			}
			
			storage.clear();
			update((state) => ({
				...initialState,
				isLoading: false
			}));
		},

		// Update user data
		updateUser: (user: UserResponse) => {
			storage.set(USER_KEY, JSON.stringify(user));
			update((state) => ({
				...state,
				user
			}));
		},

		// Set loading state
		setLoading: (isLoading: boolean) => {
			update((state) => ({
				...state,
				isLoading
			}));
		},

		// Set error
		setError: (error: string | null) => {
			update((state) => ({
				...state,
				error
			}));
		},

		// Verify session with backend
		verifySession: async () => {
			try {
				const state = get(authStore);
				if (!state.accessToken) return;

				const response = await fetch('/api/auth/me', {
					headers: {
						Authorization: `Bearer ${state.accessToken}`
					}
				});

				if (!response.ok) {
					// Try to refresh token
					await authStore.refreshAccessToken();
				}
			} catch (error) {
				console.error('Session verification failed:', error);
				authStore.logout();
			}
		},

		// Refresh access token
		refreshAccessToken: async () => {
			try {
				const state = get(authStore);
				if (!state.refreshToken) {
					authStore.logout();
					return;
				}

				const response = await fetch('/api/auth/refresh', {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json'
					},
					body: JSON.stringify({ refreshToken: state.refreshToken })
				});

				if (!response.ok) {
					authStore.logout();
					return;
				}

				const data: AuthResponse = await response.json();
				authStore.login(data);
			} catch (error) {
				console.error('Token refresh failed:', error);
				authStore.logout();
			}
		},

		// Get access token
		getAccessToken: (): string | null => {
			return get(authStore).accessToken;
		},

		// Try auto-login with remember-me cookie
		tryAutoLogin: async () => {
			if (!browser) return;
			
			try {
				const response = await fetch('/api/auth/auto-login', {
					method: 'POST',
					credentials: 'include' // Important: Include cookies
				});

				if (response.ok) {
					const data: AuthResponse = await response.json();
					authStore.login(data);
				} else {
					// Auto-login failed, set loading to false
					update((state) => ({
						...state,
						isLoading: false
					}));
				}
			} catch (error) {
				console.error('Auto-login failed:', error);
				update((state) => ({
					...state,
					isLoading: false
				}));
			}
		},

		// Logout from all devices
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
			} catch (error) {
				console.error('Logout all devices failed:', error);
			}
			
			storage.clear();
			update((state) => ({
				...initialState,
				isLoading: false
			}));
		}
	};
}

export const authStore = createAuthStore();

// Derived stores for convenience
export const user = derived(authStore, ($auth) => $auth.user);
export const isAuthenticated = derived(authStore, ($auth) => $auth.isAuthenticated);
export const isLoading = derived(authStore, ($auth) => $auth.isLoading);
export const authError = derived(authStore, ($auth) => $auth.error);

// Role-based derived stores
export const isStudent = derived(user, ($user) => $user?.role === 'student');
export const isInstructor = derived(user, ($user) => $user?.role === 'instructor');
export const isCustodian = derived(user, ($user) => $user?.role === 'custodian');
export const isSuperAdmin = derived(user, ($user) => $user?.role === 'superadmin');
export const isStaff = derived(user, ($user) => 
	$user?.role === 'instructor' || $user?.role === 'custodian' || $user?.role === 'superadmin'
);

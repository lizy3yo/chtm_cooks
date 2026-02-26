/**
 * Authentication API Client - Cookie-Based
 * 
 * Production-grade API client using httpOnly cookies
 * - Automatic credential inclusion
 * - Token refresh handling
 * - Proper error handling
 */

import type { 
	LoginRequest, 
	RegisterRequest, 
	UserResponse, 
	ApiError,
	ShortcutKeyLoginRequest,
	ActiveSession
} from '$lib/types/auth';
import { authStore } from '$lib/stores/auth';

// Base API configuration
const API_BASE_URL = '/api/auth';

// Generic API error handler
class ApiErrorHandler extends Error {
	status: number;
	code?: string;
	details?: unknown;

	constructor(message: string, status: number, code?: string, details?: unknown) {
		super(message);
		this.name = 'ApiError';
		this.status = status;
		this.code = code;
		this.details = details;
	}
}

// Generic fetch wrapper with automatic auth and error handling
async function apiRequest<T>(
	endpoint: string,
	options: RequestInit = {},
	retry = true
): Promise<T> {
	try {
		const response = await fetch(`${API_BASE_URL}${endpoint}`, {
			...options,
			credentials: 'include', // Always include cookies
			headers: {
				'Content-Type': 'application/json',
				...options.headers
			}
		});

		const data = await response.json();

		// Handle token expiration
		if (response.status === 401 && retry) {
			// Try to refresh tokens
			const refreshed = await authStore.refreshTokens();
			if (refreshed) {
				// Retry request with new tokens
				return apiRequest<T>(endpoint, options, false);
			}
		}

		if (!response.ok) {
			const error = data as ApiError;
			throw new ApiErrorHandler(
				error.error || 'An error occurred',
				response.status,
				error.code,
				error.details
			);
		}

		return data as T;
	} catch (error) {
		if (error instanceof ApiErrorHandler) {
			throw error;
		}
		throw new ApiErrorHandler('Network error occurred', 500);
	}
}

// Auth API methods
export const authApi = {
	/**
	 * Login with email and password
	 * Tokens automatically set in httpOnly cookies
	 */
	login: async (credentials: LoginRequest): Promise<{ user: UserResponse }> => {
		// Accept either `email` or legacy `username` (used by staff shortcut login)
		const payload: any = { ...credentials } as any;
		if (!payload.email && payload.username) {
			payload.email = payload.username;
			delete payload.username;
		}

		return apiRequest<{ user: UserResponse }>('/login', {
			method: 'POST',
			body: JSON.stringify(payload)
		});
	},

	/**
	 * Register a new user (primarily for students)
	 * Tokens automatically set in httpOnly cookies
	 */
	register: async (userData: RegisterRequest): Promise<{ user: UserResponse }> => {
		return apiRequest<{ user: UserResponse }>('/register', {
			method: 'POST',
			body: JSON.stringify(userData)
		});
	},

	/**
	 * Login with shortcut key (for staff and admins)
	 * Tokens automatically set in httpOnly cookies
	 */
	shortcutKeyLogin: async (data: ShortcutKeyLoginRequest): Promise<{ user: UserResponse }> => {
		return apiRequest<{ user: UserResponse }>('/shortcut-login', {
			method: 'POST',
			body: JSON.stringify(data)
		});
	},

	/**
	 * Get current user information
	 * Uses auth cookies automatically
	 */
	me: async (): Promise<{ user: UserResponse }> => {
		return apiRequest<{ user: UserResponse }>('/me');
	},

	/**
	 * Refresh access token
	 * Uses refresh token from httpOnly cookie
	 */
	refresh: async (): Promise<{ success: boolean }> => {
		return apiRequest<{ success: boolean }>('/refresh', {
			method: 'POST'
		});
	},

	/**
	 * Resend verification email
	 */
	resendVerification: async (email: string): Promise<{ message: string }> => {
		return apiRequest<{ message: string }>('/resend-verification', {
			method: 'POST',
			body: JSON.stringify({ email })
		});
	},

	/**
	 * Request password reset
	 */
	forgotPassword: async (email: string): Promise<{ message: string }> => {
		return apiRequest<{ message: string }>('/forgot-password', {
			method: 'POST',
			body: JSON.stringify({ email })
		});
	},

	/**
	 * Reset password with token
	 */
	resetPassword: async (token: string, password: string): Promise<{ message: string }> => {
		return apiRequest<{ message: string }>('/reset-password', {
			method: 'POST',
			body: JSON.stringify({ token, password })
		});
	},

	/**
	 * Verify email with token (GET request via direct fetch)
	 */
	verifyEmail: async (token: string): Promise<{ success: boolean; message: string }> => {
		const response = await fetch(`${API_BASE_URL}/verify-email?token=${encodeURIComponent(token)}`, {
			credentials: 'include'
		});
		const data = await response.json();
		
		if (!response.ok) {
			const error = data as ApiError;
			throw new ApiErrorHandler(
				error.error || 'Verification failed',
				response.status,
				error.code,
				error.details
			);
		}
		
		return data as { success: boolean; message: string };
	},

	/**
	 * Auto-login with remember-me cookie
	 */
	autoLogin: async (): Promise<{ user: UserResponse }> => {
		return apiRequest<{ user: UserResponse }>('/auto-login', {
			method: 'POST'
		});
	},

	/**
	 * Logout - clears all auth cookies
	 */
	logout: async (): Promise<{ success: boolean; message: string }> => {
		return apiRequest<{ success: boolean; message: string }>('/logout', {
			method: 'POST'
		});
	},

	/**
	 * Logout from all devices
	 */
	logoutAllDevices: async (userId: string): Promise<{ success: boolean; message: string }> => {
		return apiRequest<{ success: boolean; message: string }>('/logout', {
			method: 'DELETE',
			body: JSON.stringify({ userId })
		});
	},

	/**
	 * Get all active sessions for the user
	 */
	getSessions: async (): Promise<{ sessions: ActiveSession[] }> => {
		return apiRequest<{ sessions: ActiveSession[] }>('/sessions');
	},

	/**
	 * Revoke a specific session
	 */
	revokeSession: async (sessionId: string): Promise<{ success: boolean; message: string }> => {
		return apiRequest<{ success: boolean; message: string }>('/sessions', {
			method: 'DELETE',
			body: JSON.stringify({ sessionId })
		});
	}
};

export { ApiErrorHandler };

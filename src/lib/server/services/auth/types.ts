/**
 * Authentication Service Types
 * 
 * Centralized type definitions for authentication services
 * following clean architecture principles.
 */

export interface DeviceInfo {
	userAgent?: string;
	ipAddress?: string;
	fingerprint?: string;
}

export interface TokenPair {
	accessToken: string;
	refreshToken: string;
}

export interface RememberMeOptions {
	enabled: boolean;
	expiresInDays: number;
}

export const REMEMBER_ME_DEFAULTS = {
	COOKIE_NAME: 'remember_me',
	EXPIRY_DAYS: 30,
	MAX_SESSIONS_PER_USER: 5,
	TOKEN_LENGTH: 32, // bytes for crypto.randomBytes
	CLEANUP_INTERVAL_HOURS: 24
} as const;

export const COOKIE_OPTIONS = {
	httpOnly: true,
	sameSite: 'lax' as const,
	path: '/'
};

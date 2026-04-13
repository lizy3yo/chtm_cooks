/**
 * Cookie-based Authentication Utilities
 * 
 * Production-grade cookie management for JWT tokens
 * - HttpOnly cookies for access/refresh tokens
 * - Secure flags in production
 * - SameSite protection against CSRF
 * - Proper expiration handling
 */

import type { RequestEvent } from '@sveltejs/kit';
import { dev } from '$app/environment';
import { type UserRole } from '$lib/server/models/User';

// Cookie configuration
export const AUTH_COOKIES = {
	ACCESS_TOKEN: 'access_token',
	REFRESH_TOKEN: 'refresh_token',
} as const;

// Token expiration durations (in seconds)
export const TOKEN_EXPIRY = {
	ACCESS: 60 * 60, // 1 hour
	STAFF_ACCESS: 12 * 60 * 60, // 12 hours for custodian/instructor
	REFRESH: 7 * 24 * 60 * 60, // 7 days
} as const;

export function getAccessTokenMaxAge(role: UserRole): number {
	if (role === 'custodian' || role === 'instructor') {
		return TOKEN_EXPIRY.STAFF_ACCESS;
	}

	return TOKEN_EXPIRY.ACCESS;
}

/**
 * Cookie options for secure authentication
 */
const getCookieOptions = (maxAge: number) => ({
	httpOnly: true,
	secure: !dev, // HTTPS only in production
	sameSite: 'lax' as const, // Changed from 'strict' to 'lax' to support more request types
	path: '/',
	maxAge,
});

/**
 * Set access token in httpOnly cookie
 */
export function setAccessTokenCookie(event: RequestEvent, token: string, maxAge = TOKEN_EXPIRY.ACCESS): void {
	event.cookies.set(
		AUTH_COOKIES.ACCESS_TOKEN,
		token,
		getCookieOptions(maxAge)
	);
}

/**
 * Set refresh token in httpOnly cookie
 */
export function setRefreshTokenCookie(event: RequestEvent, token: string): void {
	event.cookies.set(
		AUTH_COOKIES.REFRESH_TOKEN,
		token,
		getCookieOptions(TOKEN_EXPIRY.REFRESH)
	);
}

/**
 * Get access token from cookie
 */
export function getAccessTokenFromCookie(event: RequestEvent): string | null {
	return event.cookies.get(AUTH_COOKIES.ACCESS_TOKEN) || null;
}

/**
 * Get refresh token from cookie
 */
export function getRefreshTokenFromCookie(event: RequestEvent): string | null {
	return event.cookies.get(AUTH_COOKIES.REFRESH_TOKEN) || null;
}

/**
 * Clear all authentication cookies
 */
export function clearAuthCookies(event: RequestEvent): void {
	const cookieOptions = {
		httpOnly: true,
		secure: !dev,
		sameSite: 'lax' as const,
		path: '/',
		maxAge: 0,
	};

	event.cookies.delete(AUTH_COOKIES.ACCESS_TOKEN, { path: '/' });
	event.cookies.delete(AUTH_COOKIES.REFRESH_TOKEN, { path: '/' });
}

/**
 * Set both access and refresh tokens
 */
export function setAuthTokens(
	event: RequestEvent,
	accessToken: string,
	refreshToken: string,
	accessTokenMaxAge = TOKEN_EXPIRY.ACCESS
): void {
	setAccessTokenCookie(event, accessToken, accessTokenMaxAge);
	setRefreshTokenCookie(event, refreshToken);
}

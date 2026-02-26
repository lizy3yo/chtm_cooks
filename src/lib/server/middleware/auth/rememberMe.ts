import type { RequestEvent } from '@sveltejs/kit';
import { rememberMeService } from '$lib/server/services/auth';
import { REMEMBER_ME_DEFAULTS, COOKIE_OPTIONS } from '$lib/server/services/auth/types';
import { dev } from '$app/environment';

/**
 * Remember Me Middleware
 * 
 * Provides utilities for handling remember-me cookies and tokens.
 * Follows industry best practices for secure persistent sessions.
 */

/**
 * Set remember-me cookie in response
 * 
 * @param event - SvelteKit request event
 * @param token - Plain token to set (format: selector:validator)
 * @param expiresAt - Token expiration date
 */
export function setRememberMeCookie(
	event: RequestEvent,
	token: string,
	expiresAt: Date
): void {
	const maxAge = Math.floor((expiresAt.getTime() - Date.now()) / 1000);
	
	const cookieOptions = {
		...COOKIE_OPTIONS,
		secure: !dev, // Allow non-secure in development
		maxAge,
		expires: expiresAt
	};
	
	console.log('[RememberMe] Setting cookie:', {
		name: REMEMBER_ME_DEFAULTS.COOKIE_NAME,
		tokenPreview: token.substring(0, 20) + '...',
		expiresAt,
		maxAge,
		options: cookieOptions
	});
	
	event.cookies.set(REMEMBER_ME_DEFAULTS.COOKIE_NAME, token, cookieOptions);
}

/**
 * Get remember-me token from cookie
 * 
 * @param event - SvelteKit request event
 * @returns Token string or null if not present
 */
export function getRememberMeCookie(event: RequestEvent): string | null {
	const cookie = event.cookies.get(REMEMBER_ME_DEFAULTS.COOKIE_NAME) || null;
	console.log('[RememberMe] Getting cookie:', {
		name: REMEMBER_ME_DEFAULTS.COOKIE_NAME,
		found: !!cookie,
		tokenPreview: cookie ? cookie.substring(0, 20) + '...' : 'null'
	});
	return cookie;
}

/**
 * Clear remember-me cookie
 * 
 * @param event - SvelteKit request event
 */
export function clearRememberMeCookie(event: RequestEvent): void {
	event.cookies.delete(REMEMBER_ME_DEFAULTS.COOKIE_NAME, {
		path: COOKIE_OPTIONS.path
	});
}

/**
 * Extract device information from request
 * 
 * @param event - SvelteKit request event
 * @returns Device info object
 */
export function getDeviceInfo(event: RequestEvent) {
	return {
		userAgent: event.request.headers.get('user-agent') || undefined,
		ipAddress: getClientIp(event)
	};
}

/**
 * Get client IP address from request
 * Handles common proxy headers
 * 
 * @param event - SvelteKit request event
 * @returns IP address or undefined
 */
export function getClientIp(event: RequestEvent): string | undefined {
	// Check common proxy headers
	const forwarded = event.request.headers.get('x-forwarded-for');
	if (forwarded) {
		// Take first IP if multiple are present
		return forwarded.split(',')[0].trim();
	}
	
	const realIp = event.request.headers.get('x-real-ip');
	if (realIp) {
		return realIp;
	}
	
	// Fallback to event.getClientAddress() if available
	return event.getClientAddress();
}

/**
 * Validate and process remember-me token
 * Returns user ID if valid, null otherwise
 * 
 * @param event - SvelteKit request event
 * @returns User ID or null
 */
export async function validateRememberMeToken(event: RequestEvent): Promise<string | null> {
	const token = getRememberMeCookie(event);
	if (!token) {
		console.log('[RememberMe] No token found in cookie');
		return null;
	}
	
	const deviceInfo = getDeviceInfo(event);
	const result = await rememberMeService.validateToken(token, deviceInfo);
	
	console.log('[RememberMe] Validation result:', {
		isValid: result.isValid,
		userId: result.userId,
		error: result.error
	});
	
	if (!result.isValid) {
		// Clear invalid cookie
		clearRememberMeCookie(event);
		return null;
	}
	
	return result.userId || null;
}

/**
 * Rotate remember-me token after validation
 * This provides additional security by issuing a new token after each use
 * 
 * @param event - SvelteKit request event
 * @param tokenId - Current token ID
 * @param userId - User ID
 * @returns New token or null if rotation failed
 */
export async function rotateRememberMeToken(
	event: RequestEvent,
	tokenId: string,
	userId: string
): Promise<boolean> {
	try {
		const deviceInfo = getDeviceInfo(event);
		const newToken = await rememberMeService.rotateToken(tokenId, userId, deviceInfo);
		
		setRememberMeCookie(event, newToken.plainToken, newToken.expiresAt);
		return true;
	} catch (error) {
		console.error('Failed to rotate remember-me token:', error);
		return false;
	}
}

/**
 * Revoke remember-me token and clear cookie
 * 
 * @param event - SvelteKit request event
 * @param tokenId - Token ID to revoke (optional - will get from cookie if not provided)
 */
export async function revokeRememberMeToken(
	event: RequestEvent,
	tokenId?: string
): Promise<void> {
	const token = getRememberMeCookie(event);
	
	if (tokenId) {
		await rememberMeService.revokeToken(tokenId, 'User logout');
	} else if (token) {
		// Parse token to get selector and find token ID
		const parts = token.split(':');
		if (parts.length === 2) {
			const tokenDoc = await rememberMeService.getTokenBySelector(parts[0]);
			if (tokenDoc?._id) {
				await rememberMeService.revokeToken(tokenDoc._id.toString(), 'User logout');
			}
		}
	}
	
	clearRememberMeCookie(event);
}

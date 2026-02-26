/**
 * Authentication Verification Middleware
 * 
 * Verifies JWT tokens from httpOnly cookies
 * Implements proper token validation and user extraction
 */

import type { RequestEvent } from '@sveltejs/kit';
import { verifyAccessToken, type JWTPayload } from '$lib/server/utils/jwt';
import { getAccessTokenFromCookie } from './cookies';
import { AppError } from '$lib/server/errors';

export interface AuthenticatedRequest extends RequestEvent {
	user: JWTPayload;
}

/**
 * Verify access token from cookie and extract user information
 * 
 * @param event - SvelteKit request event
 * @returns User payload if valid, null otherwise
 */
export function getUserFromToken(event: RequestEvent): JWTPayload | null {
	try {
		const accessToken = getAccessTokenFromCookie(event);
		
		if (!accessToken) {
			return null;
		}

		const payload = verifyAccessToken(accessToken);
		return payload;
	} catch (error) {
		// Token expired or invalid
		return null;
	}
}

/**
 * Require authentication - throws if not authenticated
 * Use this in protected API routes
 * 
 * @param event - SvelteKit request event
 * @returns User payload
 * @throws AppError if not authenticated
 */
export function requireAuth(event: RequestEvent): JWTPayload {
	const user = getUserFromToken(event);
	
	if (!user) {
		throw new AppError('Authentication required', 401, 'UNAUTHORIZED');
	}
	
	return user;
}

/**
 * Require specific role - throws if not authenticated or wrong role
 * 
 * @param event - SvelteKit request event
 * @param allowedRoles - Array of allowed roles
 * @returns User payload
 * @throws AppError if not authorized
 */
export function requireRole(event: RequestEvent, allowedRoles: string[]): JWTPayload {
	const user = requireAuth(event);
	
	if (!allowedRoles.includes(user.role)) {
		throw new AppError(
			'Insufficient permissions',
			403,
			'FORBIDDEN'
		);
	}
	
	return user;
}

/**
 * Attach user to locals if authenticated (non-throwing)
 * Use this in hooks.server.ts for optional authentication
 */
export function attachUser(event: RequestEvent): void {
	const user = getUserFromToken(event);
	if (user) {
		event.locals.user = user;
	}
}

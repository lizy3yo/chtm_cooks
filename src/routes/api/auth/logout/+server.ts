import { json } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';
import { revokeRememberMeToken } from '$lib/server/middleware/auth/rememberMe';
import { rememberMeService } from '$lib/server/services/auth';
import { clearAuthCookies } from '$lib/server/middleware/auth/cookies';

/**
 * Logout Endpoint
 * 
 * Logs out the user by:
 * 1. Clearing auth tokens (access/refresh) from cookies
 * 2. Revoking the remember-me token (if exists)
 * 3. Clearing the remember-me cookie
 */
export const POST = async (event: RequestEvent) => {
	try {
		// Clear all authentication cookies
		clearAuthCookies(event);
		
		// Revoke remember-me token and clear cookie
		await revokeRememberMeToken(event);
		
		return json({ success: true, message: 'Logged out successfully' }, { status: 200 });
	} catch (error) {
		console.error('Logout error:', error);
		return json(
			{ error: 'Logout failed' },
			{ status: 500 }
		);
	}
};

/**
 * DELETE: Logout from all devices
 * Revokes all remember-me tokens for the user
 */
export const DELETE = async (event: RequestEvent) => {
	try {
		const { request } = event;
		const body = await request.json();
		
		if (!body.userId) {
			return json({ error: 'User ID required' }, { status: 400 });
		}
		
		// Clear all authentication cookies for current session
		clearAuthCookies(event);
		
		// Revoke all tokens for user
		const count = await rememberMeService.revokeAllUserTokens(
			body.userId,
			'User logged out from all devices'
		);
		
		// Clear current remember-me cookie
		await revokeRememberMeToken(event);
		
		return json(
			{ success: true, message: `Logged out from ${count} device(s)` },
			{ status: 200 }
		);
	} catch (error) {
		console.error('Logout all devices error:', error);
		return json(
			{ error: 'Failed to logout from all devices' },
			{ status: 500 }
		);
	}
};

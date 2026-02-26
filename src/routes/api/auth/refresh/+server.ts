import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { verifyRefreshToken, generateAccessToken, generateRefreshToken } from '$lib/server/utils/jwt';
import { rateLimit, RateLimitPresets, applyRateLimitHeaders } from '$lib/server/middleware/rateLimit';
import { 
	getRefreshTokenFromCookie, 
	setAuthTokens,
	clearAuthCookies 
} from '$lib/server/middleware/auth/cookies';

/**
 * Token Refresh Endpoint
 * 
 * Refreshes access token using refresh token from httpOnly cookie
 * Industry-standard implementation with proper security
 */
export const POST: RequestHandler = async (event) => {
	// Apply rate limiting for token refresh
	const rateLimitResult = await rateLimit(event, RateLimitPresets.REFRESH);
	
	// If rate limit exceeded, return the error response
	if (rateLimitResult instanceof Response) {
		return rateLimitResult;
	}
	
	try {
		// Get refresh token from httpOnly cookie
		const refreshToken = getRefreshTokenFromCookie(event);

		if (!refreshToken) {
			return json({ error: 'Refresh token required' }, { status: 400 });
		}

		// Verify refresh token
		const payload = verifyRefreshToken(refreshToken);

		// Generate new token pair
		const newAccessToken = generateAccessToken({
			userId: payload.userId,
			email: payload.email,
			role: payload.role
		});

		const newRefreshToken = generateRefreshToken({
			userId: payload.userId,
			email: payload.email,
			role: payload.role
		});

		// Set new tokens in httpOnly cookies
		setAuthTokens(event, newAccessToken, newRefreshToken);

		// Add rate limit headers to successful response
		const responseHeaders = new Headers();
		applyRateLimitHeaders(responseHeaders, rateLimitResult);
		
		return json({
			success: true,
			message: 'Tokens refreshed successfully'
		}, {
			headers: responseHeaders
		});
	} catch (error) {
		// Clear invalid cookies
		clearAuthCookies(event);
		
		return json({ error: 'Invalid or expired refresh token' }, { status: 401 });
	}
};

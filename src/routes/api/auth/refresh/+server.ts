import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { verifyRefreshToken, generateAccessToken, generateRefreshToken } from '$lib/server/utils/jwt';
import { rateLimit, RateLimitPresets, applyRateLimitHeaders } from '$lib/server/middleware/rateLimit';
import { getDatabase } from '$lib/server/db/mongodb';
import type { User } from '$lib/server/models/User';
import { ObjectId } from 'mongodb';
import { 
	getRefreshTokenFromCookie, 
	setAuthTokens,
	clearAuthCookies 
} from '$lib/server/middleware/auth/cookies';
import { getAccessTokenMaxAge } from '$lib/server/middleware/auth/cookies';

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

		// Confirm user still exists and is allowed to authenticate.
		const db = await getDatabase();
		const usersCollection = db.collection<User>('users');
		const user = await usersCollection.findOne({ _id: new ObjectId(payload.userId) });

		if (!user || !user.isActive) {
			clearAuthCookies(event);
			return json({ error: 'Account is inactive or no longer available' }, { status: 401 });
		}

		if (user.role === 'student' && !user.emailVerified) {
			clearAuthCookies(event);
			return json({ error: 'Email not verified' }, { status: 403 });
		}

		// Generate new token pair
		const newAccessToken = generateAccessToken({
			userId: user._id!.toString(),
			email: user.email,
			role: user.role
		});

		const newRefreshToken = generateRefreshToken({
			userId: user._id!.toString(),
			email: user.email,
			role: user.role
		});

		// Set new tokens in httpOnly cookies
		setAuthTokens(event, newAccessToken, newRefreshToken, getAccessTokenMaxAge(user.role));

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

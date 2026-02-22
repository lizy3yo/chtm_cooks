import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { verifyRefreshToken, generateAccessToken, generateRefreshToken } from '$lib/server/utils/jwt';
import { rateLimit, RateLimitPresets, applyRateLimitHeaders } from '$lib/server/middleware/rateLimit';

export const POST: RequestHandler = async (event) => {
	const { request } = event;
	
	// Apply rate limiting for token refresh
	const rateLimitResult = await rateLimit(event, RateLimitPresets.REFRESH);
	
	// If rate limit exceeded, return the error response
	if (rateLimitResult instanceof Response) {
		return rateLimitResult;
	}
	try {
		const { refreshToken } = await request.json();

		if (!refreshToken) {
			return json({ error: 'Refresh token required' }, { status: 400 });
		}

		// Verify refresh token
		const payload = verifyRefreshToken(refreshToken);

		// Generate new tokens
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

		// Add rate limit headers to successful response
		const responseHeaders = new Headers();
		applyRateLimitHeaders(responseHeaders, rateLimitResult);
		
		return json({
			accessToken: newAccessToken,
			refreshToken: newRefreshToken
		}, {
			headers: responseHeaders
		});
	} catch (error) {
		return json({ error: 'Invalid or expired refresh token' }, { status: 401 });
	}
};

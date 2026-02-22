import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { verifyRefreshToken, generateAccessToken, generateRefreshToken } from '$lib/server/utils/jwt';

export const POST: RequestHandler = async ({ request }) => {
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

		return json({
			accessToken: newAccessToken,
			refreshToken: newRefreshToken
		});
	} catch (error) {
		return json({ error: 'Invalid or expired refresh token' }, { status: 401 });
	}
};

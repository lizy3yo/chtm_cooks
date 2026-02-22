import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDatabase } from '$lib/server/db/mongodb';
import type { User } from '$lib/server/models/User';
import { hashToken, isTokenExpired } from '$lib/server/utils/tokens';
import { sendVerificationSuccessEmail } from '$lib/server/services/email';
import { rateLimit, RateLimitPresets, applyRateLimitHeaders } from '$lib/server/middleware/rateLimit';

/**
 * GET /api/auth/verify-email?token=xxx
 * Verify user's email address using the verification token
 */
export const GET: RequestHandler = async (event) => {
	const { url } = event;
	
	// Apply rate limiting
	const rateLimitResult = await rateLimit(event, RateLimitPresets.API);
	if (rateLimitResult instanceof Response) {
		return rateLimitResult;
	}

	try {
		// Get token from query parameter
		const token = url.searchParams.get('token');

		if (!token) {
			return json({ error: 'Verification token is required' }, { status: 400 });
		}

		// Hash the token to match against database
		const hashedToken = hashToken(token);

		// Connect to database
		const db = await getDatabase();
		const usersCollection = db.collection<User>('users');

		// Find user with this verification token
		const user = await usersCollection.findOne({
			emailVerificationToken: hashedToken,
			emailVerified: false
		});

		if (!user) {
			return json(
				{ error: 'Invalid or expired verification token' },
				{ status: 400 }
			);
		}

		// Check if token has expired
		if (user.emailVerificationExpires && isTokenExpired(user.emailVerificationExpires)) {
			return json(
				{ 
					error: 'Verification token has expired',
					message: 'Please request a new verification email'
				},
				{ status: 400 }
			);
		}

		// Update user: mark as verified and remove verification token
		await usersCollection.updateOne(
			{ _id: user._id },
			{
				$set: {
					emailVerified: true,
					updatedAt: new Date()
				},
				$unset: {
					emailVerificationToken: '',
					emailVerificationExpires: ''
				}
			}
		);

		// Send success email (non-blocking)
		sendVerificationSuccessEmail(user.email, user.firstName).catch((error) => {
			console.error('Failed to send verification success email:', error);
		});

		// Add rate limit headers to successful response
		const responseHeaders = new Headers();
		applyRateLimitHeaders(responseHeaders, rateLimitResult);

		return json(
			{
				success: true,
				message: 'Email verified successfully! You can now log in.'
			},
			{ 
				status: 200,
				headers: responseHeaders
			}
		);
	} catch (error) {
		console.error('Email verification error:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
};

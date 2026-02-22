import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDatabase } from '$lib/server/db/mongodb';
import type { User } from '$lib/server/models/User';
import { hashToken, isTokenExpired } from '$lib/server/utils/tokens';
import { hashPassword, validatePassword } from '$lib/server/utils/password';
import { sendPasswordResetSuccessEmail } from '$lib/server/services/email';
import { rateLimit, RateLimitPresets, applyRateLimitHeaders } from '$lib/server/middleware/rateLimit';

/**
 * POST /api/auth/reset-password
 * Reset user password using reset token
 */
export const POST: RequestHandler = async (event) => {
	const { request } = event;
	
	// Apply rate limiting
	const rateLimitResult = await rateLimit(event, RateLimitPresets.API);
	if (rateLimitResult instanceof Response) {
		return rateLimitResult;
	}

	try {
		const body = await request.json();
		const { token, password } = body;

		// Validate inputs
		if (!token) {
			return json({ error: 'Reset token is required' }, { status: 400 });
		}

		if (!password) {
			return json({ error: 'New password is required' }, { status: 400 });
		}

		// Validate password strength
		const passwordValidation = validatePassword(password);
		if (!passwordValidation.valid) {
			return json({ error: passwordValidation.message }, { status: 400 });
		}

		// Hash the token to match against database
		const hashedToken = hashToken(token);

		// Connect to database
		const db = await getDatabase();
		const usersCollection = db.collection<User>('users');

		// Find user with this reset token
		const user = await usersCollection.findOne({
			passwordResetToken: hashedToken
		});

		if (!user) {
			return json(
				{ error: 'Invalid or expired reset token' },
				{ status: 400 }
			);
		}

		// Check if token has expired
		if (user.passwordResetExpires && isTokenExpired(user.passwordResetExpires)) {
			// Clean up expired token
			await usersCollection.updateOne(
				{ _id: user._id },
				{
					$unset: {
						passwordResetToken: '',
						passwordResetExpires: ''
					}
				}
			);

			return json(
				{ 
					error: 'Reset token has expired',
					message: 'Please request a new password reset link'
				},
				{ status: 400 }
			);
		}

		// Check if user is active
		if (!user.isActive) {
			return json(
				{ error: 'Account is not active. Please contact support.' },
				{ status: 403 }
			);
		}

		// Hash new password
		const hashedPassword = await hashPassword(password);

		// Update user: set new password and remove reset token
		await usersCollection.updateOne(
			{ _id: user._id },
			{
				$set: {
					password: hashedPassword,
					updatedAt: new Date()
				},
				$unset: {
					passwordResetToken: '',
					passwordResetExpires: ''
				}
			}
		);

		// Send success email (non-blocking)
		sendPasswordResetSuccessEmail(user.email, user.firstName).catch((error) => {
			console.error('Failed to send password reset success email:', error);
		});

		// Add rate limit headers to successful response
		const responseHeaders = new Headers();
		applyRateLimitHeaders(responseHeaders, rateLimitResult);

		return json(
			{
				success: true,
				message: 'Password reset successfully! You can now log in with your new password.'
			},
			{ 
				status: 200,
				headers: responseHeaders
			}
		);
	} catch (error) {
		console.error('Reset password error:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
};

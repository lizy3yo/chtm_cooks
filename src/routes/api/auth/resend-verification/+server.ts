import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDatabase } from '$lib/server/db/mongodb';
import type { User } from '$lib/server/models/User';
import { generateEmailVerificationToken, hashToken } from '$lib/server/utils/tokens';
import { sendVerificationEmail } from '$lib/server/services/email';
import { validateEmail, sanitizeInput } from '$lib/server/utils/validation';
import { rateLimit, RateLimitPresets, applyRateLimitHeaders } from '$lib/server/middleware/rateLimit';

/**
 * POST /api/auth/resend-verification
 * Resend email verification link to user
 */
export const POST: RequestHandler = async (event) => {
	const { request } = event;
	
	// Apply rate limiting (use same as registration to prevent abuse)
	const rateLimitResult = await rateLimit(event, RateLimitPresets.REGISTER);
	if (rateLimitResult instanceof Response) {
		return rateLimitResult;
	}

	try {
		const body = await request.json();
		const { email } = body;

		// Validate email
		if (!email) {
			return json({ error: 'Email is required' }, { status: 400 });
		}

		const sanitizedEmail = sanitizeInput(email.toLowerCase());

		if (!validateEmail(sanitizedEmail)) {
			return json({ error: 'Invalid email format' }, { status: 400 });
		}

		// Connect to database
		const db = await getDatabase();
		const usersCollection = db.collection<User>('users');

		// Find user
		const user = await usersCollection.findOne({ email: sanitizedEmail });

		// Always return success to prevent email enumeration attacks
		// But only send email if user exists and is not verified
		const responseHeaders = new Headers();
		applyRateLimitHeaders(responseHeaders, rateLimitResult);

		if (!user) {
			// Don't reveal that user doesn't exist
			return json(
				{
					success: true,
					message: 'If an account exists with this email, a verification link has been sent.'
				},
				{ 
					status: 200,
					headers: responseHeaders
				}
			);
		}

		// Check if already verified
		if (user.emailVerified) {
			return json(
				{
					success: true,
					message: 'Email is already verified. You can log in now.'
				},
				{ 
					status: 200,
					headers: responseHeaders
				}
			);
		}

		// Generate new verification token
		const { token, expires } = generateEmailVerificationToken(24); // 24 hours
		const hashedToken = hashToken(token);

		// Update user with new token
		await usersCollection.updateOne(
			{ _id: user._id },
			{
				$set: {
					emailVerificationToken: hashedToken,
					emailVerificationExpires: expires,
					updatedAt: new Date()
				}
			}
		);

		// Send verification email
		try {
			await sendVerificationEmail(user.email, user.firstName, token);
		} catch (emailError) {
			console.error('Failed to send verification email:', emailError);
			return json(
				{ error: 'Failed to send verification email. Please try again later.' },
				{ status: 500 }
			);
		}

		return json(
			{
				success: true,
				message: 'Verification email has been sent. Please check your inbox.'
			},
			{ 
				status: 200,
				headers: responseHeaders
			}
		);
	} catch (error) {
		console.error('Resend verification error:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
};

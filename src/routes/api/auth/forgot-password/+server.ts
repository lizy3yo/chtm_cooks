import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDatabase } from '$lib/server/db/mongodb';
import type { User } from '$lib/server/models/User';
import { generatePasswordResetToken, hashToken } from '$lib/server/utils/tokens';
import { sendPasswordResetEmail } from '$lib/server/services/email';
import { validateEmail, sanitizeInput } from '$lib/server/utils/validation';
import { rateLimit, RateLimitPresets, applyRateLimitHeaders } from '$lib/server/middleware/rateLimit';

/**
 * POST /api/auth/forgot-password
 * Request a password reset link
 */
export const POST: RequestHandler = async (event) => {
	const { request } = event;
	
	// Apply rate limiting (stricter for password reset to prevent abuse)
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

		console.log(`[Forgot Password] Request for email: ${sanitizedEmail}`);

		// Always return success to prevent email enumeration attacks
		const responseHeaders = new Headers();
		applyRateLimitHeaders(responseHeaders, rateLimitResult);

		const successMessage = 'If an account exists with this email, a password reset link has been sent.';

		if (!user) {
			console.log(`[Forgot Password] User not found: ${sanitizedEmail}`);
			// Don't reveal that user doesn't exist
			return json(
				{
					success: true,
					message: successMessage
				},
				{ 
					status: 200,
					headers: responseHeaders
				}
			);
		}

		// Check if user is active
		if (!user.isActive) {
			console.log(`[Forgot Password] User is inactive: ${sanitizedEmail}`);
			// Don't reveal account status
			return json(
				{
					success: true,
					message: successMessage
				},
				{ 
					status: 200,
					headers: responseHeaders
				}
			);
		}

		console.log(`[Forgot Password] User found and active: ${user.email}`);

		// Generate password reset token
		const { token, expires } = generatePasswordResetToken(1); // 1 hour
		const hashedToken = hashToken(token);

		console.log(`[Forgot Password] Token generated, expires: ${expires}`);

		// Update user with reset token
		const updateResult = await usersCollection.updateOne(
			{ _id: user._id },
			{
				$set: {
					passwordResetToken: hashedToken,
					passwordResetExpires: expires,
					updatedAt: new Date()
				}
			}
		);

		console.log(`[Forgot Password] Database updated, matched: ${updateResult.matchedCount}, modified: ${updateResult.modifiedCount}`);

		// Send password reset email
		console.log(`[Forgot Password] Attempting to send email to: ${user.email}`);
		try {
			await sendPasswordResetEmail(user.email, user.firstName, token);
			console.log(`[Forgot Password] ✅ Email sent successfully to: ${user.email}`);
		} catch (emailError) {
			console.error(`[Forgot Password] ❌ Failed to send password reset email to ${user.email}:`, emailError);
			if (emailError instanceof Error) {
				console.error(`[Forgot Password] Error details: ${emailError.message}`);
				console.error(`[Forgot Password] Stack trace:`, emailError.stack);
			}
			// Don't reveal this to the user for security reasons
			// Just log it and return success
		}

		return json(
			{
				success: true,
				message: successMessage
			},
			{ 
				status: 200,
				headers: responseHeaders
			}
		);
	} catch (error) {
		console.error('Forgot password error:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
};

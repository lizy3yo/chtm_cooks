import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDatabase } from '$lib/server/db/mongodb';
import { comparePassword } from '$lib/server/utils/password';
import { generateAccessToken, generateRefreshToken } from '$lib/server/utils/jwt';
import { validateEmail, sanitizeInput } from '$lib/server/utils/validation';
import type { LoginRequest, User, UserResponse } from '$lib/server/models/User';
import { rateLimit, RateLimitPresets, applyRateLimitHeaders, markRequestSuccess } from '$lib/server/middleware/rateLimit';
import { rememberMeService } from '$lib/server/services/auth';
import { setRememberMeCookie, getDeviceInfo } from '$lib/server/middleware/auth/rememberMe';
import { setAuthTokens } from '$lib/server/middleware/auth/cookies';

export const POST: RequestHandler = async (event) => {
	const { request } = event;
	
	// Apply rate limiting for login (strict limits to prevent brute force)
	const rateLimitResult = await rateLimit(event, RateLimitPresets.LOGIN);
	
	// If rate limit exceeded, return the error response
	if (rateLimitResult instanceof Response) {
		return rateLimitResult;
	}
	try {
		const body: LoginRequest = await request.json();

		// Validate required fields
		if (!body.email || !body.password) {
			return json({ error: 'Invalid credentials' }, { status: 401 });
		}

		// Sanitize email
		const email = sanitizeInput(body.email.toLowerCase());

		// Validate email format
		if (!validateEmail(email)) {
			return json({ error: 'Invalid credentials' }, { status: 401 });
		}

		// Connect to database
		const db = await getDatabase();
		const usersCollection = db.collection<User>('users');

		// Find user
		const user = await usersCollection.findOne({ email });
		if (!user) {
			return json({ error: 'Invalid credentials' }, { status: 401 });
		}

		// Check if user is active
		if (!user.isActive) {
			return json({ error: 'Invalid credentials' }, { status: 401 });
		}

		// Check if email is verified for student accounts only.
		// Staff accounts (custodian, instructor, superadmin) are created by trusted superadmin
		// and are pre-verified by the creation endpoint, but in case an account was
		// inserted/created externally (e.g. via Postman/DB), allow staff to authenticate
		// even if `emailVerified` is false so superadmins can onboard them. Students
		// still require email verification.
		if (user.role === 'student' && !user.emailVerified) {
			return json({ error: 'Email not verified' }, { status: 401 });
		}

		// Verify password
		const isPasswordValid = await comparePassword(body.password, user.password);
		if (!isPasswordValid) {
			// Failed login - rate limit will count this
			return json({ error: 'Invalid credentials' }, { status: 401 });
		}
		
		// Mark successful login - remove from rate limit counter
		await markRequestSuccess(event, RateLimitPresets.LOGIN);

		// Update last login
		await usersCollection.updateOne({ _id: user._id }, { $set: { lastLogin: new Date() } });

		// Generate tokens
		const tokenPayload = {
			userId: user._id!.toString(),
			email: user.email,
			role: user.role
		};

		const accessToken = generateAccessToken(tokenPayload);
		const refreshToken = generateRefreshToken(tokenPayload);

		// Set tokens in httpOnly cookies (secure, production-grade)
		setAuthTokens(event, accessToken, refreshToken);

		// Prepare user response (NO TOKENS in response body)
		const userResponse: UserResponse = {
			id: user._id!.toString(),
			email: user.email,
			role: user.role,
			firstName: user.firstName,
			lastName: user.lastName,
			isActive: user.isActive,
			createdAt: user.createdAt
		};

		// Handle "Remember Me" functionality
		if (body.rememberMe) {
			try {
			console.log('[Login] Remember Me requested, creating token...');
			const deviceInfo = getDeviceInfo(event);
			const rememberToken = await rememberMeService.createToken({
				userId: user._id!.toString(),
				userAgent: deviceInfo.userAgent,
				ipAddress: deviceInfo.ipAddress
			});
			
			console.log('[Login] Remember token created, setting cookie...');
			// Set httpOnly cookie with remember token
			setRememberMeCookie(event, rememberToken.plainToken, rememberToken.expiresAt);
			console.log('[Login] Remember-me cookie set successfully');
		} catch (error) {
			console.error('[Login] Failed to create remember-me token:', error);
			// Don't fail the login if remember-me fails
		}
	} else {
		console.log('[Login] Remember Me not requested');
	}

	// Add rate limit headers to successful response
	const responseHeaders = new Headers();
	applyRateLimitHeaders(responseHeaders, rateLimitResult);

	// Return only user data (tokens are in httpOnly cookies)
	return json({ 
		success: true,
		user: userResponse 
	}, { 
		status: 200,
		headers: responseHeaders
	});
	} catch (error) {
		console.error('Login error:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
};

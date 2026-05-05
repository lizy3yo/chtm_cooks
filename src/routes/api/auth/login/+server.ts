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
import { setAuthTokens, getAccessTokenMaxAge } from '$lib/server/middleware/auth/cookies';
import type { FailedLoginAttempt } from '$lib/server/models/SecuritySettings';

/**
 * Persist a failed login attempt to MongoDB for security monitoring.
 * Fire-and-forget — never blocks the response.
 */
async function recordFailedLogin(
	ip: string,
	email: string,
	reason: FailedLoginAttempt['reason'],
	userAgent: string | null,
	failedCountInWindow: number
): Promise<void> {
	try {
		const db = await getDatabase();
		// Risk heuristic: ≥10 attempts in window → high, ≥3 → medium, else low
		const risk: FailedLoginAttempt['risk'] =
			failedCountInWindow >= 10 ? 'high' : failedCountInWindow >= 3 ? 'medium' : 'low';

		const attempt: FailedLoginAttempt = {
			ip,
			email,
			reason,
			risk,
			occurredAt: new Date(),
			userAgent: userAgent ?? undefined
		};

		await db.collection<FailedLoginAttempt>('failed_logins').insertOne(attempt);

		// TTL index is created lazily — ensure it exists (idempotent)
		await db
			.collection('failed_logins')
			.createIndex({ occurredAt: 1 }, { expireAfterSeconds: 7 * 24 * 60 * 60, background: true }); // auto-purge after 7 days
	} catch {
		// Non-critical — never let audit logging break authentication
	}
}

export const POST: RequestHandler = async (event) => {
	const { request } = event;

	// Resolve client IP once for reuse in audit logging
	const clientIP =
		(request.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() ||
		event.getClientAddress() ||
		'unknown';
	const userAgent = request.headers.get('user-agent');
	
	// Apply rate limiting for login (strict limits to prevent brute force)
	const rateLimitResult = await rateLimit(event, RateLimitPresets.LOGIN);
	
	// If rate limit exceeded, return the error response
	if (rateLimitResult instanceof Response) {
		// Record rate-limited attempt (email unknown at this point — parsed below)
		void (async () => {
			try {
				const body = await request.clone().json().catch(() => ({}));
				const email = sanitizeInput((body?.email ?? 'unknown').toLowerCase());
				await recordFailedLogin(clientIP, email, 'rate_limited', userAgent, rateLimitResult.status);
			} catch { /* ignore */ }
		})();
		return rateLimitResult;
	}

	// Track attempt count for risk scoring (remaining = max - count, so count = max - remaining)
	const attemptCount = RateLimitPresets.LOGIN.maxRequests - rateLimitResult.remaining;

	try {
		const body: LoginRequest = await request.json();

		// Validate required fields
		if (!body.email || !body.password) {
			void recordFailedLogin(clientIP, 'unknown', 'invalid_credentials', userAgent, attemptCount);
			return json({ error: 'Invalid credentials' }, { status: 401 });
		}

		// Sanitize email
		const email = sanitizeInput(body.email.toLowerCase());

		// Validate email format
		if (!validateEmail(email)) {
			void recordFailedLogin(clientIP, email, 'invalid_credentials', userAgent, attemptCount);
			return json({ error: 'Invalid credentials' }, { status: 401 });
		}

		// Connect to database
		const db = await getDatabase();
		const usersCollection = db.collection<User>('users');

		// Find user
		const user = await usersCollection.findOne(
			{ email },
			{ collation: { locale: 'en', strength: 2 } }
		);
		if (!user) {
			void recordFailedLogin(clientIP, email, 'invalid_credentials', userAgent, attemptCount);
			return json({ error: 'Invalid credentials' }, { status: 401 });
		}

		// Check if user is active
		if (!user.isActive) {
			void recordFailedLogin(clientIP, email, 'account_inactive', userAgent, attemptCount);
			return json({ error: 'Invalid credentials' }, { status: 401 });
		}

		// Check if email is verified for student accounts only.
		// Staff accounts (custodian, instructor, superadmin) are created by trusted superadmin
		// and are pre-verified by the creation endpoint, but in case an account was
		// inserted/created externally (e.g. via Postman/DB), allow staff to authenticate
		// even if `emailVerified` is false so superadmins can onboard them. Students
		// still require email verification.
		if (user.role === 'student' && !user.emailVerified) {
			void recordFailedLogin(clientIP, email, 'email_unverified', userAgent, attemptCount);
			return json({ error: 'Email not verified' }, { status: 401 });
		}

		// Verify password
		const isPasswordValid = await comparePassword(body.password, user.password);
		if (!isPasswordValid) {
			void recordFailedLogin(clientIP, email, 'invalid_credentials', userAgent, attemptCount);
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
		setAuthTokens(event, accessToken, refreshToken, getAccessTokenMaxAge(user.role));

		// Prepare user response (NO TOKENS in response body)
		const userResponse: UserResponse = {
			id: user._id!.toString(),
			email: user.email,
			role: user.role,
			firstName: user.firstName,
			lastName: user.lastName,
			profilePhotoUrl: user.profilePhotoUrl,
			isActive: user.isActive,
			createdAt: user.createdAt,
			...(user.role === 'student' && {
				yearLevel: user.yearLevel,
				block: user.block,
				agreedToTerms: user.agreedToTerms
			})
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

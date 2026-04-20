import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDatabase } from '$lib/server/db/mongodb';
import { ObjectId } from 'mongodb';
import { generateAccessToken, generateRefreshToken } from '$lib/server/utils/jwt';
import type { User, UserResponse } from '$lib/server/models/User';
import { validateRememberMeToken, rotateRememberMeToken } from '$lib/server/middleware/auth/rememberMe';
import { setAuthTokens, getAccessTokenMaxAge } from '$lib/server/middleware/auth/cookies';

/**
 * Auto-Login Endpoint
 * 
 * Attempts to automatically log in a user using their remember-me cookie.
 * This endpoint is called when the app loads to restore user sessions.
 * 
 * Security Features:
 * - Validates remember-me token from httpOnly cookie
 * - Rotates token after use for additional security
 * - Returns new access/refresh tokens
 * - Fails gracefully if token is invalid/expired
 * 
 * Flow:
 * 1. Client loads app
 * 2. Client calls /api/auth/auto-login
 * 3. Server validates remember-me cookie
 * 4. If valid, return user data and new tokens
 * 5. Client updates auth store
 */
export const POST: RequestHandler = async (event) => {
	const startTime = Date.now();
	
	try {
		console.log('[AutoLogin] ========== AUTO-LOGIN REQUEST START ==========');
		console.log('[AutoLogin] Timestamp:', new Date().toISOString());
		console.log('[AutoLogin] User-Agent:', event.request.headers.get('user-agent'));
		console.log('[AutoLogin] IP:', event.getClientAddress());
		
		// Validate remember-me token
		const validationResult = await validateRememberMeToken(event);
		
		if (!validationResult) {
			console.log('[AutoLogin] ❌ No valid remember-me token found');
			console.log('[AutoLogin] Duration:', Date.now() - startTime, 'ms');
			console.log('[AutoLogin] ========== AUTO-LOGIN REQUEST END ==========');
			return json(
				{ error: 'No valid remember-me token found' },
				{ status: 401 }
			);
		}
		
		const { userId, tokenId } = validationResult;
		console.log('[AutoLogin] ✓ Valid token found');
		console.log('[AutoLogin] User ID:', userId);
		console.log('[AutoLogin] Token ID:', tokenId);
		
		// Fetch user from database
		const db = await getDatabase();
		const usersCollection = db.collection<User>('users');
		
		console.log('[AutoLogin] Fetching user from database...');
		const user = await usersCollection.findOne({ _id: new ObjectId(userId) });
		
		if (!user) {
			console.log('[AutoLogin] ❌ User not found in database');
			console.log('[AutoLogin] Duration:', Date.now() - startTime, 'ms');
			console.log('[AutoLogin] ========== AUTO-LOGIN REQUEST END ==========');
			return json(
				{ error: 'User not found' },
				{ status: 404 }
			);
		}
		
		console.log('[AutoLogin] ✓ User found:', user.email);
		console.log('[AutoLogin] User role:', user.role);
		console.log('[AutoLogin] User active:', user.isActive);
		console.log('[AutoLogin] Email verified:', user.emailVerified);
		
		// Check if user is active
		if (!user.isActive) {
			console.log('[AutoLogin] ❌ User account is inactive');
			console.log('[AutoLogin] Duration:', Date.now() - startTime, 'ms');
			console.log('[AutoLogin] ========== AUTO-LOGIN REQUEST END ==========');
			return json(
				{ error: 'Account is deactivated' },
				{ status: 403 }
			);
		}

		// Student accounts must remain verified to restore a session.
		if (user.role === 'student' && !user.emailVerified) {
			console.log('[AutoLogin] ❌ Student email not verified');
			console.log('[AutoLogin] Duration:', Date.now() - startTime, 'ms');
			console.log('[AutoLogin] ========== AUTO-LOGIN REQUEST END ==========');
			return json(
				{ error: 'Email not verified' },
				{ status: 403 }
			);
		}
		
		// Update last login
		console.log('[AutoLogin] Updating last login timestamp...');
		await usersCollection.updateOne(
			{ _id: user._id },
			{ $set: { lastLogin: new Date() } }
		);
		
		// Generate new access and refresh tokens
		console.log('[AutoLogin] Generating new access and refresh tokens...');
		const tokenPayload = {
			userId: user._id!.toString(),
			email: user.email,
			role: user.role
		};
		
		const accessToken = generateAccessToken(tokenPayload);
		const refreshToken = generateRefreshToken(tokenPayload);
		
		// Prepare user response
		const userResponse: UserResponse = {
			id: user._id!.toString(),
			email: user.email,
			role: user.role,
			firstName: user.firstName,
			lastName: user.lastName,
			isActive: user.isActive,
			createdAt: user.createdAt,
			yearLevel: user.yearLevel,
			block: user.block,
			agreedToTerms: user.agreedToTerms
		};
		
		// Set auth tokens as httpOnly cookies
		console.log('[AutoLogin] Setting auth tokens in cookies...');
		setAuthTokens(event, accessToken, refreshToken, getAccessTokenMaxAge(user.role));
		
		// Token rotation for enhanced security
		// Rotate the remember-me token after successful use
		if (tokenId) {
			try {
				console.log('[AutoLogin] Rotating remember-me token for enhanced security...');
				await rotateRememberMeToken(event, tokenId, userId);
				console.log('[AutoLogin] ✓ Token rotation successful');
			} catch (rotationError) {
				// Token rotation failed - log but don't fail the login
				console.error('[AutoLogin] ⚠️ Token rotation failed:', rotationError);
				// User is still logged in, just without token rotation
			}
		}
		
		console.log('[AutoLogin] ✓✓✓ AUTO-LOGIN SUCCESSFUL ✓✓✓');
		console.log('[AutoLogin] User:', user.email);
		console.log('[AutoLogin] Role:', user.role);
		console.log('[AutoLogin] Duration:', Date.now() - startTime, 'ms');
		console.log('[AutoLogin] ========== AUTO-LOGIN REQUEST END ==========');
		
		return json({ success: true, user: userResponse }, { status: 200 });
	} catch (error) {
		console.error('[AutoLogin] ❌❌❌ CRITICAL ERROR ❌❌❌');
		console.error('[AutoLogin] Error:', error);
		console.error('[AutoLogin] Stack:', error instanceof Error ? error.stack : 'No stack trace');
		console.error('[AutoLogin] Duration:', Date.now() - startTime, 'ms');
		console.error('[AutoLogin] ========== AUTO-LOGIN REQUEST END ==========');
		
		return json(
			{ error: 'Auto-login failed' },
			{ status: 500 }
		);
	}
};

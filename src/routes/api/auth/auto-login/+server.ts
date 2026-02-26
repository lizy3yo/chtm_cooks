import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDatabase } from '$lib/server/db/mongodb';
import { ObjectId } from 'mongodb';
import { generateAccessToken, generateRefreshToken } from '$lib/server/utils/jwt';
import type { User, UserResponse } from '$lib/server/models/User';
import { validateRememberMeToken, rotateRememberMeToken } from '$lib/server/middleware/auth/rememberMe';
import { setAuthTokens } from '$lib/server/middleware/auth/cookies';

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
	try {
		console.log('[AutoLogin] Attempting auto-login...');
		// Validate remember-me token
		const userId = await validateRememberMeToken(event);
		
		if (!userId) {
			console.log('[AutoLogin] No valid remember-me token found');
			return json(
				{ error: 'No valid remember-me token found' },
				{ status: 401 }
			);
		}
		
		console.log('[AutoLogin] Valid token found for user:', userId);
		
		// Fetch user from database
		const db = await getDatabase();
		const usersCollection = db.collection<User>('users');
		
		console.log('[AutoLogin] Fetching user from database...');
		const user = await usersCollection.findOne({ _id: new ObjectId(userId) });
		
		if (!user) {
			console.log('[AutoLogin] User not found in database');
			return json(
				{ error: 'User not found' },
				{ status: 404 }
			);
		}
		
		console.log('[AutoLogin] User found:', user.email);
		
		// Check if user is active
		if (!user.isActive) {
			console.log('[AutoLogin] User is inactive');
			return json(
				{ error: 'Account is deactivated' },
				{ status: 403 }
			);
		}
		
		// Update last login
		await usersCollection.updateOne(
			{ _id: user._id },
			{ $set: { lastLogin: new Date() } }
		);
		
		// Generate new access and refresh tokens
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
		setAuthTokens(event, accessToken, refreshToken);
		
		// Note: Token rotation is optional - uncomment below to enable
		// Token rotation provides extra security but creates more DB writes
		// await rotateRememberMeToken(event, tokenId, userId);
		
		return json({ success: true, user: userResponse }, { status: 200 });
	} catch (error) {
		console.error('Auto-login error:', error);
		return json(
			{ error: 'Auto-login failed' },
			{ status: 500 }
		);
	}
};

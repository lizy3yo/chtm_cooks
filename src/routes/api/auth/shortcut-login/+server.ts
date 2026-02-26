import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDatabase } from '$lib/server/db/mongodb';
import { ObjectId } from 'mongodb';
import { hashToken } from '$lib/server/utils/tokens';
import { generateAccessToken, generateRefreshToken } from '$lib/server/utils/jwt';
import type { User, AuthResponse, UserResponse } from '$lib/server/models/User';
import type { ShortcutKey } from '$lib/server/models/ShortcutKey';
import { rateLimit, RateLimitPresets, applyRateLimitHeaders } from '$lib/server/middleware/rateLimit';
import { logger } from '$lib/server/utils/logger';

interface ShortcutLoginRequest {
	shortcutKey: string;
	deviceFingerprint?: string;
}

export const POST: RequestHandler = async (event) => {
	const { request, getClientAddress } = event;
	
	// Apply strict rate limiting for shortcut key login
	const rateLimitResult = await rateLimit(event, RateLimitPresets.LOGIN);
	
	if (rateLimitResult instanceof Response) {
		return rateLimitResult;
	}

	try {
		const body: ShortcutLoginRequest = await request.json();

		// Validate required fields
		if (!body.shortcutKey) {
			logger.warn('Shortcut key login attempt without key', {
				ip: getClientAddress()
			});
			return json({ error: 'Shortcut key is required' }, { status: 400 });
		}

		// Hash the shortcut key for lookup
		const hashedKey = hashToken(body.shortcutKey);

		// Connect to database
		const db = await getDatabase();
		const shortcutKeysCollection = db.collection<ShortcutKey>('shortcut_keys');
		const usersCollection = db.collection<User>('users');

		// Find the shortcut key
		const shortcutKey = await shortcutKeysCollection.findOne({
			shortcutKeyHash: hashedKey,
			isActive: true
		});

		if (!shortcutKey) {
			logger.warn('Invalid shortcut key attempt', {
				ip: getClientAddress(),
				deviceFingerprint: body.deviceFingerprint
			});
			return json(
				{ error: 'Invalid or inactive shortcut key' },
				{ status: 401 }
			);
		}

		// Check if expired
		if (shortcutKey.expiresAt && shortcutKey.expiresAt < new Date()) {
			logger.warn('Expired shortcut key used', {
				shortcutKeyId: shortcutKey._id?.toString(),
				userId: shortcutKey.userId.toString()
			});
			return json(
				{ error: 'Shortcut key has expired' },
				{ status: 401 }
			);
		}

		// Verify device fingerprint matches (if both provided)
		// This check is optional now - fingerprints are no longer required
		if (body.deviceFingerprint && shortcutKey.deviceFingerprint) {
			if (body.deviceFingerprint !== shortcutKey.deviceFingerprint) {
				logger.warn('Device fingerprint mismatch (optional check)', {
					shortcutKeyId: shortcutKey._id?.toString(),
					expectedFingerprint: shortcutKey.deviceFingerprint,
					providedFingerprint: body.deviceFingerprint
				});
				// Note: Not failing the request anymore, just logging
			}
		}

		// Find the user
		const user = await usersCollection.findOne({ _id: shortcutKey.userId });

		if (!user) {
			logger.error('User not found for valid shortcut key', {
				shortcutKeyId: shortcutKey._id?.toString(),
				userId: shortcutKey.userId.toString()
			});
			return json({ error: 'User account not found' }, { status: 404 });
		}

		// Check if user is active
		if (!user.isActive) {
			logger.warn('Inactive user attempted shortcut key login', {
				userId: user._id?.toString()
			});
			return json({ error: 'User account is deactivated' }, { status: 403 });
		}

		// Verify user role matches shortcut type
		const allowedRoles = shortcutKey.shortcutType === 'SUPERADMIN' 
			? ['superadmin']
			: ['instructor', 'custodian'];

		if (!allowedRoles.includes(user.role)) {
			logger.warn('Role mismatch for shortcut key', {
				userId: user._id?.toString(),
				userRole: user.role,
				shortcutType: shortcutKey.shortcutType
			});
			return json(
				{ error: 'User role does not match shortcut key type' },
				{ status: 403 }
			);
		}

		// Update shortcut key usage stats
		await shortcutKeysCollection.updateOne(
			{ _id: shortcutKey._id },
			{
				$set: { lastUsed: new Date() },
				$inc: { usageCount: 1 }
			}
		);

		// Update user's last login
		await usersCollection.updateOne(
			{ _id: user._id },
			{ $set: { lastLogin: new Date() } }
		);

		// Generate tokens
		const tokenPayload = {
			userId: user._id!.toString(),
			email: user.email,
			role: user.role
		};

		const accessToken = generateAccessToken(tokenPayload);
		const refreshToken = generateRefreshToken(tokenPayload);

		// Prepare response
		const userResponse: UserResponse = {
			id: user._id!.toString(),
			email: user.email,
			role: user.role,
			firstName: user.firstName,
			lastName: user.lastName,
			isActive: user.isActive,
			createdAt: user.createdAt
		};

		const response: AuthResponse = {
			user: userResponse,
			accessToken,
			refreshToken
		};

		logger.info('Successful shortcut key login', {
			userId: user._id?.toString(),
			role: user.role,
			shortcutType: shortcutKey.shortcutType
		});

		// Add rate limit headers to successful response
		const responseHeaders = new Headers();
		applyRateLimitHeaders(responseHeaders, rateLimitResult);

		return json(response, {
			status: 200,
			headers: responseHeaders
		});
	} catch (error) {
		logger.error('Shortcut key login error', { error });
		return json(
			{ error: 'An error occurred during authentication' },
			{ status: 500 }
		);
	}
};

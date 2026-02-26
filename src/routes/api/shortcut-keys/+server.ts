import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDatabase } from '$lib/server/db/mongodb';
import { ObjectId } from 'mongodb';
import { hashToken } from '$lib/server/utils/tokens';
import { verifyAccessToken } from '$lib/server/utils/jwt';
import type { ShortcutKey, CreateShortcutKeyRequest, ShortcutKeyResponse } from '$lib/server/models/ShortcutKey';
import type { User } from '$lib/server/models/User';
import { logger } from '$lib/server/utils/logger';

/**
 * GET - List all shortcut keys (superadmin only)
 */
export const GET: RequestHandler = async (event) => {
	const { request } = event;

	try {
		// Verify authentication
		const authHeader = request.headers.get('Authorization');
		if (!authHeader || !authHeader.startsWith('Bearer ')) {
			return json({ error: 'Unauthorized' }, { status: 401 });
		}

		const token = authHeader.substring(7);
		const decoded = verifyAccessToken(token);

		if (!decoded) {
			return json({ error: 'Invalid token' }, { status: 401 });
		}

		// Only superadmin can list all shortcut keys
		if (decoded.role !== 'superadmin') {
			return json({ error: 'Forbidden: Superadmin access required' }, { status: 403 });
		}

		// Connect to database
		const db = await getDatabase();
		const shortcutKeysCollection = db.collection<ShortcutKey>('shortcut_keys');
		const usersCollection = db.collection<User>('users');

		// Get all shortcut keys
		const shortcutKeys = await shortcutKeysCollection
			.find({})
			.sort({ createdAt: -1 })
			.toArray();

		// Enrich with user information
		const enrichedKeys = await Promise.all(
			shortcutKeys.map(async (key) => {
				const user = await usersCollection.findOne({ _id: key.userId });
				return {
					id: key._id!.toString(),
					userId: key.userId.toString(),
					userEmail: user?.email || 'Unknown',
					userName: user ? `${user.firstName} ${user.lastName}` : 'Unknown',
					shortcutType: key.shortcutType,
					isActive: key.isActive,
					lastUsed: key.lastUsed,
					usageCount: key.usageCount,
					createdAt: key.createdAt,
					expiresAt: key.expiresAt,
					revokedAt: key.revokedAt,
					revokeReason: key.revokeReason
				};
			})
		);

		return json({ shortcutKeys: enrichedKeys }, { status: 200 });
	} catch (error) {
		logger.error('Error listing shortcut keys', { error });
		return json({ error: 'An error occurred' }, { status: 500 });
	}
};

/**
 * POST - Create a new shortcut key (superadmin only)
 */
export const POST: RequestHandler = async (event) => {
	const { request } = event;

	try {
		// Verify authentication
		const authHeader = request.headers.get('Authorization');
		if (!authHeader || !authHeader.startsWith('Bearer ')) {
			return json({ error: 'Unauthorized' }, { status: 401 });
		}

		const token = authHeader.substring(7);
		const decoded = verifyAccessToken(token);

		if (!decoded) {
			return json({ error: 'Invalid token' }, { status: 401 });
		}

		// Only superadmin can create shortcut keys
		if (decoded.role !== 'superadmin') {
			return json({ error: 'Forbidden: Superadmin access required' }, { status: 403 });
		}

		const body: CreateShortcutKeyRequest = await request.json();

		// Validate required fields
		if (!body.userId || !body.shortcutType) {
			return json(
				{ error: 'userId and shortcutType are required' },
				{ status: 400 }
			);
		}

		// Validate shortcut type
		if (!['STAFF', 'SUPERADMIN'].includes(body.shortcutType)) {
			return json(
				{ error: 'Invalid shortcut type. Must be STAFF or SUPERADMIN' },
				{ status: 400 }
			);
		}

		// Connect to database
		const db = await getDatabase();
		const shortcutKeysCollection = db.collection<ShortcutKey>('shortcut_keys');
		const usersCollection = db.collection<User>('users');

		// Verify user exists
		const targetUser = await usersCollection.findOne({ _id: new ObjectId(body.userId) });
		if (!targetUser) {
			return json({ error: 'User not found' }, { status: 404 });
		}

		// Verify user role matches shortcut type
		const allowedRoles = body.shortcutType === 'SUPERADMIN' 
			? ['superadmin']
			: ['instructor', 'custodian'];

		if (!allowedRoles.includes(targetUser.role)) {
			return json(
				{ error: `User role (${targetUser.role}) does not match shortcut type (${body.shortcutType})` },
				{ status: 400 }
			);
		}

		// Check if user already has an active shortcut key
		const existingKey = await shortcutKeysCollection.findOne({
			userId: new ObjectId(body.userId),
			isActive: true
		});

		if (existingKey) {
			return json(
				{ error: 'User already has an active shortcut key. Revoke it first.' },
				{ status: 409 }
			);
		}

		// Generate shortcut key (using timestamp and random value since no device fingerprint)
		const shortcutKeyString = body.deviceFingerprint 
			? `${body.shortcutType}_${body.deviceFingerprint}` 
			: `${body.shortcutType}_${Date.now()}_${Math.random().toString(36).substring(7)}`;
		const hashedKey = hashToken(shortcutKeyString);

		// Calculate expiration date
		const expiresAt = body.expiresInDays
			? new Date(Date.now() + body.expiresInDays * 24 * 60 * 60 * 1000)
			: undefined;

		// Create shortcut key document
		const newShortcutKey: ShortcutKey = {
			userId: new ObjectId(body.userId),
			shortcutKeyHash: hashedKey,
			deviceFingerprint: body.deviceFingerprint, // Optional, can be undefined
			shortcutType: body.shortcutType,
			isActive: true,
			usageCount: 0,
			createdAt: new Date(),
			expiresAt,
			createdBy: new ObjectId(decoded.userId)
		};

		const result = await shortcutKeysCollection.insertOne(newShortcutKey);

		logger.info('Shortcut key created', {
			shortcutKeyId: result.insertedId.toString(),
			userId: body.userId,
			shortcutType: body.shortcutType,
			createdBy: decoded.userId
		});

		const response: ShortcutKeyResponse = {
			id: result.insertedId.toString(),
			userId: body.userId,
			shortcutType: body.shortcutType,
			isActive: true,
			usageCount: 0,
			createdAt: newShortcutKey.createdAt,
			expiresAt
		};

		return json(
			{
				message: 'Shortcut key created successfully',
				shortcutKey: response,
				rawKey: shortcutKeyString // Return once for the user to save
			},
			{ status: 201 }
		);
	} catch (error) {
		logger.error('Error creating shortcut key', { error });
		return json({ error: 'An error occurred' }, { status: 500 });
	}
};

/**
 * DELETE - Revoke a shortcut key (superadmin only)
 */
export const DELETE: RequestHandler = async (event) => {
	const { request, url } = event;

	try {
		// Verify authentication
		const authHeader = request.headers.get('Authorization');
		if (!authHeader || !authHeader.startsWith('Bearer ')) {
			return json({ error: 'Unauthorized' }, { status: 401 });
		}

		const token = authHeader.substring(7);
		const decoded = verifyAccessToken(token);

		if (!decoded) {
			return json({ error: 'Invalid token' }, { status: 401 });
		}

		// Only superadmin can revoke shortcut keys
		if (decoded.role !== 'superadmin') {
			return json({ error: 'Forbidden: Superadmin access required' }, { status: 403 });
		}

		const shortcutKeyId = url.searchParams.get('id');
		const reason = url.searchParams.get('reason') || 'Revoked by administrator';

		if (!shortcutKeyId) {
			return json({ error: 'Shortcut key ID is required' }, { status: 400 });
		}

		// Connect to database
		const db = await getDatabase();
		const shortcutKeysCollection = db.collection<ShortcutKey>('shortcut_keys');

		// Update the shortcut key
		const result = await shortcutKeysCollection.updateOne(
			{ _id: new ObjectId(shortcutKeyId) },
			{
				$set: {
					isActive: false,
					revokedAt: new Date(),
					revokedBy: new ObjectId(decoded.userId),
					revokeReason: reason
				}
			}
		);

		if (result.matchedCount === 0) {
			return json({ error: 'Shortcut key not found' }, { status: 404 });
		}

		logger.info('Shortcut key revoked', {
			shortcutKeyId,
			revokedBy: decoded.userId,
			reason
		});

		return json({ message: 'Shortcut key revoked successfully' }, { status: 200 });
	} catch (error) {
		logger.error('Error revoking shortcut key', { error });
		return json({ error: 'An error occurred' }, { status: 500 });
	}
};

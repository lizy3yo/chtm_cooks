import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDatabase } from '$lib/server/db/mongodb';
import { ObjectId } from 'mongodb';
import type { User } from '$lib/server/models/User';
import { getUserFromToken } from '$lib/server/middleware/auth/verify';
import { logger } from '$lib/server/utils/logger';

/**
 * GET /api/users/[userId]
 * Fetch a single user by ID (superadmin only).
 * Used by the superadmin UI to refresh an individual user's profile photo
 * after a SSE `profile_photo_updated` event without reloading the full list.
 */
export const GET: RequestHandler = async (event) => {
	const { params } = event;

	try {
		const decoded = getUserFromToken(event);
		if (!decoded) {
			return json({ error: 'Unauthorized' }, { status: 401 });
		}

		if (decoded.role !== 'superadmin') {
			return json({ error: 'Forbidden: Superadmin access required' }, { status: 403 });
		}

		const { userId } = params;
		if (!userId || !ObjectId.isValid(userId)) {
			return json({ error: 'Invalid userId' }, { status: 400 });
		}

		const db = await getDatabase();
		const usersCollection = db.collection<User>('users');

		const user = await usersCollection.findOne(
			{ _id: new ObjectId(userId) },
			{
				projection: {
					password: 0,
					emailVerificationToken: 0,
					passwordResetToken: 0,
					passwordResetExpires: 0,
					emailVerificationExpires: 0
				}
			}
		);

		if (!user) {
			return json({ error: 'User not found' }, { status: 404 });
		}

		return json({
			user: {
				id: user._id?.toString(),
				email: user.email,
				role: user.role,
				firstName: user.firstName,
				lastName: user.lastName,
				profilePhotoUrl: user.profilePhotoUrl ?? null,
				isActive: user.isActive,
				emailVerified: user.emailVerified,
				createdAt: user.createdAt,
				lastLogin: user.lastLogin,
				yearLevel: user.yearLevel,
				block: user.block
			}
		});
	} catch (error) {
		logger.error('Error fetching user by ID:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
};

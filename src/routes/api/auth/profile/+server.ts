import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { ObjectId } from 'mongodb';
import type { User, UserResponse } from '$lib/server/models/User';
import { UserRole } from '$lib/server/models/User';
import { getDatabase } from '$lib/server/db/mongodb';
import { rateLimit, RateLimitPresets } from '$lib/server/middleware/rateLimit';
import { validateStudentProfileUpdate } from '$lib/server/middleware/profileValidation';
import { cacheService } from '$lib/server/cache';
import {
	buildProfileCacheKey,
	getAuthenticatedProfileUser,
	invalidateProfileCache,
	publishProfileRealtimeEvent
} from './shared';

function toUserResponse(user: User): UserResponse {
	return {
		id: user._id!.toString(),
		email: user.email,
		role: user.role,
		firstName: user.firstName,
		lastName: user.lastName,
		profilePhotoUrl: user.profilePhotoUrl,
		isActive: user.isActive,
		createdAt: user.createdAt,
		...(user.role === UserRole.STUDENT && {
			yearLevel: user.yearLevel,
			block: user.block,
			agreedToTerms: user.agreedToTerms
		})
	};
}

export const GET: RequestHandler = async (event) => {
	const rateLimitResult = await rateLimit(event, RateLimitPresets.API);
	if (rateLimitResult instanceof Response) {
		return rateLimitResult;
	}

	try {
		const authUser = getAuthenticatedProfileUser(event);
		if (!authUser) {
			return json({ error: 'Unauthorized' }, { status: 401 });
		}

		if (authUser.role !== UserRole.STUDENT) {
			return json({ error: 'Forbidden' }, { status: 403 });
		}

		const key = buildProfileCacheKey(authUser.userId);
		const url = new URL(event.request.url);
		const bypassCache = url.searchParams.has('_t');

		if (!bypassCache) {
			const cached = await cacheService.get<{ user: UserResponse }>(key);
			if (cached) {
				return json(cached);
			}
		}

		const db = await getDatabase();
		const usersCollection = db.collection<User>('users');
		const user = await usersCollection.findOne({ _id: new ObjectId(authUser.userId) });

		if (!user || !user.isActive) {
			return json({ error: 'User not found' }, { status: 404 });
		}

		const response = { user: toUserResponse(user) };
		await cacheService.set(key, response, {
			ttl: 3600,
			tags: [`profile:${authUser.userId}`, 'user-profile']
		});

		return json(response);
	} catch (error) {
		console.error('Profile fetch error:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
};

export const PATCH: RequestHandler = async (event) => {
	const rateLimitResult = await rateLimit(event, RateLimitPresets.API);
	if (rateLimitResult instanceof Response) {
		return rateLimitResult;
	}

	try {
		const authUser = getAuthenticatedProfileUser(event);
		if (!authUser) {
			return json({ error: 'Unauthorized' }, { status: 401 });
		}

		if (authUser.role !== UserRole.STUDENT) {
			return json({ error: 'Forbidden' }, { status: 403 });
		}

		const body = await event.request.json().catch(() => null);
		const validation = validateStudentProfileUpdate(body);
		if (!validation.valid || !validation.sanitized) {
			return json({ error: validation.error || 'Invalid profile payload' }, { status: 400 });
		}

		const db = await getDatabase();
		const usersCollection = db.collection<User>('users');
		const result = await usersCollection.findOneAndUpdate(
			{ _id: new ObjectId(authUser.userId), role: UserRole.STUDENT, isActive: true },
			{
				$set: {
					firstName: validation.sanitized.firstName,
					lastName: validation.sanitized.lastName,
					yearLevel: validation.sanitized.yearLevel,
					block: validation.sanitized.block,
					updatedAt: new Date()
				}
			},
			{ returnDocument: 'after' }
		);

		if (!result) {
			return json({ error: 'User not found' }, { status: 404 });
		}

		await invalidateProfileCache(authUser.userId);
		publishProfileRealtimeEvent(authUser.userId, 'profile_updated');

		return json({
			success: true,
			message: 'Profile updated successfully',
			user: toUserResponse(result)
		});
	} catch (error) {
		console.error('Profile update error:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
};

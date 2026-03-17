import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { ObjectId } from 'mongodb';
import path from 'path';
import { getDatabase } from '$lib/server/db/mongodb';
import type { User, UserResponse } from '$lib/server/models/User';
import { UserRole } from '$lib/server/models/User';
import { rateLimit, RateLimitPresets } from '$lib/server/middleware/rateLimit';
import { storageService } from '$lib/server/services/storage';
import {
	getAuthenticatedProfileUser,
	invalidateProfileCache,
	publishProfileRealtimeEvent
} from '../shared';

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

async function deleteExistingProfilePhoto(user: User): Promise<void> {
	if (user.profilePhotoPublicId) {
		await storageService.delete({ publicId: user.profilePhotoPublicId });
		return;
	}

	if (user.profilePhotoUrl?.startsWith('/uploads/')) {
		const relativePath = user.profilePhotoUrl.replace(/^\//, '');
		const localPath = path.join('static', relativePath);
		await storageService.delete({ filepath: localPath });
	}
}

export const POST: RequestHandler = async (event) => {
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

		const formData = await event.request.formData();
		const file = formData.get('file');

		if (!file || typeof file !== 'object' || !(file as File).arrayBuffer) {
			return json({ error: 'No profile photo provided' }, { status: 400 });
		}

		const uploadFile = file as File;
		if (uploadFile.size <= 0) {
			return json({ error: 'Uploaded file is empty' }, { status: 400 });
		}

		const db = await getDatabase();
		const usersCollection = db.collection<User>('users');
		const user = await usersCollection.findOne({ _id: new ObjectId(authUser.userId), role: UserRole.STUDENT });

		if (!user || !user.isActive) {
			return json({ error: 'User not found' }, { status: 404 });
		}

		const upload = await storageService.upload(uploadFile, {
			folder: 'profile',
			tags: ['profile-photo', 'student']
		});

		await deleteExistingProfilePhoto(user);

		const updateResult = await usersCollection.findOneAndUpdate(
			{ _id: user._id },
			{
				$set: {
					profilePhotoUrl: upload.url,
					profilePhotoPublicId: upload.publicId,
					updatedAt: new Date()
				}
			},
			{ returnDocument: 'after' }
		);

		if (!updateResult) {
			return json({ error: 'Failed to update profile photo' }, { status: 500 });
		}

		await invalidateProfileCache(authUser.userId);
		publishProfileRealtimeEvent(authUser.userId, 'photo_updated');

		return json({
			success: true,
			message: 'Profile photo updated successfully',
			user: toUserResponse(updateResult)
		});
	} catch (error) {
		console.error('Profile photo upload error:', error);
		const message = error instanceof Error ? error.message : 'Failed to upload profile photo';
		return json({ error: message }, { status: 400 });
	}
};

export const DELETE: RequestHandler = async (event) => {
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

		const db = await getDatabase();
		const usersCollection = db.collection<User>('users');
		const user = await usersCollection.findOne({ _id: new ObjectId(authUser.userId), role: UserRole.STUDENT });

		if (!user || !user.isActive) {
			return json({ error: 'User not found' }, { status: 404 });
		}

		if (!user.profilePhotoUrl && !user.profilePhotoPublicId) {
			return json({ error: 'No profile photo to remove' }, { status: 400 });
		}

		await deleteExistingProfilePhoto(user);

		const updatedUser = await usersCollection.findOneAndUpdate(
			{ _id: user._id },
			{
				$unset: {
					profilePhotoUrl: '',
					profilePhotoPublicId: ''
				},
				$set: {
					updatedAt: new Date()
				}
			},
			{ returnDocument: 'after' }
		);

		if (!updatedUser) {
			return json({ error: 'Failed to remove profile photo' }, { status: 500 });
		}

		await invalidateProfileCache(authUser.userId);
		publishProfileRealtimeEvent(authUser.userId, 'photo_updated');

		return json({
			success: true,
			message: 'Profile photo removed successfully',
			user: toUserResponse(updatedUser)
		});
	} catch (error) {
		console.error('Profile photo remove error:', error);
		const message = error instanceof Error ? error.message : 'Failed to remove profile photo';
		return json({ error: message }, { status: 400 });
	}
};

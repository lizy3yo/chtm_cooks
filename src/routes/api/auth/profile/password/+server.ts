import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { ObjectId } from 'mongodb';
import { getDatabase } from '$lib/server/db/mongodb';
import type { User } from '$lib/server/models/User';
import { UserRole } from '$lib/server/models/User';
import { comparePassword, hashPassword } from '$lib/server/utils/password';
import { validatePasswordChange } from '$lib/server/middleware/profileValidation';
import { rateLimit, RateLimitPresets } from '$lib/server/middleware/rateLimit';
import { clearAuthCookies } from '$lib/server/middleware/auth/cookies';
import { revokeRememberMeToken } from '$lib/server/middleware/auth/rememberMe';
import { rememberMeService } from '$lib/server/services/auth';
import {
	getAuthenticatedProfileUser,
	invalidateProfileCache,
	publishProfileRealtimeEvent
} from '../shared';

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
		const validation = validatePasswordChange(body);
		if (!validation.valid || !validation.sanitized) {
			return json({ error: validation.error || 'Invalid password payload' }, { status: 400 });
		}

		const db = await getDatabase();
		const usersCollection = db.collection<User>('users');
		const user = await usersCollection.findOne({ _id: new ObjectId(authUser.userId), role: UserRole.STUDENT });

		if (!user || !user.isActive) {
			return json({ error: 'User not found' }, { status: 404 });
		}

		const currentMatches = await comparePassword(validation.sanitized.currentPassword, user.password);
		if (!currentMatches) {
			return json({ error: 'Current password is incorrect' }, { status: 400 });
		}

		const newHash = await hashPassword(validation.sanitized.newPassword);
		await usersCollection.updateOne(
			{ _id: user._id },
			{ $set: { password: newHash, updatedAt: new Date() } }
		);

		await rememberMeService.revokeAllUserTokens(authUser.userId, 'Password changed');
		clearAuthCookies(event);
		await revokeRememberMeToken(event);

		await invalidateProfileCache(authUser.userId);
		publishProfileRealtimeEvent(authUser.userId, 'password_changed');

		return json({
			success: true,
			message: 'Password changed successfully. Please sign in again.'
		});
	} catch (error) {
		console.error('Password change error:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
};

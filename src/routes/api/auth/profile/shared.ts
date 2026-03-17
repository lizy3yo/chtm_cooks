import type { RequestEvent } from '@sveltejs/kit';
import { getUserFromToken } from '$lib/server/middleware/auth/verify';
import { cacheService } from '$lib/server/cache';
import {
	getProfileChannel,
	publishProfileEvent,
	type ProfileRealtimeAction
} from '$lib/server/realtime/profileEvents';

export function getAuthenticatedProfileUser(event: RequestEvent) {
	return getUserFromToken(event);
}

export function buildProfileCacheKey(userId: string): string {
	return `profile:self:${userId}`;
}

export async function invalidateProfileCache(userId: string): Promise<void> {
	const key = buildProfileCacheKey(userId);
	await Promise.all([
		cacheService.delete(key),
		cacheService.invalidateByTags([`profile:${userId}`, 'user-profile'])
	]);
}

export function publishProfileRealtimeEvent(userId: string, action: ProfileRealtimeAction): void {
	publishProfileEvent([getProfileChannel(userId)], {
		action,
		userId,
		occurredAt: new Date().toISOString()
	});
}

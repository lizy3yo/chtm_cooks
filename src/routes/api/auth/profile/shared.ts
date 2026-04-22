import type { RequestEvent } from '@sveltejs/kit';
import { getUserFromToken } from '$lib/server/middleware/auth/verify';
import { cacheService } from '$lib/server/cache';
import {
	getProfileChannel,
	publishProfileEvent,
	PROFILES_BROADCAST_CHANNEL,
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
	const channels = [getProfileChannel(userId)];
	// Also broadcast photo changes globally so the superadmin user-list can refresh in real time
	if (action === 'photo_updated') {
		channels.push(PROFILES_BROADCAST_CHANNEL);
	}
	publishProfileEvent(channels, {
		action,
		userId,
		occurredAt: new Date().toISOString()
	});
}

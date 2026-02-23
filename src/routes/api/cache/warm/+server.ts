/**
 * Cache Warming API
 * POST /api/cache/warm
 * 
 * Pre-populate cache with frequently accessed data
 */

import { json, type RequestHandler } from '@sveltejs/kit';
import { cacheWarmer, TTL_PRESETS } from '$lib/server/cache';
import { AppError } from '$lib/server/errors';

interface WarmRequest {
	/** Predefined cache warming profiles */
	profile?: 'users' | 'dashboard' | 'static' | 'all';
	/** Custom keys to warm */
	keys?: Array<{
		key: string;
		ttl?: number;
	}>;
}

export const POST: RequestHandler = async ({ request, locals }) => {
	try {
		// Optional: Add authentication check
		// if (!locals.user || locals.user.role !== 'superadmin') {
		// 	throw new AppError('Unauthorized', 403);
		// }

		const body = await request.json() as WarmRequest;

		const warmedKeys: string[] = [];

		// Warm cache based on profile
		if (body.profile) {
			switch (body.profile) {
				case 'users':
					// Example: Warm popular user data
					await cacheWarmer.warmCache(
						'users:popular',
						async () => {
							// Fetch popular users
							return { message: 'Popular users data' };
						},
						{ ttl: TTL_PRESETS.LONG }
					);
					warmedKeys.push('users:popular');
					break;

				case 'dashboard':
					// Example: Warm dashboard data
					await cacheWarmer.warmMany([
						{
							key: 'dashboard:stats',
							fetcher: async () => ({ message: 'Dashboard stats' }),
							options: { ttl: TTL_PRESETS.MEDIUM }
						},
						{
							key: 'dashboard:activity',
							fetcher: async () => ({ message: 'Activity data' }),
							options: { ttl: TTL_PRESETS.SHORT }
						}
					]);
					warmedKeys.push('dashboard:stats', 'dashboard:activity');
					break;

				case 'static':
					// Example: Warm static content
					await cacheWarmer.warmCache(
						'static:config',
						async () => ({ message: 'Static configuration' }),
						{ ttl: TTL_PRESETS.DAY }
					);
					warmedKeys.push('static:config');
					break;

				case 'all':
					// Warm all profiles
					// Implement comprehensive warming logic here
					warmedKeys.push('all profiles');
					break;
			}
		}

		// Warm custom keys
		if (body.keys && body.keys.length > 0) {
			for (const item of body.keys) {
				await cacheWarmer.warmCache(
					item.key,
					async () => ({ message: `Data for ${item.key}` }),
					{ ttl: item.ttl || TTL_PRESETS.LONG }
				);
				warmedKeys.push(item.key);
			}
		}

		return json({
			success: true,
			message: 'Cache warmed successfully',
			warmedKeys,
			timestamp: new Date().toISOString()
		});
	} catch (error) {
		if (error instanceof AppError) {
			return json(
				{
					success: false,
					error: error.message
				},
				{ status: error.statusCode }
			);
		}

		return json(
			{
				success: false,
				error: 'Failed to warm cache'
			},
			{ status: 500 }
		);
	}
};

/**
 * Example API Endpoints with Caching
 * 
 * Shows how to use caching in SvelteKit API routes
 */

import { json, type RequestHandler } from '@sveltejs/kit';
import { cacheService, ApiCache, TTL_PRESETS, CACHE_TAGS } from '$lib/server/cache';

/**
 * Example 1: Simple GET endpoint with cache
 * GET /api/users/:id
 */
export const GET: RequestHandler = async ({ params }) => {
	const userId = (params as any).id;

	try {
		// Use ApiCache for a cleaner approach
		const user = await ApiCache.getOrSet(
			`user:${userId}`,
			async () => {
				// Simulate database fetch
				// Replace with your actual database call
				return {
					id: userId,
					name: 'John Doe',
					email: 'john@example.com',
					createdAt: new Date().toISOString()
				};
			},
			{
				ttl: TTL_PRESETS.LONG,
				tags: [CACHE_TAGS.USER_DATA]
			}
		);

		return json({
			success: true,
			data: user,
			cached: true
		});
	} catch (error) {
		return json(
			{
				success: false,
				error: 'Failed to fetch user'
			},
			{ status: 500 }
		);
	}
};

/**
 * Example 2: List endpoint with pagination and caching
 * GET /api/users?page=1&limit=10
 */
export const GET_LIST: RequestHandler = async ({ url }) => {
	const page = parseInt(url.searchParams.get('page') || '1');
	const limit = parseInt(url.searchParams.get('limit') || '10');

	try {
		const cacheKey = `users:list:page:${page}:limit:${limit}`;

		const result = await cacheService.wrap(
			cacheKey,
			async () => {
				// Simulate database query
				// Replace with your actual database call
				const users = Array.from({ length: limit }, (_, i) => ({
					id: `user-${page * limit + i}`,
					name: `User ${i}`,
					email: `user${i}@example.com`
				}));

				return {
					users,
					page,
					limit,
					total: 1000
				};
			},
			{
				ttl: TTL_PRESETS.MEDIUM,
				tags: [CACHE_TAGS.USER_DATA],
				namespace: 'api'
			}
		);

		return json({
			success: true,
			data: result.data,
			cached: result.cached,
			source: result.source
		});
	} catch (error) {
		return json(
			{
				success: false,
				error: 'Failed to fetch users'
			},
			{ status: 500 }
		);
	}
};

/**
 * Example 3: POST endpoint with cache invalidation
 * POST /api/users
 */
export const POST: RequestHandler = async ({ request }) => {
	try {
		const userData = await request.json();

		// Create user in database
		// Replace with your actual database call
		const newUser = {
			id: `user-${Date.now()}`,
			...userData,
			createdAt: new Date().toISOString()
		};

		// Invalidate related caches
		await ApiCache.invalidateByTags([CACHE_TAGS.USER_DATA]);

		// Also invalidate list caches
		await ApiCache.invalidate('users:list:*');

		return json({
			success: true,
			data: newUser
		}, { status: 201 });
	} catch (error) {
		return json(
			{
				success: false,
				error: 'Failed to create user'
			},
			{ status: 500 }
		);
	}
};

/**
 * Example 4: PUT endpoint with specific cache invalidation
 * PUT /api/users/:id
 */
export const PUT: RequestHandler = async ({ params, request }) => {
	const userId = (params as any).id;

	try {
		const updates = await request.json();

		// Update user in database
		// Replace with your actual database call
		const updatedUser = {
			id: userId,
			...updates,
			updatedAt: new Date().toISOString()
		};

		// Invalidate specific user cache
		await ApiCache.invalidate(`user:${userId}`);

		// Invalidate list caches
		await ApiCache.invalidate('users:list:*');

		return json({
			success: true,
			data: updatedUser
		});
	} catch (error) {
		return json(
			{
				success: false,
				error: 'Failed to update user'
			},
			{ status: 500 }
		);
	}
};

/**
 * Example 5: DELETE endpoint with cache invalidation
 * DELETE /api/users/:id
 */
export const DELETE: RequestHandler = async ({ params }) => {
	const userId = (params as any).id;

	try {
		// Delete user from database
		// Replace with your actual database call
		const deleted = true;

		if (deleted) {
			// Invalidate specific user cache
			await ApiCache.invalidate(`user:${userId}`);

			// Invalidate related caches
			await ApiCache.invalidate(`user:${userId}:*`);

			// Invalidate list caches
			await ApiCache.invalidate('users:list:*');
		}

		return json({
			success: true,
			message: 'User deleted successfully'
		});
	} catch (error) {
		return json(
			{
				success: false,
				error: 'Failed to delete user'
			},
			{ status: 500 }
		);
	}
};

/**
 * Example 6: Complex query with multiple cache layers
 * GET /api/dashboard/stats
 */
export const GET_DASHBOARD: RequestHandler = async () => {
	try {
		// Cache multiple related queries
		const [userStats, activityStats, revenueStats] = await Promise.all([
			cacheService.wrap(
				'dashboard:users',
				async () => ({
					total: 1000,
					active: 850,
					new: 50
				}),
				{ ttl: TTL_PRESETS.SHORT, namespace: 'api' }
			),
			cacheService.wrap(
				'dashboard:activity',
				async () => ({
					todayLogins: 450,
					avgSessionTime: 320
				}),
				{ ttl: TTL_PRESETS.SHORT, namespace: 'api' }
			),
			cacheService.wrap(
				'dashboard:revenue',
				async () => ({
					today: 5000,
					month: 150000
				}),
				{ ttl: TTL_PRESETS.MEDIUM, namespace: 'api' }
			)
		]);

		return json({
			success: true,
			data: {
				users: userStats.data,
				activity: activityStats.data,
				revenue: revenueStats.data
			},
			meta: {
				usersCached: userStats.cached,
				activityCached: activityStats.cached,
				revenueCached: revenueStats.cached
			}
		});
	} catch (error) {
		return json(
			{
				success: false,
				error: 'Failed to fetch dashboard stats'
			},
			{ status: 500 }
		);
	}
};

/**
 * Example 7: Search endpoint with query-based caching
 * GET /api/users/search?q=john
 */
export const GET_SEARCH: RequestHandler = async ({ url }) => {
	const query = url.searchParams.get('q') || '';
	const filters = url.searchParams.get('filters') || '';

	if (!query) {
		return json(
			{
				success: false,
				error: 'Search query required'
			},
			{ status: 400 }
		);
	}

	try {
		// Create a unique cache key based on search params
		const cacheKey = `search:users:${query}:${filters}`;

		const result = await cacheService.wrap(
			cacheKey,
			async () => {
				// Simulate search
				// Replace with your actual search implementation
				return [
					{ id: '1', name: 'John Doe', email: 'john@example.com' },
					{ id: '2', name: 'Johnny Smith', email: 'johnny@example.com' }
				];
			},
			{
				ttl: TTL_PRESETS.SHORT, // Short TTL for search results
				namespace: 'api'
			}
		);

		return json({
			success: true,
			data: result.data,
			cached: result.cached,
			query
		});
	} catch (error) {
		return json(
			{
				success: false,
				error: 'Search failed'
			},
			{ status: 500 }
		);
	}
};

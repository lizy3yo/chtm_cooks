/**
 * Cache Invalidation API
 * POST /api/cache/invalidate
 * 
 * Invalidate cache by key, pattern, or tags
 */

import { json, type RequestHandler } from '@sveltejs/kit';
import { cacheService, ApiCache } from '$lib/server/cache';
import { AppError } from '$lib/server/errors';

interface InvalidateRequest {
	/** Cache key to invalidate */
	key?: string;
	/** Pattern to match keys (e.g., "user:*") */
	pattern?: string;
	/** Tags to invalidate */
	tags?: string[];
	/** Namespace to clear */
	namespace?: string;
}

export const POST: RequestHandler = async ({ request, locals }) => {
	try {
		// Optional: Add authentication check
		// if (!locals.user || locals.user.role !== 'superadmin') {
		// 	throw new AppError('Unauthorized', 403);
		// }

		const body = await request.json() as InvalidateRequest;

		let invalidatedCount = 0;

		// Invalidate by key
		if (body.key) {
			const result = await cacheService.delete(body.key, {
				namespace: body.namespace
			});
			invalidatedCount = result ? 1 : 0;
		}

		// Invalidate by pattern
		if (body.pattern) {
			invalidatedCount = await cacheService.deletePattern(body.pattern, {
				namespace: body.namespace
			});
		}

		// Invalidate by tags
		if (body.tags && body.tags.length > 0) {
			invalidatedCount = await cacheService.invalidateByTags(body.tags);
		}

		// Clear entire namespace
		if (body.namespace && !body.key && !body.pattern && !body.tags) {
			await cacheService.clear(body.namespace);
			invalidatedCount = -1; // Unknown count
		}

		return json({
			success: true,
			message: 'Cache invalidated successfully',
			invalidatedCount: invalidatedCount === -1 ? 'all in namespace' : invalidatedCount,
			request: body
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
				error: 'Failed to invalidate cache'
			},
			{ status: 500 }
		);
	}
};

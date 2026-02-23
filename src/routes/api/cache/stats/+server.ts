/**
 * Cache Management API
 * GET /api/cache/stats
 * 
 * Returns cache statistics and performance metrics
 */

import { json, type RequestHandler } from '@sveltejs/kit';
import { cacheMonitor } from '$lib/server/cache';
import { AppError } from '$lib/server/errors';

export const GET: RequestHandler = async ({ locals }) => {
	try {
		// Optional: Add authentication check
		// if (!locals.user || locals.user.role !== 'superadmin') {
		// 	throw new AppError('Unauthorized', 403);
		// }

		const metrics = await cacheMonitor.getMetrics();

		return json({
			success: true,
			data: metrics,
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
				error: 'Failed to fetch cache statistics'
			},
			{ status: 500 }
		);
	}
};

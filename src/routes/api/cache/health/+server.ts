/**
 * Cache Health Check API
 * GET /api/cache/health
 * 
 * Returns cache health status and detailed report
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

		const healthReport = await cacheMonitor.generateHealthReport();

		return json({
			success: true,
			data: healthReport,
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
				error: 'Failed to check cache health'
			},
			{ status: 500 }
		);
	}
};

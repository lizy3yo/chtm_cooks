import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getUserFromToken } from '$lib/server/middleware/auth/verify';
import { rateLimit, RateLimitPresets } from '$lib/server/middleware/rateLimit';
import { logger } from '$lib/server/utils/logger';
import { createInventoryIndexes } from '$lib/server/db/indexes/inventoryIndexes';

/**
 * POST /api/inventory/indexes
 * Create database indexes for inventory collections
 * (Superadmin only)
 */
export const POST: RequestHandler = async (event) => {
	const { getClientAddress } = event;
	
	// Apply rate limiting
	const rateLimitResult = await rateLimit(event, RateLimitPresets.API);
	if (rateLimitResult instanceof Response) {
		return rateLimitResult;
	}

	try {
		// Verify authentication
		const decoded = getUserFromToken(event);
		if (!decoded) {
			return json({ error: 'Unauthorized' }, { status: 401 });
		}

		// Only superadmins can create indexes
		if (decoded.role !== 'superadmin') {
			logger.warn('Non-superadmin attempted to create indexes', {
				userId: decoded.userId,
				role: decoded.role,
				ip: getClientAddress()
			});
			return json({ error: 'Forbidden: Only superadmins can create indexes' }, { status: 403 });
		}

		// Create all inventory indexes
		await createInventoryIndexes();

		logger.info('Inventory indexes created', {
			userId: decoded.userId,
			ip: getClientAddress()
		});

		return json({
			success: true,
			message: 'Inventory indexes created successfully'
		});

	} catch (error) {
		logger.error('Error creating inventory indexes', { error });
		return json({ error: 'Failed to create indexes' }, { status: 500 });
	}
};

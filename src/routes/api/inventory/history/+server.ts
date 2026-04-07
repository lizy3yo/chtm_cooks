import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDatabase } from '$lib/server/db/mongodb';
import { ObjectId } from 'mongodb';
import type { InventoryHistory, InventoryHistoryResponse } from '$lib/server/models/InventoryHistory';
import { getUserFromToken } from '$lib/server/middleware/auth/verify';
import { rateLimit, RateLimitPresets } from '$lib/server/middleware/rateLimit';
import { logger } from '$lib/server/utils/logger';
import { cacheService } from '$lib/server/cache';

/**
 * Convert InventoryHistory to InventoryHistoryResponse
 */
function toHistoryResponse(history: InventoryHistory): InventoryHistoryResponse {
	return {
		id: history._id!.toString(),
		action: history.action,
		entityType: history.entityType,
		entityId: history.entityId.toString(),
		entityName: history.entityName,
		userId: history.userId.toString(),
		userName: history.userName,
		userRole: history.userRole,
		changes: history.changes,
		metadata: history.metadata ? {
			...history.metadata,
			categoryId: history.metadata.categoryId?.toString()
		} : undefined,
		ipAddress: history.ipAddress,
		userAgent: history.userAgent,
		timestamp: history.timestamp
	};
}

/**
 * GET /api/inventory/history
 * Get inventory activity logs (audit trail)
 */
export const GET: RequestHandler = async (event) => {
	const { request, getClientAddress } = event;
	
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

		// Only custodians and superadmins can view history
		if (!['custodian', 'superadmin'].includes(decoded.role)) {
			logger.warn('Unauthorized role attempted to access inventory history', {
				userId: decoded.userId,
				role: decoded.role,
				ip: getClientAddress()
			});
			return json({ error: 'Forbidden: Insufficient permissions' }, { status: 403 });
		}

		// Get query parameters
		const url = new URL(request.url);
		const action = url.searchParams.get('action');
		const entityType = url.searchParams.get('entityType');
		const entityId = url.searchParams.get('entityId');
		const userId = url.searchParams.get('userId');
		const startDate = url.searchParams.get('startDate');
		const endDate = url.searchParams.get('endDate');
		const page = parseInt(url.searchParams.get('page') || '1');
		const limit = parseInt(url.searchParams.get('limit') || '50');
		const skip = (page - 1) * limit;

		// Build cache key
		const cacheKey = `inventory:history:${action || 'all'}:${entityType || 'all'}:${entityId || 'all'}:${userId || 'all'}:${page}:${limit}`;

		// Check cache first
		const cached = await cacheService.get<any>(cacheKey);
		if (cached) {
			return json(cached);
		}

		// Connect to database
		const db = await getDatabase();
		const historyCollection = db.collection<InventoryHistory>('inventory_history');

		// Build filter
		const filter: any = {};
		if (action) filter.action = action;
		if (entityType) filter.entityType = entityType;
		if (entityId) filter.entityId = new ObjectId(entityId);
		if (userId) filter.userId = new ObjectId(userId);
		if (startDate || endDate) {
			filter.timestamp = {};
			if (startDate) filter.timestamp.$gte = new Date(startDate);
			if (endDate) filter.timestamp.$lte = new Date(endDate);
		}

		// Get history with pagination
		const [history, total] = await Promise.all([
			historyCollection
				.find(filter)
				.sort({ timestamp: -1 })
				.skip(skip)
				.limit(limit)
				.toArray(),
			historyCollection.countDocuments(filter)
		]);

		const response = {
			history: history.map(toHistoryResponse),
			total,
			page,
			limit,
			pages: Math.ceil(total / limit)
		};

		// Cache for 1 hour to align with session timeout
		await cacheService.set(cacheKey, response, { ttl: 3600 });

		logger.info('Inventory history retrieved', {
			userId: decoded.userId,
			count: history.length,
			total
		});

		return json(response);

	} catch (error) {
		logger.error('Error retrieving inventory history', { error });
		return json({ error: 'Failed to retrieve inventory history' }, { status: 500 });
	}
};

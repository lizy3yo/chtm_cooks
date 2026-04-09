import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDatabase } from '$lib/server/db/mongodb';
import { ObjectId } from 'mongodb';
import type { InventoryItem, InventoryItemResponse } from '$lib/server/models/InventoryItem';
import { getUserFromToken } from '$lib/server/middleware/auth/verify';
import { rateLimit, RateLimitPresets } from '$lib/server/middleware/rateLimit';
import { logger } from '$lib/server/utils/logger';
import { cacheService } from '$lib/server/cache';
import { logInventoryActivity } from '$lib/server/utils/inventoryLogger';
import { InventoryAction } from '$lib/server/models/InventoryHistory';

/**
 * Convert InventoryItem to InventoryItemResponse
 */
function toItemResponse(item: InventoryItem): InventoryItemResponse {
	const donations = item.donations ?? 0;
	const currentCount = item.quantity + donations;

	return {
		id: item._id!.toString(),
		name: item.name,
		category: item.category,
		categoryId: item.categoryId?.toString(),
		specification: item.specification,
		toolsOrEquipment: item.toolsOrEquipment,
		picture: item.picture,
		quantity: item.quantity,
		donations,
		eomCount: item.eomCount,
		currentCount,
		variance: currentCount - item.eomCount,
		condition: item.condition,
		location: item.location,
		description: item.description,
		status: item.status,
		isConstant: item.isConstant,
		archived: item.archived,
		createdAt: item.createdAt,
		updatedAt: item.updatedAt
	};
}

/**
 * GET /api/inventory/archived
 * Get all archived inventory items
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

		// Only custodians, instructors, and superadmins can view archived items
		if (!['custodian', 'instructor', 'superadmin'].includes(decoded.role)) {
			logger.warn('Unauthorized role attempted to access archived items', {
				userId: decoded.userId,
				role: decoded.role,
				ip: getClientAddress()
			});
			return json({ error: 'Forbidden: Insufficient permissions' }, { status: 403 });
		}

		// Get query parameters
		const url = new URL(request.url);
		const search = url.searchParams.get('search');
		const category = url.searchParams.get('category');
		const page = parseInt(url.searchParams.get('page') || '1');
		const limit = parseInt(url.searchParams.get('limit') || '100');
		const skip = (page - 1) * limit;

		// Build cache key
		const cacheKey = `inventory:archived:${search || 'all'}:${category || 'all'}:${page}:${limit}`;

		// Check cache
		const cached = await cacheService.get<any>(cacheKey);
		if (cached) {
			return json(cached);
		}

		// Connect to database
		const db = await getDatabase();
		const itemsCollection = db.collection<InventoryItem>('inventory_items');

		// Build filter - only archived items
		const filter: any = { archived: true };
		if (category) filter.category = category;
		if (search) {
			filter.$or = [
				{ name: { $regex: search, $options: 'i' } },
				{ specification: { $regex: search, $options: 'i' } }
			];
		}

		// Get archived items with pagination
		const [items, total] = await Promise.all([
			itemsCollection
				.find(filter)
				.sort({ updatedAt: -1 })
				.skip(skip)
				.limit(limit)
				.toArray(),
			itemsCollection.countDocuments(filter)
		]);

		const response = {
			items: items.map(toItemResponse),
			total,
			page,
			limit,
			pages: Math.ceil(total / limit)
		};

		// Cache for 1 hour to align with session timeout
		await cacheService.set(cacheKey, response, { ttl: 3600 });

		logger.info('Archived items retrieved', {
			userId: decoded.userId,
			count: items.length,
			total
		});

		return json(response);

	} catch (error) {
		logger.error('Error retrieving archived items', { error });
		return json({ error: 'Failed to retrieve archived items' }, { status: 500 });
	}
};

/**
 * POST /api/inventory/archived/restore/:id
 * Restore an archived item to active status
 */
export const POST: RequestHandler = async (event) => {
	const { request, params, getClientAddress } = event;
	
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

		// Only custodians and superadmins can restore items
		if (!['custodian', 'superadmin'].includes(decoded.role)) {
			return json({ error: 'Forbidden: Insufficient permissions' }, { status: 403 });
		}

		const { itemId } = await request.json();

		if (!itemId || !ObjectId.isValid(itemId)) {
			return json({ error: 'Invalid item ID' }, { status: 400 });
		}

		// Connect to database
		const db = await getDatabase();
		const itemsCollection = db.collection<InventoryItem>('inventory_items');

		// Find the archived item
		const item = await itemsCollection.findOne({
			_id: new ObjectId(itemId),
			archived: true
		});

		if (!item) {
			return json({ error: 'Archived item not found' }, { status: 404 });
		}

		// Restore the item
		const result = await itemsCollection.updateOne(
			{ _id: new ObjectId(itemId) },
			{
				$set: {
					archived: false,
					updatedAt: new Date(),
					updatedBy: new ObjectId(decoded.userId)
				}
			}
		);

		if (result.modifiedCount === 0) {
			return json({ error: 'Failed to restore item' }, { status: 500 });
		}

		// Log activity
		await logInventoryActivity({
			action: InventoryAction.RESTORED,
			entityType: 'item',
			entityId: new ObjectId(itemId),
			entityName: item.name,
			userId: new ObjectId(decoded.userId),
			userName: decoded.email,
			userRole: decoded.role,
			ipAddress: getClientAddress(),
			userAgent: request.headers.get('user-agent') || undefined
		});

		logger.info('Item restored from archive', {
			userId: decoded.userId,
			itemId,
			itemName: item.name
		});

		return json({ success: true, message: 'Item restored successfully' });

	} catch (error) {
		logger.error('Error restoring archived item', { error });
		return json({ error: 'Failed to restore item' }, { status: 500 });
	}
};

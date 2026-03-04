import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDatabase } from '$lib/server/db/mongodb';
import { ObjectId } from 'mongodb';
import type { DeletedInventoryItem, DeletedItemResponse } from '$lib/server/models/InventoryDeleted';
import type { InventoryItem } from '$lib/server/models/InventoryItem';
import { getUserFromToken } from '$lib/server/middleware/auth/verify';
import { rateLimit, RateLimitPresets } from '$lib/server/middleware/rateLimit';
import { logger } from '$lib/server/utils/logger';
import { cacheService } from '$lib/server/cache';
import { logInventoryActivity } from '$lib/server/utils/inventoryLogger';
import { InventoryAction } from '$lib/server/models/InventoryHistory';

/**
 * Convert DeletedInventoryItem to DeletedItemResponse
 */
function toDeletedItemResponse(deleted: DeletedInventoryItem): DeletedItemResponse {
	const now = new Date();
	const daysRemaining = Math.ceil(
		(deleted.scheduledDeletion.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
	);

	return {
		id: deleted._id!.toString(),
		originalId: deleted.originalId.toString(),
		itemData: {
			...deleted.itemData,
			_id: deleted.itemData._id?.toString(),
			categoryId: deleted.itemData.categoryId?.toString(),
			createdBy: deleted.itemData.createdBy?.toString(),
			updatedBy: deleted.itemData.updatedBy?.toString()
		},
		deletedBy: deleted.deletedBy.toString(),
		deletedByName: deleted.deletedByName,
		deletedByRole: deleted.deletedByRole,
		deletedAt: deleted.deletedAt,
		scheduledDeletion: deleted.scheduledDeletion,
		daysRemaining: Math.max(0, daysRemaining),
		reason: deleted.reason
	};
}

/**
 * GET /api/inventory/deleted
 * Get recently deleted inventory items (soft delete with 30-day retention)
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

		// Only custodians and superadmins can view deleted items
		if (!['custodian', 'superadmin'].includes(decoded.role)) {
			logger.warn('Unauthorized role attempted to access deleted items', {
				userId: decoded.userId,
				role: decoded.role,
				ip: getClientAddress()
			});
			return json({ error: 'Forbidden: Insufficient permissions' }, { status: 403 });
		}

		// Get query parameters
		const url = new URL(request.url);
		const search = url.searchParams.get('search');
		const page = parseInt(url.searchParams.get('page') || '1');
		const limit = parseInt(url.searchParams.get('limit') || '50');
		const skip = (page - 1) * limit;

		// Build cache key
		const cacheKey = `inventory:deleted:${search || 'all'}:${page}:${limit}`;

		// Check cache
		const cached = await cacheService.get<any>(cacheKey);
		if (cached) {
			return json(cached);
		}

		// Connect to database
		const db = await getDatabase();
		const deletedCollection = db.collection<DeletedInventoryItem>('inventory_deleted');

		// Build filter - only items not yet permanently deleted
		const filter: any = {
			scheduledDeletion: { $gt: new Date() }
		};
		if (search) {
			filter['itemData.name'] = { $regex: search, $options: 'i' };
		}

		// Get deleted items with pagination
		const [deleted, total] = await Promise.all([
			deletedCollection
				.find(filter)
				.sort({ deletedAt: -1 })
				.skip(skip)
				.limit(limit)
				.toArray(),
			deletedCollection.countDocuments(filter)
		]);

		const response = {
			items: deleted.map(toDeletedItemResponse),
			total,
			page,
			limit,
			pages: Math.ceil(total / limit)
		};

		// Cache for 1 minute (shorter cache for deleted items)
		await cacheService.set(cacheKey, response, { ttl: 60 });

		logger.info('Deleted items retrieved', {
			userId: decoded.userId,
			count: deleted.length,
			total
		});

		return json(response);

	} catch (error) {
		logger.error('Error retrieving deleted items', { error });
		return json({ error: 'Failed to retrieve deleted items' }, { status: 500 });
	}
};

/**
 * POST /api/inventory/deleted/restore
 * Restore a soft-deleted item
 */
export const POST: RequestHandler = async (event) => {
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

		// Only custodians and superadmins can restore items
		if (!['custodian', 'superadmin'].includes(decoded.role)) {
			return json({ error: 'Forbidden: Insufficient permissions' }, { status: 403 });
		}

		const { deletedId } = await request.json();

		if (!deletedId || !ObjectId.isValid(deletedId)) {
			return json({ error: 'Invalid deleted item ID' }, { status: 400 });
		}

		// Connect to database
		const db = await getDatabase();
		const deletedCollection = db.collection<DeletedInventoryItem>('inventory_deleted');
		const itemsCollection = db.collection<InventoryItem>('inventory_items');

		// Find the deleted item
		const deletedItem = await deletedCollection.findOne({
			_id: new ObjectId(deletedId)
		});

		if (!deletedItem) {
			return json({ error: 'Deleted item not found' }, { status: 404 });
		}

		// Check if past scheduled deletion
		if (new Date() > deletedItem.scheduledDeletion) {
			return json({ error: 'Item has been permanently deleted' }, { status: 410 });
		}

		// Restore the item
		const itemData = {
			...deletedItem.itemData,
			updatedAt: new Date(),
			updatedBy: new ObjectId(decoded.userId)
		};

		await itemsCollection.insertOne(itemData);

		// Remove from deleted collection
		await deletedCollection.deleteOne({ _id: new ObjectId(deletedId) });

		// Log activity
		await logInventoryActivity({
			action: InventoryAction.RESTORED,
			entityType: 'item',
			entityId: deletedItem.originalId,
			entityName: deletedItem.itemData.name,
			userId: new ObjectId(decoded.userId),
			userName: decoded.email,
			userRole: decoded.role,
			metadata: {
				restoredFromDeletion: true,
				originalDeletedBy: deletedItem.deletedByName
			},
			ipAddress: getClientAddress(),
			userAgent: request.headers.get('user-agent') || undefined
		});

		logger.info('Item restored from deletion', {
			userId: decoded.userId,
			itemId: deletedItem.originalId.toString(),
			itemName: deletedItem.itemData.name
		});

		return json({ success: true, message: 'Item restored successfully' });

	} catch (error) {
		logger.error('Error restoring deleted item', { error });
		return json({ error: 'Failed to restore item' }, { status: 500 });
	}
};

/**
 * DELETE /api/inventory/deleted/:id
 * Permanently delete an item (cannot be undone)
 */
export const DELETE: RequestHandler = async (event) => {
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

		// Only superadmins can permanently delete
		if (decoded.role !== 'superadmin') {
			return json({ error: 'Forbidden: Only superadmins can permanently delete' }, { status: 403 });
		}

		const { deletedId } = await request.json();

		if (!deletedId || !ObjectId.isValid(deletedId)) {
			return json({ error: 'Invalid deleted item ID' }, { status: 400 });
		}

		// Connect to database
		const db = await getDatabase();
		const deletedCollection = db.collection<DeletedInventoryItem>('inventory_deleted');

		// Find and delete permanently
		const deletedItem = await deletedCollection.findOne({
			_id: new ObjectId(deletedId)
		});

		if (!deletedItem) {
			return json({ error: 'Deleted item not found' }, { status: 404 });
		}

		await deletedCollection.deleteOne({ _id: new ObjectId(deletedId) });

		// Log permanent deletion
		await logInventoryActivity({
			action: InventoryAction.DELETED,
			entityType: 'item',
			entityId: deletedItem.originalId,
			entityName: deletedItem.itemData.name,
			userId: new ObjectId(decoded.userId),
			userName: decoded.email,
			userRole: decoded.role,
			metadata: {
				permanentDeletion: true,
				originalDeletedBy: deletedItem.deletedByName,
				originalDeletedAt: deletedItem.deletedAt
			},
			ipAddress: getClientAddress(),
			userAgent: request.headers.get('user-agent') || undefined
		});

		logger.warn('Item permanently deleted', {
			userId: decoded.userId,
			itemId: deletedItem.originalId.toString(),
			itemName: deletedItem.itemData.name
		});

		return json({ success: true, message: 'Item permanently deleted' });

	} catch (error) {
		logger.error('Error permanently deleting item', { error });
		return json({ error: 'Failed to permanently delete item' }, { status: 500 });
	}
};

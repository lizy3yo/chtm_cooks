/**
 * GET /api/inventory/constant
 * Fetch all constant (frequently requested) items
 * 
 * PATCH /api/inventory/constant
 * Bulk update constant status for multiple items
 * 
 * Professional, industry-standard API with:
 * - Cookie-based authentication
 * - Role-based authorization
 * - Server-side caching
 * - Real-time SSE notifications
 * - Comprehensive validation
 * - Audit logging
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDatabase } from '$lib/server/db/mongodb';
import { ObjectId } from 'mongodb';
import type { InventoryItem, InventoryItemResponse } from '$lib/server/models/InventoryItem';
import { getUserFromToken } from '$lib/server/middleware/auth/verify';
import { rateLimit, RateLimitPresets } from '$lib/server/middleware/rateLimit';
import { logger } from '$lib/server/utils/logger';
import { cacheService } from '$lib/server/cache';
import {
	publishInventoryChange,
	INVENTORY_CHANNEL,
	type InventoryRealtimeEvent
} from '$lib/server/realtime/inventoryEvents';

/**
 * Convert InventoryItem to InventoryItemResponse
 */
function toItemResponse(item: InventoryItem): InventoryItemResponse {
	return {
		id: item._id!.toString(),
		name: item.name,
		category: item.category,
		categoryId: item.categoryId?.toString(),
		specification: item.specification,
		toolsOrEquipment: item.toolsOrEquipment,
		picture: item.picture,
		quantity: item.quantity,
		eomCount: item.eomCount,
		variance: item.quantity - item.eomCount,
		condition: item.condition,
		location: item.location,
		description: item.description,
		status: item.status,
		isConstant: item.isConstant || false,
		archived: item.archived,
		createdAt: item.createdAt,
		updatedAt: item.updatedAt
	};
}

/**
 * GET /api/inventory/constant
 * Fetch all constant items (frequently requested items)
 * Optimized with server-side caching
 */
export const GET: RequestHandler = async (event) => {
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

		// Authorization: All authenticated users can view constant items
		const allowedRoles = ['custodian', 'instructor', 'superadmin', 'student'];
		if (!allowedRoles.includes(decoded.role)) {
			logger.warn('Unauthorized role attempted to access constant items', {
				userId: decoded.userId,
				role: decoded.role,
				ip: getClientAddress()
			});
			return json({ error: 'Forbidden: Insufficient permissions' }, { status: 403 });
		}

		// Check cache first (5 minute TTL)
		const cacheKey = 'inventory:constant:all';
		const cached = await cacheService.get<InventoryItemResponse[]>(cacheKey);
		
		if (cached) {
			logger.debug('Constant items served from cache', {
				userId: decoded.userId,
				count: cached.length
			});
			
			return json({
				items: cached,
				total: cached.length,
				meta: {
					cached: true,
					timestamp: new Date().toISOString()
				}
			});
		}

		// Connect to database
		const db = await getDatabase();
		const itemsCollection = db.collection<InventoryItem>('inventory_items');

		// Fetch constant items (non-archived, isConstant = true)
		const items = await itemsCollection
			.find({
				isConstant: true,
				archived: false
			})
			.sort({ name: 1 })
			.toArray();

		const response = items.map(toItemResponse);

		// Cache for 5 minutes
		await cacheService.set(cacheKey, response, {
			ttl: 300,
			tags: ['inventory-constant', 'inventory-catalog']
		});

		logger.info('Constant items retrieved', {
			userId: decoded.userId,
			role: decoded.role,
			count: items.length
		});

		return json({
			items: response,
			total: response.length,
			meta: {
				cached: false,
				timestamp: new Date().toISOString()
			}
		});

	} catch (error) {
		logger.error('Error retrieving constant items', {
			error: error instanceof Error ? error.message : String(error)
		});
		return json(
			{
				error: 'Failed to retrieve constant items',
				message: process.env.NODE_ENV === 'development'
					? error instanceof Error ? error.message : String(error)
					: 'An error occurred while fetching constant items'
			},
			{ status: 500 }
		);
	}
};

/**
 * PATCH /api/inventory/constant
 * Bulk update constant status for items
 * Only custodians and superadmins can modify
 */
export const PATCH: RequestHandler = async (event) => {
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

		// Authorization: Only custodians and superadmins
		if (!['custodian', 'superadmin'].includes(decoded.role)) {
			logger.warn('Unauthorized role attempted to update constant items', {
				userId: decoded.userId,
				role: decoded.role,
				ip: getClientAddress()
			});
			return json({ error: 'Forbidden: Insufficient permissions' }, { status: 403 });
		}

		// Parse request body
		const body = await request.json();
		const { itemIds, isConstant } = body;

		// Validation
		if (!Array.isArray(itemIds) || itemIds.length === 0) {
			return json({ error: 'itemIds must be a non-empty array' }, { status: 400 });
		}

		if (typeof isConstant !== 'boolean') {
			return json({ error: 'isConstant must be a boolean' }, { status: 400 });
		}

		// Validate item IDs
		const objectIds = itemIds.map(id => {
			try {
				return new ObjectId(id);
			} catch {
				throw new Error(`Invalid item ID: ${id}`);
			}
		});

		// Connect to database
		const db = await getDatabase();
		const itemsCollection = db.collection<InventoryItem>('inventory_items');

		// Update items
		const result = await itemsCollection.updateMany(
			{
				_id: { $in: objectIds },
				archived: false
			},
			{
				$set: {
					isConstant,
					updatedAt: new Date()
				}
			}
		);

		if (result.matchedCount === 0) {
			return json({ error: 'No items found to update' }, { status: 404 });
		}

		// Invalidate cache
		await cacheService.invalidateByTags(['inventory-constant', 'inventory-catalog']);

		// Fetch updated items for response
		const updatedItems = await itemsCollection
			.find({ _id: { $in: objectIds } })
			.toArray();

		// Publish SSE events for each updated item
		for (const item of updatedItems) {
			const event: InventoryRealtimeEvent = {
				action: 'item_updated',
				entityType: 'item',
				entityId: item._id!.toString(),
				entityName: item.name,
				occurredAt: new Date().toISOString()
			};
			publishInventoryChange([INVENTORY_CHANNEL], event);
		}

		logger.info('Constant items updated', {
			userId: decoded.userId,
			role: decoded.role,
			itemIds,
			isConstant,
			updatedCount: result.modifiedCount
		});

		return json({
			success: true,
			message: `Successfully updated ${result.modifiedCount} item(s)`,
			items: updatedItems.map(toItemResponse),
			updatedCount: result.modifiedCount
		});

	} catch (error) {
		logger.error('Error updating constant items', {
			error: error instanceof Error ? error.message : String(error)
		});
		return json(
			{
				error: 'Failed to update constant items',
				message: process.env.NODE_ENV === 'development'
					? error instanceof Error ? error.message : String(error)
					: 'An error occurred while updating constant items'
			},
			{ status: 500 }
		);
	}
};

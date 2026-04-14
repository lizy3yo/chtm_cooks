import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDatabase } from '$lib/server/db/mongodb';
import { ObjectId } from 'mongodb';
import type { 
	InventoryItem,
	InventoryItemResponse,
	UpdateInventoryItemRequest,
	ItemStatus
} from '$lib/server/models/InventoryItem';
import type { DeletedInventoryItem } from '$lib/server/models/InventoryDeleted';
import { sanitizeInput } from '$lib/server/utils/validation';
import { getUserFromToken } from '$lib/server/middleware/auth/verify';
import { rateLimit, RateLimitPresets } from '$lib/server/middleware/rateLimit';
import { logger } from '$lib/server/utils/logger';
import { logInventoryActivity, getObjectChanges } from '$lib/server/utils/inventoryLogger';
import { InventoryAction } from '$lib/server/models/InventoryHistory';
import { cacheService } from '$lib/server/cache';
import { publishInventoryChange, INVENTORY_CHANNEL } from '$lib/server/realtime/inventoryEvents';
import type { InventoryRealtimeEvent } from '$lib/server/realtime/inventoryEvents';
import { storageService } from '$lib/server/services/storage';
import type { DeleteOptions } from '$lib/server/services/storage/types';
import path from 'path';

/**
 * Determine item status based on quantity
 */
function determineStatus(quantity: number, archived: boolean): ItemStatus {
	if (archived) return 'Archived' as ItemStatus;
	if (quantity === 0) return 'Out of Stock' as ItemStatus;
	return 'In Stock' as ItemStatus;
}

function getCurrentCount(quantity: number, donations = 0): number {
	return quantity + donations;
}

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
		donations: item.donations ?? 0,
		eomCount: item.eomCount,
		currentCount: getCurrentCount(item.quantity, item.donations ?? 0),
		variance: getCurrentCount(item.quantity, item.donations ?? 0) - item.eomCount,
		description: item.description,
		status: item.status,
		isConstant: item.isConstant,
		maxQuantityPerRequest: item.maxQuantityPerRequest,
		archived: item.archived,
		createdAt: item.createdAt,
		updatedAt: item.updatedAt
	};
}

function getDeleteOptionsFromManagedImageUrl(imageUrl: string): DeleteOptions | null {
	if (!imageUrl) return null;

	// Local managed uploads: /uploads/inventory/...
	if (imageUrl.startsWith('/uploads/inventory/')) {
		const relativePath = imageUrl.replace(/^\/uploads\//, '');
		return { filepath: path.join('static', relativePath) };
	}

	// Cloudinary managed uploads: https://res.cloudinary.com/.../image/upload/v123/<publicId>.<ext>
	try {
		const parsed = new URL(imageUrl);
		if (!parsed.hostname.includes('res.cloudinary.com')) {
			return null;
		}

		const uploadMarker = '/image/upload/';
		const markerIndex = parsed.pathname.indexOf(uploadMarker);
		if (markerIndex === -1) {
			return null;
		}

		let publicIdWithExt = parsed.pathname.slice(markerIndex + uploadMarker.length);
		publicIdWithExt = publicIdWithExt.replace(/^v\d+\//, '');
		const publicId = publicIdWithExt.replace(/\.[^./]+$/, '');

		// Safety guard: only delete images from the inventory folder hierarchy.
		if (!publicId || !publicId.includes('inventory')) {
			return null;
		}

		return { publicId };
	} catch {
		return null;
	}
}

/**
 * GET /api/inventory/items/[id]
 * Get a single inventory item
 */
export const GET: RequestHandler = async (event) => {
	const { request, params, getClientAddress } = event;
	
	// Apply rate limiting
	const rateLimitResult = await rateLimit(event, RateLimitPresets.API);
	if (rateLimitResult instanceof Response) {
		return rateLimitResult;
	}

	try {
		// Verify authentication via cookie
		const decoded = getUserFromToken(event);
		if (!decoded) {
			return json({ error: 'Unauthorized' }, { status: 401 });
		}

		// Validate item ID
		const itemId = params.id;
		if (!ObjectId.isValid(itemId)) {
			return json({ error: 'Invalid item ID' }, { status: 400 });
		}

		// Connect to database
		const db = await getDatabase();
		const itemsCollection = db.collection<InventoryItem>('inventory_items');

		// Get item
		const item = await itemsCollection.findOne({ _id: new ObjectId(itemId) });
		if (!item) {
			return json({ error: 'Item not found' }, { status: 404 });
		}

		return json(toItemResponse(item));

	} catch (error) {
		logger.error('Error retrieving inventory item', { error });
		return json({ error: 'Failed to retrieve inventory item' }, { status: 500 });
	}
};

/**
 * PATCH /api/inventory/items/[id]
 * Update an inventory item
 */
export const PATCH: RequestHandler = async (event) => {
	const { request, params, getClientAddress } = event;
	const isImportContext = request.headers.get('x-import-context') === '1';
	
	// Apply rate limiting unless this request is part of a controlled import flow
	if (!isImportContext) {
		const rateLimitResult = await rateLimit(event, RateLimitPresets.API);
		if (rateLimitResult instanceof Response) {
			return rateLimitResult;
		}
	}

	try {
		// Verify authentication via cookie
		const decoded = getUserFromToken(event);
		if (!decoded) {
			return json({ error: 'Unauthorized' }, { status: 401 });
		}

		// Only custodians and superadmins can update items
		if (!['custodian', 'superadmin'].includes(decoded.role)) {
			return json({ error: 'Forbidden: Insufficient permissions' }, { status: 403 });
		}

		// Validate item ID
		const itemId = params.id;
		if (!ObjectId.isValid(itemId)) {
			return json({ error: 'Invalid item ID' }, { status: 400 });
		}

		// Parse request body
		const body: UpdateInventoryItemRequest = await request.json();

		// Connect to database
		const db = await getDatabase();
		const itemsCollection = db.collection<InventoryItem>('inventory_items');
		const categoriesCollection = db.collection('inventory_categories');

		// Get current item
		const currentItem = await itemsCollection.findOne({ _id: new ObjectId(itemId) });
		if (!currentItem) {
			return json({ error: 'Item not found' }, { status: 404 });
		}

		const incomingPicture = typeof body.picture === 'string' ? body.picture.trim() : undefined;
		const shouldReplaceOldPicture =
			body.replacePicture === true &&
			incomingPicture !== undefined &&
			incomingPicture.length > 0 &&
			!!currentItem.picture &&
			currentItem.picture !== incomingPicture;
		const oldPictureForDeletion = shouldReplaceOldPicture ? currentItem.picture : undefined;

		// Build update object
		const updateFields: any = {
			updatedAt: new Date(),
			updatedBy: new ObjectId(decoded.userId)
		};

		if (body.name !== undefined) {
			updateFields.name = sanitizeInput(body.name.trim());
		}
		if (body.category !== undefined) {
			updateFields.category = sanitizeInput(body.category.trim());
		}
		if (body.categoryId !== undefined) {
			if (body.categoryId && ObjectId.isValid(body.categoryId)) {
				const categoryExists = await categoriesCollection.findOne({ 
					_id: new ObjectId(body.categoryId) 
				});
				if (!categoryExists) {
					return json({ error: 'Category not found' }, { status: 404 });
				}
				updateFields.categoryId = new ObjectId(body.categoryId);
			} else {
				updateFields.categoryId = undefined;
			}
		}
		if (body.specification !== undefined) {
			updateFields.specification = sanitizeInput(body.specification.trim());
		}
		if (body.toolsOrEquipment !== undefined) {
			updateFields.toolsOrEquipment = sanitizeInput(body.toolsOrEquipment.trim());
		}
		if (body.picture !== undefined) {
			updateFields.picture = incomingPicture ?? body.picture;
		}
		if (body.quantity !== undefined) {
			updateFields.quantity = Math.max(0, body.quantity);
		}
		if (body.donations !== undefined) {
			updateFields.donations = Math.max(0, body.donations);
		}
		if (body.eomCount !== undefined) {
			updateFields.eomCount = Math.max(0, body.eomCount);
		}
		if (body.archived !== undefined) {
			updateFields.archived = body.archived;
		}
		if (body.isConstant !== undefined) {
			updateFields.isConstant = body.isConstant;
		}
		if (body.maxQuantityPerRequest !== undefined) {
			// Only set maxQuantityPerRequest if the item is constant
			// If not constant or value is null/undefined, explicitly unset it
			if (body.isConstant !== false && body.maxQuantityPerRequest) {
				updateFields.maxQuantityPerRequest = Math.max(1, Math.floor(body.maxQuantityPerRequest));
			} else {
				updateFields.maxQuantityPerRequest = undefined;
			}
		}

		// Recalculate status if quantity changed
		const newQuantity = updateFields.quantity ?? currentItem.quantity;
		const newDonations = updateFields.donations ?? currentItem.donations ?? 0;
		const newArchived = updateFields.archived ?? currentItem.archived;
		updateFields.status = determineStatus(getCurrentCount(newQuantity, newDonations), newArchived);

		// Update category counts if category changed
		if (updateFields.categoryId !== undefined) {
			const oldCategoryId = currentItem.categoryId;
			const newCategoryId = updateFields.categoryId;

			if (oldCategoryId && !oldCategoryId.equals(newCategoryId)) {
				// Decrement old category
				await categoriesCollection.updateOne(
					{ _id: oldCategoryId },
					{ $inc: { itemCount: -1 } }
				);
			}

			if (newCategoryId && (!oldCategoryId || !oldCategoryId.equals(newCategoryId))) {
				// Increment new category
				await categoriesCollection.updateOne(
					{ _id: newCategoryId },
					{ $inc: { itemCount: 1 } }
				);
			}
		}

		// Update item
		const result = await itemsCollection.findOneAndUpdate(
			{ _id: new ObjectId(itemId) },
			{ $set: updateFields },
			{ returnDocument: 'after' }
		);

		if (!result) {
			return json({ error: 'Failed to update item' }, { status: 500 });
		}

		// Log activity based on what changed
		const fieldsToTrack = Object.keys(updateFields).filter(f => !['updatedAt', 'updatedBy'].includes(f));
		const changes = getObjectChanges(currentItem, updateFields, fieldsToTrack);

		// Determine action type
		let action = InventoryAction.UPDATED;
		if (body.archived === true && !currentItem.archived) {
			action = InventoryAction.ARCHIVED;
		} else if (body.archived === false && currentItem.archived) {
			action = InventoryAction.RESTORED;
		} else if (body.quantity !== undefined && body.quantity !== currentItem.quantity) {
			action = InventoryAction.QUANTITY_CHANGED;
		}

		await logInventoryActivity({
			action,
			entityType: 'item',
			entityId: result._id!,
			entityName: result.name,
			userId: new ObjectId(decoded.userId),
			userName: decoded.email,
			userRole: decoded.role,
			changes: changes.length > 0 ? changes : undefined,
			metadata: {
				previousStatus: currentItem.status,
				newStatus: result.status,
				quantityChange: body.quantity !== undefined ? body.quantity - currentItem.quantity : undefined
			},
			ipAddress: getClientAddress(),
			userAgent: request.headers.get('user-agent') || undefined
		});

		logger.info('Inventory item updated', {
			userId: decoded.userId,
			itemId,
			updates: Object.keys(updateFields),
			action
		});

		// Invalidate inventory cache (use tag-based invalidation — deletePattern is a no-op on Upstash)
		await cacheService.invalidateByTags(['inventory-items', 'inventory-catalog', 'inventory-constant', 'reports-analytics']);
		await cacheService.deletePattern('inventory:archived:*');
		await cacheService.deletePattern('inventory:history:*');

		const sseEvent: InventoryRealtimeEvent = {
			action: action === InventoryAction.ARCHIVED ? 'item_archived' : action === InventoryAction.RESTORED ? 'item_restored' : 'item_updated',
			entityType: 'item' as const,
			entityId: result._id!.toString(),
			entityName: result.name,
			occurredAt: new Date().toISOString()
		};
		
		console.log('[PATCH-ITEM] Publishing SSE event:', JSON.stringify(sseEvent, null, 2));
		publishInventoryChange([INVENTORY_CHANNEL], sseEvent);
		console.log('[PATCH-ITEM] SSE event published successfully');

		if (oldPictureForDeletion) {
			const deleteOptions = getDeleteOptionsFromManagedImageUrl(oldPictureForDeletion);
			if (deleteOptions) {
				const deleted = await storageService.delete(deleteOptions);
				if (!deleted) {
					logger.warn('Failed to delete replaced inventory image', {
						itemId,
						oldPictureForDeletion,
						deleteOptions
					});
				}
			}
		}

		return json(toItemResponse(result));

	} catch (error) {
		logger.error('Error updating inventory item', { error });
		return json({ error: 'Failed to update inventory item' }, { status: 500 });
	}
};

/**
 * DELETE /api/inventory/items/[id]
 * Delete an inventory item (soft delete with 30-day retention)
 */
export const DELETE: RequestHandler = async (event) => {
	const { request, params, getClientAddress } = event;
	
	// Apply rate limiting
	const rateLimitResult = await rateLimit(event, RateLimitPresets.API);
	if (rateLimitResult instanceof Response) {
		return rateLimitResult;
	}

	try {
		// Verify authentication via cookie
		let decoded = getUserFromToken(event);
		
		// Fallback: Check Authorization header if cookie auth failed
		if (!decoded) {
			const authHeader = request.headers.get('authorization');
			if (authHeader?.startsWith('Bearer ')) {
				try {
					const { verifyAccessToken } = await import('$lib/server/utils/jwt');
					const token = authHeader.slice(7);
					decoded = verifyAccessToken(token);
				} catch (err) {
					// Token validation failed, continue without auth
				}
			}
		}
		
		if (!decoded) {
			logger.warn('DELETE item: No valid authentication found', {
				itemId: params.id,
				hasCookie: event.request.headers.get('cookie') ? 'yes' : 'no',
				hasAuthHeader: request.headers.get('authorization') ? 'yes' : 'no'
			});
			return json({ error: 'Unauthorized' }, { status: 401 });
		}

		// Only custodians and superadmins can delete items
		if (!['custodian', 'superadmin'].includes(decoded.role)) {
			logger.warn('DELETE item: User lacks delete permissions', {
				userId: decoded.userId,
				userRole: decoded.role,
				itemId: params.id
			});
			return json({ error: 'Forbidden: Insufficient permissions' }, { status: 403 });
		}

		// Validate item ID
		const itemId = params.id;
		if (!ObjectId.isValid(itemId)) {
			return json({ error: 'Invalid item ID' }, { status: 400 });
		}

		// Connect to database
		const db = await getDatabase();
		const itemsCollection = db.collection<InventoryItem>('inventory_items');
		const categoriesCollection = db.collection('inventory_categories');
		const deletedCollection = db.collection<DeletedInventoryItem>('inventory_deleted');

		// Get item
		const item = await itemsCollection.findOne({ _id: new ObjectId(itemId) });
		if (!item) {
			return json({ error: 'Item not found' }, { status: 404 });
		}

		// Calculate scheduled deletion date (30 days from now)
		const now = new Date();
		const scheduledDeletion = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // 30 days

		// Move item to deleted collection (soft delete)
		const deletedItem: DeletedInventoryItem = {
			originalId: item._id!,
			itemData: item,
			deletedBy: new ObjectId(decoded.userId),
			deletedByName: decoded.email,
			deletedByRole: decoded.role,
			deletedAt: now,
			scheduledDeletion,
			reason: 'User initiated deletion',
			ipAddress: getClientAddress()
		};

		await deletedCollection.insertOne(deletedItem);

		// Remove from active collection
		await itemsCollection.deleteOne({ _id: new ObjectId(itemId) });

		// Decrement category count
		if (item.categoryId) {
			await categoriesCollection.updateOne(
				{ _id: item.categoryId },
				{ $inc: { itemCount: -1 } }
			);
		}

		// Log activity
		await logInventoryActivity({
			action: InventoryAction.DELETED,
			entityType: 'item',
			entityId: item._id!,
			entityName: item.name,
			userId: new ObjectId(decoded.userId),
			userName: decoded.email,
			userRole: decoded.role,
			metadata: {
				scheduledDeletion: scheduledDeletion.toISOString(),
				retentionDays: 30,
				categoryId: item.categoryId?.toString(),
				categoryName: item.category
			},
			ipAddress: getClientAddress(),
			userAgent: request.headers.get('user-agent') || undefined
		});

		logger.info('Inventory item deleted (soft)', {
			userId: decoded.userId,
			itemId,
			itemName: item.name,
			scheduledDeletion
		});

		// Invalidate inventory cache (use tag-based invalidation — deletePattern is a no-op on Upstash)
		await cacheService.invalidateByTags(['inventory-items', 'inventory-catalog', 'reports-analytics']);
		await cacheService.deletePattern('inventory:deleted:*');
		await cacheService.deletePattern('inventory:history:*');

		publishInventoryChange([INVENTORY_CHANNEL], {
			action: 'item_deleted',
			entityType: 'item',
			entityId: item._id!.toString(),
			entityName: item.name,
			occurredAt: new Date().toISOString()
		});

		return json({ 
			success: true, 
			message: 'Item deleted successfully. Recoverable for 30 days.',
			deletionDate: scheduledDeletion
		});

	} catch (error) {
		logger.error('Error deleting inventory item', { error });
		return json({ error: 'Failed to delete inventory item' }, { status: 500 });
	}
};

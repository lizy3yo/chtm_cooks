import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDatabase } from '$lib/server/db/mongodb';
import { ObjectId } from 'mongodb';
import type { DeletedInventoryItem, DeletedInventoryCategory, DeletedItemResponse } from '$lib/server/models/InventoryDeleted';
import type { InventoryItem } from '$lib/server/models/InventoryItem';
import { getUserFromToken } from '$lib/server/middleware/auth/verify';
import { rateLimit, RateLimitPresets } from '$lib/server/middleware/rateLimit';
import { logger } from '$lib/server/utils/logger';
import { cacheService } from '$lib/server/cache';
import { logInventoryActivity } from '$lib/server/utils/inventoryLogger';
import { InventoryAction } from '$lib/server/models/InventoryHistory';
import { storageService } from '$lib/server/services/storage/storageService';

/**
 * Extract Cloudinary publicId from image URL
 */
function extractPublicIdFromUrl(url: string): string | null {
	try {
		// Example URL: https://res.cloudinary.com/cloud-name/image/upload/v1234567/folder/subfolder/filename.jpg
		const urlParts = url.split('/upload/');
		if (urlParts.length < 2) return null;
		
		// Get everything after /upload/ and remove version (v1234567)
		let pathAfterUpload = urlParts[1];
		
		// Remove version identifier (e.g., v1234567890/)
		pathAfterUpload = pathAfterUpload.replace(/^v\d+\//, '');
		
		// Remove file extension
		const publicId = pathAfterUpload.replace(/\.[^/.]+$/, '');
		
		return publicId;
	} catch (error) {
		logger.error('Failed to extract publicId from URL', { url, error });
		return null;
	}
}

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
 * Convert DeletedInventoryCategory to response format
 */
function toDeletedCategoryResponse(deleted: DeletedInventoryCategory): any {
	const now = new Date();
	const daysRemaining = Math.ceil(
		(deleted.scheduledDeletion.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
	);

	return {
		id: deleted._id!.toString(),
		originalId: deleted.originalId.toString(),
		type: 'category',
		categoryData: {
			...deleted.categoryData,
			_id: deleted.categoryData._id?.toString(),
			createdBy: deleted.categoryData.createdBy?.toString(),
			updatedBy: deleted.categoryData.updatedBy?.toString()
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
		const deletedItemsCollection = db.collection<DeletedInventoryItem>('inventory_deleted');
		const deletedCategoriesCollection = db.collection<DeletedInventoryCategory>('inventory_categories_deleted');

		// Build filter - only items/categories not yet permanently deleted
		const timeFilter = {
			scheduledDeletion: { $gt: new Date() }
		};

		// Build search filters
		const itemFilter: any = { ...timeFilter };
		const categoryFilter: any = { ...timeFilter };
		
		if (search) {
			itemFilter['itemData.name'] = { $regex: search, $options: 'i' };
			categoryFilter['categoryData.name'] = { $regex: search, $options: 'i' };
		}

		// Get both deleted items and categories
		const [deletedItems, deletedCategories, totalItems, totalCategories] = await Promise.all([
			deletedItemsCollection
				.find(itemFilter)
				.sort({ deletedAt: -1 })
				.toArray(),
			deletedCategoriesCollection
				.find(categoryFilter)
				.sort({ deletedAt: -1 })
				.toArray(),
			deletedItemsCollection.countDocuments(itemFilter),
			deletedCategoriesCollection.countDocuments(categoryFilter)
		]);

		// Combine and sort by deletion date
		const combinedResults = [
			...deletedItems.map(item => ({ ...toDeletedItemResponse(item), type: 'item' })),
			...deletedCategories.map(cat => toDeletedCategoryResponse(cat))
		].sort((a, b) => new Date(b.deletedAt).getTime() - new Date(a.deletedAt).getTime());

		// Apply pagination to combined results
		const total = totalItems + totalCategories;
		const paginatedResults = combinedResults.slice(skip, skip + limit);

		const response = {
			items: paginatedResults,
			total,
			page,
			limit,
			pages: Math.ceil(total / limit)
		};

		// Cache for 1 hour to align with session timeout
		await cacheService.set(cacheKey, response, { ttl: 3600 });

		logger.info('Deleted items and categories retrieved', {
			userId: decoded.userId,
			count: paginatedResults.length,
			total,
			items: totalItems,
			categories: totalCategories
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

		const { deletedId, type } = await request.json();

		if (!deletedId || !ObjectId.isValid(deletedId)) {
			return json({ error: 'Invalid deleted item ID' }, { status: 400 });
		}

		if (!type || !['item', 'category'].includes(type)) {
			return json({ error: 'Invalid or missing type (must be "item" or "category")' }, { status: 400 });
		}

		// Connect to database
		const db = await getDatabase();

		if (type === 'category') {
			// Handle category restoration
			const deletedCategoriesCollection = db.collection<DeletedInventoryCategory>('inventory_categories_deleted');
			const categoriesCollection = db.collection('inventory_categories');

			const deletedCategory = await deletedCategoriesCollection.findOne({
				_id: new ObjectId(deletedId)
			});

			if (!deletedCategory) {
				return json({ error: 'Deleted category not found' }, { status: 404 });
			}

			// Check if past scheduled deletion
			if (new Date() > deletedCategory.scheduledDeletion) {
				return json({ error: 'Category has been permanently deleted' }, { status: 410 });
			}

			// Restore the category
			const categoryData = {
				...deletedCategory.categoryData,
				updatedAt: new Date(),
				updatedBy: new ObjectId(decoded.userId)
			};

			await categoriesCollection.insertOne(categoryData);

			// Remove from deleted collection
			await deletedCategoriesCollection.deleteOne({ _id: new ObjectId(deletedId) });

			// Log activity
			await logInventoryActivity({
				action: InventoryAction.CATEGORY_RESTORED,
				entityType: 'category',
				entityId: deletedCategory.originalId,
				entityName: deletedCategory.categoryData.name,
				userId: new ObjectId(decoded.userId),
				userName: decoded.email,
				userRole: decoded.role,
				metadata: {
					restoredFromDeletion: true,
					originalDeletedBy: deletedCategory.deletedByName
				},
				ipAddress: getClientAddress(),
				userAgent: request.headers.get('user-agent') || undefined
			});

			logger.info('Category restored from deletion', {
				userId: decoded.userId,
				categoryId: deletedCategory.originalId.toString(),
				categoryName: deletedCategory.categoryData.name
			});

			return json({ success: true, message: 'Category restored successfully' });

		} else {
			// Handle item restoration
			const deletedItemsCollection = db.collection<DeletedInventoryItem>('inventory_deleted');
			const itemsCollection = db.collection<InventoryItem>('inventory_items');

			// Find the deleted item
			const deletedItem = await deletedItemsCollection.findOne({
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
			await deletedItemsCollection.deleteOne({ _id: new ObjectId(deletedId) });

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
		}

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

		// Only custodians and superadmins can permanently delete
		if (!['custodian', 'superadmin'].includes(decoded.role)) {
			return json({ error: 'Forbidden: Insufficient permissions to permanently delete' }, { status: 403 });
		}

		const { deletedId, type } = await request.json();

		if (!deletedId || !ObjectId.isValid(deletedId)) {
			return json({ error: 'Invalid deleted item ID' }, { status: 400 });
		}

		if (!type || !['item', 'category'].includes(type)) {
			return json({ error: 'Invalid or missing type (must be "item" or "category")' }, { status: 400 });
		}

		// Connect to database
		const db = await getDatabase();

		if (type === 'category') {
			// Handle category permanent deletion
			const deletedCategoriesCollection = db.collection<DeletedInventoryCategory>('inventory_categories_deleted');

			const deletedCategory = await deletedCategoriesCollection.findOne({
				_id: new ObjectId(deletedId)
			});

			if (!deletedCategory) {
				return json({ error: 'Deleted category not found' }, { status: 404 });
			}

			// Delete picture from Cloudinary
			if (deletedCategory.categoryData.picture) {
				const publicId = extractPublicIdFromUrl(deletedCategory.categoryData.picture);
				if (publicId) {
					try {
						await storageService.delete({ publicId });
						logger.info('Category picture permanently deleted from Cloudinary', { 
							categoryId: deletedCategory.originalId.toString(),
							publicId 
						});
					} catch (error) {
						logger.warn('Failed to delete category picture from Cloudinary', { 
							categoryId: deletedCategory.originalId.toString(),
							publicId,
							error 
						});
					}
				}
			}

			await deletedCategoriesCollection.deleteOne({ _id: new ObjectId(deletedId) });

			// Log permanent deletion
			await logInventoryActivity({
				action: InventoryAction.CATEGORY_DELETED,
				entityType: 'category',
				entityId: deletedCategory.originalId,
				entityName: deletedCategory.categoryData.name,
				userId: new ObjectId(decoded.userId),
				userName: decoded.email,
				userRole: decoded.role,
				metadata: {
					permanentDeletion: true,
					originalDeletedBy: deletedCategory.deletedByName,
					originalDeletedAt: deletedCategory.deletedAt
				},
				ipAddress: getClientAddress(),
				userAgent: request.headers.get('user-agent') || undefined
			});

			logger.warn('Category permanently deleted', {
				userId: decoded.userId,
				categoryId: deletedCategory.originalId.toString(),
				categoryName: deletedCategory.categoryData.name
			});

			return json({ success: true, message: 'Category permanently deleted' });

		} else {
			// Handle item permanent deletion
			const deletedItemsCollection = db.collection<DeletedInventoryItem>('inventory_deleted');

			// Find and delete permanently
			const deletedItem = await deletedItemsCollection.findOne({
				_id: new ObjectId(deletedId)
			});

			if (!deletedItem) {
				return json({ error: 'Deleted item not found' }, { status: 404 });
			}

			// Delete picture from Cloudinary
			if (deletedItem.itemData.picture) {
				const publicId = extractPublicIdFromUrl(deletedItem.itemData.picture);
				if (publicId) {
					try {
						await storageService.delete({ publicId });
						logger.info('Item picture permanently deleted from Cloudinary', { 
							itemId: deletedItem.originalId.toString(),
							publicId 
						});
					} catch (error) {
						logger.warn('Failed to delete item picture from Cloudinary', { 
							itemId: deletedItem.originalId.toString(),
							publicId,
							error 
						});
					}
				}
			}

			await deletedItemsCollection.deleteOne({ _id: new ObjectId(deletedId) });

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
		}

	} catch (error) {
		logger.error('Error permanently deleting item', { error });
		return json({ error: 'Failed to permanently delete item' }, { status: 500 });
	}
};

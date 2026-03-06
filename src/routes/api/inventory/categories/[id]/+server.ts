import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDatabase } from '$lib/server/db/mongodb';
import { ObjectId } from 'mongodb';
import type {
	InventoryCategory,
	InventoryCategoryResponse,
	UpdateCategoryRequest
} from '$lib/server/models/InventoryCategory';
import type { DeletedInventoryCategory } from '$lib/server/models/InventoryDeleted';
import { sanitizeInput } from '$lib/server/utils/validation';
import { getUserFromToken } from '$lib/server/middleware/auth/verify';
import { rateLimit, RateLimitPresets } from '$lib/server/middleware/rateLimit';
import { logger } from '$lib/server/utils/logger';
import { logInventoryActivity, getObjectChanges } from '$lib/server/utils/inventoryLogger';
import { InventoryAction } from '$lib/server/models/InventoryHistory';
import { cacheService } from '$lib/server/cache';
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
 * Convert InventoryCategory to InventoryCategoryResponse
 */
function toCategoryResponse(category: InventoryCategory): InventoryCategoryResponse {
	return {
		id: category._id!.toString(),
		name: category.name,
		description: category.description,
		picture: category.picture,
		itemCount: category.itemCount,
		archived: category.archived,
		createdAt: category.createdAt,
		updatedAt: category.updatedAt
	};
}

/**
 * PATCH /api/inventory/categories/[id]
 * Update a category
 */
export const PATCH: RequestHandler = async (event) => {
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

			// Only custodians and superadmins can update categories
		if (!['custodian', 'superadmin'].includes(decoded.role)) {
			return json({ error: 'Forbidden: Insufficient permissions' }, { status: 403 });
		}

		// Validate category ID
		const categoryId = params.id;
		if (!ObjectId.isValid(categoryId)) {
			return json({ error: 'Invalid category ID' }, { status: 400 });
		}

		// Parse request body
		const body: UpdateCategoryRequest = await request.json();

		// Build update object
		const updateFields: any = {
			updatedAt: new Date(),
			updatedBy: new ObjectId(decoded.userId)
		};

		if (body.name !== undefined) {
			updateFields.name = sanitizeInput(body.name.trim());
		}
		if (body.description !== undefined) {
			updateFields.description = sanitizeInput(body.description.trim());
		}
		if (body.picture !== undefined) {
			updateFields.picture = body.picture;
		}
		if (body.archived !== undefined) {
			updateFields.archived = body.archived;
		}

		// Connect to database
		const db = await getDatabase();
		const categoriesCollection = db.collection<InventoryCategory>('inventory_categories');

		// Check if category exists
		const category = await categoriesCollection.findOne({ _id: new ObjectId(categoryId) });
		if (!category) {
			return json({ error: 'Category not found' }, { status: 404 });
		}

		// If updating picture, delete old picture from Cloudinary
		if (body.picture !== undefined && category.picture && body.picture !== category.picture) {
			const oldPublicId = extractPublicIdFromUrl(category.picture);
			if (oldPublicId) {
				try {
					await storageService.delete({ publicId: oldPublicId });
					logger.info('Old category picture deleted from Cloudinary', { 
						categoryId,
						publicId: oldPublicId 
					});
				} catch (error) {
					logger.warn('Failed to delete old category picture from Cloudinary', { 
						categoryId,
						publicId: oldPublicId,
						error 
					});
				}
			}
		}

		// If updating name, check for duplicates
		if (body.name && body.name !== category.name) {
			const duplicate = await categoriesCollection.findOne({
				name: { $regex: `^${updateFields.name}$`, $options: 'i' },
				_id: { $ne: new ObjectId(categoryId) },
				archived: false
			});
			if (duplicate) {
				return json({ error: 'Category with this name already exists' }, { status: 409 });
			}
		}

		// Update category
		const result = await categoriesCollection.findOneAndUpdate(
			{ _id: new ObjectId(categoryId) },
			{ $set: updateFields },
			{ returnDocument: 'after' }
		);

		if (!result) {
			return json({ error: 'Failed to update category' }, { status: 500 });
		}

		// Log activity based on what changed
		const fieldsToTrack = Object.keys(updateFields).filter(f => !['updatedAt', 'updatedBy'].includes(f));
		const changes = getObjectChanges(category, updateFields, fieldsToTrack);
		let action = InventoryAction.CATEGORY_UPDATED;

		if (body.archived === true && !category.archived) {
			action = InventoryAction.CATEGORY_ARCHIVED;
		} else if (body.archived === false && category.archived) {
			action = InventoryAction.CATEGORY_RESTORED;
		}

		await logInventoryActivity({
			action,
			entityType: 'category',
			entityId: result._id!,
			entityName: result.name,
			userId: new ObjectId(decoded.userId),
			userName: decoded.email,
			userRole: decoded.role,
			changes: changes.length > 0 ? changes : undefined,
			ipAddress: getClientAddress(),
			userAgent: request.headers.get('user-agent') || undefined
		});

		logger.info('Category updated', {
			userId: decoded.userId,
			categoryId,
			updates: Object.keys(updateFields),
			action
		});

		// Invalidate catalog and category caches
		await cacheService.deletePattern('inventory:categories:*');
		await cacheService.invalidateByTags(['inventory-catalog']);

		return json(toCategoryResponse(result));

	} catch (error) {
		logger.error('Error updating category', { error });
		return json({ error: 'Failed to update category' }, { status: 500 });
	}
};

/**
 * DELETE /api/inventory/categories/[id]
 * Delete a category (soft delete)
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
		const decoded = getUserFromToken(event);
		if (!decoded) {
			return json({ error: 'Unauthorized' }, { status: 401 });
		}

		// Only custodians and superadmins can delete categories
		if (!['custodian', 'superadmin'].includes(decoded.role)) {
			return json({ error: 'Forbidden: Insufficient permissions' }, { status: 403 });
		}

		// Validate category ID
		const categoryId = params.id;
		if (!ObjectId.isValid(categoryId)) {
			return json({ error: 'Invalid category ID' }, { status: 400 });
		}

		// Connect to database
		const db = await getDatabase();
		const categoriesCollection = db.collection<InventoryCategory>('inventory_categories');
		const itemsCollection = db.collection('inventory_items');
		const deletedCollection = db.collection<DeletedInventoryCategory>('inventory_categories_deleted');

		// Check if category exists
		const category = await categoriesCollection.findOne({ _id: new ObjectId(categoryId) });
		if (!category) {
			return json({ error: 'Category not found' }, { status: 404 });
		}

		// Check if category has items
		const itemCount = await itemsCollection.countDocuments({ 
			categoryId: new ObjectId(categoryId),
			archived: false
		});

		if (itemCount > 0) {
			return json({ 
				error: 'Cannot delete category with existing items. Please reassign or archive items first.' 
			}, { status: 409 });
		}

		// Calculate scheduled deletion date (30 days from now)
		const now = new Date();
		const scheduledDeletion = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // 30 days

		// Move category to deleted collection (soft delete)
		const deletedCategory: DeletedInventoryCategory = {
			originalId: category._id!,
			categoryData: category,
			deletedBy: new ObjectId(decoded.userId),
			deletedByName: decoded.email,
			deletedByRole: decoded.role,
			deletedAt: now,
			scheduledDeletion,
			reason: 'User initiated deletion',
			ipAddress: getClientAddress()
		};

		await deletedCollection.insertOne(deletedCategory);

		// Remove from active collection
		await categoriesCollection.deleteOne({ _id: new ObjectId(categoryId) });

		// Log deletion activity
		await logInventoryActivity({
			action: InventoryAction.CATEGORY_DELETED,
			entityType: 'category',
			entityId: category._id!,
			entityName: category.name,
			userId: new ObjectId(decoded.userId),
			userName: decoded.email,
			userRole: decoded.role,
			metadata: {
				itemCount: category.itemCount,
				scheduledDeletion: scheduledDeletion.toISOString(),
				retentionDays: 30
			},
			ipAddress: getClientAddress(),
			userAgent: request.headers.get('user-agent') || undefined
		});

		logger.info('Category deleted (soft)', {
			userId: decoded.userId,
			categoryId,
			categoryName: category.name,
			scheduledDeletion
		});

		// Invalidate cache
		await cacheService.deletePattern('inventory:items:*');
		await cacheService.deletePattern('inventory:categories:*');
		await cacheService.deletePattern('inventory:deleted:*');
		await cacheService.deletePattern('inventory:history:*');
		await cacheService.invalidateByTags(['inventory-catalog']);

		return json({ 
			success: true, 
			message: 'Category deleted successfully. Recoverable for 30 days.',
			deletionDate: scheduledDeletion
		});

	} catch (error) {
		logger.error('Error deleting category', { error });
		return json({ error: 'Failed to delete category' }, { status: 500 });
	}
};

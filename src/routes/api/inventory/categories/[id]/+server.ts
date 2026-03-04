import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDatabase } from '$lib/server/db/mongodb';
import { ObjectId } from 'mongodb';
import type {
	InventoryCategory,
	InventoryCategoryResponse,
	UpdateCategoryRequest
} from '$lib/server/models/InventoryCategory';
import { sanitizeInput } from '$lib/server/utils/validation';
import { getUserFromToken } from '$lib/server/middleware/auth/verify';
import { rateLimit, RateLimitPresets } from '$lib/server/middleware/rateLimit';
import { logger } from '$lib/server/utils/logger';
import { logInventoryActivity, getObjectChanges } from '$lib/server/utils/inventoryLogger';
import { InventoryAction } from '$lib/server/models/InventoryHistory';

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

		// Soft delete (archive) the category
		await categoriesCollection.updateOne(
			{ _id: new ObjectId(categoryId) },
			{ 
				$set: { 
					archived: true,
					updatedAt: new Date(),
					updatedBy: new ObjectId(decoded.userId)
				}
			}
		);

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
				itemCount: category.itemCount
			},
			ipAddress: getClientAddress(),
			userAgent: request.headers.get('user-agent') || undefined
		});

		logger.info('Category deleted', {
			userId: decoded.userId,
			categoryId
		});

		return json({ success: true, message: 'Category deleted successfully' });

	} catch (error) {
		logger.error('Error deleting category', { error });
		return json({ error: 'Failed to delete category' }, { status: 500 });
	}
};

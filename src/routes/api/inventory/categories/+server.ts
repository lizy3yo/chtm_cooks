import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDatabase } from '$lib/server/db/mongodb';
import { ObjectId } from 'mongodb';
import type { 
	InventoryCategory, 
	InventoryCategoryResponse, 
	CreateCategoryRequest
} from '$lib/server/models/InventoryCategory';
import { sanitizeInput } from '$lib/server/utils/validation';
import { getUserFromToken } from '$lib/server/middleware/auth/verify';
import { rateLimit, RateLimitPresets } from '$lib/server/middleware/rateLimit';
import { logger } from '$lib/server/utils/logger';
import { logInventoryActivity } from '$lib/server/utils/inventoryLogger';
import { InventoryAction } from '$lib/server/models/InventoryHistory';
import { storageService } from '$lib/server/services/storage/storageService';
import { cacheService } from '$lib/server/cache';

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
 * GET /api/inventory/categories
 * Get all inventory categories
 */
export const GET: RequestHandler = async (event) => {
	const { request, getClientAddress } = event;
	
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

			// Only custodians, instructors, and superadmins can view inventory
		if (!['custodian', 'instructor', 'superadmin'].includes(decoded.role)) {
			logger.warn('Unauthorized role attempted to access inventory categories', {
				userId: decoded.userId,
				role: decoded.role,
				ip: getClientAddress()
			});
			return json({ error: 'Forbidden: Insufficient permissions' }, { status: 403 });
		}

		// Connect to database
		const db = await getDatabase();
		const categoriesCollection = db.collection<InventoryCategory>('inventory_categories');

		// Get query parameters
		const url = new URL(request.url);
		const includeArchived = url.searchParams.get('includeArchived') === 'true';
		const search = url.searchParams.get('search');

		// Build filter
		const filter: any = {};
		if (!includeArchived) {
			filter.archived = false;
		}
		if (search) {
			filter.name = { $regex: search, $options: 'i' };
		}

		// Get categories
		const categories = await categoriesCollection
			.find(filter)
			.sort({ name: 1 })
			.toArray();

		logger.info('Categories retrieved', {
			userId: decoded.userId,
			count: categories.length
		});

		return json({
			categories: categories.map(toCategoryResponse),
			total: categories.length
		});

	} catch (error) {
		logger.error('Error retrieving categories', { error });
		return json({ error: 'Failed to retrieve categories' }, { status: 500 });
	}
};

/**
 * POST /api/inventory/categories
 * Create a new inventory category
 */
export const POST: RequestHandler = async (event) => {
	const { request, getClientAddress } = event;
	
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

		// Only custodians and superadmins can create categories
		if (!['custodian', 'superadmin'].includes(decoded.role)) {
			logger.warn('Unauthorized role attempted to create category', {
				userId: decoded.userId,
				role: decoded.role,
				ip: getClientAddress()
			});
			return json({ error: 'Forbidden: Insufficient permissions' }, { status: 403 });
		}

		// Parse and validate request body
		const body: CreateCategoryRequest = await request.json();
		
		if (!body.name || body.name.trim().length === 0) {
			return json({ error: 'Category name is required' }, { status: 400 });
		}

		// Sanitize inputs
		const name = sanitizeInput(body.name.trim());
		const description = body.description ? sanitizeInput(body.description.trim()) : undefined;
		const picture = body.picture || undefined;

		// Connect to database
		const db = await getDatabase();
		const categoriesCollection = db.collection<InventoryCategory>('inventory_categories');

		// Check if active category already exists
		const existingActiveCategory = await categoriesCollection.findOne({ 
			name: { $regex: `^${name}$`, $options: 'i' },
			archived: false
		});

		if (existingActiveCategory) {
			return json({ error: 'Category with this name already exists' }, { status: 409 });
		}

		// Check if archived category exists - reuse it instead of creating new
		const archivedCategory = await categoriesCollection.findOne({ 
			name: { $regex: `^${name}$`, $options: 'i' },
			archived: true
		});

		if (archivedCategory) {
			// Delete old picture from Cloudinary if updating with new picture
			if (picture && archivedCategory.picture && picture !== archivedCategory.picture) {
				const oldPublicId = extractPublicIdFromUrl(archivedCategory.picture);
				if (oldPublicId) {
					try {
						await storageService.delete({ publicId: oldPublicId });
						logger.info('Old archived category picture deleted from Cloudinary', { 
							categoryId: archivedCategory._id?.toString(),
							publicId: oldPublicId 
						});
					} catch (error) {
						logger.warn('Failed to delete old archived category picture from Cloudinary', { 
							categoryId: archivedCategory._id?.toString(),
							publicId: oldPublicId,
							error 
						});
					}
				}
			}

			// Reactivate the archived category
			const updateFields: any = {
				archived: false,
				description,
				picture,
				updatedAt: new Date(),
				updatedBy: new ObjectId(decoded.userId)
			};

			const result = await categoriesCollection.findOneAndUpdate(
				{ _id: archivedCategory._id },
				{ $set: updateFields },
				{ returnDocument: 'after' }
			);

			if (!result) {
				return json({ error: 'Failed to reactivate category' }, { status: 500 });
			}

			// Log reactivation activity
			await logInventoryActivity({
				action: InventoryAction.CATEGORY_RESTORED,
				entityType: 'category',
				entityId: result._id!,
				entityName: result.name,
				userId: new ObjectId(decoded.userId),
				userName: decoded.email,
				userRole: decoded.role,
				metadata: {
					reactivatedFromArchive: true
				},
				ipAddress: getClientAddress(),
				userAgent: request.headers.get('user-agent') || undefined
			});

			logger.info('Category reactivated from archive', {
				userId: decoded.userId,
				categoryId: result._id!.toString(),
				name
			});

			// Invalidate cache
			await cacheService.deletePattern('inventory:categories:*');

			return json(toCategoryResponse(result), { status: 201 });
		}

		// Create new category
		const newCategory: InventoryCategory = {
			name,
			description,
			picture,
			itemCount: 0,
			archived: false,
			createdAt: new Date(),
			updatedAt: new Date(),
			createdBy: new ObjectId(decoded.userId)
		};

		const result = await categoriesCollection.insertOne(newCategory);
		newCategory._id = result.insertedId;

		// Log activity
		await logInventoryActivity({
			action: InventoryAction.CATEGORY_CREATED,
			entityType: 'category',
			entityId: newCategory._id,
			entityName: newCategory.name,
			userId: new ObjectId(decoded.userId),
			userName: decoded.email,
			userRole: decoded.role,
			metadata: {
				description: newCategory.description
			},
			ipAddress: getClientAddress(),
			userAgent: request.headers.get('user-agent') || undefined
		});

		logger.info('Category created', {
			userId: decoded.userId,
			categoryId: newCategory._id.toString(),
			name
		});

		// Invalidate cache
		await cacheService.deletePattern('inventory:categories:*');

		return json(toCategoryResponse(newCategory), { status: 201 });

	} catch (error) {
		logger.error('Error creating category', { error });
		
		// Handle duplicate key error (MongoDB error code 11000)
		if (error && typeof error === 'object' && 'code' in error && error.code === 11000) {
			return json({ 
				error: 'A category with this name already exists (possibly archived). Please use a different name or contact an administrator.' 
			}, { status: 409 });
		}
		
		return json({ error: 'Failed to create category' }, { status: 500 });
	}
};

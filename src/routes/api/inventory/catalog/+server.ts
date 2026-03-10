import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDatabase } from '$lib/server/db/mongodb';
import { ObjectId } from 'mongodb';
import type { InventoryItem, InventoryItemResponse } from '$lib/server/models/InventoryItem';
import type { InventoryCategory, InventoryCategoryResponse } from '$lib/server/models/InventoryCategory';
import { getUserFromToken } from '$lib/server/middleware/auth/verify';
import { rateLimit, RateLimitPresets } from '$lib/server/middleware/rateLimit';
import { logger } from '$lib/server/utils/logger';
import { cacheService } from '$lib/server/cache';

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
		minStock: item.minStock,
		condition: item.condition,
		location: item.location,
		description: item.description,
		status: item.status,
		archived: item.archived,
		createdAt: item.createdAt,
		updatedAt: item.updatedAt
	};
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
 * Build query filter based on search and availability parameters
 */
function buildItemFilter(params: {
	search?: string;
	availability?: string;
	condition?: string;
	categoryId?: string;
}): Record<string, any> {
	const filter: Record<string, any> = {
		archived: false
	};

	// Use MongoDB text search when possible to leverage text indexes.
	// Fallback to regex only for very short search terms.
	if (params.search && params.search.trim().length > 0) {
		const term = params.search.trim();
		if (term.length >= 2) {
			filter.$text = { $search: term };
		} else {
			filter.$or = [
				{ name: { $regex: term, $options: 'i' } },
				{ specification: { $regex: term, $options: 'i' } },
				{ description: { $regex: term, $options: 'i' } }
			];
		}
	}

	// Add availability filter based on status
	// Maps UI availability values to actual item statuses
	if (params.availability && params.availability !== 'all') {
		const availabilityMap: Record<string, string[]> = {
			available: ['In Stock', 'Low Stock'], // Items currently available
			borrowed: ['In Stock', 'Low Stock'], // Same as available (borrowing tracked separately)
			maintenance: ['Maintenance'], // Items in maintenance (if stored as status)
			outofstock: ['Out of Stock'] // Items with quantity = 0
		};
		const statuses = availabilityMap[params.availability.toLowerCase()];
		if (statuses) {
			filter.status = { $in: statuses };
		}
	}

	// Add condition filter
	if (params.condition && params.condition !== 'all') {
		filter.condition = params.condition;
	}

	// Add category filter
	if (params.categoryId && params.categoryId !== 'all') {
		try {
			filter.categoryId = new ObjectId(params.categoryId);
		} catch (err) {
			logger.warn('Invalid categoryId provided', { categoryId: params.categoryId });
		}
	}

	return filter;
}

/**
 * Sort items based on sortBy parameter
 */
function applySorting(sortBy: string): Record<string, 1 | -1> {
	const sortMap: Record<string, Record<string, 1 | -1>> = {
		name: { name: 1 },
		category: { category: 1, name: 1 },
		availability: { status: 1, name: 1 },
		condition: { condition: 1, name: 1 },
		recent: { createdAt: -1 },
		updated: { updatedAt: -1 }
	};

	return sortMap[sortBy] || { name: 1 };
}

/**
 * Detect whether the current filter is using MongoDB text search.
 */
function hasTextSearch(filter: Record<string, any>): boolean {
	return Boolean(filter.$text);
}

/**
 * GET /api/inventory/catalog
 * Fetch catalog with categories and items
 * Optimized for student/public viewing - only shows available inventory
 * 
 * Query Parameters:
 * - search: Search term for items
 * - category: Filter by category ID or name
 * - availability: Filter by availability (available, borrowed, maintenance, outofstock, all)
 * - condition: Filter by condition (Excellent, Good, Fair, Poor, Damaged, all)
 * - sortBy: Sort order (name, category, availability, condition, recent, updated)
 * - page: Page number (default: 1)
 * - limit: Items per page (default: 50, max: 200)
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

		// Only custodians, instructors, and superadmins, plus students can view catalog
		// But students get limited view - only available items
		const allowedRoles = ['custodian', 'instructor', 'superadmin', 'student'];
		if (!allowedRoles.includes(decoded.role)) {
			logger.warn('Unauthorized role attempted to access catalog', {
				userId: decoded.userId,
				role: decoded.role,
				ip: getClientAddress()
			});
			return json({ error: 'Forbidden: Insufficient permissions' }, { status: 403 });
		}

		// Get query parameters
		const url = new URL(request.url);
		const search = url.searchParams.get('search') || '';
		const category = url.searchParams.get('category') || 'all';
		const availability = url.searchParams.get('availability') || 'all';
		const condition = url.searchParams.get('condition') || 'all';
		const sortBy = url.searchParams.get('sortBy') || 'name';
		const page = Math.max(1, parseInt(url.searchParams.get('page') || '1'));
		const limit = Math.min(200, Math.max(1, parseInt(url.searchParams.get('limit') || '50')));
		const skip = (page - 1) * limit;

		// Build cache key based on query parameters and user role
		// Students should get cached catalog filtered to available items only
		const cachePartition = decoded.role === 'student' ? 'student' : 'staff';
		const cacheKey = `inventory:catalog:${cachePartition}:${search}:${category}:${availability}:${condition}:${sortBy}:${page}:${limit}`;

		// Check cache first - 5 minute TTL for public catalog (balance freshness vs performance)
		const cached = await cacheService.get<any>(cacheKey);
		if (cached) {
			if (cached?.meta) {
				cached.meta.cached = true;
			}
			logger.debug('Catalog served from cache', {
				cacheKey,
				userId: decoded.userId
			});
			return json(cached);
		}

		// Connect to database
		const db = await getDatabase();
		const categoriesCollection = db.collection<InventoryCategory>('inventory_categories');
		const itemsCollection = db.collection<InventoryItem>('inventory_items');

		// Fetch all non-archived categories
		const categories = await categoriesCollection
			.find({ archived: false })
			.sort({ name: 1 })
			.toArray();

		if (categories.length === 0) {
			const response = {
				categories: [],
				items: [],
				total: 0,
				page,
				limit,
				pages: 0,
				summary: {
					totalItems: 0,
					categoriesCount: 0
				}
			};
			// Cache empty response for shorter duration
			await cacheService.set(cacheKey, response, {
				ttl: 60,
				tags: ['inventory-catalog']
			});
			return json(response);
		}

		// Build item filter
		// Students see all non-archived items by default (including Out of Stock),
		// and their selected availability filter is honoured.
		// Only archived items are always excluded (handled inside buildItemFilter via archived:false).
		const itemFilter = buildItemFilter({
			search,
			availability,
			condition,
			categoryId: category
		});

		// Get total count of items matching filter
		const totalItems = await itemsCollection.countDocuments(itemFilter);

		// Fetch items with pagination
		const usesTextSearch = hasTextSearch(itemFilter);
		const sortSpec: any = usesTextSearch && sortBy === 'name'
			? { score: { $meta: 'textScore' }, name: 1 }
			: applySorting(sortBy);

		const projection: any = usesTextSearch
			? { score: { $meta: 'textScore' } }
			: undefined;

		const items = await itemsCollection
			.find(itemFilter, projection ? { projection } : undefined)
			.sort(sortSpec)
			.skip(skip)
			.limit(limit)
			.toArray();

		// Build response
		const response = {
			categories: categories.map(toCategoryResponse),
			items: items.map(toItemResponse),
			total: totalItems,
			page,
			limit,
			pages: Math.ceil(totalItems / limit),
			summary: {
				totalItems,
				categoriesCount: categories.length,
				filteredItemsCount: items.length
			},
			meta: {
				userRole: decoded.role,
				timestamp: new Date().toISOString(),
				cached: false
			}
		};

		logger.info('Catalog retrieved', {
			userId: decoded.userId,
			role: decoded.role,
			itemsCount: items.length,
			total: totalItems,
			categoriesCount: categories.length
		});

		// Cache for 5 minutes (balance between freshness and performance)
		await cacheService.set(cacheKey, response, {
			ttl: 300,
			tags: ['inventory-catalog']
		});

		return json(response);

	} catch (error) {
		logger.error('Error retrieving catalog', {
			error: error instanceof Error ? error.message : String(error)
		});
		return json(
			{
				error: 'Failed to retrieve catalog',
				message: process.env.NODE_ENV === 'development'
					? error instanceof Error ? error.message : String(error)
					: 'An error occurred while fetching the catalog'
			},
			{ status: 500 }
		);
	}
};

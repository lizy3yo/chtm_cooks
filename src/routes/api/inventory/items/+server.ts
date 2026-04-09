import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDatabase } from '$lib/server/db/mongodb';
import { ObjectId } from 'mongodb';
import type { 
	InventoryItem,
	InventoryItemResponse,
	CreateInventoryItemRequest,
	ItemStatus
} from '$lib/server/models/InventoryItem';
import { sanitizeInput } from '$lib/server/utils/validation';
import { getUserFromToken } from '$lib/server/middleware/auth/verify';
import { rateLimit, RateLimitPresets } from '$lib/server/middleware/rateLimit';
import { logger } from '$lib/server/utils/logger';
import { logInventoryActivity } from '$lib/server/utils/inventoryLogger';
import { InventoryAction } from '$lib/server/models/InventoryHistory';
import { cacheService } from '$lib/server/cache';
import { publishInventoryChange, INVENTORY_CHANNEL } from '$lib/server/realtime/inventoryEvents';

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

/**
 * GET /api/inventory/items
 * Get all inventory items
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
			logger.warn('Unauthorized role attempted to access inventory items', {
				userId: decoded.userId,
				role: decoded.role,
				ip: getClientAddress()
			});
			return json({ error: 'Forbidden: Insufficient permissions' }, { status: 403 });
		}

		// Get query parameters
		const url = new URL(request.url);
		const includeArchived = url.searchParams.get('includeArchived') === 'true';
		const category = url.searchParams.get('category');
		const status = url.searchParams.get('status');
		const search = url.searchParams.get('search');
		const page = parseInt(url.searchParams.get('page') || '1');
		const limit = parseInt(url.searchParams.get('limit') || '100');
		const skip = (page - 1) * limit;

		// Build cache key based on query parameters
		const cacheKey = `inventory:items:${includeArchived}:${category || 'all'}:${status || 'all'}:${search || 'all'}:${page}:${limit}`;

		// Check cache first
		const cached = await cacheService.get<any>(cacheKey);
		if (cached) {
			logger.debug('Inventory items served from cache', { cacheKey });
			return json(cached);
		}

		// Connect to database
		const db = await getDatabase();
		const itemsCollection = db.collection<InventoryItem>('inventory_items');

		// Build filter
		const filter: any = {};
		if (!includeArchived) {
			filter.archived = false;
		}
		if (category) {
			filter.category = category;
		}
		if (status) {
			filter.status = status;
		}
		if (search) {
			filter.$or = [
				{ name: { $regex: search, $options: 'i' } },
				{ specification: { $regex: search, $options: 'i' } }
			];
		}

		// Get items with pagination
		const [items, total] = await Promise.all([
			itemsCollection
				.find(filter)
				.sort({ name: 1 })
				.skip(skip)
				.limit(limit)
				.toArray(),
			itemsCollection.countDocuments(filter)
		]);

		logger.info('Inventory items retrieved', {
			userId: decoded.userId,
			count: items.length,
			total
		});

		const response = {
			items: items.map(toItemResponse),
			total,
			page,
			limit,
			pages: Math.ceil(total / limit)
		};

		// Cache for 1 hour — tagged so mutations can invalidate via invalidateByTags
		await cacheService.set(cacheKey, response, { ttl: 3600, tags: ['inventory-items'] });

		return json(response);

	} catch (error) {
		logger.error('Error retrieving inventory items', { error });
		return json({ error: 'Failed to retrieve inventory items' }, { status: 500 });
	}
};

/**
 * POST /api/inventory/items
 * Create a new inventory item
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

		// Only custodians and superadmins can create items
		if (!['custodian', 'superadmin'].includes(decoded.role)) {
			logger.warn('Unauthorized role attempted to create inventory item', {
				userId: decoded.userId,
				role: decoded.role,
				ip: getClientAddress()
			});
			return json({ error: 'Forbidden: Insufficient permissions' }, { status: 403 });
		}

		// Parse and validate request body
		const body: CreateInventoryItemRequest = await request.json();
		
		// Validate required fields
		if (!body.name || body.name.trim().length === 0) {
			return json({ error: 'Item name is required' }, { status: 400 });
		}
		if (!body.category || body.category.trim().length === 0) {
			return json({ error: 'Category is required' }, { status: 400 });
		}
		if (body.quantity === undefined || body.quantity < 0) {
			return json({ error: 'Valid quantity is required' }, { status: 400 });
		}

		// Sanitize inputs
		const name = sanitizeInput(body.name.trim());
		const category = sanitizeInput(body.category.trim());
		const specification = body.specification ? sanitizeInput(body.specification.trim()) : '';
		const toolsOrEquipment = body.toolsOrEquipment ? sanitizeInput(body.toolsOrEquipment.trim()) : '';
		const quantity = Math.max(0, body.quantity);
		const donations = body.donations !== undefined ? Math.max(0, body.donations) : 0;
		const eomCount = body.eomCount !== undefined ? Math.max(0, body.eomCount) : 0;

		// Connect to database
		const db = await getDatabase();
		const itemsCollection = db.collection<InventoryItem>('inventory_items');
		const categoriesCollection = db.collection('inventory_categories');

		// Verify category exists and get categoryId
		let categoryId: ObjectId | undefined;
		if (body.categoryId && ObjectId.isValid(body.categoryId)) {
			categoryId = new ObjectId(body.categoryId);
			const categoryExists = await categoriesCollection.findOne({ _id: categoryId });
			if (!categoryExists) {
				return json({ error: 'Category not found' }, { status: 404 });
			}
		}

		// Determine status
		const status = determineStatus(getCurrentCount(quantity, donations), false);

		// Create item
		const newItem: InventoryItem = {
			name,
			category,
			categoryId,
			specification,
			toolsOrEquipment,
			picture: body.picture,
			quantity,
			donations,
			eomCount,
			status,
			isConstant: body.isConstant || false,
			maxQuantityPerRequest: body.isConstant && body.maxQuantityPerRequest 
				? Math.max(1, Math.floor(body.maxQuantityPerRequest))
				: undefined,
			archived: false,
			createdAt: new Date(),
			updatedAt: new Date(),
			createdBy: new ObjectId(decoded.userId)
		};

		const result = await itemsCollection.insertOne(newItem);
		newItem._id = result.insertedId;

		// Update category item count if categoryId exists
		if (categoryId) {
			await categoriesCollection.updateOne(
				{ _id: categoryId },
				{ $inc: { itemCount: 1 } }
			);
		}

		// Log activity
		await logInventoryActivity({
			action: InventoryAction.CREATED,
			entityType: 'item',
			entityId: newItem._id,
			entityName: newItem.name,
			userId: new ObjectId(decoded.userId),
			userName: decoded.email,
			userRole: decoded.role,
			metadata: {
				category,
				categoryId: categoryId?.toString(),
				quantity,
				donations,
				status
			},
			ipAddress: getClientAddress(),
			userAgent: request.headers.get('user-agent') || undefined
		});

		logger.info('Inventory item created', {
			userId: decoded.userId,
			itemId: newItem._id.toString(),
			name,
			category
		});

		// Invalidate inventory cache (use tag-based invalidation — deletePattern is a no-op on Upstash)
		await cacheService.invalidateByTags(['inventory-items', 'inventory-catalog']);
		await cacheService.deletePattern('inventory:archived:*');

		publishInventoryChange([INVENTORY_CHANNEL], {
			action: 'item_created',
			entityType: 'item',
			entityId: newItem._id!.toString(),
			entityName: newItem.name,
			occurredAt: new Date().toISOString()
		});

		return json(toItemResponse(newItem), { status: 201 });

	} catch (error) {
		logger.error('Error creating inventory item', { error });
		return json({ error: 'Failed to create inventory item' }, { status: 500 });
	}
};

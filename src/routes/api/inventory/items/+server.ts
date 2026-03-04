import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDatabase } from '$lib/server/db/mongodb';
import { ObjectId } from 'mongodb';
import type { 
	InventoryItem,
	InventoryItemResponse,
	CreateInventoryItemRequest,
	ItemCondition,
	ItemStatus
} from '$lib/server/models/InventoryItem';
import { sanitizeInput } from '$lib/server/utils/validation';
import { getUserFromToken } from '$lib/server/middleware/auth/verify';
import { rateLimit, RateLimitPresets } from '$lib/server/middleware/rateLimit';
import { logger } from '$lib/server/utils/logger';
import { logInventoryActivity } from '$lib/server/utils/inventoryLogger';
import { InventoryAction } from '$lib/server/models/InventoryHistory';

/**
 * Determine item status based on quantity and minStock
 */
function determineStatus(quantity: number, minStock: number, archived: boolean): ItemStatus {
	if (archived) return 'Archived' as ItemStatus;
	if (quantity === 0) return 'Out of Stock' as ItemStatus;
	if (quantity <= minStock) return 'Low Stock' as ItemStatus;
	return 'In Stock' as ItemStatus;
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

		// Connect to database
		const db = await getDatabase();
		const itemsCollection = db.collection<InventoryItem>('inventory_items');

		// Get query parameters
		const url = new URL(request.url);
		const includeArchived = url.searchParams.get('includeArchived') === 'true';
		const category = url.searchParams.get('category');
		const status = url.searchParams.get('status');
		const search = url.searchParams.get('search');
		const page = parseInt(url.searchParams.get('page') || '1');
		const limit = parseInt(url.searchParams.get('limit') || '100');
		const skip = (page - 1) * limit;

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

		return json({
			items: items.map(toItemResponse),
			total,
			page,
			limit,
			pages: Math.ceil(total / limit)
		});

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
		if (body.minStock === undefined || body.minStock < 0) {
			return json({ error: 'Valid minimum stock is required' }, { status: 400 });
		}

		// Sanitize inputs
		const name = sanitizeInput(body.name.trim());
		const category = sanitizeInput(body.category.trim());
		const specification = body.specification ? sanitizeInput(body.specification.trim()) : '';
		const toolsOrEquipment = body.toolsOrEquipment ? sanitizeInput(body.toolsOrEquipment.trim()) : '';
		const location = body.location ? sanitizeInput(body.location.trim()) : undefined;
		const quantity = Math.max(0, body.quantity);
		const eomCount = body.eomCount !== undefined ? Math.max(0, body.eomCount) : 0;
		const minStock = Math.max(0, body.minStock);
		const condition = body.condition || 'Good' as ItemCondition;

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
		const status = determineStatus(quantity, minStock, false);

		// Create item
		const newItem: InventoryItem = {
			name,
			category,
			categoryId,
			specification,
			toolsOrEquipment,
			picture: body.picture,
			quantity,
			eomCount,
			minStock,
			condition,
			location,
			status,
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
				minStock,
				condition,
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

		return json(toItemResponse(newItem), { status: 201 });

	} catch (error) {
		logger.error('Error creating inventory item', { error });
		return json({ error: 'Failed to create inventory item' }, { status: 500 });
	}
};

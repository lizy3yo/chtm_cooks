/**
 * GET  /api/donations  — paginated list (custodian / superadmin)
 * POST /api/donations  — record a donation and sync to inventory
 *
 * inventoryAction = 'new_item'        → creates a new inventory item
 * inventoryAction = 'add_to_existing' → increments quantity on an existing item
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDatabase } from '$lib/server/db/mongodb';
import { ObjectId } from 'mongodb';
import {
	type Donation,
	type CreateDonationRequest,
	toDonationResponse,
	DONATIONS_COLLECTION
} from '$lib/server/models/Donation';
import type { InventoryItem, ItemCondition, ItemStatus } from '$lib/server/models/InventoryItem';
import { sanitizeInput } from '$lib/server/utils/validation';
import { rateLimit, RateLimitPresets } from '$lib/server/middleware/rateLimit';
import { logger } from '$lib/server/utils/logger';
import { cacheService } from '$lib/server/cache';
import { publishDonationChange, DONATION_CHANNEL } from '$lib/server/realtime/donationEvents';
import { publishInventoryChange, INVENTORY_CHANNEL } from '$lib/server/realtime/inventoryEvents';
import { logInventoryActivity } from '$lib/server/utils/inventoryLogger';
import { InventoryAction } from '$lib/server/models/InventoryHistory';
import {
	getAuthenticatedUser,
	buildDonationsListCacheKey,
	invalidateDonationCaches,
	generateReceiptNumber,
	DONATIONS_CACHE_TAG
} from './shared';

const ALLOWED_ROLES = ['custodian', 'superadmin'];

// ─── GET ─────────────────────────────────────────────────────────────────────

export const GET: RequestHandler = async (event) => {
	const rateLimitResult = await rateLimit(event, RateLimitPresets.API);
	if (rateLimitResult instanceof Response) return rateLimitResult;

	try {
		const user = getAuthenticatedUser(event);
		if (!user) return json({ error: 'Unauthorized' }, { status: 401 });
		if (!ALLOWED_ROLES.includes(user.role))
			return json({ error: 'Forbidden: Insufficient permissions' }, { status: 403 });

		const url = new URL(event.request.url);
		const search = url.searchParams.get('search')?.trim() || undefined;
		const parsedPage = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10));
		const parsedLimit = Math.min(200, Math.max(1, parseInt(url.searchParams.get('limit') || '50', 10)));
		const skip = (parsedPage - 1) * parsedLimit;
		const skipCache = url.searchParams.has('_t');

		const cacheKey = buildDonationsListCacheKey({ search, page: parsedPage, limit: parsedLimit });

		if (!skipCache) {
			const cached = await cacheService.get(cacheKey);
			if (cached) return json(cached);
		}

		const db = await getDatabase();
		const col = db.collection<Donation>(DONATIONS_COLLECTION);

		const filter: Record<string, unknown> = {};
		if (search) {
			filter.$or = [
				{ itemName: { $regex: search, $options: 'i' } },
				{ donorName: { $regex: search, $options: 'i' } },
				{ purpose: { $regex: search, $options: 'i' } }
			];
		}

		const [donations, total] = await Promise.all([
			col.find(filter).sort({ createdAt: -1 }).skip(skip).limit(parsedLimit).toArray(),
			col.countDocuments(filter)
		]);

		const response = {
			donations: donations.map(toDonationResponse),
			total,
			page: parsedPage,
			limit: parsedLimit,
			pages: Math.ceil(total / parsedLimit)
		};

		await cacheService.set(cacheKey, response, { ttl: 3600, tags: [DONATIONS_CACHE_TAG] });

		return json(response);
	} catch (error) {
		logger.error('donations', 'Failed to retrieve donations', { error });
		return json({ error: 'Internal server error' }, { status: 500 });
	}
};

// ─── POST ────────────────────────────────────────────────────────────────────

export const POST: RequestHandler = async (event) => {
	const rateLimitResult = await rateLimit(event, RateLimitPresets.API);
	if (rateLimitResult instanceof Response) return rateLimitResult;

	try {
		const user = getAuthenticatedUser(event);
		if (!user) return json({ error: 'Unauthorized' }, { status: 401 });
		if (!ALLOWED_ROLES.includes(user.role))
			return json({ error: 'Forbidden: Insufficient permissions' }, { status: 403 });

		const body: CreateDonationRequest = await event.request.json();

		// ── Common validation ────────────────────────────────────────────────
		if (!body.donorName?.trim())
			return json({ error: 'Donor name is required' }, { status: 400 });
		if (!Number.isInteger(body.quantity) || body.quantity < 1)
			return json({ error: 'Quantity must be a positive integer' }, { status: 400 });
		if (!body.purpose?.trim())
			return json({ error: 'Purpose is required' }, { status: 400 });
		if (!body.date)
			return json({ error: 'Date is required' }, { status: 400 });
		if (!['new_item', 'add_to_existing'].includes(body.inventoryAction))
			return json({ error: 'inventoryAction must be "new_item" or "add_to_existing"' }, { status: 400 });

		const donationDate = new Date(body.date);
		if (isNaN(donationDate.getTime()))
			return json({ error: 'Invalid date format' }, { status: 400 });

		const donorName = sanitizeInput(body.donorName.trim()).slice(0, 200);
		const purpose = sanitizeInput(body.purpose.trim()).slice(0, 500);
		const notes = body.notes ? sanitizeInput(body.notes.trim()).slice(0, 1000) : undefined;

		const db = await getDatabase();
		const donationsCol = db.collection<Donation>(DONATIONS_COLLECTION);
		const itemsCol = db.collection<InventoryItem>('inventory_items');
		const categoriesCol = db.collection('inventory_categories');

		const now = new Date();
		let inventoryItemId: ObjectId | undefined;
		let itemName: string;
		let unit: string | undefined;

		// ── Branch: new inventory item ────────────────────────────────────────
		if (body.inventoryAction === 'new_item') {
			if (!body.itemName?.trim())
				return json({ error: 'Item name is required' }, { status: 400 });
			if (!body.category?.trim())
				return json({ error: 'Category is required' }, { status: 400 });

			itemName = sanitizeInput(body.itemName.trim()).slice(0, 200);
			unit = body.unit ? sanitizeInput(body.unit.trim()).slice(0, 50) : undefined;
			const category = sanitizeInput(body.category.trim()).slice(0, 100);
			const specification = body.specification ? sanitizeInput(body.specification.trim()).slice(0, 500) : '';
			const toolsOrEquipment = body.toolsOrEquipment ? sanitizeInput(body.toolsOrEquipment.trim()).slice(0, 200) : '';
			const location = body.location ? sanitizeInput(body.location.trim()).slice(0, 200) : undefined;
			const condition = body.condition || 'Good';

			let categoryId: ObjectId | undefined;
			if (body.categoryId && ObjectId.isValid(body.categoryId)) {
				categoryId = new ObjectId(body.categoryId);
				const catExists = await categoriesCol.findOne({ _id: categoryId });
				if (!catExists) return json({ error: 'Category not found' }, { status: 404 });
			}

			const status: ItemStatus = body.quantity > 0 ? 'In Stock' as ItemStatus : 'Out of Stock' as ItemStatus;

			const newItem: InventoryItem = {
				name: itemName,
				category,
				categoryId,
				specification,
				toolsOrEquipment,
				quantity: body.quantity,
				eomCount: 0,
				condition: condition as ItemCondition,
				location,
				status,
				archived: false,
				createdAt: now,
				updatedAt: now,
				createdBy: new ObjectId(user.userId)
			};

			const itemResult = await itemsCol.insertOne(newItem);
			inventoryItemId = itemResult.insertedId;

			if (categoryId) {
				await categoriesCol.updateOne({ _id: categoryId }, { $inc: { itemCount: 1 } });
			}

			await logInventoryActivity({
				action: InventoryAction.CREATED,
				entityType: 'item',
				entityId: inventoryItemId,
				entityName: itemName,
				userId: new ObjectId(user.userId),
				userName: user.email,
				userRole: user.role,
				metadata: { source: 'donation', donorName, quantity: body.quantity, condition, category },
				ipAddress: event.getClientAddress(),
				userAgent: event.request.headers.get('user-agent') || undefined
			});

			await cacheService.invalidateByTags(['inventory-items', 'inventory-catalog']);

			publishInventoryChange([INVENTORY_CHANNEL], {
				action: 'item_created',
				entityType: 'item',
				entityId: inventoryItemId.toString(),
				entityName: itemName,
				occurredAt: now.toISOString()
			});

		// ── Branch: add to existing inventory item ────────────────────────────
		} else {
			if (!body.inventoryItemId || !ObjectId.isValid(body.inventoryItemId))
				return json({ error: 'Valid inventoryItemId is required' }, { status: 400 });

			const existingItemId = new ObjectId(body.inventoryItemId);
			const existingItem = await itemsCol.findOne({ _id: existingItemId, archived: false });
			if (!existingItem)
				return json({ error: 'Inventory item not found or is archived' }, { status: 404 });

			itemName = existingItem.name;
			inventoryItemId = existingItemId;

			const newQty = existingItem.quantity + body.quantity;
			const newStatus: ItemStatus = newQty > 0 ? 'In Stock' as ItemStatus : 'Out of Stock' as ItemStatus;

			await itemsCol.updateOne(
				{ _id: existingItemId },
				{ $inc: { quantity: body.quantity }, $set: { status: newStatus, updatedAt: now, updatedBy: new ObjectId(user.userId) } }
			);

			await logInventoryActivity({
				action: InventoryAction.QUANTITY_CHANGED,
				entityType: 'item',
				entityId: existingItemId,
				entityName: itemName,
				userId: new ObjectId(user.userId),
				userName: user.email,
				userRole: user.role,
				metadata: { source: 'donation', donorName, quantityChange: body.quantity, newQuantity: newQty },
				ipAddress: event.getClientAddress(),
				userAgent: event.request.headers.get('user-agent') || undefined
			});

			await cacheService.invalidateByTags(['inventory-items', 'inventory-catalog']);

			publishInventoryChange([INVENTORY_CHANNEL], {
				action: 'item_updated',
				entityType: 'item',
				entityId: existingItemId.toString(),
				entityName: itemName,
				occurredAt: now.toISOString()
			});
		}

		// ── Create donation record ─────────────────────────────────────────────
		const totalCount = await donationsCol.countDocuments();
		const receiptNumber = generateReceiptNumber(totalCount);

		const newDonation: Donation = {
			receiptNumber,
			donorName,
			itemName,
			quantity: body.quantity,
			unit,
			purpose,
			date: donationDate,
			notes,
			inventoryAction: body.inventoryAction,
			inventoryItemId,
			createdAt: now,
			updatedAt: now,
			createdBy: new ObjectId(user.userId)
		};

		const result = await donationsCol.insertOne(newDonation);
		newDonation._id = result.insertedId;

		await invalidateDonationCaches();

		publishDonationChange([DONATION_CHANNEL], {
			action: 'donation_created',
			entityId: newDonation._id.toString(),
			occurredAt: now.toISOString()
		});

		logger.info('donations', 'Donation recorded and inventory synced', {
			userId: user.userId,
			donationId: newDonation._id.toString(),
			receiptNumber,
			inventoryAction: body.inventoryAction,
			inventoryItemId: inventoryItemId?.toString()
		});

		return json(toDonationResponse(newDonation), { status: 201 });
	} catch (error) {
		logger.error('donations', 'Failed to create donation', { error });
		return json({ error: 'Internal server error' }, { status: 500 });
	}
};

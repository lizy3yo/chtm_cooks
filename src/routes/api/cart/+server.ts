import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDatabase } from '$lib/server/db/mongodb';
import { ObjectId } from 'mongodb';
import { rateLimit, RateLimitPresets } from '$lib/server/middleware/rateLimit';
import { sanitizeInput } from '$lib/server/utils/validation';
import { logger } from '$lib/server/utils/logger';

/**
 * Cart Item stored in database
 */
export interface CartItem {
	itemId: ObjectId;
	name: string;
	quantity: number;
	maxQuantity: number;
	categoryId?: ObjectId;
	picture?: string;
	addedAt: Date;
	updatedAt: Date;
}

/**
 * Student Cart Document
 */
export interface StudentCart {
	_id?: ObjectId;
	studentId: ObjectId;
	items: CartItem[];
	createdAt: Date;
	updatedAt: Date;
}

const CART_COLLECTION = 'student_carts';

/**
 * Get authenticated user from session
 */
function getAuthenticatedUser(event: any): { userId: string; role: string } | null {
	const user = event.locals.user;
	if (!user || !user.userId) {
		return null;
	}
	return { userId: user.userId, role: user.role };
}

/**
 * Convert cart document to response format
 */
function toCartResponse(cart: StudentCart) {
	return {
		items: cart.items.map((item) => ({
			itemId: item.itemId.toString(),
			name: item.name,
			quantity: item.quantity,
			maxQuantity: item.maxQuantity,
			categoryId: item.categoryId?.toString(),
			picture: item.picture,
			addedAt: item.addedAt.toISOString(),
			updatedAt: item.updatedAt.toISOString()
		})),
		updatedAt: cart.updatedAt.toISOString()
	};
}

/**
 * GET /api/cart
 * Fetch student's cart
 */
export const GET: RequestHandler = async (event) => {
	try {
		const user = getAuthenticatedUser(event);
		if (!user) {
			return json({ error: 'Unauthorized' }, { status: 401 });
		}

		if (user.role !== 'student') {
			return json({ error: 'Forbidden: Only students can access cart' }, { status: 403 });
		}

		const db = await getDatabase();
		const cartCollection = db.collection<StudentCart>(CART_COLLECTION);

		const cart = await cartCollection.findOne({ studentId: new ObjectId(user.userId) });

		if (!cart) {
			// Return empty cart if none exists
			return json({
				items: [],
				updatedAt: new Date().toISOString()
			});
		}

		return json(toCartResponse(cart));
	} catch (error) {
		logger.error('Error fetching cart', { error });
		return json({ error: 'Failed to fetch cart' }, { status: 500 });
	}
};

/**
 * POST /api/cart
 * Add item to cart or update quantity
 */
export const POST: RequestHandler = async (event) => {
	const rateLimitResult = await rateLimit(event, RateLimitPresets.API);
	if (rateLimitResult instanceof Response) {
		return rateLimitResult;
	}

	try {
		const user = getAuthenticatedUser(event);
		if (!user) {
			return json({ error: 'Unauthorized' }, { status: 401 });
		}

		if (user.role !== 'student') {
			return json({ error: 'Forbidden: Only students can modify cart' }, { status: 403 });
		}

		let body: {
			itemId: string;
			name: string;
			quantity?: number;
			maxQuantity: number;
			categoryId?: string;
			picture?: string;
		};

		try {
			body = await event.request.json();
		} catch (error) {
			return json({ error: 'Invalid JSON payload' }, { status: 400 });
		}

		// Validate required fields
		if (!body.itemId || !body.name || !body.maxQuantity) {
			return json({ error: 'Missing required fields: itemId, name, maxQuantity' }, { status: 400 });
		}

		// Sanitize inputs
		const itemId = sanitizeInput(body.itemId);
		const name = sanitizeInput(body.name).slice(0, 200);
		const quantity = Math.max(1, Math.min(body.maxQuantity, body.quantity || 1));
		const maxQuantity = Math.max(1, body.maxQuantity);

		if (!ObjectId.isValid(itemId)) {
			return json({ error: 'Invalid itemId format' }, { status: 400 });
		}

		const db = await getDatabase();
		const cartCollection = db.collection<StudentCart>(CART_COLLECTION);
		const now = new Date();

		const studentId = new ObjectId(user.userId);
		const itemObjectId = new ObjectId(itemId);

		// Find existing cart
		const existingCart = await cartCollection.findOne({ studentId });

		if (!existingCart) {
			// Create new cart with first item
			const newCart: StudentCart = {
				studentId,
				items: [{
					itemId: itemObjectId,
					name,
					quantity,
					maxQuantity,
					categoryId: body.categoryId ? new ObjectId(body.categoryId) : undefined,
					picture: body.picture,
					addedAt: now,
					updatedAt: now
				}],
				createdAt: now,
				updatedAt: now
			};

			await cartCollection.insertOne(newCart);

			logger.info('Cart created with first item', {
				userId: user.userId,
				itemId,
				quantity
			});

			return json({
				result: 'added',
				...toCartResponse(newCart)
			}, { status: 201 });
		}

		// Check if item already exists in cart
		const existingItemIndex = existingCart.items.findIndex(
			(item) => item.itemId.toString() === itemId
		);

		if (existingItemIndex >= 0) {
			// Update existing item quantity
			const currentItem = existingCart.items[existingItemIndex];
			const newQuantity = Math.min(currentItem.quantity + quantity, maxQuantity);
			const result = newQuantity === currentItem.quantity ? 'capped' : 'incremented';

			existingCart.items[existingItemIndex] = {
				...currentItem,
				name, // Update name in case it changed
				quantity: newQuantity,
				maxQuantity,
				categoryId: body.categoryId ? new ObjectId(body.categoryId) : currentItem.categoryId,
				picture: body.picture || currentItem.picture,
				updatedAt: now
			};

			await cartCollection.updateOne(
				{ studentId },
				{
					$set: {
						items: existingCart.items,
						updatedAt: now
					}
				}
			);

			logger.info('Cart item updated', {
				userId: user.userId,
				itemId,
				oldQuantity: currentItem.quantity,
				newQuantity,
				result
			});

			return json({
				result,
				...toCartResponse({ ...existingCart, updatedAt: now })
			});
		}

		// Add new item to cart
		const newItem: CartItem = {
			itemId: itemObjectId,
			name,
			quantity,
			maxQuantity,
			categoryId: body.categoryId ? new ObjectId(body.categoryId) : undefined,
			picture: body.picture,
			addedAt: now,
			updatedAt: now
		};

		existingCart.items.push(newItem);

		await cartCollection.updateOne(
			{ studentId },
			{
				$set: {
					items: existingCart.items,
					updatedAt: now
				}
			}
		);

		logger.info('Item added to cart', {
			userId: user.userId,
			itemId,
			quantity
		});

		return json({
			result: 'added',
			...toCartResponse({ ...existingCart, updatedAt: now })
		});
	} catch (error) {
		logger.error('Error adding item to cart', { error });
		return json({ error: 'Failed to add item to cart' }, { status: 500 });
	}
};

/**
 * PATCH /api/cart
 * Update item quantity in cart
 */
export const PATCH: RequestHandler = async (event) => {
	const rateLimitResult = await rateLimit(event, RateLimitPresets.API);
	if (rateLimitResult instanceof Response) {
		return rateLimitResult;
	}

	try {
		const user = getAuthenticatedUser(event);
		if (!user) {
			return json({ error: 'Unauthorized' }, { status: 401 });
		}

		if (user.role !== 'student') {
			return json({ error: 'Forbidden: Only students can modify cart' }, { status: 403 });
		}

		let body: { itemId: string; quantity: number };

		try {
			body = await event.request.json();
		} catch (error) {
			return json({ error: 'Invalid JSON payload' }, { status: 400 });
		}

		if (!body.itemId || typeof body.quantity !== 'number') {
			return json({ error: 'Missing required fields: itemId, quantity' }, { status: 400 });
		}

		const itemId = sanitizeInput(body.itemId);
		if (!ObjectId.isValid(itemId)) {
			return json({ error: 'Invalid itemId format' }, { status: 400 });
		}

		const db = await getDatabase();
		const cartCollection = db.collection<StudentCart>(CART_COLLECTION);
		const now = new Date();

		const studentId = new ObjectId(user.userId);
		const cart = await cartCollection.findOne({ studentId });

		if (!cart) {
			return json({ error: 'Cart not found' }, { status: 404 });
		}

		const itemIndex = cart.items.findIndex((item) => item.itemId.toString() === itemId);

		if (itemIndex < 0) {
			return json({ error: 'Item not found in cart' }, { status: 404 });
		}

		const item = cart.items[itemIndex];
		const newQuantity = Math.max(1, Math.min(item.maxQuantity, body.quantity));

		cart.items[itemIndex] = {
			...item,
			quantity: newQuantity,
			updatedAt: now
		};

		await cartCollection.updateOne(
			{ studentId },
			{
				$set: {
					items: cart.items,
					updatedAt: now
				}
			}
		);

		logger.info('Cart item quantity updated', {
			userId: user.userId,
			itemId,
			oldQuantity: item.quantity,
			newQuantity
		});

		return json(toCartResponse({ ...cart, updatedAt: now }));
	} catch (error) {
		logger.error('Error updating cart item quantity', { error });
		return json({ error: 'Failed to update cart item' }, { status: 500 });
	}
};

/**
 * DELETE /api/cart
 * Remove item from cart or clear entire cart
 * Note: Constant items cannot be removed individually
 */
export const DELETE: RequestHandler = async (event) => {
	const rateLimitResult = await rateLimit(event, RateLimitPresets.API);
	if (rateLimitResult instanceof Response) {
		return rateLimitResult;
	}

	try {
		const user = getAuthenticatedUser(event);
		if (!user) {
			return json({ error: 'Unauthorized' }, { status: 401 });
		}

		if (user.role !== 'student') {
			return json({ error: 'Forbidden: Only students can modify cart' }, { status: 403 });
		}

		const url = new URL(event.request.url);
		const itemId = url.searchParams.get('itemId');

		const db = await getDatabase();
		const cartCollection = db.collection<StudentCart>(CART_COLLECTION);
		const now = new Date();
		const studentId = new ObjectId(user.userId);

		if (!itemId) {
			// Clear entire cart (removes all items including constant ones)
			await cartCollection.updateOne(
				{ studentId },
				{
					$set: {
						items: [],
						updatedAt: now
					}
				}
			);

			logger.info('Cart cleared', { userId: user.userId });

			return json({
				items: [],
				updatedAt: now.toISOString()
			});
		}

		// Remove specific item - check if it's a constant item first
		const sanitizedItemId = sanitizeInput(itemId);
		if (!ObjectId.isValid(sanitizedItemId)) {
			return json({ error: 'Invalid itemId format' }, { status: 400 });
		}

		// Check if the item is a constant item in inventory
		const inventoryCollection = db.collection('inventory_items');
		const inventoryItem = await inventoryCollection.findOne({
			_id: new ObjectId(sanitizedItemId)
		});

		if (inventoryItem && inventoryItem.isConstant === true) {
			logger.warn('Attempt to remove constant item from cart', {
				userId: user.userId,
				itemId: sanitizedItemId,
				itemName: inventoryItem.name
			});

			return json({
				error: 'Cannot remove constant items',
				message: 'Constant items are required and cannot be removed from your request list. You can only adjust their quantity.'
			}, { status: 403 });
		}

		const cart = await cartCollection.findOne({ studentId });

		if (!cart) {
			return json({ error: 'Cart not found' }, { status: 404 });
		}

		const filteredItems = cart.items.filter(
			(item) => item.itemId.toString() !== sanitizedItemId
		);

		if (filteredItems.length === cart.items.length) {
			return json({ error: 'Item not found in cart' }, { status: 404 });
		}

		await cartCollection.updateOne(
			{ studentId },
			{
				$set: {
					items: filteredItems,
					updatedAt: now
				}
			}
		);

		logger.info('Item removed from cart', {
			userId: user.userId,
			itemId: sanitizedItemId
		});

		return json(toCartResponse({ ...cart, items: filteredItems, updatedAt: now }));
	} catch (error) {
		logger.error('Error removing item from cart', { error });
		return json({ error: 'Failed to remove item from cart' }, { status: 500 });
	}
};

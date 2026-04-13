import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { ObjectId } from 'mongodb';
import { getDatabase } from '$lib/server/db/mongodb';
import type { CreateInventoryItemRequest, InventoryItem, ItemStatus } from '$lib/server/models/InventoryItem';
import { sanitizeInput } from '$lib/server/utils/validation';
import { getUserFromToken } from '$lib/server/middleware/auth/verify';
import { rateLimit, RateLimitPresets } from '$lib/server/middleware/rateLimit';
import { logger } from '$lib/server/utils/logger';
import { cacheService } from '$lib/server/cache';
import { publishInventoryChange, INVENTORY_CHANNEL } from '$lib/server/realtime/inventoryEvents';

type BulkCreateRequest = {
	items: CreateInventoryItemRequest[];
};

type BulkFailure = {
	index: number;
	name?: string;
	error: string;
};

const MAX_ITEMS_PER_BULK_REQUEST = 200;

function determineStatus(quantity: number, archived: boolean): ItemStatus {
	if (archived) return 'Archived' as ItemStatus;
	if (quantity === 0) return 'Out of Stock' as ItemStatus;
	return 'In Stock' as ItemStatus;
}

function getCurrentCount(quantity: number, donations = 0): number {
	return quantity + donations;
}

export const POST: RequestHandler = async (event) => {
	const { request, getClientAddress } = event;
	const isImportContext = request.headers.get('x-import-context') === '1';

	if (!isImportContext) {
		const rateLimitResult = await rateLimit(event, RateLimitPresets.INVENTORY_IMPORT);
		if (rateLimitResult instanceof Response) {
			return rateLimitResult;
		}
	}

	try {
		const decoded = getUserFromToken(event);
		if (!decoded) {
			return json({ error: 'Unauthorized' }, { status: 401 });
		}

		if (!['custodian', 'superadmin'].includes(decoded.role)) {
			logger.warn('Unauthorized role attempted bulk inventory import', {
				userId: decoded.userId,
				role: decoded.role,
				ip: getClientAddress()
			});
			return json({ error: 'Forbidden: Insufficient permissions' }, { status: 403 });
		}

		const body = (await request.json()) as BulkCreateRequest;
		const payloadItems = Array.isArray(body?.items) ? body.items : [];

		if (payloadItems.length === 0) {
			return json({ error: 'No items provided for bulk import' }, { status: 400 });
		}

		if (payloadItems.length > MAX_ITEMS_PER_BULK_REQUEST) {
			return json(
				{ error: `Bulk import request exceeds limit of ${MAX_ITEMS_PER_BULK_REQUEST} items` },
				{ status: 400 }
			);
		}

		const db = await getDatabase();
		const itemsCollection = db.collection<InventoryItem>('inventory_items');
		const categoriesCollection = db.collection('inventory_categories');

		const failures: BulkFailure[] = [];
		const preparedItems: InventoryItem[] = [];
		const preparedSourceIndexes: number[] = [];

		for (let i = 0; i < payloadItems.length; i++) {
			const item = payloadItems[i];
			try {
				if (!item?.name || item.name.trim().length === 0) {
					throw new Error('Item name is required');
				}
				if (!item?.category || item.category.trim().length === 0) {
					throw new Error('Category is required');
				}
				if (item.quantity === undefined || item.quantity < 0) {
					throw new Error('Valid quantity is required');
				}

				const name = sanitizeInput(item.name.trim());
				const category = sanitizeInput(item.category.trim());
				const specification = item.specification ? sanitizeInput(item.specification.trim()) : '';
				const toolsOrEquipment = item.toolsOrEquipment ? sanitizeInput(item.toolsOrEquipment.trim()) : '';
				const quantity = Math.max(0, item.quantity);
				const donations = item.donations !== undefined ? Math.max(0, item.donations) : 0;
				const eomCount = item.eomCount !== undefined ? Math.max(0, item.eomCount) : 0;

				let categoryId: ObjectId | undefined;
				if (item.categoryId && ObjectId.isValid(item.categoryId)) {
					categoryId = new ObjectId(item.categoryId);
					const categoryExists = await categoriesCollection.findOne({ _id: categoryId });
					if (!categoryExists) {
						throw new Error('Category not found');
					}
				}

				preparedItems.push({
					name,
					category,
					categoryId,
					specification,
					toolsOrEquipment,
					picture: item.picture,
					quantity,
					donations,
					eomCount,
					status: determineStatus(getCurrentCount(quantity, donations), false),
					isConstant: item.isConstant || false,
					maxQuantityPerRequest: item.isConstant && item.maxQuantityPerRequest
						? Math.max(1, Math.floor(item.maxQuantityPerRequest))
						: undefined,
					archived: false,
					createdAt: new Date(),
					updatedAt: new Date(),
					createdBy: new ObjectId(decoded.userId)
				});
				preparedSourceIndexes.push(i);
			} catch (error) {
				failures.push({
					index: i,
					name: item?.name,
					error: error instanceof Error ? error.message : 'Validation failed'
				});
			}
		}

		if (preparedItems.length === 0) {
			return json({
				createdCount: 0,
				failedCount: failures.length,
				failures
			}, { status: 400 });
		}

		let createdItems = [...preparedItems];
		let createdCount = 0;

		try {
			const insertResult = await itemsCollection.insertMany(preparedItems, { ordered: false });
			createdCount = insertResult.insertedCount;
		} catch (error: any) {
			const writeErrors = Array.isArray(error?.writeErrors) ? error.writeErrors : [];
			if (writeErrors.length === 0) {
				throw error;
			}

			const failedPreparedIndexes = new Set<number>();
			for (const writeError of writeErrors) {
				const preparedIndex = writeError?.index;
				if (typeof preparedIndex !== 'number') continue;

				failedPreparedIndexes.add(preparedIndex);
				failures.push({
					index: preparedSourceIndexes[preparedIndex] ?? preparedIndex,
					name: preparedItems[preparedIndex]?.name,
					error: writeError?.errmsg || 'Failed to insert item'
				});
			}

			createdItems = preparedItems.filter((_, idx) => !failedPreparedIndexes.has(idx));
			createdCount = createdItems.length;
		}

		const categoryIncrements = new Map<string, number>();
		for (const item of createdItems) {
			if (!item.categoryId) continue;
			const key = item.categoryId.toString();
			categoryIncrements.set(key, (categoryIncrements.get(key) ?? 0) + 1);
		}

		if (categoryIncrements.size > 0) {
			await categoriesCollection.bulkWrite(
				[...categoryIncrements.entries()].map(([categoryId, inc]) => ({
					updateOne: {
						filter: { _id: new ObjectId(categoryId) },
						update: { $inc: { itemCount: inc } }
					}
				})),
				{ ordered: false }
			);
		}

		await cacheService.invalidateByTags(['inventory-items', 'inventory-catalog']);
		await cacheService.deletePattern('inventory:archived:*');

		publishInventoryChange([INVENTORY_CHANNEL], {
			action: 'item_created',
			entityType: 'item',
			entityId: 'bulk-import',
			entityName: `Bulk import (${createdCount} items)`,
			occurredAt: new Date().toISOString()
		});

		logger.info('Bulk inventory import completed', {
			userId: decoded.userId,
			createdCount,
			failedCount: failures.length
		});

		return json({
			createdCount,
			failedCount: failures.length,
			failures
		}, { status: 201 });
	} catch (error) {
		logger.error('Bulk inventory import failed', { error });
		return json({ error: 'Failed to bulk import inventory items' }, { status: 500 });
	}
};

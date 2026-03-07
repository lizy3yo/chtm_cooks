import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDatabase } from '$lib/server/db/mongodb';
import { ObjectId } from 'mongodb';
import { rateLimit, RateLimitPresets } from '$lib/server/middleware/rateLimit';
import { logger } from '$lib/server/utils/logger';
import type { InventoryItem } from '$lib/server/models/InventoryItem';
import { BorrowRequestStatus, toBorrowRequestResponse, type BorrowRequest } from '$lib/server/models/BorrowRequest';
import {
	BORROW_REQUESTS_COLLECTION,
	getAuthenticatedUser,
	incrementInventoryOnReturn,
	invalidateBorrowRequestCaches,
	parseObjectId
} from '../../shared';

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
		if (!['custodian', 'superadmin'].includes(user.role)) {
			return json({ error: 'Forbidden: Custodian access required' }, { status: 403 });
		}

		const requestId = parseObjectId(event.params.id);
		if (!requestId) {
			return json({ error: 'Invalid request ID' }, { status: 400 });
		}

		const db = await getDatabase();
		const requestCollection = db.collection<BorrowRequest>(BORROW_REQUESTS_COLLECTION);
		const inventoryCollection = db.collection<InventoryItem>('inventory_items');

		const borrowRequest = await requestCollection.findOne({ _id: requestId });
		if (!borrowRequest) {
			return json({ error: 'Borrow request not found' }, { status: 404 });
		}

		if (borrowRequest.status !== BorrowRequestStatus.BORROWED) {
			return json({ error: 'Borrow request is not in borrowed state' }, { status: 409 });
		}

		await incrementInventoryOnReturn(inventoryCollection, borrowRequest.items);

		const now = new Date();
		const updated = await requestCollection.findOneAndUpdate(
			{ _id: requestId, status: BorrowRequestStatus.BORROWED },
			{
				$set: {
					status: BorrowRequestStatus.RETURNED,
					custodianId: new ObjectId(user.userId),
					returnedAt: now,
					updatedAt: now,
					updatedBy: new ObjectId(user.userId)
				}
			},
			{ returnDocument: 'after' }
		);

		if (!updated) {
			// Best effort rollback of inventory increments on state race.
			for (const item of borrowRequest.items) {
				await inventoryCollection.updateOne(
					{ _id: item.itemId, quantity: { $gte: item.quantity } },
					{ $inc: { quantity: -item.quantity }, $set: { updatedAt: new Date() } }
				);
			}
			return json({ error: 'Borrow request state changed, please retry' }, { status: 409 });
		}

		await invalidateBorrowRequestCaches();
		return json(toBorrowRequestResponse(updated));
	} catch (error) {
		logger.error('Error returning borrow request', { error });
		return json({ error: 'Failed to complete return' }, { status: 500 });
	}
};

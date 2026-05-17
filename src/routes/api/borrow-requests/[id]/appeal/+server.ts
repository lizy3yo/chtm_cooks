import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDatabase } from '$lib/server/db/mongodb';
import { ObjectId } from 'mongodb';
import { rateLimit, RateLimitPresets } from '$lib/server/middleware/rateLimit';
import { sanitizeInput } from '$lib/server/utils/validation';
import { logger } from '$lib/server/utils/logger';
import {
	BorrowRequestStatus,
	type BorrowRequest,
	toBorrowRequestResponse
} from '$lib/server/models/BorrowRequest';
import {
	BORROW_REQUESTS_COLLECTION,
	decrementInventoryForBorrow,
	getAuthenticatedUser,
	invalidateBorrowRequestCaches,
	parseObjectId,
	publishBorrowRequestRealtimeEvent
} from '../../shared';
import { notifyBorrowRequestLifecycle } from '$lib/server/services/notifications';

/** Maximum number of times a student may appeal a single request. */
const MAX_APPEAL_COUNT = 1;

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
			return json({ error: 'Forbidden: Only students may appeal a rejected request' }, { status: 403 });
		}

		const requestId = parseObjectId(event.params.id);
		if (!requestId) {
			return json({ error: 'Invalid request ID' }, { status: 400 });
		}

		const body = (await event.request.json()) as { reason?: string };
		const reason = sanitizeInput(body.reason || '');
		if (reason.length < 10 || reason.length > 500) {
			return json(
				{ error: 'Appeal reason must be between 10 and 500 characters' },
				{ status: 400 }
			);
		}

		const db = await getDatabase();
		const collection = db.collection<BorrowRequest>(BORROW_REQUESTS_COLLECTION);
		const now = new Date();

		// Fetch the request first to validate ownership and appeal count
		const existing = await collection.findOne({
			_id: requestId,
			studentId: new ObjectId(user.userId),
			status: BorrowRequestStatus.REJECTED
		});

		if (!existing) {
			return json(
				{ error: 'Request not found or is not in a rejected state' },
				{ status: 409 }
			);
		}

		const currentAppealCount = existing.appealCount ?? 0;
		if (currentAppealCount >= MAX_APPEAL_COUNT) {
			return json(
				{ error: 'This request has already been appealed and cannot be appealed again' },
				{ status: 409 }
			);
		}

		const inventoryCollection = db.collection<any>('inventory_items');

		// Try to decrement stock again for the appeal
		const stockResult = await decrementInventoryForBorrow(inventoryCollection, existing.items);
		if (!stockResult.ok) {
			return json(
				{ error: stockResult.message || 'Insufficient stock to appeal this request' },
				{ status: 409 }
			);
		}

		const updated = await collection.findOneAndUpdate(
			{
				_id: requestId,
				studentId: new ObjectId(user.userId),
				status: BorrowRequestStatus.REJECTED
			},
			{
				$set: {
					status: BorrowRequestStatus.PENDING_APPEAL,
					appealReason: reason,
					appealedAt: now,
					updatedAt: now,
					updatedBy: new ObjectId(user.userId)
				},
				$inc: { appealCount: 1 }
			},
			{ returnDocument: 'after' }
		);

		if (!updated) {
			// Roll back decrement
			for (const item of existing.items) {
				await inventoryCollection.updateOne(
					{ _id: item.itemId },
					{ $inc: { quantity: item.quantity }, $set: { updatedAt: new Date() } }
				);
			}
			return json(
				{ error: 'Failed to submit appeal. The request may have already been appealed.' },
				{ status: 409 }
			);
		}

		await invalidateBorrowRequestCaches();
		publishBorrowRequestRealtimeEvent(updated, 'appealed', now);
		await notifyBorrowRequestLifecycle({
			db,
			request: updated,
			event: 'appealed',
			contextNotes: reason
		});

		return json(toBorrowRequestResponse(updated));
	} catch (error) {
		logger.error('Error submitting borrow request appeal', { error });
		return json({ error: 'Failed to submit appeal' }, { status: 500 });
	}
};

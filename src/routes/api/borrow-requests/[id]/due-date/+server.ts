import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDatabase } from '$lib/server/db/mongodb';
import { ObjectId } from 'mongodb';
import { rateLimit, RateLimitPresets } from '$lib/server/middleware/rateLimit';
import { logger } from '$lib/server/utils/logger';
import {
	BORROW_REQUESTS_COLLECTION,
	getAuthenticatedUser,
	invalidateBorrowRequestCaches,
	parseObjectId,
	publishBorrowRequestRealtimeEvent
} from '../../shared';
import { REPLACEMENT_OBLIGATIONS_COLLECTION, invalidateReplacementObligationCaches } from '../../../replacement-obligations/shared';
import type { BorrowRequest } from '$lib/server/models/BorrowRequest';

export const PATCH: RequestHandler = async (event) => {
	const rateLimitResult = await rateLimit(event, RateLimitPresets.API);
	if (rateLimitResult instanceof Response) return rateLimitResult;

	try {
		const user = getAuthenticatedUser(event);
		if (!user || (user.role !== 'custodian' && user.role !== 'superadmin')) {
			return json({ error: 'Unauthorized' }, { status: 403 });
		}

		const requestId = parseObjectId(event.params.id);
		if (!requestId) return json({ error: 'Invalid request ID' }, { status: 400 });

		const { itemId, dueDate } = await event.request.json();
		if (!itemId || !dueDate) {
			return json({ error: 'itemId and dueDate are required' }, { status: 400 });
		}

		const db = await getDatabase();
		const now = new Date();
		const parsedDueDate = new Date(dueDate);

		// Update BorrowRequest item inspection
		const requestDoc = await db.collection<BorrowRequest>(BORROW_REQUESTS_COLLECTION).findOne({ _id: requestId });
		if (!requestDoc) return json({ error: 'Request not found' }, { status: 404 });

		const itemIndex = requestDoc.items.findIndex(i => i.itemId.toString() === itemId);
		if (itemIndex === -1 || !requestDoc.items[itemIndex].inspection) {
			return json({ error: 'Item inspection not found' }, { status: 404 });
		}

		const updatePath = `items.${itemIndex}.inspection.dueDate`;
		await db.collection(BORROW_REQUESTS_COLLECTION).updateOne(
			{ _id: requestId },
			{
				$set: {
					[updatePath]: parsedDueDate,
					updatedAt: now,
					updatedBy: new ObjectId(user.userId)
				}
			}
		);

		// Update ReplacementObligation
		await db.collection(REPLACEMENT_OBLIGATIONS_COLLECTION).updateOne(
			{ borrowRequestId: requestId, itemId: parseObjectId(itemId) },
			{
				$set: {
					dueDate: parsedDueDate,
					updatedAt: now,
					updatedBy: new ObjectId(user.userId)
				}
			}
		);

		await invalidateBorrowRequestCaches();
		await invalidateReplacementObligationCaches();

		// Refetch and publish
		const updatedDoc = await db.collection<BorrowRequest>(BORROW_REQUESTS_COLLECTION).findOne({ _id: requestId });
		if (updatedDoc) {
			publishBorrowRequestRealtimeEvent(updatedDoc, 'obligation_updated', now);
		}

		return json({ success: true, message: 'Due date updated' });
	} catch (error) {
		logger.error('Error updating due date', { error });
		return json({ error: 'Internal server error' }, { status: 500 });
	}
};

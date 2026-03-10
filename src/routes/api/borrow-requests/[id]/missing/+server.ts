import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDatabase } from '$lib/server/db/mongodb';
import { ObjectId } from 'mongodb';
import { rateLimit, RateLimitPresets } from '$lib/server/middleware/rateLimit';
import { logger } from '$lib/server/utils/logger';
import { BorrowRequestStatus, toBorrowRequestResponse, type BorrowRequest } from '$lib/server/models/BorrowRequest';
import {
	BORROW_REQUESTS_COLLECTION,
	getAuthenticatedUser,
	invalidateBorrowRequestCaches,
	parseObjectId,
	publishBorrowRequestRealtimeEvent
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

		const now = new Date();
		const updated = await requestCollection.findOneAndUpdate(
			{
				_id: requestId,
				status: { $in: [BorrowRequestStatus.BORROWED, BorrowRequestStatus.PENDING_RETURN] }
			},
			{
				$set: {
					status: BorrowRequestStatus.MISSING,
					custodianId: new ObjectId(user.userId),
					missingAt: now,
					updatedAt: now,
					updatedBy: new ObjectId(user.userId)
				}
			},
			{ returnDocument: 'after' }
		);

		if (!updated) {
			return json({ error: 'Only active borrowed requests can be marked missing' }, { status: 409 });
		}

		await invalidateBorrowRequestCaches();
		publishBorrowRequestRealtimeEvent(updated, 'missing', now);
		return json(toBorrowRequestResponse(updated));
	} catch (error) {
		logger.error('Error marking borrow request as missing', { error });
		return json({ error: 'Failed to mark request as missing' }, { status: 500 });
	}
};

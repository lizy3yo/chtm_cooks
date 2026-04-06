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
import { notifyBorrowRequestLifecycle } from '$lib/server/services/notifications';

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
		if (!['student', 'superadmin'].includes(user.role)) {
			return json({ error: 'Forbidden: Student access required' }, { status: 403 });
		}

		const requestId = parseObjectId(event.params.id);
		if (!requestId) {
			return json({ error: 'Invalid request ID' }, { status: 400 });
		}

		const db = await getDatabase();
		const requestCollection = db.collection<BorrowRequest>(BORROW_REQUESTS_COLLECTION);

		const borrowRequest = await requestCollection.findOne({ _id: requestId });
		if (!borrowRequest) {
			return json({ error: 'Borrow request not found' }, { status: 404 });
		}

		// Verify the student owns this request
		if (user.role === 'student' && borrowRequest.studentId.toString() !== user.userId) {
			return json({ error: 'Forbidden: Not your request' }, { status: 403 });
		}

		if (borrowRequest.status !== BorrowRequestStatus.BORROWED) {
			return json({ error: 'Borrow request is not in borrowed state' }, { status: 409 });
		}

		const now = new Date();
		const updated = await requestCollection.findOneAndUpdate(
			{ _id: requestId, status: BorrowRequestStatus.BORROWED },
			{
				$set: {
					status: BorrowRequestStatus.PENDING_RETURN,
					updatedAt: now,
					updatedBy: new ObjectId(user.userId)
				}
			},
			{ returnDocument: 'after' }
		);

		if (!updated) {
			return json({ error: 'Borrow request state changed, please retry' }, { status: 409 });
		}

		await invalidateBorrowRequestCaches();
		publishBorrowRequestRealtimeEvent(updated, 'return_initiated', now);
		await notifyBorrowRequestLifecycle({
			db,
			request: updated,
			event: 'return_initiated'
		});
		logger.info('Student initiated return', { requestId: requestId.toString(), studentId: user.userId });
		return json(toBorrowRequestResponse(updated));
	} catch (error) {
		logger.error('Error initiating return', { error });
		return json({ error: 'Failed to initiate return' }, { status: 500 });
	}
};

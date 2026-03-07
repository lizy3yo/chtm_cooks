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
		if (!['instructor', 'superadmin'].includes(user.role)) {
			return json({ error: 'Forbidden: Instructor access required' }, { status: 403 });
		}

		const requestId = parseObjectId(event.params.id);
		if (!requestId) {
			return json({ error: 'Invalid request ID' }, { status: 400 });
		}

		const db = await getDatabase();
		const collection = db.collection<BorrowRequest>(BORROW_REQUESTS_COLLECTION);
		const now = new Date();

		const updated = await collection.findOneAndUpdate(
			{ _id: requestId, status: BorrowRequestStatus.PENDING_INSTRUCTOR },
			{
				$set: {
					status: BorrowRequestStatus.APPROVED_INSTRUCTOR,
					instructorId: new ObjectId(user.userId),
					approvedAt: now,
					updatedAt: now,
					updatedBy: new ObjectId(user.userId)
				}
			},
			{ returnDocument: 'after' }
		);

		if (!updated) {
			return json({ error: 'Borrow request is not in pending_instructor state' }, { status: 409 });
		}

		await invalidateBorrowRequestCaches();
		return json(toBorrowRequestResponse(updated));
	} catch (error) {
		logger.error('Error approving borrow request', { error });
		return json({ error: 'Failed to approve borrow request' }, { status: 500 });
	}
};

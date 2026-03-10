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
	type RejectBorrowRequestRequest,
	toBorrowRequestResponse
} from '$lib/server/models/BorrowRequest';
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
		if (!['instructor', 'custodian', 'superadmin'].includes(user.role)) {
			return json({ error: 'Forbidden: Instructor or custodian access required' }, { status: 403 });
		}

		const requestId = parseObjectId(event.params.id);
		if (!requestId) {
			return json({ error: 'Invalid request ID' }, { status: 400 });
		}

		const body = (await event.request.json()) as RejectBorrowRequestRequest;
		const reason = sanitizeInput(body.reason || '');
		const notes = body.notes ? sanitizeInput(body.notes) : undefined;
		if (reason.length < 3 || reason.length > 200) {
			return json({ error: 'Reason must be between 3 and 200 characters' }, { status: 400 });
		}
		if (notes && notes.length > 500) {
			return json({ error: 'Notes must be 500 characters or less' }, { status: 400 });
		}

		const db = await getDatabase();
		const collection = db.collection<BorrowRequest>(BORROW_REQUESTS_COLLECTION);
		const now = new Date();

		const allowedCurrentStatuses = user.role === 'custodian'
			? [BorrowRequestStatus.APPROVED_INSTRUCTOR]
			: [BorrowRequestStatus.PENDING_INSTRUCTOR];

		const actorUpdateFields = user.role === 'custodian'
			? { custodianId: new ObjectId(user.userId) }
			: { instructorId: new ObjectId(user.userId) };

		const updated = await collection.findOneAndUpdate(
			{ _id: requestId, status: { $in: allowedCurrentStatuses } },
			{
				$set: {
					status: BorrowRequestStatus.REJECTED,
					...actorUpdateFields,
					rejectReason: reason,
					rejectionNotes: notes,
					rejectedAt: now,
					updatedAt: now,
					updatedBy: new ObjectId(user.userId)
				}
			},
			{ returnDocument: 'after' }
		);

		if (!updated) {
			const requiredState = user.role === 'custodian' ? 'approved_instructor' : 'pending_instructor';
			return json({ error: `Borrow request is not in ${requiredState} state` }, { status: 409 });
		}

		await invalidateBorrowRequestCaches();
		publishBorrowRequestRealtimeEvent(updated, 'rejected', now);
		return json(toBorrowRequestResponse(updated));
	} catch (error) {
		logger.error('Error rejecting borrow request', { error });
		return json({ error: 'Failed to reject borrow request' }, { status: 500 });
	}
};

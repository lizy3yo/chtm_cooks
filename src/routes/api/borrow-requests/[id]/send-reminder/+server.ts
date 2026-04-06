import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDatabase } from '$lib/server/db/mongodb';
import { ObjectId } from 'mongodb';
import { rateLimit, RateLimitPresets } from '$lib/server/middleware/rateLimit';
import { logger } from '$lib/server/utils/logger';
import { BorrowRequestStatus, type BorrowRequest } from '$lib/server/models/BorrowRequest';
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
		if (!['custodian', 'superadmin'].includes(user.role)) {
			return json({ error: 'Forbidden: Custodian access required' }, { status: 403 });
		}

		const requestId = parseObjectId(event.params.id);
		if (!requestId) {
			return json({ error: 'Invalid request ID' }, { status: 400 });
		}

		const db = await getDatabase();
		const requestCollection = db.collection<BorrowRequest>(BORROW_REQUESTS_COLLECTION);
		const request = await requestCollection.findOne({ _id: requestId });

		if (!request) {
			return json({ error: 'Borrow request not found' }, { status: 404 });
		}

		if (![BorrowRequestStatus.BORROWED, BorrowRequestStatus.PENDING_RETURN].includes(request.status)) {
			return json({ error: 'Reminders can only be sent for active borrowed requests' }, { status: 409 });
		}

		const now = new Date();
		if (request.returnDate >= now) {
			return json({ error: 'Reminder can only be sent after due date' }, { status: 409 });
		}

		const reminderCount = (request.reminderCount || 0) + 1;
		await requestCollection.updateOne(
			{ _id: requestId },
			{
				$set: {
					lastReminderAt: now,
					updatedAt: now,
					updatedBy: new ObjectId(user.userId)
				},
				$inc: {
					reminderCount: 1
				}
			}
		);

		await invalidateBorrowRequestCaches();
		publishBorrowRequestRealtimeEvent(
			{ ...request, _id: requestId },
			'reminder_sent',
			now
		);
		await notifyBorrowRequestLifecycle({
			db,
			request: { ...request, _id: requestId },
			event: 'reminder_sent',
			contextNotes: 'Borrowed items are overdue. Please return them as soon as possible.'
		});
		return json({
			success: true,
			message: 'Overdue reminder recorded successfully',
			reminderCount
		});
	} catch (error) {
		logger.error('Error sending overdue reminder', { error });
		return json({ error: 'Failed to send overdue reminder' }, { status: 500 });
	}
};

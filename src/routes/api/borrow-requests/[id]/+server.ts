import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDatabase } from '$lib/server/db/mongodb';
import { ObjectId } from 'mongodb';
import { rateLimit, RateLimitPresets } from '$lib/server/middleware/rateLimit';
import { cacheService } from '$lib/server/cache';
import { logger } from '$lib/server/utils/logger';
import type { BorrowRequest, BorrowRequestResponse } from '$lib/server/models/BorrowRequest';
import { BorrowRequestStatus, toBorrowRequestResponse } from '$lib/server/models/BorrowRequest';
import type { User } from '$lib/server/models/User';
import {
	BORROW_REQUESTS_COLLECTION,
	buildBorrowRequestDetailCacheKey,
	canAccessBorrowRequest,
	getAuthenticatedUser,
	parseObjectId,
	publishBorrowRequestRealtimeEvent
} from '../shared';
import { notifyBorrowRequestLifecycle } from '$lib/server/services/notifications';

export const GET: RequestHandler = async (event) => {
	const rateLimitResult = await rateLimit(event, RateLimitPresets.API);
	if (rateLimitResult instanceof Response) {
		return rateLimitResult;
	}

	try {
		const user = getAuthenticatedUser(event);
		if (!user) {
			return json({ error: 'Unauthorized' }, { status: 401 });
		}

		const requestId = parseObjectId(event.params.id);
		if (!requestId) {
			return json({ error: 'Invalid request ID' }, { status: 400 });
		}

		const cacheKey = buildBorrowRequestDetailCacheKey(event.params.id);
		const cached = await cacheService.get<ReturnType<typeof toBorrowRequestResponse>>(cacheKey);
		if (cached) {
			if (user.role === 'student' && cached.studentId !== user.userId) {
				return json({ error: 'Forbidden' }, { status: 403 });
			}
			return json(cached);
		}

		const db = await getDatabase();
		const collection = db.collection<BorrowRequest>(BORROW_REQUESTS_COLLECTION);
		const requestDoc = await collection.findOne({ _id: requestId });

		if (!requestDoc) {
			return json({ error: 'Borrow request not found' }, { status: 404 });
		}

		if (!canAccessBorrowRequest(user, requestDoc)) {
			return json({ error: 'Forbidden' }, { status: 403 });
		}

		const usersCollection = db.collection<User>('users');
		const actorIds = [
			requestDoc.studentId,
			requestDoc.instructorId,
			requestDoc.custodianId
		].filter((id): id is NonNullable<typeof id> => Boolean(id));

		const userDocs = actorIds.length > 0
			? await usersCollection
				.find(
					{ _id: { $in: actorIds } },
					{ projection: { firstName: 1, lastName: 1, email: 1, yearLevel: 1, block: 1 } }
				)
				.toArray()
			: [];
		const userMap = new Map(userDocs.map((userDoc) => [userDoc._id!.toString(), userDoc]));

		const base = toBorrowRequestResponse(requestDoc) as BorrowRequestResponse & {
			student?: Record<string, unknown>;
			instructor?: Record<string, unknown>;
			custodian?: Record<string, unknown>;
		};
		const student = userMap.get(base.studentId);
		const instructor = base.instructorId ? userMap.get(base.instructorId) : undefined;
		const custodian = base.custodianId ? userMap.get(base.custodianId) : undefined;

		const response = {
			...base,
			student: student ? {
				id: student._id!.toString(),
				email: student.email,
				firstName: student.firstName,
				lastName: student.lastName,
				fullName: `${student.firstName} ${student.lastName}`.trim(),
				yearLevel: student.yearLevel,
				block: student.block
			} : undefined,
			instructor: instructor ? {
				id: instructor._id!.toString(),
				email: instructor.email,
				firstName: instructor.firstName,
				lastName: instructor.lastName,
				fullName: `${instructor.firstName} ${instructor.lastName}`.trim()
			} : undefined,
			custodian: custodian ? {
				id: custodian._id!.toString(),
				email: custodian.email,
				firstName: custodian.firstName,
				lastName: custodian.lastName,
				fullName: `${custodian.firstName} ${custodian.lastName}`.trim()
			} : undefined
		};

		await cacheService.set(cacheKey, response, { ttl: 43200 });
		return json(response);
	} catch (error) {
		logger.error('Error fetching borrow request detail', { error });
		return json({ error: 'Failed to fetch borrow request' }, { status: 500 });
	}
};

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

		// Only students can cancel their own requests
		if (user.role !== 'student') {
			return json({ error: 'Forbidden: Only students can cancel requests' }, { status: 403 });
		}

		const requestId = parseObjectId(event.params.id);
		if (!requestId) {
			return json({ error: 'Invalid request ID' }, { status: 400 });
		}

		const db = await getDatabase();
		const collection = db.collection<BorrowRequest>(BORROW_REQUESTS_COLLECTION);

		// Student can only cancel their own pending requests
		const updated = await collection.findOneAndUpdate(
			{
				_id: requestId,
				studentId: new ObjectId(user.userId),
				status: BorrowRequestStatus.PENDING_INSTRUCTOR
			},
			{
				$set: {
					status: BorrowRequestStatus.CANCELLED,
					rejectReason: 'Request cancelled by student',
					rejectedAt: new Date(),
					updatedAt: new Date(),
					updatedBy: new ObjectId(user.userId)
				}
			},
			{ returnDocument: 'after' }
		);

		if (!updated) {
			return json(
				{ error: 'Request not found or cannot be cancelled. Only pending requests can be cancelled.' },
				{ status: 400 }
			);
		}

		// Invalidate caches
		const cacheKey = buildBorrowRequestDetailCacheKey(event.params.id);
		await cacheService.delete(cacheKey);
		publishBorrowRequestRealtimeEvent(updated, 'cancelled');
		await notifyBorrowRequestLifecycle({
			db,
			request: updated,
			event: 'cancelled'
		});

		return json(toBorrowRequestResponse(updated));
	} catch (error) {
		logger.error('Error cancelling borrow request', { error });
		return json({ error: 'Failed to cancel borrow request' }, { status: 500 });
	}
};

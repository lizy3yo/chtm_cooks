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
		logger.warn('Deprecated return initiation endpoint called');
		return json(
			{
				error: 'Student-initiated returns are no longer supported. The custodian must confirm the return.'
			},
			{ status: 410 }
		);
	} catch (error) {
		logger.error('Error handling deprecated return initiation endpoint', { error });
		return json({ error: 'Failed to process return request' }, { status: 500 });
	}
};

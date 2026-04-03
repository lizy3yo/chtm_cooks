import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDatabase } from '$lib/server/db/mongodb';
import type { ReplacementObligation } from '$lib/server/models/ReplacementObligation';
import { ObligationStatus } from '$lib/server/models/ReplacementObligation';
import { rateLimit, RateLimitPresets } from '$lib/server/middleware/rateLimit';
import { logger } from '$lib/server/utils/logger';
import { BorrowRequestStatus, type BorrowRequest } from '$lib/server/models/BorrowRequest';
import {
	BORROW_REQUESTS_COLLECTION,
	publishBorrowRequestRealtimeEvent
} from '../../borrow-requests/shared';
import {
	REPLACEMENT_OBLIGATIONS_COLLECTION,
	getAuthenticatedUser,
	invalidateReplacementObligationCaches,
	publishReplacementObligationRealtimeEvent
} from '../shared';

/**
 * POST /api/replacement-obligations/reconcile
 * Reconciles stale 'missing' borrow requests where all obligations are resolved.
 * Transitions them to 'resolved' status.
 * Custodian / superadmin only.
 */
export const POST: RequestHandler = async (event) => {
	const rateLimitResult = await rateLimit(event, RateLimitPresets.API);
	if (rateLimitResult instanceof Response) return rateLimitResult;

	try {
		const user = getAuthenticatedUser(event);
		if (!user || (user.role !== 'custodian' && user.role !== 'superadmin')) {
			return json({ error: 'Unauthorized' }, { status: 403 });
		}

		const db = await getDatabase();
		const now = new Date();

		// Find all borrow requests still in 'missing' status
		const missingRequests = await db
			.collection<BorrowRequest>(BORROW_REQUESTS_COLLECTION)
			.find({ status: BorrowRequestStatus.MISSING })
			.toArray();

		if (missingRequests.length === 0) {
			return json({ reconciled: 0 });
		}

		let reconciled = 0;

		for (const request of missingRequests) {
			const pendingCount = await db
				.collection<ReplacementObligation>(REPLACEMENT_OBLIGATIONS_COLLECTION)
				.countDocuments({
					borrowRequestId: request._id,
					status: ObligationStatus.PENDING
				});

			if (pendingCount === 0) {
				// All obligations settled — transition to resolved
				await db
					.collection<BorrowRequest>(BORROW_REQUESTS_COLLECTION)
					.updateOne(
						{ _id: request._id },
						{ $set: { status: BorrowRequestStatus.RESOLVED, resolvedAt: now, updatedAt: now } }
					);

				// Publish to replacement obligations SSE channel
				publishReplacementObligationRealtimeEvent(
					request.studentId.toString(),
					'request_auto_resolved',
					request._id!.toString(),
					undefined,
					now
				);

				// Publish to borrow-requests SSE channel so the requests page updates
				publishBorrowRequestRealtimeEvent(
					{ ...request, status: BorrowRequestStatus.RESOLVED, resolvedAt: now, _id: request._id! },
					'returned',
					now
				);

				reconciled++;
			}
		}

		if (reconciled > 0) {
			await invalidateReplacementObligationCaches();
			logger.info('replacement-obligations', `Reconciled ${reconciled} stale missing request(s) to resolved`);
		}

		return json({ reconciled });
	} catch (error) {
		logger.error('replacement-obligations', 'Reconciliation failed', { error });
		return json({ error: 'Internal server error' }, { status: 500 });
	}
};

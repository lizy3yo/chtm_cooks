import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDatabase } from '$lib/server/db/mongodb';
import { ObjectId } from 'mongodb';
import type { ReplacementObligation } from '$lib/server/models/ReplacementObligation';
import type { User } from '$lib/server/models/User';
import {
	ObligationStatus,
	ResolutionType,
	toReplacementObligationResponse,
	type ResolveReplacementObligationRequest
} from '$lib/server/models/ReplacementObligation';
import { BorrowRequestStatus, type BorrowRequest } from '$lib/server/models/BorrowRequest';
import { rateLimit, RateLimitPresets } from '$lib/server/middleware/rateLimit';
import { logger } from '$lib/server/utils/logger';
import { BORROW_REQUESTS_COLLECTION, publishBorrowRequestRealtimeEvent } from '../../borrow-requests/shared';
import { cacheService } from '$lib/server/cache';
import {
	buildReplacementObligationDetailCacheKey,
	REPLACEMENT_OBLIGATIONS_CACHE_TAG,
	REPLACEMENT_OBLIGATIONS_COLLECTION,
	getAuthenticatedUser,
	invalidateReplacementObligationCaches,
	isResolutionType,
	parseObjectId,
	sanitizeResolutionPayload,
	publishReplacementObligationRealtimeEvent
} from '../shared';

/**
 * GET /api/replacement-obligations/[id]
 * Get a specific replacement obligation
 */
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

		const obligationId = event.params.id;
		const obligationObjectId = parseObjectId(obligationId);
		if (!obligationObjectId) {
			return json({ error: 'Invalid obligation ID' }, { status: 400 });
		}

		const cacheKey = buildReplacementObligationDetailCacheKey(obligationId);
		const cached = await cacheService.get<{ obligation: ReturnType<typeof toReplacementObligationResponse> }>(cacheKey);
		if (cached) {
			if (user.role === 'student' && cached.obligation.studentId !== user.userId) {
				return json({ error: 'Forbidden' }, { status: 403 });
			}
			return json(cached);
		}

		const db = await getDatabase();

		const obligation = await db
			.collection<ReplacementObligation>(REPLACEMENT_OBLIGATIONS_COLLECTION)
			.findOne({ _id: obligationObjectId });

		if (!obligation) {
			return json({ error: 'Obligation not found' }, { status: 404 });
		}

		// Students can only see their own obligations
		if (user.role === 'student' && obligation.studentId.toString() !== user.userId) {
			return json({ error: 'Forbidden' }, { status: 403 });
		}

		// Get student details
		const student = await db
			.collection<User>('users')
			.findOne({ _id: obligation.studentId });

		const studentName = student ? `${student.firstName} ${student.lastName}` : undefined;
		const studentEmail = student?.email;
		const studentProfilePhotoUrl = student?.profilePhotoUrl;
		const response = {
				obligation: toReplacementObligationResponse(
				obligation,
				studentName,
				studentEmail,
				studentProfilePhotoUrl
			)
		};

		await cacheService.set(cacheKey, response, {
			ttl: 43200,
			tags: [REPLACEMENT_OBLIGATIONS_CACHE_TAG]
		});

		return json(response);
	} catch (error) {
		logger.error('replacement-obligations', 'Failed to retrieve obligation', { error });
		return json({ error: 'Internal server error' }, { status: 500 });
	}
};

/**
 * PATCH /api/replacement-obligations/[id]
 * Resolve a replacement obligation (item replacement or waiver)
 * Custodian only
 */
export const PATCH: RequestHandler = async (event) => {
	const rateLimitResult = await rateLimit(event, RateLimitPresets.API);
	if (rateLimitResult instanceof Response) {
		return rateLimitResult;
	}

	try {
		const user = getAuthenticatedUser(event);
		if (!user || (user.role !== 'custodian' && user.role !== 'superadmin')) {
			return json({ error: 'Unauthorized' }, { status: 403 });
		}

		const obligationId = event.params.id;
		const obligationObjectId = parseObjectId(obligationId);
		if (!obligationObjectId) {
			return json({ error: 'Invalid obligation ID' }, { status: 400 });
		}

		let body: ResolveReplacementObligationRequest;
		try {
			body = (await event.request.json()) as ResolveReplacementObligationRequest;
		} catch {
			return json({ error: 'Invalid JSON payload' }, { status: 400 });
		}

		if (!isResolutionType(body.resolutionType)) {
			return json({ error: 'Invalid resolution type' }, { status: 400 });
		}

		const sanitizedBody = sanitizeResolutionPayload(body);

		// Replacement type requires quantity validation
		if (sanitizedBody.resolutionType === ResolutionType.REPLACEMENT) {
			if (
				typeof sanitizedBody.amountPaid !== 'number' ||
				!Number.isFinite(sanitizedBody.amountPaid) ||
				sanitizedBody.amountPaid <= 0
			) {
				return json({ error: 'Valid replacement quantity is required' }, { status: 400 });
			}
		}

		const db = await getDatabase();
		const now = new Date();

		// Get the obligation
		const obligation = await db
			.collection<ReplacementObligation>(REPLACEMENT_OBLIGATIONS_COLLECTION)
			.findOne({ _id: obligationObjectId });

		if (!obligation) {
			return json({ error: 'Obligation not found' }, { status: 404 });
		}

		if (obligation.status !== ObligationStatus.PENDING) {
			return json({ error: 'Obligation is already resolved' }, { status: 400 });
		}

		// Calculate new status and items replaced
		let newStatus = ObligationStatus.PENDING;
		let totalAmountPaid = obligation.amountPaid;

		if (sanitizedBody.resolutionType === ResolutionType.REPLACEMENT) {
			totalAmountPaid += sanitizedBody.amountPaid || 0;
			if (totalAmountPaid > obligation.amount) {
				return json({ error: 'Replacement quantity exceeds outstanding balance' }, { status: 400 });
			}
			newStatus = totalAmountPaid >= obligation.amount ? ObligationStatus.REPLACED : ObligationStatus.PENDING;
		} else if (sanitizedBody.resolutionType === ResolutionType.WAIVER) {
			newStatus = ObligationStatus.WAIVED;
		}

		// Update obligation
		const updateDoc: {
			$set: Record<string, unknown>;
			$unset?: Record<string, ''>;
		} = {
			$set: {
				status: newStatus,
				amountPaid: totalAmountPaid,
				resolutionType: sanitizedBody.resolutionType,
				resolutionNotes: sanitizedBody.resolutionNotes,
				paymentReference: sanitizedBody.paymentReference,
				updatedAt: now,
				updatedBy: new ObjectId(user.userId)
			}
		};

		if (newStatus !== ObligationStatus.PENDING) {
			updateDoc.$set.resolutionDate = now;
		} else {
			updateDoc.$unset = { resolutionDate: '' };
		}

		const updatedObligation = await db
			.collection<ReplacementObligation>(REPLACEMENT_OBLIGATIONS_COLLECTION)
			.findOneAndUpdate(
				{ _id: obligationObjectId, status: ObligationStatus.PENDING },
				updateDoc,
				{ returnDocument: 'after' }
			);

		if (!updatedObligation) {
			return json({ error: 'Failed to update obligation' }, { status: 500 });
		}

		// Fetch the related borrow request before cache invalidation
		const relatedBorrowRequest = await db
			.collection<BorrowRequest>(BORROW_REQUESTS_COLLECTION)
			.findOne({ _id: obligation.borrowRequestId });

		await invalidateReplacementObligationCaches();

		// Check if all obligations for this borrow request are now resolved.
		// If so, transition the borrow request from 'missing' → 'resolved'.
		let autoResolved = false;
		if (newStatus !== ObligationStatus.PENDING && relatedBorrowRequest?.status === 'missing') {
			const remainingPending = await db
				.collection<ReplacementObligation>(REPLACEMENT_OBLIGATIONS_COLLECTION)
				.countDocuments({
					borrowRequestId: obligation.borrowRequestId,
					status: ObligationStatus.PENDING
				});

			if (remainingPending === 0) {
				await db
					.collection<BorrowRequest>(BORROW_REQUESTS_COLLECTION)
					.updateOne(
						{ _id: obligation.borrowRequestId },
						{ $set: { status: BorrowRequestStatus.RESOLVED, resolvedAt: now, updatedAt: now } }
					);

				autoResolved = true;
				logger.info('replacement-obligations', 'Borrow request auto-resolved after all obligations settled', {
					borrowRequestId: obligation.borrowRequestId.toString()
				});
			}
		}

		// Publish to the replacement obligations SSE channel so the replacement page updates live.
		publishReplacementObligationRealtimeEvent(
			obligation.studentId.toString(),
			autoResolved ? 'request_auto_resolved' : 'obligation_resolved',
			obligation.borrowRequestId.toString(),
			obligationId,
			now
		);

		// Also publish to the borrow-requests SSE channel so the requests page updates live.
		const relatedBorrowRequestFinal = await db
			.collection<BorrowRequest>(BORROW_REQUESTS_COLLECTION)
			.findOne({ _id: obligation.borrowRequestId });

		if (relatedBorrowRequestFinal) {
			publishBorrowRequestRealtimeEvent(
				{ ...relatedBorrowRequestFinal, _id: obligation.borrowRequestId },
				autoResolved ? 'returned' : 'obligation_updated',
				now
			);
		}

		logger.info('replacement-obligations', 'Obligation resolved', {
			obligationId,
			userId: user.userId,
			resolutionType: sanitizedBody.resolutionType,
			newStatus
		});

		return json({
			success: true,
			message: 'Obligation updated successfully'
		});
	} catch (error) {
		logger.error('replacement-obligations', 'Failed to resolve obligation', { error });
		return json({ error: 'Internal server error' }, { status: 500 });
	}
};

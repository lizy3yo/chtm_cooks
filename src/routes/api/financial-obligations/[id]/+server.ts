import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDatabase } from '$lib/server/db/mongodb';
import { ObjectId } from 'mongodb';
import type { FinancialObligation } from '$lib/server/models/FinancialObligation';
import type { User } from '$lib/server/models/User';
import {
	ObligationStatus,
	ResolutionType,
	toFinancialObligationResponse,
	type ResolveFinancialObligationRequest
} from '$lib/server/models/FinancialObligation';
import { rateLimit, RateLimitPresets } from '$lib/server/middleware/rateLimit';
import { logger } from '$lib/server/utils/logger';
import type { BorrowRequest } from '$lib/server/models/BorrowRequest';
import { BORROW_REQUESTS_COLLECTION, publishBorrowRequestRealtimeEvent } from '../../borrow-requests/shared';
import { cacheService } from '$lib/server/cache';
import {
	buildFinancialObligationDetailCacheKey,
	FINANCIAL_OBLIGATIONS_CACHE_TAG,
	FINANCIAL_OBLIGATIONS_COLLECTION,
	getAuthenticatedUser,
	invalidateFinancialObligationCaches,
	isResolutionType,
	parseObjectId,
	sanitizeResolutionPayload,
	publishFinancialObligationRealtimeEvent
} from '../shared';

/**
 * GET /api/financial-obligations/[id]
 * Get a specific financial obligation
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

		const cacheKey = buildFinancialObligationDetailCacheKey(obligationId);
		const cached = await cacheService.get<{ obligation: ReturnType<typeof toFinancialObligationResponse> }>(cacheKey);
		if (cached) {
			if (user.role === 'student' && cached.obligation.studentId !== user.userId) {
				return json({ error: 'Forbidden' }, { status: 403 });
			}
			return json(cached);
		}

		const db = await getDatabase();

		const obligation = await db
			.collection<FinancialObligation>(FINANCIAL_OBLIGATIONS_COLLECTION)
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
			obligation: toFinancialObligationResponse(
				obligation,
				studentName,
				studentEmail,
				studentProfilePhotoUrl
			)
		};

		await cacheService.set(cacheKey, response, {
			ttl: 120,
			tags: [FINANCIAL_OBLIGATIONS_CACHE_TAG]
		});

		return json(response);
	} catch (error) {
		logger.error('financial-obligations', 'Failed to retrieve obligation', { error });
		return json({ error: 'Internal server error' }, { status: 500 });
	}
};

/**
 * PATCH /api/financial-obligations/[id]
 * Resolve a financial obligation (payment or replacement)
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

		let body: ResolveFinancialObligationRequest;
		try {
			body = (await event.request.json()) as ResolveFinancialObligationRequest;
		} catch {
			return json({ error: 'Invalid JSON payload' }, { status: 400 });
		}

		if (!isResolutionType(body.resolutionType)) {
			return json({ error: 'Invalid resolution type' }, { status: 400 });
		}

		const sanitizedBody = sanitizeResolutionPayload(body);

		if (sanitizedBody.resolutionType === ResolutionType.PAYMENT) {
			if (
				typeof sanitizedBody.amountPaid !== 'number' ||
				!Number.isFinite(sanitizedBody.amountPaid) ||
				sanitizedBody.amountPaid <= 0
			) {
				return json({ error: 'Valid payment amount is required' }, { status: 400 });
			}
		}

		const db = await getDatabase();
		const now = new Date();

		// Get the obligation
		const obligation = await db
			.collection<FinancialObligation>(FINANCIAL_OBLIGATIONS_COLLECTION)
			.findOne({ _id: obligationObjectId });

		if (!obligation) {
			return json({ error: 'Obligation not found' }, { status: 404 });
		}

		if (obligation.status !== ObligationStatus.PENDING) {
			return json({ error: 'Obligation is already resolved' }, { status: 400 });
		}

		// Calculate new status and amount paid
		let newStatus = ObligationStatus.PENDING;
		let totalAmountPaid = obligation.amountPaid;

		if (sanitizedBody.resolutionType === ResolutionType.PAYMENT) {
			totalAmountPaid += sanitizedBody.amountPaid || 0;
			if (totalAmountPaid > obligation.amount) {
				return json({ error: 'Payment amount exceeds outstanding balance' }, { status: 400 });
			}
			newStatus = totalAmountPaid >= obligation.amount ? ObligationStatus.PAID : ObligationStatus.PENDING;
		} else if (sanitizedBody.resolutionType === ResolutionType.REPLACEMENT) {
			newStatus = ObligationStatus.REPLACED;
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
			.collection<FinancialObligation>(FINANCIAL_OBLIGATIONS_COLLECTION)
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

		await invalidateFinancialObligationCaches();

		// Check if all obligations for this borrow request are now resolved.
		// If so, transition the borrow request from 'missing' → 'resolved'.
		let autoResolved = false;
		if (newStatus !== ObligationStatus.PENDING && relatedBorrowRequest?.status === 'missing') {
			const remainingPending = await db
				.collection<FinancialObligation>(FINANCIAL_OBLIGATIONS_COLLECTION)
				.countDocuments({
					borrowRequestId: obligation.borrowRequestId,
					status: ObligationStatus.PENDING
				});

			if (remainingPending === 0) {
				await db
					.collection<BorrowRequest>(BORROW_REQUESTS_COLLECTION)
					.updateOne(
						{ _id: obligation.borrowRequestId },
						{ $set: { status: 'resolved', resolvedAt: now, updatedAt: now } }
					);

				autoResolved = true;
				logger.info('financial-obligations', 'Borrow request auto-resolved after all obligations settled', {
					borrowRequestId: obligation.borrowRequestId.toString()
				});
			}
		}

		// Publish to the financial obligations SSE channel so the financial page updates live.
		publishFinancialObligationRealtimeEvent(
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

		logger.info('financial-obligations', 'Obligation resolved', {
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
		logger.error('financial-obligations', 'Failed to resolve obligation', { error });
		return json({ error: 'Internal server error' }, { status: 500 });
	}
};

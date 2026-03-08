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
import { getAuthenticatedUser } from '../../borrow-requests/shared';

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
		if (!ObjectId.isValid(obligationId)) {
			return json({ error: 'Invalid obligation ID' }, { status: 400 });
		}

		const db = await getDatabase();

		const obligation = await db
			.collection<FinancialObligation>('financial_obligations')
			.findOne({ _id: new ObjectId(obligationId) });

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

		return json({
			obligation: toFinancialObligationResponse(obligation, studentName, studentEmail)
		});
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
		if (!ObjectId.isValid(obligationId)) {
			return json({ error: 'Invalid obligation ID' }, { status: 400 });
		}

		const body: ResolveFinancialObligationRequest = await event.request.json();

		if (!body.resolutionType) {
			return json({ error: 'Resolution type is required' }, { status: 400 });
		}

		if (body.resolutionType === ResolutionType.PAYMENT) {
			if (body.amountPaid === undefined || body.amountPaid < 0) {
				return json({ error: 'Valid payment amount is required' }, { status: 400 });
			}
		}

		const db = await getDatabase();
		const now = new Date();

		// Get the obligation
		const obligation = await db
			.collection<FinancialObligation>('financial_obligations')
			.findOne({ _id: new ObjectId(obligationId) });

		if (!obligation) {
			return json({ error: 'Obligation not found' }, { status: 404 });
		}

		if (obligation.status !== ObligationStatus.PENDING) {
			return json({ error: 'Obligation is already resolved' }, { status: 400 });
		}

		// Calculate new status and amount paid
		let newStatus = ObligationStatus.PENDING;
		let totalAmountPaid = obligation.amountPaid;

		if (body.resolutionType === ResolutionType.PAYMENT) {
			totalAmountPaid += body.amountPaid || 0;
			newStatus = totalAmountPaid >= obligation.amount ? ObligationStatus.PAID : ObligationStatus.PENDING;
		} else if (body.resolutionType === ResolutionType.REPLACEMENT) {
			newStatus = ObligationStatus.REPLACED;
		} else if (body.resolutionType === ResolutionType.WAIVER) {
			newStatus = ObligationStatus.WAIVED;
		}

		// Update obligation
		const updateResult = await db
			.collection<FinancialObligation>('financial_obligations')
			.updateOne(
				{ _id: new ObjectId(obligationId) },
				{
					$set: {
						status: newStatus,
						amountPaid: totalAmountPaid,
						resolutionType: body.resolutionType,
						resolutionDate: newStatus !== ObligationStatus.PENDING ? now : undefined,
						resolutionNotes: body.resolutionNotes,
						paymentReference: body.paymentReference,
						updatedAt: now,
						updatedBy: new ObjectId(user.userId)
					}
				}
			);

		if (updateResult.matchedCount === 0) {
			return json({ error: 'Failed to update obligation' }, { status: 500 });
		}

		logger.info('financial-obligations', 'Obligation resolved', {
			obligationId,
			userId: user.userId,
			resolutionType: body.resolutionType,
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

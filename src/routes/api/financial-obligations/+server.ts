import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDatabase } from '$lib/server/db/mongodb';
import { ObjectId } from 'mongodb';
import type { FinancialObligation } from '$lib/server/models/FinancialObligation';
import type { User } from '$lib/server/models/User';
import { toFinancialObligationResponse } from '$lib/server/models/FinancialObligation';
import { rateLimit, RateLimitPresets } from '$lib/server/middleware/rateLimit';
import { logger } from '$lib/server/utils/logger';
import { getAuthenticatedUser } from '../borrow-requests/shared';

/**
 * GET /api/financial-obligations
 * Get financial obligations with optional filters
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

		const db = await getDatabase();

		// Build filter based on role and query params
		const filter: any = {};

		// Students can only see their own obligations
		if (user.role === 'student') {
			filter.studentId = new ObjectId(user.userId);
		}

		// Filter by status
		const statusParam = event.url.searchParams.get('status');
		if (statusParam) {
			filter.status = statusParam;
		}

		// Filter by student ID (custodian/admin only)
		const studentIdParam = event.url.searchParams.get('studentId');
		if (
			studentIdParam &&
			(user.role === 'custodian' || user.role === 'superadmin' || user.role === 'instructor')
		) {
			filter.studentId = new ObjectId(studentIdParam);
		}

		// Pagination
		const page = parseInt(event.url.searchParams.get('page') || '1');
		const limit = parseInt(event.url.searchParams.get('limit') || '50');
		const skip = (page - 1) * limit;

		const [obligations, total] = await Promise.all([
			db
				.collection<FinancialObligation>('financial_obligations')
				.find(filter)
				.sort({ createdAt: -1 })
				.skip(skip)
				.limit(limit)
				.toArray(),
			db.collection<FinancialObligation>('financial_obligations').countDocuments(filter)
		]);

		// Get student details for each obligation
		const studentIds = [...new Set(obligations.map((o) => o.studentId.toString()))];
		const students = await db
			.collection<User>('users')
			.find({ _id: { $in: studentIds.map((id) => new ObjectId(id)) } })
			.toArray();

		const studentMap = new Map(
			students.map((s) => [s._id!.toString(), { name: `${s.firstName} ${s.lastName}`, email: s.email }])
		);

		const response = obligations.map((obligation) => {
			const studentInfo = studentMap.get(obligation.studentId.toString());
			return toFinancialObligationResponse(obligation, studentInfo?.name, studentInfo?.email);
		});

		logger.info('financial-obligations', 'Retrieved obligations', {
			userId: user.userId,
			count: response.length
		});

		return json({
			obligations: response,
			total,
			page,
			limit,
			pages: Math.ceil(total / limit)
		});
	} catch (error) {
		logger.error('financial-obligations', 'Failed to retrieve obligations', { error });
		return json({ error: 'Internal server error' }, { status: 500 });
	}
};

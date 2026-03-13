import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDatabase } from '$lib/server/db/mongodb';
import { ObjectId } from 'mongodb';
import type { FinancialObligation } from '$lib/server/models/FinancialObligation';
import { ObligationStatus } from '$lib/server/models/FinancialObligation';
import type { User } from '$lib/server/models/User';
import { toFinancialObligationResponse } from '$lib/server/models/FinancialObligation';
import { rateLimit, RateLimitPresets } from '$lib/server/middleware/rateLimit';
import { logger } from '$lib/server/utils/logger';
import { cacheService } from '$lib/server/cache';
import {
	buildFinancialObligationsListCacheKey,
	FINANCIAL_OBLIGATIONS_CACHE_TAG,
	FINANCIAL_OBLIGATIONS_COLLECTION,
	getAuthenticatedUser,
	isObligationStatus,
	parseObjectId
} from './shared';

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

		const url = new URL(event.request.url);
		const db = await getDatabase();

		// Build filter based on role and query params
		const filter: Record<string, unknown> = {};

		// Students can only see their own obligations
		if (user.role === 'student') {
			filter.studentId = new ObjectId(user.userId);
		}

		// Filter by status
		const statusParam = url.searchParams.get('status');
		if (statusParam) {
			if (!isObligationStatus(statusParam)) {
				return json({ error: 'Invalid obligation status filter' }, { status: 400 });
			}
			filter.status = statusParam;
		}

		// Filter by student ID (custodian/admin only)
		const studentIdParam = url.searchParams.get('studentId');
		if (
			studentIdParam &&
			(user.role === 'custodian' || user.role === 'superadmin' || user.role === 'instructor')
		) {
			const studentId = parseObjectId(studentIdParam);
			if (!studentId) {
				return json({ error: 'Invalid student ID filter' }, { status: 400 });
			}
			filter.studentId = studentId;
		}

		// Pagination
		const parsedPage = Number.parseInt(url.searchParams.get('page') || '1', 10);
		const parsedLimit = Number.parseInt(url.searchParams.get('limit') || '50', 10);
		const page = Number.isFinite(parsedPage) ? Math.max(1, parsedPage) : 1;
		const limit = Number.isFinite(parsedLimit) ? Math.min(200, Math.max(1, parsedLimit)) : 50;
		const skip = (page - 1) * limit;
		const skipCache = url.searchParams.has('_t');

		const cacheKey = buildFinancialObligationsListCacheKey({
			role: user.role,
			userId: user.userId,
			status: statusParam ? (statusParam as ObligationStatus) : undefined,
			studentId: studentIdParam || undefined,
			page,
			limit
		});

		const cached = !skipCache
			? await cacheService.get<{
				obligations: ReturnType<typeof toFinancialObligationResponse>[];
				total: number;
				page: number;
				limit: number;
				pages: number;
			}>(cacheKey)
			: null;

		if (cached) {
			return json(cached);
		}

		const [obligations, total] = await Promise.all([
			db
				.collection<FinancialObligation>(FINANCIAL_OBLIGATIONS_COLLECTION)
				.find(filter)
				.sort({ createdAt: -1 })
				.skip(skip)
				.limit(limit)
				.toArray(),
			db.collection<FinancialObligation>(FINANCIAL_OBLIGATIONS_COLLECTION).countDocuments(filter)
		]);

		// Get student details for each obligation
		const studentIds = [...new Set(obligations.map((o) => o.studentId.toString()))];
		const students = studentIds.length > 0
			? await db
				.collection<User>('users')
				.find({ _id: { $in: studentIds.map((id) => new ObjectId(id)) } })
				.toArray()
			: [];

		const studentMap = new Map(
			students.map((s) => [s._id!.toString(), { name: `${s.firstName} ${s.lastName}`, email: s.email }])
		);

		const response = {
			obligations: obligations.map((obligation) => {
				const studentInfo = studentMap.get(obligation.studentId.toString());
				return toFinancialObligationResponse(obligation, studentInfo?.name, studentInfo?.email);
			}),
			total,
			page,
			limit,
			pages: Math.ceil(total / limit)
		};

		await cacheService.set(cacheKey, response, {
			ttl: 90,
			tags: [FINANCIAL_OBLIGATIONS_CACHE_TAG]
		});

		logger.info('financial-obligations', 'Retrieved obligations', {
			userId: user.userId,
			count: response.obligations.length
		});

		return json(response);
	} catch (error) {
		logger.error('financial-obligations', 'Failed to retrieve obligations', { error });
		return json({ error: 'Internal server error' }, { status: 500 });
	}
};

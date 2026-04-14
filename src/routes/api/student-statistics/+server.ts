/**
 * GET /api/student-statistics
 *
 * Returns a comprehensive statistics snapshot for the authenticated student.
 *
 * Security:
 *  - Requires a valid httpOnly JWT access-token cookie (cookie-based auth).
 *  - Students may only query their own data; the user ID is always taken
 *    from the verified JWT payload — never from the query string.
 *  - Non-student roles receive 403 Forbidden.
 *
 * Caching:
 *  - Server: Redis (TTL 43200 s / 12 hours) keyed per student.
 *  - Cache bust: append `?_t=<timestamp>` to skip the Redis read.
 *  - After a successful computation the result is stored back in Redis
 *    so subsequent requests are served without hitting MongoDB.
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getUserFromToken } from '$lib/server/middleware/auth/verify';
import { cacheService } from '$lib/server/cache';
import {
	computeStudentStatistics,
	type StatisticsPeriod
} from '$lib/server/services/statistics';
import { logger } from '$lib/server/utils/logger';
import { rateLimit, RateLimitPresets } from '$lib/server/middleware/rateLimit';

// Cache TTL: 12 hours — aligned with authenticated session timeout
const STATS_CACHE_TTL_SECONDS = 43200;

function parsePeriod(raw: string | null): StatisticsPeriod | null {
	if (raw === '7d' || raw === '30d' || raw === '90d' || raw === '180d' || raw === '365d' || raw === 'all') {
		return raw;
	}
	if (raw === null || raw === '') return '180d';
	return null;
}

function buildCacheKey(userId: string, period: StatisticsPeriod): string {
	return `student-stats:v2:${userId}:${period}`;
}

export const GET: RequestHandler = async (event) => {
	try {
		const rateLimitResult = await rateLimit(event, RateLimitPresets.API);
		if (rateLimitResult instanceof Response) {
			return rateLimitResult;
		}

		// ── Authentication ────────────────────────────────────────────────────
		const user = getUserFromToken(event);
		if (!user) {
			return json({ error: 'Unauthorized' }, { status: 401 });
		}

		// ── Authorisation: students only (own data) ────────────────────────────
		if (user.role !== 'student') {
			return json(
				{ error: 'Forbidden: statistics endpoint is restricted to students' },
				{ status: 403 }
			);
		}

		const userId = user.userId;
		const period = parsePeriod(event.url.searchParams.get('period'));
		if (!period) {
			return json(
				{ error: 'Invalid period. Supported values: 7d, 30d, 90d, 180d, 365d, all' },
				{ status: 400 }
			);
		}
		const skipCache = event.url.searchParams.has('_t');
		const cacheKey = buildCacheKey(userId, period);

		// ── Redis cache read ───────────────────────────────────────────────────
		if (!skipCache) {
			const cached = await cacheService.get<Awaited<ReturnType<typeof computeStudentStatistics>>>(
				cacheKey
			);
			if (cached) {
				logger.debug('student-statistics cache HIT', { userId, period });
				return json(cached);
			}
		}

		// ── Compute ────────────────────────────────────────────────────────────
		logger.debug('student-statistics cache MISS — computing', { userId, period });
		const stats = await computeStudentStatistics(userId, period);

		// ── Redis cache write ──────────────────────────────────────────────────
		await cacheService.set(cacheKey, stats, {
			ttl: STATS_CACHE_TTL_SECONDS,
			tags: [`student-stats:${userId}`, `student-stats-period:${period}`]
		});

		return json(stats);
	} catch (error) {
		logger.error('student-statistics: computation failed', { error });
		return json({ error: 'Failed to compute statistics' }, { status: 500 });
	}
};

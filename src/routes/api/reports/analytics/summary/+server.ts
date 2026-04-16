/**
 * GET /api/reports/analytics/summary
 *
 * Lightweight analytics summary used for fast UI updates.
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDatabase } from '$lib/server/db/mongodb';
import { getUserFromToken } from '$lib/server/middleware/auth/verify';
import { rateLimit, RateLimitPresets } from '$lib/server/middleware/rateLimit';
import { cacheService } from '$lib/server/cache';
import { logger } from '$lib/server/utils/logger';
import { parallelAggregations, ANALYTICS_AGGREGATION_OPTIONS } from '$lib/server/utils/queryOptimizer';
import { UserRole } from '$lib/server/models/User';

const CACHE_TTL = 60; // 1 minute
const ANALYTICS_CACHE_VERSION = 'v8';
const ALLOWED_ROLES = new Set(['instructor', 'custodian', 'superadmin']);

function getPeriodRange(period: string, from?: string, to?: string): { start: Date; end: Date } {
    const end = to ? new Date(to) : new Date();
    end.setHours(23, 59, 59, 999);

    if (from) {
        const start = new Date(from);
        start.setHours(0, 0, 0, 0);
        return { start, end };
    }

    const start = new Date(end);
    if (period === 'week') {
        start.setDate(start.getDate() - 7);
    } else if (period === 'semester') {
        start.setMonth(start.getMonth() - 6);
    } else {
        start.setMonth(start.getMonth() - 1);
    }
    start.setHours(0, 0, 0, 0);
    return { start, end };
}

export const GET: RequestHandler = async (event) => {
    const requestStart = Date.now();
    logger.info('reports-analytics-summary', 'Analytics summary request started');

    const rateLimitResult = await rateLimit(event, RateLimitPresets.API);
    if (rateLimitResult instanceof Response) return rateLimitResult;

    try {
        const user = getUserFromToken(event);
        if (!user) return json({ error: 'Unauthorized' }, { status: 401 });
        if (!ALLOWED_ROLES.has(user.role)) return json({ error: 'Forbidden' }, { status: 403 });

        const url = new URL(event.request.url);
        const period = url.searchParams.get('period') || 'month';
        const from = url.searchParams.get('from') || undefined;
        const to = url.searchParams.get('to') || undefined;
        const skipCache = url.searchParams.has('_t');

        if (!['week', 'month', 'semester'].includes(period)) {
            return json({ error: 'Invalid period. Use week, month, or semester.' }, { status: 400 });
        }

        const { start, end } = getPeriodRange(period, from, to);
        const cacheKey = `reports:analytics:summary:${ANALYTICS_CACHE_VERSION}:${period}:${start.toISOString()}:${end.toISOString()}`;

        if (!skipCache) {
            const cached = await cacheService.get(cacheKey);
            if (cached) {
                logger.info('reports-analytics-summary', 'Cache hit - returning cached summary', { duration: Date.now() - requestStart });
                return json(cached);
            }
        }

        const db = await getDatabase();
        const borrowRequests = db.collection('borrow_requests');
        const obligations = db.collection('replacement_obligations');

        logger.info('reports-analytics-summary', 'Cache miss - executing lightweight queries');

        // Parallel small queries for responsive UI
        const data = await parallelAggregations<{
            borrowingAverages: any[];
            itemsBorrowed: any[];
            statusBreakdown: any[];
        }>({
            borrowingAverages: {
                name: 'borrowingAverages',
                promise: borrowRequests.aggregate([
                    { $match: { createdAt: { $gte: start, $lte: end } } },
                    {
                        $group: {
                            _id: null,
                            avgItemsPerRequest: { $avg: { $size: '$items' } },
                            avgQuantityPerRequest: {
                                $avg: {
                                    $sum: {
                                        $map: { input: '$items', as: 'item', in: '$$item.quantity' }
                                    }
                                }
                            },
                            totalRequests: { $sum: 1 }
                        }
                    }
                ], ANALYTICS_AGGREGATION_OPTIONS).toArray()
            },
            itemsBorrowed: {
                name: 'itemsBorrowed',
                promise: borrowRequests.aggregate([
                    { $match: { createdAt: { $gte: start, $lte: end } } },
                    { $unwind: '$items' },
                    {
                        $group: {
                            _id: '$items.itemId',
                            name: { $first: '$items.name' },
                            category: { $first: '$items.category' },
                            totalQuantity: { $sum: '$items.quantity' },
                            borrowCount: { $sum: 1 }
                        }
                    },
                    { $sort: { totalQuantity: -1 } },
                    { $limit: 6 }
                ], { allowDiskUse: true }).toArray()
            },
            statusBreakdown: {
                name: 'statusBreakdown',
                promise: borrowRequests.aggregate([
                    { $match: { createdAt: { $gte: start, $lte: end } } },
                    { $group: { _id: '$status', count: { $sum: 1 } } }
                ], ANALYTICS_AGGREGATION_OPTIONS).toArray()
            }
        });

        const overdueCount = await borrowRequests.countDocuments({ status: 'borrowed', returnDate: { $lt: new Date() } });

        const borrowingAvg = (data.borrowingAverages[0] ?? { avgItemsPerRequest: 0, avgQuantityPerRequest: 0, totalRequests: 0 });
        const items = data.itemsBorrowed ?? [];
        const status = (data.statusBreakdown ?? []).map((s: any) => ({ status: s._id, count: s.count }));

        const response = {
            meta: { period, from: start.toISOString(), to: end.toISOString(), generatedAt: new Date().toISOString() },
            borrowRequests: {
                borrowingAverages: {
                    avgItemsPerRequest: Math.round((borrowingAvg.avgItemsPerRequest ?? 0) * 10) / 10,
                    avgQuantityPerRequest: Math.round((borrowingAvg.avgQuantityPerRequest ?? 0) * 10) / 10,
                    totalRequests: borrowingAvg.totalRequests ?? 0
                },
                itemsBorrowed: items.map((i: any) => ({ id: i._id?.toString() ?? '', name: i.name, category: i.category, totalQuantity: i.totalQuantity, borrowCount: i.borrowCount })),
                statusBreakdown: status,
                overdueCount
            },
            // minimal placeholders for other sections so client can safely read
            lossAndDamage: { summary: { todayTotal: 0, todayMissing: 0, todayDamaged: 0, last7DaysTotal: 0, last7DaysMissing: 0, last7DaysDamaged: 0, mtdTotal: 0, mtdMissing: 0, mtdDamaged: 0, periodTotal: 0, periodMissing: 0, periodDamaged: 0 }, tracking: [] },
            inventory: { summary: { currentCount: 0, eomCount: 0, variance: 0, donations: 0, constantCount: 0, lowStockCount: 0 }, constantItems: [], mostBorrowedItems: [], itemsCurrentlyOut: [], damageRateItems: [], eomVariance: [], varianceDrivers: [], stockAlerts: [] },
            replacement: { summary: { totalItemsPending: 0, totalItemsReplaced: 0, totalObligations: 0, pendingCount: 0 }, resolutionBreakdown: [], avgResolutionDays: 0, obligationsByCategory: [], monthlyActivity: [], donationTotals: [] },
            studentRisk: { repeatOffenders: [], highIncidentStudents: [], overdueStudents: [], trustScores: [] }
        };

        await cacheService.set(cacheKey, response, { ttl: CACHE_TTL });

        logger.info('reports-analytics-summary', 'Analytics summary generated and cached', { duration: Date.now() - requestStart });
        return json(response);
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.error('reports-analytics-summary', 'Failed to generate analytics summary', { error: message });
        return json({ error: 'Failed to generate analytics summary', detail: message }, { status: 500 });
    }
};

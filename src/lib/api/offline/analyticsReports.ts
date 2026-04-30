/**
 * Offline-First Analytics Reports API
 * 
 * Wraps existing analytics API with offline capabilities
 */

import { offlineFetch } from './offlineFirst';
import type { AnalyticsReport, AnalyticsPeriod } from '../analyticsReports';

export const analyticsOfflineAPI = {
	/**
	 * Fetch analytics report with offline support
	 * Industry Standard: Cache-first with 12-hour TTL
	 */
	async fetchAnalytics(params: { period: AnalyticsPeriod }): Promise<AnalyticsReport> {
		try {
			const cacheKey = `analytics:${params.period}`;

			const data = await offlineFetch<AnalyticsReport>(`/api/reports/analytics?period=${params.period}`, {
				strategy: 'cache-first',
				cacheTable: 'analytics',
				cacheKey,
				cacheTTL: 12 * 60 * 60 * 1000, // 12 hours
				method: 'GET'
			});

			return data;
		} catch (error) {
			console.error('[AnalyticsOffline] FetchAnalytics failed:', error);
			throw error;
		}
	},

	/**
	 * Peek cached analytics (synchronous)
	 */
	peekCachedAnalytics(params: { period: AnalyticsPeriod }): AnalyticsReport | null {
		// This would need to be implemented with synchronous IndexedDB access
		// For now, return null and let the component handle loading state
		return null;
	}
};

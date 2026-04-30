/**
 * Offline-First API Index
 * 
 * Central export point for all offline-first APIs
 * 
 * Usage:
 * ```typescript
 * import { borrowRequestsOfflineAPI, catalogOfflineAPI } from '$lib/api/offline';
 * ```
 */

export { borrowRequestsOfflineAPI } from './borrowRequests';
export { catalogOfflineAPI } from './catalog';
export { donationsOfflineAPI } from './donations';
export { analyticsOfflineAPI } from './analyticsReports';
export { offlineFetch, clearAllCaches, prefetchForOffline } from './offlineFirst';

// Re-export types
export type { OfflineFetchOptions } from './offlineFirst';

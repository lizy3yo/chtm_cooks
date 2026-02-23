/**
 * Cache Layer - Enterprise-grade Redis caching
 * 
 * A comprehensive caching solution with:
 * - Multiple caching strategies (cache-aside, read-through, write-through, etc.)
 * - Cache warming and stampede protection
 * - Tag-based invalidation
 * - Distributed locking
 * - Performance monitoring and health checks
 * - Automatic serialization/deserialization
 * - Namespace support
 * - TTL management
 * 
 * @example Basic usage
 * ```typescript
 * import { cacheService } from '$lib/server/cache';
 * 
 * // Set a value
 * await cacheService.set('user:123', userData, { ttl: 3600 });
 * 
 * // Get a value
 * const user = await cacheService.get('user:123');
 * 
 * // Cache-aside pattern
 * const result = await cacheService.wrap(
 *   'user:123',
 *   async () => await db.users.findById('123'),
 *   { ttl: 3600, tags: ['users'] }
 * );
 * ```
 * 
 * @example Advanced patterns
 * ```typescript
 * import { stampedeProtection, cacheWarmer } from '$lib/server/cache';
 * 
 * // Prevent cache stampede
 * const data = await stampedeProtection.fetch(
 *   'expensive-query',
 *   () => expensiveDatabaseQuery(),
 *   { ttl: 3600 }
 * );
 * 
 * // Warm cache on startup
 * await cacheWarmer.warmCache(
 *   'popular-data',
 *   () => fetchPopularData(),
 *   { ttl: 3600 }
 * );
 * ```
 */

// Core exports
export { cacheService } from './client';
export { CacheService } from './client';

// Configuration exports
export { 
	getCacheConfig, 
	TTL_PRESETS, 
	CACHE_PREFIXES, 
	CACHE_TAGS,
	DEFAULT_CACHE_CONFIG 
} from './config';

// Type exports
export type {
	CacheOptions,
	CacheEntry,
	CacheStats,
	CacheMetadata,
	CacheResult,
	CacheHealth,
	CacheLayerConfig,
	InvalidationOptions,
	CacheWarmingConfig,
	DataFetcher,
	KeyBuilder
} from './types';

export { CacheStrategy, CacheEvent } from './types';

// Strategy exports
export {
	cacheAside,
	ReadThroughCache,
	writeThrough,
	writeBehind,
	writeAround,
	CacheWarmer,
	DistributedLock,
	StampedeProtection,
	memoizeWithTTL,
	cacheWarmer,
	distributedLock,
	stampedeProtection
} from './strategies';

// Middleware exports
export {
	createCacheMiddleware,
	cacheControl,
	invalidateRouteCache,
	setCacheHeaders,
	generateETag,
	handleConditionalRequest,
	ApiCache
} from './middleware';

// Monitoring exports
export {
	CacheMonitor,
	CacheAlertSystem,
	cacheMonitor,
	cacheAlertSystem,
	startMonitoring,
	stopMonitoring
} from './monitoring';

export type { CacheMetrics } from './monitoring';

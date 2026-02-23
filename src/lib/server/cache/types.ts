/**
 * Type definitions for the caching layer
 * Provides comprehensive type safety for cache operations
 */

export type CacheKey = string;
export type CacheTTL = number; // Time to live in seconds

/**
 * Cache options for get/set operations
 */
export interface CacheOptions {
	/** Time to live in seconds */
	ttl?: CacheTTL;
	/** Namespace for the cache key */
	namespace?: string;
	/** Tags for cache invalidation */
	tags?: string[];
	/** Whether to compress large values */
	compress?: boolean;
	/** Custom serialization */
	serialize?: boolean;
}

/**
 * Cache entry metadata
 */
export interface CacheMetadata {
	key: string;
	createdAt: number;
	expiresAt: number;
	hits: number;
	size: number;
	tags?: string[];
}

/**
 * Cache entry with value and metadata
 */
export interface CacheEntry<T = unknown> {
	value: T;
	metadata: CacheMetadata;
}

/**
 * Cache statistics
 */
export interface CacheStats {
	hits: number;
	misses: number;
	sets: number;
	deletes: number;
	hitRate: number;
	totalKeys: number;
	memoryUsage?: number;
	uptime: number;
}

/**
 * Cache invalidation options
 */
export interface InvalidationOptions {
	/** Invalidate by key pattern */
	pattern?: string;
	/** Invalidate by tags */
	tags?: string[];
	/** Invalidate by namespace */
	namespace?: string;
}

/**
 * Cache warming configuration
 */
export interface CacheWarmingConfig<T = unknown> {
	key: string;
	fetcher: () => Promise<T>;
	ttl: number;
	interval?: number; // Re-warm interval in ms
}

/**
 * Cache strategy types
 */
export enum CacheStrategy {
	/** Cache aside (lazy loading) - most common */
	CACHE_ASIDE = 'cache-aside',
	/** Read through - cache handles data fetching */
	READ_THROUGH = 'read-through',
	/** Write through - write to cache and DB simultaneously */
	WRITE_THROUGH = 'write-through',
	/** Write behind - async write to DB */
	WRITE_BEHIND = 'write-behind',
	/** Write around - write to DB, invalidate cache */
	WRITE_AROUND = 'write-around'
}

/**
 * Cache layer configuration
 */
export interface CacheLayerConfig {
	/** Default TTL in seconds (1 hour) */
	defaultTTL: number;
	/** Default namespace prefix */
	defaultNamespace: string;
	/** Enable compression for values larger than this size (bytes) */
	compressionThreshold: number;
	/** Enable cache statistics */
	enableStats: boolean;
	/** Enable debug logging */
	debug: boolean;
	/** Maximum key length */
	maxKeyLength: number;
	/** Maximum value size (bytes) */
	maxValueSize: number;
	/** Default strategy */
	defaultStrategy: CacheStrategy;
}

/**
 * Cache operation result
 */
export interface CacheResult<T = unknown> {
	success: boolean;
	data?: T;
	cached: boolean;
	error?: string;
	source: 'cache' | 'database' | 'error';
	duration: number; // milliseconds
}

/**
 * Cache key builder function type
 */
export type KeyBuilder = (...args: unknown[]) => string;

/**
 * Data fetcher function type
 */
export type DataFetcher<T = unknown> = () => Promise<T>;

/**
 * Cache event types
 */
export enum CacheEvent {
	HIT = 'hit',
	MISS = 'miss',
	SET = 'set',
	DELETE = 'delete',
	INVALIDATE = 'invalidate',
	ERROR = 'error'
}

/**
 * Cache event listener
 */
export interface CacheEventData {
	event: CacheEvent;
	key: string;
	timestamp: number;
	metadata?: Record<string, unknown>;
}

/**
 * Cache health status
 */
export interface CacheHealth {
	status: 'healthy' | 'degraded' | 'unhealthy';
	latency: number;
	uptime: number;
	errorRate: number;
	lastCheck: number;
}

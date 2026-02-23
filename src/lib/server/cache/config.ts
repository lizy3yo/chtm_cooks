import { CacheStrategy, type CacheLayerConfig } from './types';

/**
 * Default cache configuration
 * Follows industry best practices for distributed caching
 */
export const DEFAULT_CACHE_CONFIG: CacheLayerConfig = {
	// Default TTL: 1 hour (3600 seconds)
	// This is a good default for most use cases
	defaultTTL: 3600,

	// Default namespace to avoid key collisions
	defaultNamespace: 'app',

	// Compress values larger than 1KB
	// Reduces memory usage and network transfer
	compressionThreshold: 1024,

	// Enable statistics tracking
	enableStats: true,

	// Debug mode (enable in development)
	debug: process.env.NODE_ENV === 'development',

	// Maximum key length (Redis supports up to 512MB, but keep it reasonable)
	maxKeyLength: 256,

	// Maximum value size: 1MB (prevents memory issues)
	maxValueSize: 1024 * 1024,

	// Default caching strategy
	defaultStrategy: CacheStrategy.CACHE_ASIDE
};

/**
 * TTL presets for different data types
 * Based on industry standards and common usage patterns
 */
export const TTL_PRESETS = {
	/** 5 minutes - for rapidly changing data */
	SHORT: 300,

	/** 15 minutes - for frequently updated data */
	MEDIUM: 900,

	/** 1 hour - default for most data */
	LONG: 3600,

	/** 6 hours - for semi-static data */
	VERY_LONG: 21600,

	/** 24 hours - for static data */
	DAY: 86400,

	/** 7 days - for rarely changing data */
	WEEK: 604800,

	/** No expiration (use with caution) */
	INFINITE: -1
} as const;

/**
 * Cache key prefixes for different data types
 * Helps organize cache keys and enables bulk invalidation
 */
export const CACHE_PREFIXES = {
	USER: 'user',
	SESSION: 'session',
	API: 'api',
	QUERY: 'query',
	PAGE: 'page',
	ASSET: 'asset',
	RATE_LIMIT: 'ratelimit',
	LOCK: 'lock',
	TEMP: 'temp'
} as const;

/**
 * Cache tags for granular invalidation
 * Tags allow invalidating multiple related cache entries
 */
export const CACHE_TAGS = {
	USER_DATA: 'user-data',
	USER_PROFILE: 'user-profile',
	USER_SETTINGS: 'user-settings',
	AUTH: 'auth',
	PUBLIC: 'public',
	PRIVATE: 'private',
	ADMIN: 'admin'
} as const;

/**
 * Environment-specific configuration
 */
export function getCacheConfig(): CacheLayerConfig {
	return {
		...DEFAULT_CACHE_CONFIG,
		// Override based on environment
		debug: process.env.CACHE_DEBUG === 'true' || DEFAULT_CACHE_CONFIG.debug,
		defaultTTL: process.env.CACHE_DEFAULT_TTL 
			? parseInt(process.env.CACHE_DEFAULT_TTL, 10)
			: DEFAULT_CACHE_CONFIG.defaultTTL
	};
}

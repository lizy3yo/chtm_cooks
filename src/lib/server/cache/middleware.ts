import type { Handle, RequestEvent } from '@sveltejs/kit';
import { cacheService } from './client';
import type { CacheOptions } from './types';
import { logger } from '../utils/logger';
import { TTL_PRESETS } from './config';

/**
 * Cache Middleware Configuration
 */
interface CacheMiddlewareConfig {
	/** Enable caching */
	enabled: boolean;
	/** Cache only GET requests */
	onlyGET: boolean;
	/** Default TTL for cached responses */
	defaultTTL: number;
	/** Paths to exclude from caching */
	excludePaths?: RegExp[];
	/** Paths to include in caching */
	includePaths?: RegExp[];
	/** Cache based on query parameters */
	cacheQueryParams: boolean;
	/** Cache based on user authentication */
	cachePerUser: boolean;
	/** Custom key builder */
	keyBuilder?: (event: RequestEvent) => string;
}

/**
 * Default middleware configuration
 */
const DEFAULT_CONFIG: CacheMiddlewareConfig = {
	enabled: true,
	onlyGET: true,
	defaultTTL: TTL_PRESETS.MEDIUM,
	excludePaths: [
		/^\/api\/auth\//,          // Auth endpoints
		/^\/api\/admin\//,         // Admin endpoints
		/^\/api\/.*\/create$/,     // Create operations
		/^\/api\/.*\/update$/,     // Update operations
		/^\/api\/.*\/delete$/      // Delete operations
	],
	cacheQueryParams: true,
	cachePerUser: false
};

/**
 * Build a cache key from the request event
 */
function buildCacheKey(event: RequestEvent, config: CacheMiddlewareConfig): string {
	const { url, request } = event;
	const parts = [request.method, url.pathname];

	// Include query params if enabled
	if (config.cacheQueryParams && url.search) {
		const sortedParams = Array.from(url.searchParams.entries())
			.sort(([a], [b]) => a.localeCompare(b))
			.map(([k, v]) => `${k}=${v}`)
			.join('&');
		parts.push(sortedParams);
	}

	// Include user ID if caching per user
	if (config.cachePerUser && (event.locals as any).user) {
		parts.push(`user:${(event.locals as any).user.id}`);
	}

	return `response:${parts.join(':')}`;
}

/**
 * Check if path should be cached
 */
function shouldCache(pathname: string, config: CacheMiddlewareConfig): boolean {
	// Check exclude patterns
	if (config.excludePaths) {
		for (const pattern of config.excludePaths) {
			if (pattern.test(pathname)) {
				return false;
			}
		}
	}

	// Check include patterns (if specified)
	if (config.includePaths && config.includePaths.length > 0) {
		for (const pattern of config.includePaths) {
			if (pattern.test(pathname)) {
				return true;
			}
		}
		return false; // Not in include list
	}

	return true;
}

/**
 * Response Cache Middleware
 * Caches API responses to improve performance
 */
export function createCacheMiddleware(
	userConfig: Partial<CacheMiddlewareConfig> = {}
): Handle {
	const config = { ...DEFAULT_CONFIG, ...userConfig };

	return async ({ event, resolve }) => {
		// Skip if caching is disabled
		if (!config.enabled) {
			return resolve(event);
		}

		// Only cache GET requests if configured
		if (config.onlyGET && event.request.method !== 'GET') {
			return resolve(event);
		}

		// Check if path should be cached
		if (!shouldCache(event.url.pathname, config)) {
			return resolve(event);
		}

		// Build cache key
		const cacheKey = config.keyBuilder 
			? config.keyBuilder(event)
			: buildCacheKey(event, config);

		try {
			// Try to get cached response
			const cached = await cacheService.get<{
				status: number;
				headers: Record<string, string>;
				body: string;
			}>(cacheKey, { namespace: 'http' });

			if (cached) {
				logger.debug('Cache hit for response', { 
					path: event.url.pathname,
					key: cacheKey 
				});

				// Return cached response
				return new Response(cached.body, {
					status: cached.status,
					headers: {
						...cached.headers,
						'X-Cache': 'HIT',
						'X-Cache-Key': cacheKey
					}
				});
			}

			// Cache miss - proceed with request
			const response = await resolve(event);

			// Only cache successful responses
			if (response.status >= 200 && response.status < 300) {
				// Clone response to read body
				const clonedResponse = response.clone();
				const body = await clonedResponse.text();

				// Prepare cache entry
				const cacheEntry = {
					status: response.status,
					headers: Object.fromEntries(response.headers.entries()),
					body
				};

				// Store in cache (don't wait)
				cacheService.set(cacheKey, cacheEntry, {
					ttl: config.defaultTTL,
					namespace: 'http'
				}).catch(error => {
					logger.error('Failed to cache response', { key: cacheKey, error });
				});

				// Add cache headers
				const headers = new Headers(response.headers);
				headers.set('X-Cache', 'MISS');
				headers.set('X-Cache-Key', cacheKey);

				return new Response(body, {
					status: response.status,
					statusText: response.statusText,
					headers
				});
			}

			return response;
		} catch (error) {
			logger.error('Cache middleware error', { error });
			// On error, just proceed without caching
			return resolve(event);
		}
	};
}

/**
 * Cache Control Decorator
 * Add to specific routes to control caching
 */
export function cacheControl(options: {
	ttl?: number;
	tags?: string[];
	varyBy?: string[];
}) {
	return {
		ttl: options.ttl,
		tags: options.tags,
		varyBy: options.varyBy
	};
}

/**
 * Helper to invalidate cache for a specific route
 */
export async function invalidateRouteCache(pathname: string): Promise<void> {
	try {
		const pattern = `response:*${pathname}*`;
		await cacheService.deletePattern(pattern, { namespace: 'http' });
		logger.info('Route cache invalidated', { pathname });
	} catch (error) {
		logger.error('Failed to invalidate route cache', { pathname, error });
	}
}

/**
 * Helper to set cache headers in response
 */
export function setCacheHeaders(
	headers: Headers,
	options: {
		maxAge?: number;
		sMaxAge?: number;
		staleWhileRevalidate?: number;
		staleIfError?: number;
		public?: boolean;
		private?: boolean;
		noCache?: boolean;
		noStore?: boolean;
	}
): void {
	const directives: string[] = [];

	if (options.public) directives.push('public');
	if (options.private) directives.push('private');
	if (options.noCache) directives.push('no-cache');
	if (options.noStore) directives.push('no-store');
	if (options.maxAge !== undefined) directives.push(`max-age=${options.maxAge}`);
	if (options.sMaxAge !== undefined) directives.push(`s-maxage=${options.sMaxAge}`);
	if (options.staleWhileRevalidate !== undefined) {
		directives.push(`stale-while-revalidate=${options.staleWhileRevalidate}`);
	}
	if (options.staleIfError !== undefined) {
		directives.push(`stale-if-error=${options.staleIfError}`);
	}

	if (directives.length > 0) {
		headers.set('Cache-Control', directives.join(', '));
	}
}

/**
 * ETag generation helper
 */
export function generateETag(content: string): string {
	// Simple hash function for ETag
	let hash = 0;
	for (let i = 0; i < content.length; i++) {
		const char = content.charCodeAt(i);
		hash = ((hash << 5) - hash) + char;
		hash = hash & hash;
	}
	return `"${Math.abs(hash).toString(36)}"`;
}

/**
 * Conditional request handler
 * Handles If-None-Match (ETag) and If-Modified-Since
 */
export function handleConditionalRequest(
	event: RequestEvent,
	etag: string,
	lastModified?: Date
): Response | null {
	const ifNoneMatch = event.request.headers.get('if-none-match');
	const ifModifiedSince = event.request.headers.get('if-modified-since');

	// Check ETag
	if (ifNoneMatch && ifNoneMatch === etag) {
		return new Response(null, {
			status: 304,
			headers: {
				'ETag': etag,
				'Cache-Control': 'public, max-age=3600'
			}
		});
	}

	// Check Last-Modified
	if (ifModifiedSince && lastModified) {
		const modifiedSince = new Date(ifModifiedSince);
		if (lastModified <= modifiedSince) {
			return new Response(null, {
				status: 304,
				headers: {
					'Last-Modified': lastModified.toUTCString(),
					'Cache-Control': 'public, max-age=3600'
				}
			});
		}
	}

	return null;
}

/**
 * API Response Caching Utility
 * Use in API routes for manual cache control
 */
export class ApiCache {
	/**
	 * Get cached API response or execute handler
	 */
	static async getOrSet<T>(
		key: string,
		handler: () => Promise<T>,
		options: CacheOptions = {}
	): Promise<T> {
		const result = await cacheService.wrap(key, handler, {
			...options,
			namespace: 'api'
		});
		
		return result.data as T;
	}

	/**
	 * Invalidate API cache by key or pattern
	 */
	static async invalidate(keyOrPattern: string): Promise<void> {
		if (keyOrPattern.includes('*')) {
			await cacheService.deletePattern(keyOrPattern, { namespace: 'api' });
		} else {
			await cacheService.delete(keyOrPattern, { namespace: 'api' });
		}
	}

	/**
	 * Invalidate by tags
	 */
	static async invalidateByTags(tags: string[]): Promise<void> {
		await cacheService.invalidateByTags(tags);
	}
}

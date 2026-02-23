import { cacheService } from '../client';
import type { CacheOptions, CacheResult } from '../types';
import { logger } from '../../utils/logger';

/**
 * Caching Strategies & Patterns
 * 
 * Implements industry-standard caching patterns:
 * - Cache-Aside (Lazy Loading)
 * - Read-Through
 * - Write-Through
 * - Write-Behind (Write-Back)
 * - Write-Around
 */

/**
 * Cache-Aside Pattern (Lazy Loading)
 * Most common pattern - application manages cache
 * 
 * Flow:
 * 1. Check cache
 * 2. If miss, fetch from DB
 * 3. Store in cache
 * 4. Return data
 */
export async function cacheAside<T>(
	key: string,
	fetcher: () => Promise<T>,
	options: CacheOptions = {}
): Promise<CacheResult<T>> {
	return cacheService.wrap(key, fetcher, options);
}

/**
 * Read-Through Pattern
 * Cache layer handles data fetching
 * Similar to cache-aside but abstracted
 */
export class ReadThroughCache<T> {
	constructor(
		private readonly keyBuilder: (...args: any[]) => string,
		private readonly fetcher: (...args: any[]) => Promise<T>,
		private readonly options: CacheOptions = {}
	) {}

	async get(...args: any[]): Promise<CacheResult<T>> {
		const key = this.keyBuilder(...args);
		return cacheService.wrap(key, () => this.fetcher(...args), this.options);
	}
}

/**
 * Write-Through Pattern
 * Write to cache and database simultaneously
 * Ensures consistency but slower writes
 */
export async function writeThrough<T>(
	key: string,
	value: T,
	persistFn: (value: T) => Promise<void>,
	options: CacheOptions = {}
): Promise<{ success: boolean; error?: string }> {
	try {
		// Write to both cache and database simultaneously
		const [cacheResult] = await Promise.all([
			cacheService.set(key, value, options),
			persistFn(value)
		]);

		return { success: cacheResult };
	} catch (error) {
		logger.error('Write-through error', { key, error });
		return {
			success: false,
			error: error instanceof Error ? error.message : 'Unknown error'
		};
	}
}

/**
 * Write-Behind Pattern (Write-Back)
 * Write to cache immediately, persist to DB asynchronously
 * Faster writes but eventual consistency
 */
export async function writeBehind<T>(
	key: string,
	value: T,
	persistFn: (value: T) => Promise<void>,
	options: CacheOptions = {}
): Promise<{ success: boolean; error?: string }> {
	try {
		// Write to cache immediately
		const cacheResult = await cacheService.set(key, value, options);

		// Persist to database asynchronously (don't wait)
		persistFn(value).catch(error => {
			logger.error('Write-behind persist error', { key, error });
		});

		return { success: cacheResult };
	} catch (error) {
		logger.error('Write-behind error', { key, error });
		return {
			success: false,
			error: error instanceof Error ? error.message : 'Unknown error'
		};
	}
}

/**
 * Write-Around Pattern
 * Write to database, invalidate cache
 * Good for write-heavy scenarios where data is rarely re-read
 */
export async function writeAround<T>(
	key: string,
	value: T,
	persistFn: (value: T) => Promise<void>,
	options: CacheOptions = {}
): Promise<{ success: boolean; error?: string }> {
	try {
		// Write to database
		await persistFn(value);

		// Invalidate cache
		await cacheService.delete(key, options);

		return { success: true };
	} catch (error) {
		logger.error('Write-around error', { key, error });
		return {
			success: false,
			error: error instanceof Error ? error.message : 'Unknown error'
		};
	}
}

/**
 * Cache Warming
 * Pre-populate cache with frequently accessed data
 */
export class CacheWarmer {
	private intervals: Map<string, NodeJS.Timeout> = new Map();

	/**
	 * Warm cache with initial data
	 */
	async warmCache<T>(
		key: string,
		fetcher: () => Promise<T>,
		options: CacheOptions = {}
	): Promise<boolean> {
		try {
			const data = await fetcher();
			return await cacheService.set(key, data, options);
		} catch (error) {
			logger.error('Cache warming failed', { key, error });
			return false;
		}
	}

	/**
	 * Warm cache with multiple keys
	 */
	async warmMany<T>(
		entries: Array<{
			key: string;
			fetcher: () => Promise<T>;
			options?: CacheOptions;
		}>
	): Promise<number> {
		const results = await Promise.allSettled(
			entries.map(entry => this.warmCache(entry.key, entry.fetcher, entry.options))
		);

		const successCount = results.filter(
			r => r.status === 'fulfilled' && r.value === true
		).length;

		logger.info('Cache warming completed', {
			total: entries.length,
			successful: successCount
		});

		return successCount;
	}

	/**
	 * Set up periodic cache refresh
	 */
	scheduleRefresh<T>(
		key: string,
		fetcher: () => Promise<T>,
		intervalMs: number,
		options: CacheOptions = {}
	): void {
		// Clear existing interval if any
		this.cancelRefresh(key);

		// Initial warm
		this.warmCache(key, fetcher, options);

		// Schedule periodic refresh
		const interval = setInterval(() => {
			this.warmCache(key, fetcher, options);
		}, intervalMs);

		this.intervals.set(key, interval);

		logger.info('Cache refresh scheduled', { key, intervalMs });
	}

	/**
	 * Cancel scheduled refresh
	 */
	cancelRefresh(key: string): void {
		const interval = this.intervals.get(key);
		if (interval) {
			clearInterval(interval);
			this.intervals.delete(key);
			logger.info('Cache refresh cancelled', { key });
		}
	}

	/**
	 * Cancel all scheduled refreshes
	 */
	cancelAll(): void {
		for (const [key, interval] of this.intervals) {
			clearInterval(interval);
		}
		this.intervals.clear();
		logger.info('All cache refreshes cancelled');
	}
}

/**
 * Distributed Lock Pattern
 * Prevents cache stampede and ensures only one process updates cache
 */
export class DistributedLock {
	private readonly lockPrefix = 'lock';

	/**
	 * Acquire a lock
	 */
	async acquire(
		resource: string,
		ttl: number = 10,
		retries: number = 3,
		retryDelay: number = 100
	): Promise<string | null> {
		const lockKey = `${this.lockPrefix}:${resource}`;
		const lockValue = `${Date.now()}-${Math.random()}`;

		for (let i = 0; i < retries; i++) {
			try {
				// Try to set lock with NX (only if not exists)
				const result = await cacheService.set(lockKey, lockValue, {
					ttl,
					namespace: 'system'
				});

				if (result) {
					return lockValue;
				}

				// Wait before retry
				await new Promise(resolve => setTimeout(resolve, retryDelay));
			} catch (error) {
				logger.error('Lock acquisition error', { resource, error });
			}
		}

		return null;
	}

	/**
	 * Release a lock
	 */
	async release(resource: string, lockValue: string): Promise<boolean> {
		const lockKey = `${this.lockPrefix}:${resource}`;

		try {
			// Verify we own the lock before releasing
			const currentValue = await cacheService.get<string>(lockKey, {
				namespace: 'system'
			});

			if (currentValue === lockValue) {
				return await cacheService.delete(lockKey, { namespace: 'system' });
			}

			return false;
		} catch (error) {
			logger.error('Lock release error', { resource, error });
			return false;
		}
	}

	/**
	 * Execute function with lock
	 */
	async withLock<T>(
		resource: string,
		fn: () => Promise<T>,
		ttl: number = 10
	): Promise<T | null> {
		const lockValue = await this.acquire(resource, ttl);

		if (!lockValue) {
			logger.warn('Failed to acquire lock', { resource });
			return null;
		}

		try {
			return await fn();
		} finally {
			await this.release(resource, lockValue);
		}
	}
}

/**
 * Cache Stampede Prevention
 * Prevents multiple requests from fetching the same data simultaneously
 */
export class StampedeProtection {
	private readonly pendingRequests: Map<string, Promise<any>> = new Map();
	private readonly lock = new DistributedLock();

	/**
	 * Fetch with stampede protection
	 */
	async fetch<T>(
		key: string,
		fetcher: () => Promise<T>,
		options: CacheOptions = {}
	): Promise<CacheResult<T>> {
		// Check if there's already a pending request
		if (this.pendingRequests.has(key)) {
			const data = await this.pendingRequests.get(key);
			return {
				success: true,
				data,
				cached: false,
				source: 'database',
				duration: 0
			};
		}

		// Try to get from cache
		const cached = await cacheService.get<T>(key, options);
		if (cached !== null) {
			return {
				success: true,
				data: cached,
				cached: true,
				source: 'cache',
				duration: 0
			};
		}

		// Use distributed lock to prevent stampede
		const lockKey = `stampede:${key}`;
		const promise = this.lock.withLock(lockKey, async () => {
			// Double-check cache after acquiring lock
			const recheck = await cacheService.get<T>(key, options);
			if (recheck !== null) {
				return recheck;
			}

			// Fetch and cache
			const data = await fetcher();
			await cacheService.set(key, data, options);
			return data;
		});

		// Store pending request
		this.pendingRequests.set(key, promise);

		try {
			const data = await promise;
			return {
				success: true,
				data: data as T,
				cached: false,
				source: 'database',
				duration: 0
			};
		} finally {
			this.pendingRequests.delete(key);
		}
	}
}

/**
 * Memoization with TTL
 * Cache function results in memory with automatic expiration
 */
export function memoizeWithTTL<T extends (...args: any[]) => Promise<any>>(
	fn: T,
	options: {
		ttl: number;
		keyBuilder?: (...args: Parameters<T>) => string;
		namespace?: string;
	}
): T {
	const keyBuilder = options.keyBuilder || ((...args: any[]) => JSON.stringify(args));

	return (async (...args: Parameters<T>) => {
		const key = `memoize:${fn.name}:${keyBuilder(...args)}`;
		
		const result = await cacheService.wrap(
			key,
			() => fn(...args),
			{
				ttl: options.ttl,
				namespace: options.namespace || 'memoize'
			}
		);

		return result.data;
	}) as T;
}

// Export singleton instances
export const cacheWarmer = new CacheWarmer();
export const distributedLock = new DistributedLock();
export const stampedeProtection = new StampedeProtection();

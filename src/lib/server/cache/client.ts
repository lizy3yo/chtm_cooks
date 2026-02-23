import { getRedisClient } from '../middleware/rateLimit/redis';
import { getCacheConfig, CACHE_PREFIXES } from './config';
import type {
	CacheOptions,
	CacheEntry,
	CacheStats,
	CacheLayerConfig,
	CacheHealth,
	CacheResult
} from './types';
import { logger } from '../utils/logger';
import { Redis as UpstashRedis } from '@upstash/redis';
import type IORedis from 'ioredis';

type RedisClient = UpstashRedis | IORedis;

/**
 * CacheService - Enterprise-grade caching layer
 * 
 * Features:
 * - Automatic serialization/deserialization
 * - TTL management
 * - Namespace support
 * - Tag-based invalidation
 * - Statistics tracking
 * - Health monitoring
 * - Graceful error handling
 * 
 * @example
 * ```typescript
 * const cache = CacheService.getInstance();
 * await cache.set('user:123', userData, { ttl: 3600 });
 * const user = await cache.get('user:123');
 * ```
 */
export class CacheService {
	private static instance: CacheService;
	private client: RedisClient;
	private config: CacheLayerConfig;
	private stats: CacheStats;
	private startTime: number;
	private isUpstash: boolean;

	private constructor() {
		this.client = getRedisClient();
		this.config = getCacheConfig();
		this.startTime = Date.now();
		this.isUpstash = this.checkClientType();
		
		this.stats = {
			hits: 0,
			misses: 0,
			sets: 0,
			deletes: 0,
			hitRate: 0,
			totalKeys: 0,
			uptime: 0
		};

		if (this.config.debug) {
			logger.info('CacheService initialized', {
				type: this.isUpstash ? 'upstash' : 'ioredis',
				config: this.config
			});
		}
	}

	/**
	 * Check if the Redis client is Upstash or IORedis
	 */
	private checkClientType(): boolean {
		// Check for Upstash-specific methods
		return 'json' in this.client && typeof (this.client as any).json === 'object';
	}

	/**
	 * Get singleton instance
	 */
	public static getInstance(): CacheService {
		if (!CacheService.instance) {
			CacheService.instance = new CacheService();
		}
		return CacheService.instance;
	}

	/**
	 * Build a namespaced cache key
	 */
	private buildKey(key: string, namespace?: string): string {
		const ns = namespace || this.config.defaultNamespace;
		const fullKey = `${ns}:${key}`;
		
		if (fullKey.length > this.config.maxKeyLength) {
			logger.warn('Cache key exceeds maximum length', { key: fullKey });
			// Use hash of the key if too long
			return `${ns}:hash:${this.hashKey(key)}`;
		}
		
		return fullKey;
	}

	/**
	 * Simple hash function for long keys
	 */
	private hashKey(key: string): string {
		let hash = 0;
		for (let i = 0; i < key.length; i++) {
			const char = key.charCodeAt(i);
			hash = ((hash << 5) - hash) + char;
			hash = hash & hash;
		}
		return Math.abs(hash).toString(36);
	}

	/**
	 * Serialize value to string
	 */
	private serialize<T>(value: T): string {
		try {
			return JSON.stringify(value);
		} catch (error) {
			logger.error('Failed to serialize cache value', { error });
			throw new Error('Cache serialization failed');
		}
	}

	/**
	 * Deserialize value from string
	 */
	private deserialize<T>(value: string): T {
		try {
			return JSON.parse(value) as T;
		} catch (error) {
			logger.error('Failed to deserialize cache value', { error });
			throw new Error('Cache deserialization failed');
		}
	}

	/**
	 * Get value from cache
	 */
	async get<T>(key: string, options: CacheOptions = {}): Promise<T | null> {
		const fullKey = this.buildKey(key, options.namespace);
		
		try {
			const value = await this.client.get(fullKey);
			
			if (value === null || value === undefined) {
				this.stats.misses++;
				this.updateHitRate();
				
				if (this.config.debug) {
					logger.debug('Cache miss', { key: fullKey });
				}
				
				return null;
			}

			this.stats.hits++;
			this.updateHitRate();
			
			if (this.config.debug) {
				logger.debug('Cache hit', { key: fullKey });
			}

			// Handle different return types from Upstash vs IORedis
			const stringValue = typeof value === 'string' ? value : String(value);
			return this.deserialize<T>(stringValue);
		} catch (error) {
			logger.error('Cache get error', { key: fullKey, error });
			return null;
		}
	}

	/**
	 * Set value in cache
	 */
	async set<T>(key: string, value: T, options: CacheOptions = {}): Promise<boolean> {
		const fullKey = this.buildKey(key, options.namespace);
		const ttl = options.ttl || this.config.defaultTTL;
		
		try {
			const serialized = this.serialize(value);
			
			// Check value size
			if (serialized.length > this.config.maxValueSize) {
				logger.warn('Cache value exceeds maximum size', { 
					key: fullKey, 
					size: serialized.length 
				});
				return false;
			}

			// Set with TTL
			if (ttl > 0) {
				await this.client.setex(fullKey, ttl, serialized);
			} else {
				await this.client.set(fullKey, serialized);
			}

			// Store tags if provided
			if (options.tags && options.tags.length > 0) {
				await this.storeTags(fullKey, options.tags);
			}

			this.stats.sets++;
			
			if (this.config.debug) {
				logger.debug('Cache set', { key: fullKey, ttl });
			}

			return true;
		} catch (error) {
			logger.error('Cache set error', { key: fullKey, error });
			return false;
		}
	}

	/**
	 * Delete value from cache
	 */
	async delete(key: string, options: CacheOptions = {}): Promise<boolean> {
		const fullKey = this.buildKey(key, options.namespace);
		
		try {
			const result = await this.client.del(fullKey);
			this.stats.deletes++;
			
			if (this.config.debug) {
				logger.debug('Cache delete', { key: fullKey });
			}

			return result > 0;
		} catch (error) {
			logger.error('Cache delete error', { key: fullKey, error });
			return false;
		}
	}

	/**
	 * Check if key exists in cache
	 */
	async has(key: string, options: CacheOptions = {}): Promise<boolean> {
		const fullKey = this.buildKey(key, options.namespace);
		
		try {
			const result = await this.client.exists(fullKey);
			return result > 0;
		} catch (error) {
			logger.error('Cache exists error', { key: fullKey, error });
			return false;
		}
	}

	/**
	 * Get multiple values at once (pipeline)
	 */
	async getMany<T>(keys: string[], options: CacheOptions = {}): Promise<(T | null)[]> {
		const fullKeys = keys.map(key => this.buildKey(key, options.namespace));
		
		try {
			if (this.isUpstash) {
				// Upstash doesn't support mget the same way
				const results = await Promise.all(
					fullKeys.map(key => this.client.get(key))
				);
				return results.map(value => 
					value ? this.deserialize<T>(String(value)) : null
				);
			} else {
				// IORedis supports mget
				const results = await (this.client as IORedis).mget(...fullKeys);
				return results.map(value => 
					value ? this.deserialize<T>(value) : null
				);
			}
		} catch (error) {
			logger.error('Cache getMany error', { keys: fullKeys, error });
			return keys.map(() => null);
		}
	}

	/**
	 * Set multiple values at once (pipeline)
	 */
	async setMany(
		entries: Array<{ key: string; value: unknown; ttl?: number }>,
		options: CacheOptions = {}
	): Promise<boolean> {
		try {
			if (this.isUpstash) {
				// Upstash: use Promise.all
				await Promise.all(
					entries.map(entry =>
						this.set(entry.key, entry.value, {
							...options,
							ttl: entry.ttl || options.ttl
						})
					)
				);
			} else {
				// IORedis: use pipeline
				const pipeline = (this.client as IORedis).pipeline();
				
				entries.forEach(entry => {
					const fullKey = this.buildKey(entry.key, options.namespace);
					const serialized = this.serialize(entry.value);
					const ttl = entry.ttl || options.ttl || this.config.defaultTTL;
					
					if (ttl > 0) {
						pipeline.setex(fullKey, ttl, serialized);
					} else {
						pipeline.set(fullKey, serialized);
					}
				});
				
				await pipeline.exec();
			}

			this.stats.sets += entries.length;
			return true;
		} catch (error) {
			logger.error('Cache setMany error', { error });
			return false;
		}
	}

	/**
	 * Delete by pattern (use with caution in production)
	 */
	async deletePattern(pattern: string, options: CacheOptions = {}): Promise<number> {
		const fullPattern = this.buildKey(pattern, options.namespace);
		
		try {
			if (this.isUpstash) {
				logger.warn('Pattern deletion not efficiently supported in Upstash');
				return 0;
			}

			const ioredisClient = this.client as IORedis;
			const keys = await ioredisClient.keys(fullPattern);
			
			if (keys.length === 0) {
				return 0;
			}

			const result = await ioredisClient.del(...keys);
			this.stats.deletes += result;
			
			if (this.config.debug) {
				logger.debug('Cache pattern delete', { pattern: fullPattern, count: result });
			}

			return result;
		} catch (error) {
			logger.error('Cache deletePattern error', { pattern: fullPattern, error });
			return 0;
		}
	}

	/**
	 * Store tags for a cache key
	 */
	private async storeTags(key: string, tags: string[]): Promise<void> {
		try {
			const promises = tags.map(tag => {
				const tagKey = this.buildKey(`tag:${tag}`);
				return this.client.sadd(tagKey, key);
			});
			await Promise.all(promises);
		} catch (error) {
			logger.error('Failed to store tags', { key, tags, error });
		}
	}

	/**
	 * Invalidate cache by tags
	 */
	async invalidateByTags(tags: string[]): Promise<number> {
		let totalDeleted = 0;
		
		try {
			for (const tag of tags) {
				const tagKey = this.buildKey(`tag:${tag}`);
				
				if (this.isUpstash) {
					// Upstash approach
					const keys = await this.client.smembers(tagKey);
					if (Array.isArray(keys) && keys.length > 0) {
						await Promise.all(keys.map(k => this.client.del(String(k))));
						totalDeleted += keys.length;
					}
					await this.client.del(tagKey);
				} else {
					// IORedis approach
					const ioredisClient = this.client as IORedis;
					const keys = await ioredisClient.smembers(tagKey);
					if (keys.length > 0) {
						const deleted = await ioredisClient.del(...keys);
						totalDeleted += deleted;
					}
					await ioredisClient.del(tagKey);
				}
			}

			if (this.config.debug) {
				logger.debug('Cache invalidated by tags', { tags, totalDeleted });
			}

			return totalDeleted;
		} catch (error) {
			logger.error('Cache invalidateByTags error', { tags, error });
			return 0;
		}
	}

	/**
	 * Update hit rate calculation
	 */
	private updateHitRate(): void {
		const total = this.stats.hits + this.stats.misses;
		this.stats.hitRate = total > 0 ? this.stats.hits / total : 0;
	}

	/**
	 * Get cache statistics
	 */
	async getStats(): Promise<CacheStats> {
		try {
			this.stats.uptime = Date.now() - this.startTime;
			
			// Get total keys count
			if (this.isUpstash) {
				this.stats.totalKeys = 0; // Upstash doesn't provide dbsize easily
			} else {
				const ioredisClient = this.client as IORedis;
				this.stats.totalKeys = await ioredisClient.dbsize();
				
				// Get memory usage
				const info = await ioredisClient.info('memory');
				const memMatch = info.match(/used_memory:(\d+)/);
				if (memMatch) {
					this.stats.memoryUsage = parseInt(memMatch[1], 10);
				}
			}

			return { ...this.stats };
		} catch (error) {
			logger.error('Failed to get cache stats', { error });
			return { ...this.stats };
		}
	}

	/**
	 * Check cache health
	 */
	async checkHealth(): Promise<CacheHealth> {
		const start = Date.now();
		const testKey = this.buildKey('health:check');
		
		try {
			// Test write
			await this.client.setex(testKey, 10, 'health-check');
			
			// Test read
			const value = await this.client.get(testKey);
			
			// Test delete
			await this.client.del(testKey);
			
			const latency = Date.now() - start;
			const errorRate = (this.stats.hits + this.stats.misses) > 0
				? 0 // Calculate from error tracking if implemented
				: 0;

			return {
				status: latency < 100 ? 'healthy' : latency < 500 ? 'degraded' : 'unhealthy',
				latency,
				uptime: Date.now() - this.startTime,
				errorRate,
				lastCheck: Date.now()
			};
		} catch (error) {
			logger.error('Cache health check failed', { error });
			return {
				status: 'unhealthy',
				latency: Date.now() - start,
				uptime: Date.now() - this.startTime,
				errorRate: 1,
				lastCheck: Date.now()
			};
		}
	}

	/**
	 * Clear all cache (use with extreme caution)
	 */
	async clear(namespace?: string): Promise<boolean> {
		try {
			if (namespace) {
				// Clear specific namespace
				const pattern = `${namespace}:*`;
				await this.deletePattern(pattern);
			} else if (!this.isUpstash) {
				// Clear all (only for IORedis in development)
				if (process.env.NODE_ENV === 'production') {
					logger.warn('Attempted to clear all cache in production');
					return false;
				}
				await (this.client as IORedis).flushdb();
			}

			if (this.config.debug) {
				logger.debug('Cache cleared', { namespace });
			}

			return true;
		} catch (error) {
			logger.error('Cache clear error', { namespace, error });
			return false;
		}
	}

	/**
	 * Wrap a data fetcher with cache-aside pattern
	 */
	async wrap<T>(
		key: string,
		fetcher: () => Promise<T>,
		options: CacheOptions = {}
	): Promise<CacheResult<T>> {
		const start = Date.now();
		
		try {
			// Try to get from cache first
			const cached = await this.get<T>(key, options);
			
			if (cached !== null) {
				return {
					success: true,
					data: cached,
					cached: true,
					source: 'cache',
					duration: Date.now() - start
				};
			}

			// Cache miss - fetch from source
			const data = await fetcher();
			
			// Store in cache
			await this.set(key, data, options);

			return {
				success: true,
				data,
				cached: false,
				source: 'database',
				duration: Date.now() - start
			};
		} catch (error) {
			logger.error('Cache wrap error', { key, error });
			return {
				success: false,
				cached: false,
				source: 'error',
				error: error instanceof Error ? error.message : 'Unknown error',
				duration: Date.now() - start
			};
		}
	}

	/**
	 * Get TTL (time to live) for a key
	 */
	async getTTL(key: string, options: CacheOptions = {}): Promise<number> {
		const fullKey = this.buildKey(key, options.namespace);
		
		try {
			const ttl = await this.client.ttl(fullKey);
			return ttl;
		} catch (error) {
			logger.error('Cache getTTL error', { key: fullKey, error });
			return -1;
		}
	}

	/**
	 * Extend TTL for a key
	 */
	async extendTTL(key: string, ttl: number, options: CacheOptions = {}): Promise<boolean> {
		const fullKey = this.buildKey(key, options.namespace);
		
		try {
			const result = await this.client.expire(fullKey, ttl);
			return result > 0;
		} catch (error) {
			logger.error('Cache extendTTL error', { key: fullKey, error });
			return false;
		}
	}
}

// Export singleton instance
export const cacheService = CacheService.getInstance();

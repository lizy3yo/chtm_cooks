import type { RateLimitConfig } from './config';
import { getRedisClient, isUpstash } from './redis';
import type IORedis from 'ioredis';
import type { Redis as UpstashRedis } from '@upstash/redis';

/**
 * Result of a sliding window rate limit check
 */
export interface SlidingWindowResult {
	allowed: boolean; // Whether the request is allowed
	count: number; // Current number of requests in window
	resetTime: number; // Unix timestamp when window resets
	blockExpiry?: number; // Unix timestamp when block expires (if blocked)
}

/**
 * Sliding Window Rate Limiting Algorithm
 * 
 * Uses Redis sorted sets for accurate rate limiting:
 * - Score: timestamp in milliseconds
 * - Member: unique request identifier
 * 
 * Algorithm steps:
 * 1. Remove entries older than the window
 * 2. Add current request
 * 3. Count total requests in window
 * 4. Compare against limit
 * 5. Set TTL for automatic cleanup
 * 
 * Time Complexity: O(log N)
 * Space Complexity: O(N) where N is maxRequests
 */
export class SlidingWindow {
	/**
	 * Check if a request should be allowed based on sliding window rate limit
	 * 
	 * @param key - Redis key for this rate limit (e.g., "ratelimit:login:192.168.1.1")
	 * @param config - Rate limit configuration
	 * @returns Result indicating if request is allowed and current state
	 */
	static async check(key: string, config: RateLimitConfig): Promise<SlidingWindowResult> {
		const redis = getRedisClient();
		const now = Date.now();
		const windowStart = now - config.windowMs;
		const blockKey = `${key}:blocked`;

		// Check if client is currently blocked
		const blockExpiry = await redis.get<string>(blockKey);
		if (blockExpiry) {
			const expiryTime = parseInt(blockExpiry as string, 10);
			return {
				allowed: false,
				count: config.maxRequests + 1,
				resetTime: expiryTime,
				blockExpiry: expiryTime
			};
		}

		// Generate unique request ID
		const requestId = `${now}:${Math.random().toString(36).substring(2, 15)}`;

		let count: number;

		// Handle Upstash Redis (REST API)
		if (isUpstash()) {
			const upstashClient = redis as UpstashRedis;
			
			// Remove old entries
			await upstashClient.zremrangebyscore(key, '-inf', windowStart);
			
			// Add current request
			await upstashClient.zadd(key, { score: now, member: requestId });
			
			// Count requests in window
			count = await upstashClient.zcard(key);
			
			// Set expiration
			await upstashClient.expire(key, Math.ceil(config.windowMs / 1000) + 1);
		} 
		// Handle Local Redis (ioredis)
		else {
			const ioredisClient = redis as IORedis;
			
			// Perform sliding window operations atomically using pipeline
			const pipeline = ioredisClient.pipeline();

			// 1. Remove old entries outside the current window
			pipeline.zremrangebyscore(key, '-inf', windowStart);

			// 2. Add current request with timestamp as score
			pipeline.zadd(key, now, requestId);

			// 3. Count requests in current window
			pipeline.zcard(key);

			// 4. Set expiration on the key (cleanup)
			pipeline.expire(key, Math.ceil(config.windowMs / 1000) + 1);

			// Execute all operations atomically
			const results = await pipeline.exec();

			if (!results) {
				throw new Error('Redis pipeline execution failed');
			}

			// Extract count from pipeline results
			// Pipeline results format: [[error, result], [error, result], ...]
			count = (results[2]?.[1] as number) || 0;
		}

		// Calculate reset time
		const resetTime = now + config.windowMs;

		// Check if limit exceeded
		if (count > config.maxRequests) {
			// Apply block if configured
			if (config.blockDurationMs) {
				const blockExpiryTime = now + config.blockDurationMs;
				const blockDurationSeconds = Math.ceil(config.blockDurationMs / 1000);
				
				// Set block with expiration (syntax differs between Upstash and ioredis)
				if (isUpstash()) {
					// Upstash: use set with ex option
					const upstashClient = redis as UpstashRedis;
					await upstashClient.set(blockKey, blockExpiryTime.toString(), { ex: blockDurationSeconds });
				} else {
					// ioredis: use setex
					const ioredisClient = redis as IORedis;
					await ioredisClient.setex(blockKey, blockDurationSeconds, blockExpiryTime.toString());
				}
				
				return {
					allowed: false,
					count,
					resetTime: blockExpiryTime,
					blockExpiry: blockExpiryTime
				};
			}

			return {
				allowed: false,
				count,
				resetTime
			};
		}

		return {
			allowed: true,
			count,
			resetTime
		};
	}

	/**
	 * Remove the most recent request from the sliding window
	 * Used when skipSuccessfulRequests is true (e.g., successful login)
	 * 
	 * @param key - Redis key for this rate limit
	 */
	static async removeLastRequest(key: string): Promise<void> {
		try {
			const redis = getRedisClient();
			
			let members: string[];
			
			// Handle Upstash Redis
			if (isUpstash()) {
				const upstashClient = redis as UpstashRedis;
				members = await upstashClient.zrange<string[]>(key, -1, -1);
			} 
			// Handle Local Redis (ioredis)
			else {
				const ioredisClient = redis as IORedis;
				members = await ioredisClient.zrevrange(key, 0, 0);
			}
			
			if (members && members.length > 0) {
				// Remove it from the sorted set
				await redis.zrem(key, members[0]);
			}
		} catch (error) {
			console.error('Failed to remove last request from sliding window:', error);
			// Non-critical error, don't throw
		}
	}

	/**
	 * Clear all rate limit data for a specific key
	 * Useful for testing or admin overrides
	 * 
	 * @param key - Redis key for this rate limit
	 */
	static async clear(key: string): Promise<void> {
		try {
			const redis = getRedisClient();
			const blockKey = `${key}:blocked`;
			
			await redis.del(key);
			await redis.del(blockKey);
		} catch (error) {
			console.error('Failed to clear rate limit:', error);
			throw error;
		}
	}

	/**
	 * Get current rate limit status without incrementing
	 * Useful for monitoring and debugging
	 * 
	 * @param key - Redis key for this rate limit
	 * @param config - Rate limit configuration
	 * @returns Current count and reset time
	 */
	static async getStatus(
		key: string,
		config: RateLimitConfig
	): Promise<{ count: number; resetTime: number }> {
		try {
			const redis = getRedisClient();
			const now = Date.now();
			const windowStart = now - config.windowMs;

			// Count requests in current window without modifying
			const count = await redis.zcount(key, windowStart, now);
			const resetTime = now + config.windowMs;

			return { count, resetTime };
		} catch (error) {
			console.error('Failed to get rate limit status:', error);
			return { count: 0, resetTime: Date.now() + config.windowMs };
		}
	}
}

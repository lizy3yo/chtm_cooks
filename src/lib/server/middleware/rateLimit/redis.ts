import { Redis as UpstashRedis } from '@upstash/redis';
import IORedis from 'ioredis';
import { UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN, REDIS_URL } from '$env/static/private';

/**
 * Redis Client for Rate Limiting
 * Supports both Upstash (REST API) and local Redis (ioredis)
 * Priority: Upstash (production) -> Local Redis (development)
 */

// Unified interface for both Redis clients
type RedisClient = UpstashRedis | IORedis;

declare global {
	// eslint-disable-next-line no-var
	var _redis: RedisClient | undefined;
	// eslint-disable-next-line no-var
	var _redisType: 'upstash' | 'local' | undefined;
}

/**
 * Initialize Redis client with proper error handling and connection management
 * Automatically selects between Upstash (REST) and local Redis (ioredis)
 * @returns Redis client instance
 */
export function getRedisClient(): RedisClient {
	if (global._redis) {
		return global._redis;
	}

	try {
		// Priority 1: Use Upstash Redis if available (production)
		// Upstash uses REST API, not Redis protocol
		if (UPSTASH_REDIS_REST_URL && UPSTASH_REDIS_REST_TOKEN) {
			console.log('🔴 Initializing Upstash Redis client (REST API)...');
			
			const client = new UpstashRedis({
				url: UPSTASH_REDIS_REST_URL,
				token: UPSTASH_REDIS_REST_TOKEN,
			});
			
			global._redis = client;
			global._redisType = 'upstash';
			console.log('✅ Upstash Redis client initialized');
			return client;
		}
		
		// Priority 2: Use local Redis as fallback (development)
		// Local Redis uses ioredis with Redis protocol
		const redisUrl = REDIS_URL || 'redis://localhost:6379';
		console.log('🔴 Initializing Local Redis client (ioredis)...');
		
		const client = new IORedis(redisUrl, {
			maxRetriesPerRequest: 3,
			retryStrategy(times) {
				const delay = Math.min(times * 50, 2000);
				return delay;
			},
			lazyConnect: true,
		});

		// Connection event handlers for ioredis
		client.on('connect', () => {
			console.log('✅ Connected to local Redis');
		});

		client.on('error', (err) => {
			console.error('❌ Local Redis Error:', err);
		});

		client.on('close', () => {
			console.log('🔌 Redis connection closed');
		});

		client.on('reconnecting', () => {
			console.log('🔄 Redis reconnecting...');
		});

		global._redis = client;
		global._redisType = 'local';
		console.log('✅ Local Redis client initialized');
		return client;
	} catch (error) {
		console.error('❌ Failed to initialize Redis client:', error);
		throw error;
	}
}

// Export the Redis client
export const redis = getRedisClient();

// Helper function to check which Redis type is being used
export const isUpstash = (): boolean => global._redisType === 'upstash';
export const isLocal = (): boolean => global._redisType === 'local';

/**
 * Test Redis connection with PING/PONG
 * Works with both Upstash (REST) and local Redis (ioredis)
 * @returns true if Redis responds with PONG
 */
export async function testRedisConnection(): Promise<boolean> {
	try {
		const result = await redis.ping();
		
		// Upstash returns "PONG", ioredis returns "PONG"
		const isPong = result === 'PONG' || result === 'pong';
		
		if (isPong) {
			console.log(`✅ Redis PING successful (${global._redisType}):`, result);
		} else {
			console.warn(`⚠️ Redis PING returned unexpected value:`, result);
		}
		
		return isPong;
	} catch (error) {
		console.error('❌ Redis PING failed:', error);
		return false;
	}
}

/**
 * Close Redis connection gracefully
 * Only needed for ioredis (local), Upstash is REST API (no persistent connection)
 */
export async function closeRedisConnection(): Promise<void> {
	try {
		if (global._redis && global._redisType === 'local') {
			const client = global._redis as IORedis;
			await client.quit();
			global._redis = undefined;
			global._redisType = undefined;
			console.log('✅ Redis connection closed gracefully');
		} else if (global._redis && global._redisType === 'upstash') {
			console.log('ℹ️ Upstash uses REST API, no connection to close');
			global._redis = undefined;
			global._redisType = undefined;
		}
	} catch (error) {
		console.error('❌ Error closing Redis connection:', error);
	}
}

/**
 * Check if Redis is healthy and responsive
 * @returns true if Redis responds to PING
 */
export async function checkRedisHealth(): Promise<boolean> {
	return await testRedisConnection();
}

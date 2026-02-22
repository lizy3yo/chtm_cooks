import Redis from 'ioredis';
import { UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN, REDIS_URL } from '$env/static/private';

/**
 * Redis Client for Rate Limiting
 * Provides connection management with automatic fallback
 * Priority: Upstash (production) -> Local Redis (development)
 */

let redisClient: Redis | null = null;

/**
 * Initialize Redis client with proper error handling and connection management
 * @returns Redis client instance
 */
export function getRedisClient(): Redis {
	if (redisClient) {
		return redisClient;
	}

	try {
		// Priority 1: Use Upstash Redis if available (production)
		if (UPSTASH_REDIS_REST_URL && UPSTASH_REDIS_REST_TOKEN) {
			console.log('🔴 Initializing Upstash Redis client...');
			
			// Parse Upstash URL
			const url = new URL(UPSTASH_REDIS_REST_URL);
			
			redisClient = new Redis({
				host: url.hostname,
				port: 443,
				password: UPSTASH_REDIS_REST_TOKEN,
				tls: {
					servername: url.hostname
				},
				enableReadyCheck: true,
				maxRetriesPerRequest: 3,
				retryStrategy(times) {
					const delay = Math.min(times * 50, 2000);
					return delay;
				},
				reconnectOnError(err) {
					const targetError = 'READONLY';
					if (err.message.includes(targetError)) {
						return true;
					}
					return false;
				}
			});
		}
		// Priority 2: Use local Redis as fallback (development)
		else if (REDIS_URL) {
			console.log('🔴 Initializing Local Redis client...');
			
			redisClient = new Redis(REDIS_URL, {
				enableReadyCheck: true,
				maxRetriesPerRequest: 3,
				retryStrategy(times) {
					const delay = Math.min(times * 50, 2000);
					return delay;
				},
				lazyConnect: false
			});
		} else {
			throw new Error('No Redis configuration found. Please set UPSTASH_REDIS_REST_URL or REDIS_URL');
		}

		// Connection event handlers
		redisClient.on('connect', () => {
			console.log('✅ Redis connected successfully');
		});

		redisClient.on('error', (err) => {
			console.error('❌ Redis connection error:', err);
		});

		redisClient.on('close', () => {
			console.log('🔌 Redis connection closed');
		});

		redisClient.on('reconnecting', () => {
			console.log('🔄 Redis reconnecting...');
		});

		return redisClient;
	} catch (error) {
		console.error('Failed to initialize Redis client:', error);
		throw error;
	}
}

/**
 * Close Redis connection gracefully
 */
export async function closeRedisConnection(): Promise<void> {
	if (redisClient) {
		await redisClient.quit();
		redisClient = null;
		console.log('Redis connection closed gracefully');
	}
}

/**
 * Check if Redis is healthy and responsive
 */
export async function checkRedisHealth(): Promise<boolean> {
	try {
		const client = getRedisClient();
		const result = await client.ping();
		return result === 'PONG';
	} catch (error) {
		console.error('Redis health check failed:', error);
		return false;
	}
}

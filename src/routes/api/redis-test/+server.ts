import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { redis, isUpstash, isLocal, testRedisConnection } from '$lib/server/middleware/rateLimit/redis';
import type { Redis as UpstashRedis } from '@upstash/redis';
import type IORedis from 'ioredis';

/**
 * Redis Connection Test Endpoint
 * Tests Redis PING/PONG and shows connection info
 * 
 * GET /api/redis-test
 */
export const GET: RequestHandler = async () => {
	try {
		console.log('\n=== Testing Redis Connection ===');
		
		// Test PING/PONG
		const connectionOk = await testRedisConnection();
		
		// Get connection type
		const redisType = isUpstash() ? 'Upstash (REST API)' : isLocal() ? 'Local (ioredis)' : 'Unknown';
		
		// Try to get/set a test value
		let testValueOk = false;
		let testError = null;
		
		try {
			// Set a test value with expiration (syntax differs between Upstash and ioredis)
			if (isUpstash()) {
				// Upstash syntax: set(key, value, { ex: seconds })
				const upstashClient = redis as UpstashRedis;
				await upstashClient.set('test:redis:connection', 'SUCCESS', { ex: 10 });
			} else {
				// ioredis syntax: set(key, value, 'EX', seconds)
				const ioredisClient = redis as IORedis;
				await ioredisClient.set('test:redis:connection', 'SUCCESS', 'EX', 10);
			}
			
			// Get the test value
			const value = await redis.get('test:redis:connection');
			testValueOk = value === 'SUCCESS';
			
			console.log('✅ Test value set/get:', testValueOk);
		} catch (error) {
			testError = error instanceof Error ? error.message : 'Unknown error';
			console.error('❌ Test value set/get failed:', error);
		}
		
		// Prepare response
		const response = {
			success: connectionOk && testValueOk,
			redis: {
				type: redisType,
				pingTest: connectionOk ? 'PONG' : 'FAILED',
				setGetTest: testValueOk ? 'SUCCESS' : 'FAILED',
				connectionStatus: connectionOk ? 'Connected' : 'Disconnected',
				error: testError
			},
			timestamp: new Date().toISOString()
		};
		
		console.log('Redis Test Result:', response);
		console.log('=== Test Complete ===\n');
		
		return json(response, {
			status: response.success ? 200 : 503
		});
		
	} catch (error) {
		console.error('❌ Redis test endpoint error:', error);
		
		return json({
			success: false,
			error: error instanceof Error ? error.message : 'Unknown error',
			redis: {
				type: isUpstash() ? 'Upstash (REST API)' : isLocal() ? 'Local (ioredis)' : 'Unknown',
				pingTest: 'FAILED',
				setGetTest: 'FAILED',
				connectionStatus: 'Error'
			},
			timestamp: new Date().toISOString()
		}, {
			status: 503
		});
	}
};

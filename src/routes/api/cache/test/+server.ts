/**
 * Cache Testing API
 * GET/POST /api/cache/test
 * 
 * Test cache functionality with various operations
 */

import { json, type RequestHandler } from '@sveltejs/kit';
import { cacheService, TTL_PRESETS } from '$lib/server/cache';

/**
 * GET - Test cache read operations
 */
export const GET: RequestHandler = async ({ url }) => {
	const key = url.searchParams.get('key') || 'test:sample';

	try {
		const startTime = Date.now();

		// Test cache get
		const value = await cacheService.get(key);
		const getLatency = Date.now() - startTime;

		// Check if key exists
		const exists = await cacheService.has(key);

		// Get TTL
		const ttl = await cacheService.getTTL(key);

		return json({
			success: true,
			data: {
				key,
				value,
				exists,
				ttl,
				getLatency: `${getLatency}ms`
			}
		});
	} catch (error) {
		return json(
			{
				success: false,
				error: 'Cache test failed',
				details: error instanceof Error ? error.message : 'Unknown error'
			},
			{ status: 500 }
		);
	}
};

/**
 * POST - Test cache write operations
 */
export const POST: RequestHandler = async ({ request }) => {
	try {
		const body = await request.json();
		const key = body.key || 'test:sample';
		const value = body.value || { message: 'Test data', timestamp: Date.now() };
		const ttl = body.ttl || TTL_PRESETS.SHORT;

		const operations: Record<string, any> = {};

		// Test set operation
		const setStart = Date.now();
		const setResult = await cacheService.set(key, value, { ttl });
		operations.set = {
			success: setResult,
			latency: `${Date.now() - setStart}ms`
		};

		// Test get operation
		const getStart = Date.now();
		const getValue = await cacheService.get(key);
		operations.get = {
			value: getValue,
			latency: `${Date.now() - getStart}ms`
		};

		// Test has operation
		const hasStart = Date.now();
		const hasResult = await cacheService.has(key);
		operations.has = {
			exists: hasResult,
			latency: `${Date.now() - hasStart}ms`
		};

		// Test TTL operation
		const ttlStart = Date.now();
		const ttlValue = await cacheService.getTTL(key);
		operations.ttl = {
			value: ttlValue,
			latency: `${Date.now() - ttlStart}ms`
		};

		// Test batch operations
		const batchStart = Date.now();
		await cacheService.setMany([
			{ key: `${key}:batch:1`, value: 'Value 1' },
			{ key: `${key}:batch:2`, value: 'Value 2' },
			{ key: `${key}:batch:3`, value: 'Value 3' }
		], { ttl: TTL_PRESETS.SHORT });
		
		const batchValues = await cacheService.getMany([
			`${key}:batch:1`,
			`${key}:batch:2`,
			`${key}:batch:3`
		]);
		operations.batch = {
			values: batchValues,
			latency: `${Date.now() - batchStart}ms`
		};

		// Test wrap operation (cache-aside pattern)
		const wrapStart = Date.now();
		const wrapResult = await cacheService.wrap(
			`${key}:wrap`,
			async () => ({ message: 'Wrapped data', fetched: true }),
			{ ttl: TTL_PRESETS.SHORT }
		);
		operations.wrap = {
			data: wrapResult.data,
			cached: wrapResult.cached,
			source: wrapResult.source,
			latency: `${Date.now() - wrapStart}ms`
		};

		return json({
			success: true,
			message: 'Cache test completed successfully',
			operations,
			testKey: key
		});
	} catch (error) {
		return json(
			{
				success: false,
				error: 'Cache test failed',
				details: error instanceof Error ? error.message : 'Unknown error'
			},
			{ status: 500 }
		);
	}
};

/**
 * DELETE - Clean up test keys
 */
export const DELETE: RequestHandler = async ({ url }) => {
	try {
		const pattern = url.searchParams.get('pattern') || 'test:*';

		const deletedCount = await cacheService.deletePattern(pattern);

		return json({
			success: true,
			message: 'Test keys cleaned up',
			deletedCount
		});
	} catch (error) {
		return json(
			{
				success: false,
				error: 'Failed to clean up test keys',
				details: error instanceof Error ? error.message : 'Unknown error'
			},
			{ status: 500 }
		);
	}
};

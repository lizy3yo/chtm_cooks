import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDatabase } from '$lib/server/db/mongodb';
import { getRedisClient, checkRedisHealth } from '$lib/server/middleware/rateLimit/redis';
import { verifyEmailConnection } from '$lib/server/services/email';
import { ServiceUnavailableError } from '$lib/server/errors';

/**
 * GET /api/health
 * Health check endpoint for monitoring and load balancers
 * Returns status of all critical services
 */
export const GET: RequestHandler = async ({ locals }) => {
	const checks: {
		[key: string]: {
			status: 'healthy' | 'unhealthy' | 'degraded';
			message?: string;
			responseTime?: number;
		};
	} = {};

	let overallStatus: 'healthy' | 'unhealthy' | 'degraded' = 'healthy';

	// Check MongoDB
	const mongoStart = Date.now();
	try {
		const db = await getDatabase();
		await db.command({ ping: 1 });
		checks.mongodb = {
			status: 'healthy',
			responseTime: Date.now() - mongoStart
		};
	} catch (error) {
		checks.mongodb = {
			status: 'unhealthy',
			message: 'Database connection failed',
			responseTime: Date.now() - mongoStart
		};
		overallStatus = 'unhealthy';
	}

	// Check Redis
	const redisStart = Date.now();
	try {
		const redis = getRedisClient();
		const isHealthy = await checkRedisHealth();
		checks.redis = {
			status: isHealthy ? 'healthy' : 'unhealthy',
			message: isHealthy ? undefined : 'Redis connection failed',
			responseTime: Date.now() - redisStart
		};
		if (!isHealthy && overallStatus === 'healthy') {
			overallStatus = 'degraded'; // Can function without Redis but rate limiting affected
		}
	} catch (error) {
		checks.redis = {
			status: 'unhealthy',
			message: 'Redis not available',
			responseTime: Date.now() - redisStart
		};
		if (overallStatus === 'healthy') {
			overallStatus = 'degraded';
		}
	}

	// Check Email Service
	const emailStart = Date.now();
	try {
		const emailHealthy = await verifyEmailConnection();
		checks.email = {
			status: emailHealthy ? 'healthy' : 'degraded',
			message: emailHealthy ? undefined : 'Email service connection issues',
			responseTime: Date.now() - emailStart
		};
		if (!emailHealthy && overallStatus === 'healthy') {
			overallStatus = 'degraded';
		}
	} catch (error) {
		checks.email = {
			status: 'degraded',
			message: 'Email service check failed',
			responseTime: Date.now() - emailStart
		};
		if (overallStatus === 'healthy') {
			overallStatus = 'degraded';
		}
	}

	// Calculate total uptime
	const uptime = process.uptime();

	const response = {
		status: overallStatus,
		timestamp: new Date().toISOString(),
		uptime: {
			seconds: Math.floor(uptime),
			formatted: formatUptime(uptime)
		},
		services: checks,
		version: '1.0.0',
		environment: process.env.NODE_ENV || 'development',
		requestId: locals.requestId
	};

	// Return 503 if unhealthy, 200 if healthy or degraded
	const statusCode = overallStatus === 'unhealthy' ? 503 : 200;

	// If unhealthy, throw error for proper logging
	if (overallStatus === 'unhealthy') {
		throw new ServiceUnavailableError('One or more critical services are unavailable', 30, {
			services: checks
		});
	}

	return json(response, { status: statusCode });
};

/**
 * Format uptime in human-readable format
 */
function formatUptime(seconds: number): string {
	const days = Math.floor(seconds / 86400);
	const hours = Math.floor((seconds % 86400) / 3600);
	const minutes = Math.floor((seconds % 3600) / 60);
	const secs = Math.floor(seconds % 60);

	const parts: string[] = [];
	if (days > 0) parts.push(`${days}d`);
	if (hours > 0) parts.push(`${hours}h`);
	if (minutes > 0) parts.push(`${minutes}m`);
	if (secs > 0 || parts.length === 0) parts.push(`${secs}s`);

	return parts.join(' ');
}

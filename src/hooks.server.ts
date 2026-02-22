import type { Handle, HandleServerError } from '@sveltejs/kit';
import { sequence } from '@sveltejs/kit/hooks';
import { dev } from '$app/environment';
import { json } from '@sveltejs/kit';
import {
	initializeRequestContext,
	getRequestContext,
	getRequestDuration,
	addRequestIdHeader
} from '$lib/server/middleware/requestContext';
import { logRequest, logError, logInfo } from '$lib/server/utils/logger';
import {
	formatErrorResponse,
	isOperationalError,
	shouldLogError,
	getRetryAfter
} from '$lib/server/errors/errorFormatter';
import type { AppError } from '$lib/server/errors/AppError';
import { securityHeadersMiddleware } from '$lib/server/middleware/security';
import { initializeIndexes } from '$lib/server/db/indexes';

/**
 * Initialize database indexes on server startup
 * This ensures all required indexes are created for optimal query performance
 */
(async () => {
	try {
		logInfo('Initializing database indexes...');
		const result = await initializeIndexes();
		logInfo(`Database indexes initialized: ${result.created} created, ${result.existed} existed, ${result.failed} failed`);
	} catch (error) {
		logError(error as Error, { context: 'index-initialization' });
	}
})();

/**
 * Request Context Handler
 * Initializes request ID and timing for all requests
 */
const requestContextHandler: Handle = async ({ event, resolve }) => {
	// Initialize request context (request ID, start time)
	initializeRequestContext(event);

	const context = getRequestContext(event);

	// Resolve the request
	const response = await resolve(event);

	// Add request ID to response headers
	addRequestIdHeader(response.headers, context.requestId);

	// Calculate request duration
	const duration = getRequestDuration(event);

	// Log request
	logRequest(
		event.request.method,
		event.url.pathname,
		response.status,
		duration,
		context.requestId,
		context.userId
	);

	return response;
};

/**
 * CORS Handler
 * Handles CORS for API requests
 */
const corsHandler: Handle = async ({ event, resolve }) => {
	// Only apply CORS to API routes
	if (event.url.pathname.startsWith('/api')) {
		// Handle preflight requests
		if (event.request.method === 'OPTIONS') {
			return new Response(null, {
				status: 204,
				headers: {
					'Access-Control-Allow-Origin': getAllowedOrigin(event.request.headers.get('origin')),
					'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
					'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Request-ID',
					'Access-Control-Max-Age': '86400',
					'Access-Control-Allow-Credentials': 'true'
				}
			});
		}
	}

	const response = await resolve(event);

	// Add CORS headers to API responses
	if (event.url.pathname.startsWith('/api')) {
		response.headers.set(
			'Access-Control-Allow-Origin',
			getAllowedOrigin(event.request.headers.get('origin'))
		);
		response.headers.set('Access-Control-Allow-Credentials', 'true');
	}

	return response;
};

/**
 * Get allowed origin for CORS
 * In production, check against whitelist
 * In development, allow all origins
 */
function getAllowedOrigin(origin: string | null): string {
	if (dev) {
		return origin || '*';
	}

	// Production: whitelist specific origins
	const allowedOrigins = [
		'http://localhost:5173',
		'http://localhost:3000',
		'https://yourdomain.com',
		'https://www.yourdomain.com'
		// Add your production domains here
	];

	if (origin && allowedOrigins.includes(origin)) {
		return origin;
	}

	// Default to first allowed origin
	return allowedOrigins[0];
}

/**
 * Error Handler
 * Catches and formats all errors consistently
 */
const errorHandler: Handle = async ({ event, resolve }) => {
	try {
		return await resolve(event);
	} catch (error) {
		const context = getRequestContext(event);

		// Log error if needed
		if (shouldLogError(error as Error)) {
			logError(error as Error, {
				requestId: context.requestId,
				userId: context.userId,
				method: event.request.method,
				url: event.url.pathname
			});
		}

		// Format error response
		const errorResponse = formatErrorResponse(
			error as Error | AppError,
			context.requestId,
			event.url.pathname,
			event.request.method
		);

		// Get retry-after if present
		const retryAfter = getRetryAfter(error as Error | AppError);

		// Create response headers
		const headers = new Headers();
		addRequestIdHeader(headers, context.requestId);

		if (retryAfter) {
			headers.set('Retry-After', retryAfter.toString());
		}

		// Return JSON error response
		return json(errorResponse, {
			status: errorResponse.statusCode,
			headers
		});
	}
};

/**
 * Combine all handlers in sequence
 * Execution order matters: context -> security -> cors -> error handling
 */
export const handle = sequence(
	requestContextHandler,
	securityHeadersMiddleware,
	corsHandler,
	errorHandler
);

/**
 * Global error handler for unhandled errors
 * Catches errors that weren't caught by the handle hook
 */
export const handleError: HandleServerError = ({ error, event }) => {
	const context = getRequestContext(event);

	// Log the error
	logError(error as Error, {
		requestId: context.requestId,
		userId: context.userId,
		method: event.request.method,
		url: event.url.pathname,
		type: 'unhandled'
	});

	// Check if error is operational
	const operational = isOperationalError(error as Error);

	// Return sanitized error message
	return {
		message: operational
			? (error as Error).message
			: 'An unexpected error occurred. Please try again later.',
		code: 'code' in (error as AppError) ? (error as AppError).code : 'INTERNAL_ERROR',
		requestId: context.requestId
	};
};

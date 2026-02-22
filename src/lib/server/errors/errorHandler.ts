import { json, type RequestEvent } from '@sveltejs/kit';
import type { AppError } from '$lib/server/errors/AppError';
import { addRequestIdHeader } from '$lib/server/middleware/requestContext';
import { formatErrorResponse, getRetryAfter } from '$lib/server/errors/errorFormatter';

/**
 * Throw an error that will be caught by the global error handler
 * 
 * @param error - Error to throw
 * @throws Always throws the provided error
 */
export function throwError(error: Error | AppError): never {
	throw error;
}

/**
 * Return error response directly (alternative to throwing)
 * Useful when you want to return error without throwing
 * 
 * @param error - Error to return
 * @param event - Request event for context
 * @returns JSON error response
 */
export function returnError(error: Error | AppError, event: RequestEvent) {
	const errorResponse = formatErrorResponse(
		error,
		event.locals.requestId,
		event.url.pathname,
		event.request.method
	);

	const retryAfter = getRetryAfter(error);

	const headers = new Headers();
	addRequestIdHeader(headers, event.locals.requestId);

	if (retryAfter) {
		headers.set('Retry-After', retryAfter.toString());
	}

	return json(errorResponse, {
		status: errorResponse.statusCode,
		headers
	});
}

/**
 * Wrap async handler with error handling
 * Automatically catches and returns formatted errors
 * 
 * @param handler - Async handler function
 * @returns Wrapped handler
 */
export function withErrorHandling<T extends RequestEvent>(
	handler: (event: T) => Promise<Response>
) {
	return async (event: T): Promise<Response> => {
		try {
			return await handler(event);
		} catch (error) {
			return returnError(error as Error | AppError, event);
		}
	};
}

/**
 * Assert condition or throw error
 * 
 * @param condition - Condition to check
 * @param error - Error to throw if condition is false
 * @throws Error if condition is false
 */
export function assert(condition: unknown, error: Error | AppError): asserts condition {
	if (!condition) {
		throw error;
	}
}

/**
 * Try-catch wrapper that returns result or error
 * 
 * @param fn - Function to execute
 * @returns Tuple of [error, result]
 */
export async function tryCatch<T>(
	fn: () => Promise<T>
): Promise<[null, T] | [Error, null]> {
	try {
		const result = await fn();
		return [null, result];
	} catch (error) {
		return [error as Error, null];
	}
}

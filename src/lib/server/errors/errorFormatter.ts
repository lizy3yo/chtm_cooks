import type { AppError } from './AppError';
import { dev } from '$app/environment';

/**
 * Standard error response interface
 */
export interface ErrorResponse {
	error: string;
	message: string;
	code: string;
	statusCode: number;
	timestamp: string;
	requestId?: string;
	path?: string;
	method?: string;
	details?: unknown;
	stack?: string; // Only in development
}

/**
 * Format error for API response
 * Sanitizes error details and removes sensitive information
 * 
 * @param error - Error object to format
 * @param requestId - Unique request identifier
 * @param path - Request path
 * @param method - HTTP method
 * @returns Formatted error response
 */
export function formatErrorResponse(
	error: Error | AppError,
	requestId?: string,
	path?: string,
	method?: string
): ErrorResponse {
	// Check if error is an AppError instance
	const isAppError = 'statusCode' in error && 'code' in error;

	const statusCode = isAppError ? (error as AppError).statusCode : 500;
	const code = isAppError ? (error as AppError).code : 'INTERNAL_ERROR';
	const message = error.message || 'An unexpected error occurred';
	const details = isAppError ? (error as AppError).details : undefined;

	const errorResponse: ErrorResponse = {
		error: error.name,
		message: sanitizeErrorMessage(message),
		code,
		statusCode,
		timestamp: new Date().toISOString(),
		requestId,
		path,
		method
	};

	// Include details if available and in development
	if (details && (dev || isAppError)) {
		errorResponse.details = sanitizeDetails(details);
	}

	// Include stack trace only in development
	if (dev && error.stack) {
		errorResponse.stack = error.stack;
	}

	return errorResponse;
}

/**
 * Sanitize error message to prevent sensitive information leakage
 * 
 * @param message - Original error message
 * @returns Sanitized message
 */
function sanitizeErrorMessage(message: string): string {
	// Remove potential file paths
	let sanitized = message.replace(/\/[^\s]+/g, '[PATH]');

	// Remove potential SQL queries
	sanitized = sanitized.replace(/SELECT .+ FROM/gi, '[SQL_QUERY]');

	// Remove potential connection strings
	sanitized = sanitized.replace(/mongodb:\/\/[^\s]+/gi, '[CONNECTION_STRING]');
	sanitized = sanitized.replace(/redis:\/\/[^\s]+/gi, '[CONNECTION_STRING]');

	// Remove potential environment variables
	sanitized = sanitized.replace(/\$\{[^}]+\}/g, '[ENV_VAR]');

	return sanitized;
}

/**
 * Sanitize error details object
 * 
 * @param details - Error details
 * @returns Sanitized details
 */
function sanitizeDetails(details: unknown): unknown {
	if (typeof details === 'string') {
		return sanitizeErrorMessage(details);
	}

	if (Array.isArray(details)) {
		return details.map(sanitizeDetails);
	}

	if (details && typeof details === 'object') {
		const sanitized: Record<string, unknown> = {};
		for (const [key, value] of Object.entries(details)) {
			// Skip sensitive fields
			if (isSensitiveField(key)) {
				sanitized[key] = '[REDACTED]';
			} else {
				sanitized[key] = sanitizeDetails(value);
			}
		}
		return sanitized;
	}

	return details;
}

/**
 * Check if field name is sensitive
 * 
 * @param fieldName - Field name to check
 * @returns True if field is sensitive
 */
function isSensitiveField(fieldName: string): boolean {
	const sensitiveFields = [
		'password',
		'token',
		'secret',
		'apikey',
		'api_key',
		'authorization',
		'cookie',
		'session',
		'ssn',
		'credit_card',
		'cvv',
		'pin'
	];

	const lowerFieldName = fieldName.toLowerCase();
	return sensitiveFields.some((sensitive) => lowerFieldName.includes(sensitive));
}

/**
 * Check if error is operational (expected) or programming error
 * 
 * @param error - Error to check
 * @returns True if error is operational
 */
export function isOperationalError(error: Error | AppError): boolean {
	if ('isOperational' in error) {
		return (error as AppError).isOperational;
	}
	return false;
}

/**
 * Extract retry-after value from error
 * 
 * @param error - Error object
 * @returns Retry-after seconds or undefined
 */
export function getRetryAfter(error: Error | AppError): number | undefined {
	if ('retryAfter' in error) {
		return (error as AppError & { retryAfter?: number }).retryAfter;
	}
	return undefined;
}

/**
 * Determine if error should be logged
 * Some errors (like validation) might be too noisy to log
 * 
 * @param error - Error to check
 * @returns True if error should be logged
 */
export function shouldLogError(error: Error | AppError): boolean {
	// Always log non-operational errors
	if (!isOperationalError(error)) {
		return true;
	}

	// Skip logging for certain operational errors in production
	if (!dev) {
		const skipCodes = ['VALIDATION_ERROR', 'BAD_REQUEST'];
		if ('code' in error && skipCodes.includes((error as AppError).code)) {
			return false;
		}
	}

	return true;
}

/**
 * Parse error object to AppError
 * Useful for converting native errors to AppError
 * 
 * @param error - Error to parse
 * @returns AppError instance
 */
export function parseError(error: unknown): AppError {
	// Import InternalServerError here to avoid circular dependency
	const { InternalServerError } = require('./AppError');

	if (error instanceof Error) {
		// If already an AppError, return as is
		if ('statusCode' in error && 'code' in error) {
			return error as AppError;
		}

		// Convert native Error to AppError
		return new InternalServerError(error.message, {
			originalError: error.name
		});
	}

	// Handle non-Error objects
	if (typeof error === 'string') {
		return new InternalServerError(error);
	}

	return new InternalServerError('An unknown error occurred', {
		originalError: error
	});
}

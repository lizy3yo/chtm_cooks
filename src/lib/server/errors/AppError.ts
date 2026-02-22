/**
 * Custom Error Classes
 * Provides typed errors for different scenarios with proper HTTP status codes
 */

/**
 * Base application error class
 * All custom errors should extend this class
 */
export class AppError extends Error {
	public readonly statusCode: number;
	public readonly code: string;
	public readonly isOperational: boolean;
	public readonly details?: unknown;

	constructor(
		message: string,
		statusCode: number = 500,
		code: string = 'INTERNAL_ERROR',
		isOperational: boolean = true,
		details?: unknown
	) {
		super(message);
		this.name = this.constructor.name;
		this.statusCode = statusCode;
		this.code = code;
		this.isOperational = isOperational;
		this.details = details;

		// Maintains proper stack trace for where error was thrown (V8 only)
		Error.captureStackTrace(this, this.constructor);
	}
}

/**
 * 400 Bad Request
 * Client sent invalid data
 */
export class BadRequestError extends AppError {
	constructor(message: string = 'Bad request', details?: unknown) {
		super(message, 400, 'BAD_REQUEST', true, details);
	}
}

/**
 * 401 Unauthorized
 * Authentication required or failed
 */
export class UnauthorizedError extends AppError {
	constructor(message: string = 'Unauthorized', details?: unknown) {
		super(message, 401, 'UNAUTHORIZED', true, details);
	}
}

/**
 * 403 Forbidden
 * User authenticated but doesn't have permission
 */
export class ForbiddenError extends AppError {
	constructor(message: string = 'Forbidden', details?: unknown) {
		super(message, 403, 'FORBIDDEN', true, details);
	}
}

/**
 * 404 Not Found
 * Requested resource doesn't exist
 */
export class NotFoundError extends AppError {
	constructor(message: string = 'Resource not found', details?: unknown) {
		super(message, 404, 'NOT_FOUND', true, details);
	}
}

/**
 * 409 Conflict
 * Request conflicts with current state (e.g., duplicate email)
 */
export class ConflictError extends AppError {
	constructor(message: string = 'Resource conflict', details?: unknown) {
		super(message, 409, 'CONFLICT', true, details);
	}
}

/**
 * 422 Unprocessable Entity
 * Request data is valid but can't be processed
 */
export class UnprocessableEntityError extends AppError {
	constructor(message: string = 'Unprocessable entity', details?: unknown) {
		super(message, 422, 'UNPROCESSABLE_ENTITY', true, details);
	}
}

/**
 * 429 Too Many Requests
 * Rate limit exceeded
 */
export class TooManyRequestsError extends AppError {
	public readonly retryAfter?: number;

	constructor(message: string = 'Too many requests', retryAfter?: number, details?: unknown) {
		super(message, 429, 'TOO_MANY_REQUESTS', true, details);
		this.retryAfter = retryAfter;
	}
}

/**
 * 500 Internal Server Error
 * Unexpected server error
 */
export class InternalServerError extends AppError {
	constructor(message: string = 'Internal server error', details?: unknown) {
		super(message, 500, 'INTERNAL_SERVER_ERROR', false, details);
	}
}

/**
 * 503 Service Unavailable
 * Service temporarily unavailable (maintenance, overload)
 */
export class ServiceUnavailableError extends AppError {
	public readonly retryAfter?: number;

	constructor(message: string = 'Service unavailable', retryAfter?: number, details?: unknown) {
		super(message, 503, 'SERVICE_UNAVAILABLE', true, details);
		this.retryAfter = retryAfter;
	}
}

/**
 * Database Error
 * Error occurred during database operation
 */
export class DatabaseError extends AppError {
	constructor(message: string = 'Database error', details?: unknown) {
		super(message, 500, 'DATABASE_ERROR', false, details);
	}
}

/**
 * Validation Error
 * Input validation failed
 */
export class ValidationError extends AppError {
	constructor(message: string = 'Validation failed', details?: unknown) {
		super(message, 400, 'VALIDATION_ERROR', true, details);
	}
}

/**
 * Authentication Error
 * Invalid credentials or token
 */
export class AuthenticationError extends AppError {
	constructor(message: string = 'Authentication failed', details?: unknown) {
		super(message, 401, 'AUTHENTICATION_ERROR', true, details);
	}
}

/**
 * Authorization Error
 * Insufficient permissions
 */
export class AuthorizationError extends AppError {
	constructor(message: string = 'Insufficient permissions', details?: unknown) {
		super(message, 403, 'AUTHORIZATION_ERROR', true, details);
	}
}

/**
 * Email Error
 * Error occurred while sending email
 */
export class EmailError extends AppError {
	constructor(message: string = 'Email service error', details?: unknown) {
		super(message, 500, 'EMAIL_ERROR', false, details);
	}
}

/**
 * Token Error
 * Invalid, expired, or malformed token
 */
export class TokenError extends AppError {
	constructor(message: string = 'Token error', details?: unknown) {
		super(message, 401, 'TOKEN_ERROR', true, details);
	}
}

/**
 * External API Error
 * Error from external service/API call
 */
export class ExternalAPIError extends AppError {
	constructor(message: string = 'External API error', details?: unknown) {
		super(message, 502, 'EXTERNAL_API_ERROR', false, details);
	}
}

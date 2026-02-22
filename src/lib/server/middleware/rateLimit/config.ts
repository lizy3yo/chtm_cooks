/**
 * Rate Limit Configuration and Presets
 * Defines rate limiting rules for different endpoints
 */

/**
 * Rate limit configuration for a specific endpoint
 */
export interface RateLimitConfig {
	windowMs: number; // Time window in milliseconds
	maxRequests: number; // Maximum requests allowed in the window
	blockDurationMs?: number; // Optional: How long to block after exceeding limit
	skipSuccessfulRequests?: boolean; // Only count failed attempts (useful for login)
	keyPrefix?: string; // Redis key prefix for this specific limiter
}

/**
 * Rate limit information returned to clients
 */
export interface RateLimitInfo {
	limit: number;
	remaining: number;
	reset: number; // Unix timestamp when the limit resets
	retryAfter?: number; // Seconds until the user can retry (if blocked)
}

/**
 * Predefined rate limit configurations for different scenarios
 * These follow industry best practices for security
 */
export const RateLimitPresets = {
	/**
	 * Login endpoint - Strict limits to prevent brute force attacks
	 * - Only counts failed login attempts
	 * - Blocks for 30 minutes after 5 failed attempts
	 */
	LOGIN: {
		windowMs: 15 * 60 * 1000, // 15 minutes
		maxRequests: 5, // 5 attempts per 15 minutes
		blockDurationMs: 30 * 60 * 1000, // Block for 30 minutes after exceeding
		skipSuccessfulRequests: true, // Only count failed login attempts
		keyPrefix: 'ratelimit:login'
	} as RateLimitConfig,

	/**
	 * Registration endpoint - Moderate limits
	 * - Prevents mass account creation
	 * - Blocks for 1 hour after 3 registrations
	 */
	REGISTER: {
		windowMs: 60 * 60 * 1000, // 1 hour
		maxRequests: 3, // 3 registrations per hour
		blockDurationMs: 60 * 60 * 1000, // Block for 1 hour
		keyPrefix: 'ratelimit:register'
	} as RateLimitConfig,

	/**
	 * Token refresh endpoint - Relaxed limits
	 * - Allows frequent token refreshes
	 * - No blocking, just slows down abusive clients
	 */
	REFRESH: {
		windowMs: 60 * 1000, // 1 minute
		maxRequests: 10, // 10 requests per minute
		keyPrefix: 'ratelimit:refresh'
	} as RateLimitConfig,

	/**
	 * General API endpoints - Standard rate limit
	 * - Prevents API abuse
	 */
	API: {
		windowMs: 60 * 1000, // 1 minute
		maxRequests: 60, // 60 requests per minute
		keyPrefix: 'ratelimit:api'
	} as RateLimitConfig,

	/**
	 * Password reset endpoint - Strict limits
	 * - Prevents abuse of password reset functionality
	 */
	PASSWORD_RESET: {
		windowMs: 60 * 60 * 1000, // 1 hour
		maxRequests: 3, // 3 attempts per hour
		blockDurationMs: 60 * 60 * 1000, // Block for 1 hour
		keyPrefix: 'ratelimit:password-reset'
	} as RateLimitConfig
};

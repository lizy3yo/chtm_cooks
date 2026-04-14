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
	 * - Blocks for 30 minutes after 1000 failed attempts
	 */
	LOGIN: {
		windowMs: 15 * 60 * 1000, // 15 minutes
		maxRequests: 1000, // 1000 attempts per 15 minutes
		blockDurationMs: 30 * 60 * 1000, // Block for 30 minutes after exceeding
		skipSuccessfulRequests: true, // Only count failed login attempts
		keyPrefix: 'ratelimit:login'
	} as RateLimitConfig,

	/**
	 * Registration endpoint - Moderate limits
	 * - Prevents mass account creation
	 * - Blocks for 1 hour after 10 registrations
	 */
	REGISTER: {
		windowMs: 60 * 60 * 1000, // 1 hour
		maxRequests: 10, // 10 registrations per hour
		blockDurationMs: 60 * 60 * 1000, // Block for 1 hour
		keyPrefix: 'ratelimit:register'
	} as RateLimitConfig,

	/**
	 * Resend verification endpoint - Moderate limits
	 * - Prevents repeated resend abuse while still allowing recovery
	 */
	RESEND_VERIFICATION: {
		windowMs: 60 * 60 * 1000, // 1 hour
		maxRequests: 10, // 10 resend attempts per hour
		blockDurationMs: 60 * 60 * 1000, // Block for 1 hour
		keyPrefix: 'ratelimit:resend-verification'
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
	 * Inventory import endpoint - tighter limits than general API
	 * - Prevents repeated high-cost bulk imports from overwhelming the system
	 */
	INVENTORY_IMPORT: {
		windowMs: 60 * 1000, // 1 minute
		maxRequests: 6, // 6 import requests per minute
		blockDurationMs: 5 * 60 * 1000, // Block for 5 minutes when exceeded
		keyPrefix: 'ratelimit:inventory-import'
	} as RateLimitConfig,

	/**
	 * Inventory image upload endpoint - high-throughput but bounded
	 * - Supports bulk image imports from ZIP/Excel workflows
	 */
	INVENTORY_IMAGE_UPLOAD: {
		windowMs: 60 * 1000, // 1 minute
		maxRequests: 300, // 300 image uploads per minute
		blockDurationMs: 60 * 1000, // Block for 1 minute when exceeded
		keyPrefix: 'ratelimit:inventory-image-upload'
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

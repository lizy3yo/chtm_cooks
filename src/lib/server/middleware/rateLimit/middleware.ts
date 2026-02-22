import type { RequestEvent } from '@sveltejs/kit';
import { json } from '@sveltejs/kit';
import type { RateLimitConfig, RateLimitInfo } from './config';
import { SlidingWindow } from './slidingWindow';

/**
 * Rate Limiting Middleware
 * 
 * Provides request rate limiting using sliding window algorithm
 * with Redis for distributed environments.
 */

/**
 * Extract client IP address from request
 * Handles proxied requests properly (X-Forwarded-For, X-Real-IP)
 * 
 * @param event - SvelteKit request event
 * @returns Client IP address
 */
function getClientIP(event: RequestEvent): string {
	// Check X-Forwarded-For header (load balancers, CDNs)
	const forwarded = event.request.headers.get('x-forwarded-for');
	if (forwarded) {
		// X-Forwarded-For can contain multiple IPs, take the first one
		return forwarded.split(',')[0].trim();
	}

	// Check X-Real-IP header (reverse proxies)
	const realIP = event.request.headers.get('x-real-ip');
	if (realIP) {
		return realIP;
	}

	// Fallback to direct client address
	return event.getClientAddress() || 'unknown';
}

/**
 * Generate Redis key for rate limiting
 * 
 * @param config - Rate limit configuration
 * @param identifier - Unique identifier (usually IP address)
 * @returns Redis key
 */
function getRateLimitKey(config: RateLimitConfig, identifier: string): string {
	const prefix = config.keyPrefix || 'ratelimit';
	return `${prefix}:${identifier}`;
}

/**
 * Main rate limiting middleware
 * 
 * Checks if request should be allowed based on rate limit configuration.
 * Returns either RateLimitInfo (allowed) or Response (rate limited).
 * 
 * @param event - SvelteKit request event
 * @param config - Rate limit configuration
 * @returns RateLimitInfo if allowed, Response if rate limited
 * 
 * @example
 * ```typescript
 * const result = await rateLimit(event, RateLimitPresets.LOGIN);
 * if (result instanceof Response) {
 *   return result; // Rate limited
 * }
 * // Continue processing...
 * ```
 */
export async function rateLimit(
	event: RequestEvent,
	config: RateLimitConfig
): Promise<RateLimitInfo | Response> {
	try {
		const clientIP = getClientIP(event);
		const key = getRateLimitKey(config, clientIP);

		// Check rate limit using sliding window
		const result = await SlidingWindow.check(key, config);

		// Calculate remaining requests
		const remaining = Math.max(0, config.maxRequests - result.count);
		const resetTimestamp = Math.ceil(result.resetTime / 1000);

		// Build rate limit info
		const rateLimitInfo: RateLimitInfo = {
			limit: config.maxRequests,
			remaining,
			reset: resetTimestamp
		};

		// If not allowed, return 429 response
		if (!result.allowed) {
			const retryAfter = result.blockExpiry
				? Math.ceil((result.blockExpiry - Date.now()) / 1000)
				: Math.ceil((result.resetTime - Date.now()) / 1000);

			rateLimitInfo.retryAfter = Math.max(0, retryAfter);

			const message = result.blockExpiry
				? 'You have been temporarily blocked due to too many failed attempts'
				: `Rate limit exceeded. Maximum ${config.maxRequests} requests per ${config.windowMs / 1000} seconds.`;

			return json(
				{
					error: 'Too many requests',
					message,
					retryAfter: rateLimitInfo.retryAfter
				},
				{
					status: 429,
					headers: {
						'X-RateLimit-Limit': rateLimitInfo.limit.toString(),
						'X-RateLimit-Remaining': '0',
						'X-RateLimit-Reset': new Date(result.resetTime).toISOString(),
						'Retry-After': rateLimitInfo.retryAfter.toString()
					}
				}
			);
		}

		return rateLimitInfo;
	} catch (error) {
		console.error('Rate limit check failed:', error);
		
		// Fail open - allow the request if rate limiting fails
		// In production, you might want to fail closed for security
		// To fail closed, return a 503 Service Unavailable response instead
		return {
			limit: config.maxRequests,
			remaining: config.maxRequests,
			reset: Math.ceil((Date.now() + config.windowMs) / 1000)
		};
	}
}

/**
 * Apply rate limit headers to a response
 * 
 * @param headers - Response headers object
 * @param info - Rate limit information
 * 
 * @example
 * ```typescript
 * const headers = new Headers();
 * applyRateLimitHeaders(headers, rateLimitInfo);
 * return json(data, { headers });
 * ```
 */
export function applyRateLimitHeaders(headers: Headers, info: RateLimitInfo): void {
	headers.set('X-RateLimit-Limit', info.limit.toString());
	headers.set('X-RateLimit-Remaining', info.remaining.toString());
	headers.set('X-RateLimit-Reset', new Date(info.reset * 1000).toISOString());

	if (info.retryAfter !== undefined) {
		headers.set('Retry-After', info.retryAfter.toString());
	}
}

/**
 * Mark a request as successful
 * 
 * Used with skipSuccessfulRequests config option.
 * Removes the request from rate limit counter (e.g., successful login).
 * 
 * @param event - SvelteKit request event
 * @param config - Rate limit configuration
 * 
 * @example
 * ```typescript
 * // After successful login
 * await markRequestSuccess(event, RateLimitPresets.LOGIN);
 * ```
 */
export async function markRequestSuccess(
	event: RequestEvent,
	config: RateLimitConfig
): Promise<void> {
	if (!config.skipSuccessfulRequests) {
		return;
	}

	try {
		const clientIP = getClientIP(event);
		const key = getRateLimitKey(config, clientIP);
		
		await SlidingWindow.removeLastRequest(key);
	} catch (error) {
		console.error('Failed to mark request as successful:', error);
		// Non-critical error, continue
	}
}

/**
 * Clear rate limit for a specific identifier
 * 
 * Useful for testing or admin overrides.
 * 
 * @param identifier - Unique identifier (usually IP address)
 * @param config - Rate limit configuration
 * 
 * @example
 * ```typescript
 * // Clear rate limit for specific IP
 * await clearRateLimit('192.168.1.100', RateLimitPresets.LOGIN);
 * ```
 */
export async function clearRateLimit(
	identifier: string,
	config: RateLimitConfig
): Promise<void> {
	try {
		const key = getRateLimitKey(config, identifier);
		await SlidingWindow.clear(key);
	} catch (error) {
		console.error('Failed to clear rate limit:', error);
		throw error;
	}
}

/**
 * Get current rate limit status for an identifier
 * 
 * Returns current count and reset time without incrementing.
 * Useful for monitoring and debugging.
 * 
 * @param identifier - Unique identifier (usually IP address)
 * @param config - Rate limit configuration
 * @returns Current status
 */
export async function getRateLimitStatus(
	identifier: string,
	config: RateLimitConfig
): Promise<{ count: number; resetTime: number }> {
	try {
		const key = getRateLimitKey(config, identifier);
		return await SlidingWindow.getStatus(key, config);
	} catch (error) {
		console.error('Failed to get rate limit status:', error);
		return { count: 0, resetTime: Date.now() + config.windowMs };
	}
}

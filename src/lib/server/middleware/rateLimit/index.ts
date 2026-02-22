/**
 * Rate Limiting Module
 * 
 * Industry-standard rate limiting implementation using sliding window algorithm.
 * Supports distributed systems via Redis.
 * 
 * @module rateLimit
 */

// Export configuration types and presets
export { RateLimitPresets } from './config';
export type { RateLimitConfig, RateLimitInfo } from './config';

// Export middleware functions
export {
	rateLimit,
	applyRateLimitHeaders,
	markRequestSuccess,
	clearRateLimit,
	getRateLimitStatus
} from './middleware';

// Export Redis utilities (for advanced usage)
export { getRedisClient, closeRedisConnection, checkRedisHealth } from './redis';

// Export sliding window class (for advanced usage)
export { SlidingWindow } from './slidingWindow';
export type { SlidingWindowResult } from './slidingWindow';

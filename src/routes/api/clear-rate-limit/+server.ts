import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { clearRateLimit, RateLimitPresets } from '$lib/server/middleware/rateLimit';

/**
 * Clear Rate Limit for Current Client IP
 * 
 * DELETE /api/clear-rate-limit
 */
export const DELETE: RequestHandler = async (event) => {
	try {
		// Get client IP
		const forwarded = event.request.headers.get('x-forwarded-for');
		const clientIP = forwarded ? forwarded.split(',')[0].trim() : event.getClientAddress() || 'unknown';
		
		// Clear rate limits for all presets
		await clearRateLimit(clientIP, RateLimitPresets.LOGIN);
		await clearRateLimit(clientIP, RateLimitPresets.REGISTER);
		await clearRateLimit(clientIP, RateLimitPresets.REFRESH);
		await clearRateLimit(clientIP, RateLimitPresets.API);
		await clearRateLimit(clientIP, RateLimitPresets.PASSWORD_RESET);
		
		return json({
			success: true,
			message: 'Rate limits cleared for your IP address',
			ip: clientIP
		});
	} catch (error) {
		console.error('Failed to clear rate limits:', error);
		return json({
			success: false,
			error: error instanceof Error ? error.message : 'Unknown error'
		}, { status: 500 });
	}
};

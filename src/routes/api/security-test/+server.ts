/**
 * Security Headers Test Endpoint
 * Returns current security headers configuration for testing
 * 
 * GET /api/security-test
 * 
 * This endpoint is useful for:
 * - Verifying security headers are properly applied
 * - Testing with Postman or other API clients
 * - Debugging security configuration
 * 
 * Response includes:
 * - All active security headers
 * - Security score
 * - Environment information
 * - Configuration recommendations
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { dev } from '$app/environment';
import {
	getSecurityHeadersForTesting,
	getSecurityScore,
	validateCSPDirectives,
	getSecurityConfig
} from '$lib/server/middleware/security';

export const GET: RequestHandler = async ({ url }) => {
	// Get current configuration
	const config = getSecurityConfig(dev);

	// Generate headers
	const headers = getSecurityHeadersForTesting(config);

	// Get security score
	const { score, recommendations } = getSecurityScore(config);

	// Validate CSP if present
	let cspValidation = null;
	if (config.contentSecurityPolicy && typeof config.contentSecurityPolicy === 'object') {
		cspValidation = validateCSPDirectives(config.contentSecurityPolicy);
	}

	// Build response
	const response = {
		status: 'ok',
		timestamp: new Date().toISOString(),
		environment: dev ? 'development' : 'production',
		securityHeaders: headers,
		analysis: {
			score,
			grade: getGrade(score),
			recommendations
		},
		cspValidation,
		info: {
			message: 'These are the security headers currently applied to all responses',
			note: 'Use Postman or curl to verify headers are present in actual responses',
			testInstructions: [
				`1. Make a GET request to: ${url.origin}/`,
				'2. Check the response headers',
				'3. Verify security headers are present',
				'4. Compare with the headers listed above'
			]
		}
	};

	return json(response, {
		headers: {
			'Content-Type': 'application/json',
			'Cache-Control': 'no-cache, no-store, must-revalidate'
		}
	});
};

/**
 * Get letter grade from score
 */
function getGrade(score: number): string {
	if (score >= 95) return 'A+';
	if (score >= 90) return 'A';
	if (score >= 85) return 'A-';
	if (score >= 80) return 'B+';
	if (score >= 75) return 'B';
	if (score >= 70) return 'B-';
	if (score >= 65) return 'C+';
	if (score >= 60) return 'C';
	if (score >= 55) return 'C-';
	if (score >= 50) return 'D';
	return 'F';
}

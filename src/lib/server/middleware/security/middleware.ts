/**
 * Security Headers Middleware
 * SvelteKit hook handler for applying security headers
 */

import type { Handle } from '@sveltejs/kit';
import { dev } from '$app/environment';
import type { SecurityHeadersConfig, SecurityHeaders } from './types';
import { getSecurityConfig } from './config';
import {
	generateSecurityHeaders,
	applySecurityHeaders,
	validateCSPDirectives,
	getSecurityScore
} from './headers';
import { logInfo, logWarn } from '$lib/server/utils/logger';

/**
 * Security headers middleware options
 */
export interface SecurityMiddlewareOptions {
	/**
	 * Custom configuration (overrides default)
	 */
	config?: Partial<SecurityHeadersConfig>;

	/**
	 * Enable CSP violation reporting
	 */
	enableReporting?: boolean;

	/**
	 * Report CSP violations to this endpoint
	 */
	reportUri?: string;

	/**
	 * Log security warnings to console
	 */
	logWarnings?: boolean;

	/**
	 * Routes to exclude from security headers (e.g., ['/api/webhook'])
	 */
	excludeRoutes?: string[];

	/**
	 * Enable security score logging on startup
	 */
	enableScoring?: boolean;
}

/**
 * Cache for generated security headers
 */
let cachedSecurityHeaders: SecurityHeaders | null = null;
let cachedEnvironment: boolean | null = null;

/**
 * Create security headers middleware
 * Returns a SvelteKit Handle function
 */
export function createSecurityHeadersMiddleware(
	options: SecurityMiddlewareOptions = {}
): Handle {
	const {
		config: customConfig,
		enableReporting = false,
		reportUri,
		logWarnings = true,
		excludeRoutes = [],
		enableScoring = true
	} = options;

	return async ({ event, resolve }) => {
		// Check if route should be excluded
		const shouldExclude = excludeRoutes.some((route) => event.url.pathname.startsWith(route));

		if (shouldExclude) {
			return resolve(event);
		}

		// Get or generate security headers
		const securityHeaders = getOrGenerateHeaders(
			customConfig,
			enableReporting,
			reportUri,
			logWarnings,
			enableScoring
		);

		// Resolve the response
		const response = await resolve(event);

		// Apply security headers to response
		applySecurityHeaders(response.headers, securityHeaders);

		return response;
	};
}

/**
 * Get cached security headers or generate new ones
 */
function getOrGenerateHeaders(
	customConfig?: Partial<SecurityHeadersConfig>,
	enableReporting?: boolean,
	reportUri?: string,
	logWarnings?: boolean,
	enableScoring?: boolean
): SecurityHeaders {
	// Check if we need to regenerate headers
	const envChanged = cachedEnvironment !== dev;

	if (!cachedSecurityHeaders || envChanged || customConfig) {
		// Update cache state
		cachedEnvironment = dev;

		// Get configuration
		const config = customConfig || getSecurityConfig(dev);

		// Validate CSP directives if present
		if (
			logWarnings &&
			config.contentSecurityPolicy &&
			typeof config.contentSecurityPolicy === 'object'
		) {
			const validation = validateCSPDirectives(config.contentSecurityPolicy);
			if (validation.warnings.length > 0) {
				validation.warnings.forEach((warning) => logWarn(warning));
			}
		}

		// Log security score if enabled
		if (enableScoring && !dev) {
			const { score, recommendations } = getSecurityScore(config);
			logInfo(`Security Score: ${score}/100`);
			if (recommendations.length > 0 && logWarnings) {
				logInfo('Security Recommendations:');
				recommendations.forEach((rec) => logInfo(`  - ${rec}`));
			}
		}

		// Generate headers
		let headers = generateSecurityHeaders(config);

		// Add CSP reporting if enabled
		if (
			enableReporting &&
			reportUri &&
			config.contentSecurityPolicy &&
			typeof config.contentSecurityPolicy === 'object'
		) {
			const currentCSP = headers['Content-Security-Policy'];
			headers['Content-Security-Policy'] = `${currentCSP}; report-uri ${reportUri}`;
		}

		// Cache headers only if not using custom config
		if (!customConfig) {
			cachedSecurityHeaders = headers;
		}

		return headers;
	}

	return cachedSecurityHeaders;
}

/**
 * Default security headers middleware
 * Uses default configuration based on environment
 */
export const securityHeadersMiddleware: Handle = createSecurityHeadersMiddleware({
	logWarnings: true,
	enableScoring: true
});

/**
 * Strict security headers middleware
 * Maximum security configuration (may break some features)
 */
export const strictSecurityHeadersMiddleware: Handle = createSecurityHeadersMiddleware({
	config: {
		contentSecurityPolicy: {
			'default-src': ["'self'"],
			'script-src': ["'self'"],
			'style-src': ["'self'"],
			'img-src': ["'self'", 'data:', 'https:'],
			'font-src': ["'self'"],
			'connect-src': ["'self'"],
			'media-src': ["'self'"],
			'object-src': ["'none'"],
			'frame-src': ["'none'"],
			'frame-ancestors': ["'none'"],
			'base-uri': ["'self'"],
			'form-action': ["'self'"],
			'worker-src': ["'self'"],
			'manifest-src': ["'self'"],
			'upgrade-insecure-requests': true,
			'block-all-mixed-content': true
		},
		xFrameOptions: 'DENY',
		crossOriginEmbedderPolicy: 'require-corp',
		crossOriginOpenerPolicy: 'same-origin',
		crossOriginResourcePolicy: 'same-origin'
	},
	logWarnings: true
});

/**
 * Permissive security headers middleware
 * Relaxed configuration for development or legacy apps
 */
export const permissiveSecurityHeadersMiddleware: Handle = createSecurityHeadersMiddleware({
	config: {
		contentSecurityPolicy: false,
		strictTransportSecurity: false,
		xFrameOptions: 'SAMEORIGIN',
		crossOriginEmbedderPolicy: false,
		crossOriginOpenerPolicy: false,
		crossOriginResourcePolicy: false
	},
	logWarnings: false,
	enableScoring: false
});

/**
 * CSP Report Handler
 * Handles CSP violation reports sent to the report-uri endpoint
 */
export async function handleCSPReport(request: Request): Promise<Response> {
	try {
		const report = await request.json();

		// Log CSP violation
		logWarn('CSP Violation Report:', {
			documentUri: report['csp-report']?.['document-uri'],
			violatedDirective: report['csp-report']?.['violated-directive'],
			blockedUri: report['csp-report']?.['blocked-uri'],
			originalPolicy: report['csp-report']?.['original-policy']
		});

		// You can also send this to an external monitoring service
		// await sendToMonitoringService(report);

		return new Response(null, { status: 204 });
	} catch (error) {
		logWarn('Failed to process CSP report', {
			error: error instanceof Error ? error.message : String(error)
		});
		return new Response(null, { status: 400 });
	}
}

/**
 * Security headers test endpoint
 * Returns current security headers for debugging
 */
export function getSecurityHeadersForTesting(
	customConfig?: Partial<SecurityHeadersConfig>
): SecurityHeaders {
	const config = customConfig || getSecurityConfig(dev);
	return generateSecurityHeaders(config);
}

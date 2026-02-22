/**
 * Security Headers Generator
 * Generates security headers based on configuration
 * Implements OWASP security best practices
 */

import type {
	SecurityHeadersConfig,
	SecurityHeaders,
	CSPDirectives,
	HSTSConfig,
	PermissionsPolicyConfig
} from './types';

/**
 * Generate Content Security Policy header value
 * Converts CSP directives object to policy string
 */
export function generateCSPHeader(directives: CSPDirectives): string {
	const policies: string[] = [];

	// Iterate through all directives
	for (const [directive, values] of Object.entries(directives)) {
		if (directive === 'upgrade-insecure-requests' && values === true) {
			policies.push('upgrade-insecure-requests');
			continue;
		}

		if (directive === 'block-all-mixed-content' && values === true) {
			policies.push('block-all-mixed-content');
			continue;
		}

		// Convert directive name from camelCase to kebab-case
		const kebabDirective = directive.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();

		if (Array.isArray(values) && values.length > 0) {
			// Join values with space and append to directive
			policies.push(`${kebabDirective} ${values.join(' ')}`);
		} else if (Array.isArray(values) && values.length === 0) {
			// Empty array means "'none'"
			policies.push(`${kebabDirective} 'none'`);
		}
	}

	return policies.join('; ');
}

/**
 * Generate Strict-Transport-Security header value
 * Formats HSTS configuration into header string
 */
export function generateHSTSHeader(config: HSTSConfig): string {
	const parts: string[] = [`max-age=${config.maxAge}`];

	if (config.includeSubDomains) {
		parts.push('includeSubDomains');
	}

	if (config.preload) {
		parts.push('preload');
	}

	return parts.join('; ');
}

/**
 * Generate Permissions-Policy header value
 * Formats permissions policy configuration into header string
 */
export function generatePermissionsPolicyHeader(config: PermissionsPolicyConfig): string {
	const policies: string[] = [];

	for (const [feature, allowlist] of Object.entries(config)) {
		if (!allowlist || !Array.isArray(allowlist)) continue;

		// Convert feature name from camelCase to kebab-case
		const kebabFeature = feature.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();

		if (allowlist.length === 0) {
			// Empty array means disabled for all
			policies.push(`${kebabFeature}=()`);
		} else {
			// Format: feature=(origin1 origin2)
			const origins = allowlist.map((origin) => {
				if (origin === 'self') return 'self';
				if (origin === '*') return '*';
				return `"${origin}"`;
			});
			policies.push(`${kebabFeature}=(${origins.join(' ')})`);
		}
	}

	return policies.join(', ');
}

/**
 * Generate all security headers based on configuration
 * Returns an object with header name-value pairs
 */
export function generateSecurityHeaders(config: Partial<SecurityHeadersConfig>): SecurityHeaders {
	const headers: SecurityHeaders = {};

	// Content Security Policy
	if (config.contentSecurityPolicy) {
		if (typeof config.contentSecurityPolicy === 'object') {
			headers['Content-Security-Policy'] = generateCSPHeader(config.contentSecurityPolicy);
		}
	}

	// Strict Transport Security (HSTS)
	if (config.strictTransportSecurity) {
		if (typeof config.strictTransportSecurity === 'object') {
			headers['Strict-Transport-Security'] = generateHSTSHeader(config.strictTransportSecurity);
		}
	}

	// Permissions Policy
	if (config.permissionsPolicy) {
		if (typeof config.permissionsPolicy === 'object') {
			headers['Permissions-Policy'] = generatePermissionsPolicyHeader(config.permissionsPolicy);
		}
	}

	// X-Frame-Options (clickjacking protection)
	if (config.xFrameOptions) {
		headers['X-Frame-Options'] = config.xFrameOptions;
	}

	// X-Content-Type-Options (MIME sniffing protection)
	if (config.xContentTypeOptions) {
		headers['X-Content-Type-Options'] = 'nosniff';
	}

	// X-XSS-Protection (legacy XSS protection for older browsers)
	if (config.xXssProtection) {
		headers['X-XSS-Protection'] = '1; mode=block';
	}

	// Referrer-Policy (control referrer information)
	if (config.referrerPolicy) {
		headers['Referrer-Policy'] = config.referrerPolicy;
	}

	// X-DNS-Prefetch-Control (control DNS prefetching)
	if (config.xDnsPrefetchControl !== undefined) {
		headers['X-DNS-Prefetch-Control'] = config.xDnsPrefetchControl ? 'on' : 'off';
	}

	// X-Download-Options (IE-specific, prevent file opening in trusted zone)
	if (config.xDownloadOptions) {
		headers['X-Download-Options'] = 'noopen';
	}

	// X-Permitted-Cross-Domain-Policies (Flash/PDF cross-domain policy)
	if (config.xPermittedCrossDomainPolicies) {
		headers['X-Permitted-Cross-Domain-Policies'] = config.xPermittedCrossDomainPolicies;
	}

	// Cross-Origin-Embedder-Policy (enable certain features like SharedArrayBuffer)
	if (config.crossOriginEmbedderPolicy) {
		headers['Cross-Origin-Embedder-Policy'] = config.crossOriginEmbedderPolicy;
	}

	// Cross-Origin-Opener-Policy (prevents cross-origin window access)
	if (config.crossOriginOpenerPolicy) {
		headers['Cross-Origin-Opener-Policy'] = config.crossOriginOpenerPolicy;
	}

	// Cross-Origin-Resource-Policy (prevents cross-origin resource loading)
	if (config.crossOriginResourcePolicy) {
		headers['Cross-Origin-Resource-Policy'] = config.crossOriginResourcePolicy;
	}

	// Origin-Agent-Cluster (enable process isolation)
	if (config.originAgentCluster) {
		headers['Origin-Agent-Cluster'] = '?1';
	}

	return headers;
}

/**
 * Apply security headers to a Headers object
 * Mutates the provided headers object
 */
export function applySecurityHeaders(
	headersObject: Headers,
	securityHeaders: SecurityHeaders
): void {
	for (const [name, value] of Object.entries(securityHeaders)) {
		headersObject.set(name, value);
	}
}

/**
 * Get security headers as array of tuples
 * Useful for certain frameworks or testing
 */
export function getSecurityHeadersArray(
	config: Partial<SecurityHeadersConfig>
): Array<[string, string]> {
	const headers = generateSecurityHeaders(config);
	return Object.entries(headers);
}

/**
 * Validate CSP directives
 * Checks for common misconfigurations and security issues
 */
export function validateCSPDirectives(directives: CSPDirectives): {
	valid: boolean;
	warnings: string[];
} {
	const warnings: string[] = [];

	// Check for unsafe-inline in script-src
	if (directives['script-src']?.includes("'unsafe-inline'")) {
		warnings.push(
			"CSP Warning: 'unsafe-inline' in script-src reduces XSS protection. Consider using nonces or hashes."
		);
	}

	// Check for unsafe-eval in script-src
	if (directives['script-src']?.includes("'unsafe-eval'")) {
		warnings.push(
			"CSP Warning: 'unsafe-eval' in script-src allows eval(), which can be exploited for XSS. Remove if possible."
		);
	}

	// Check if frame-ancestors is set (clickjacking protection)
	if (!directives['frame-ancestors'] || directives['frame-ancestors'].length === 0) {
		warnings.push("CSP Warning: 'frame-ancestors' not set. Consider setting it to prevent clickjacking.");
	}

	// Check for wildcard in default-src
	if (directives['default-src']?.includes('*')) {
		warnings.push(
			"CSP Warning: Wildcard '*' in default-src allows loading from any source. Be more specific."
		);
	}

	// Check for data: in script-src (can be exploited)
	if (directives['script-src']?.includes('data:')) {
		warnings.push(
			"CSP Warning: 'data:' in script-src allows data URIs, which can be used for XSS attacks."
		);
	}

	return {
		valid: warnings.length === 0,
		warnings
	};
}

/**
 * Get security score based on configuration
 * Returns a score from 0-100 based on security header coverage
 */
export function getSecurityScore(config: Partial<SecurityHeadersConfig>): {
	score: number;
	recommendations: string[];
} {
	let score = 0;
	const recommendations: string[] = [];

	// CSP (30 points)
	if (config.contentSecurityPolicy && typeof config.contentSecurityPolicy === 'object') {
		score += 30;
	} else {
		recommendations.push('Enable Content Security Policy for XSS protection');
	}

	// HSTS (15 points)
	if (config.strictTransportSecurity) {
		score += 15;
	} else {
		recommendations.push('Enable HSTS to enforce HTTPS connections');
	}

	// X-Frame-Options (10 points)
	if (config.xFrameOptions) {
		score += 10;
	} else {
		recommendations.push('Enable X-Frame-Options for clickjacking protection');
	}

	// X-Content-Type-Options (10 points)
	if (config.xContentTypeOptions) {
		score += 10;
	} else {
		recommendations.push('Enable X-Content-Type-Options to prevent MIME sniffing');
	}

	// Referrer-Policy (10 points)
	if (config.referrerPolicy) {
		score += 10;
	} else {
		recommendations.push('Set Referrer-Policy to control referrer information leakage');
	}

	// Permissions-Policy (10 points)
	if (config.permissionsPolicy) {
		score += 10;
	} else {
		recommendations.push('Set Permissions-Policy to control browser features');
	}

	// Cross-Origin policies (15 points total)
	if (config.crossOriginEmbedderPolicy) score += 5;
	else recommendations.push('Consider enabling Cross-Origin-Embedder-Policy');

	if (config.crossOriginOpenerPolicy) score += 5;
	else recommendations.push('Consider enabling Cross-Origin-Opener-Policy');

	if (config.crossOriginResourcePolicy) score += 5;
	else recommendations.push('Consider enabling Cross-Origin-Resource-Policy');

	return { score, recommendations };
}

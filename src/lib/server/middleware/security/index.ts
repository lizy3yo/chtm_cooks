/**
 * Security Middleware Module
 * Industry-standard security headers implementation for SvelteKit
 * 
 * @module security
 * 
 * This module provides comprehensive security header management including:
 * - Content Security Policy (CSP) for XSS protection
 * - Strict Transport Security (HSTS) for HTTPS enforcement
 * - Frame protection for clickjacking prevention
 * - MIME sniffing protection
 * - Cross-origin policies
 * - Permissions policies
 * 
 * @example
 * ```typescript
 * // In hooks.server.ts
 * import { securityHeadersMiddleware } from '$lib/server/middleware/security';
 * 
 * export const handle = sequence(
 *   securityHeadersMiddleware,
 *   // ... other middleware
 * );
 * ```
 * 
 * @example
 * ```typescript
 * // Custom configuration
 * import { createSecurityHeadersMiddleware } from '$lib/server/middleware/security';
 * 
 * const customSecurity = createSecurityHeadersMiddleware({
 *   config: {
 *     xFrameOptions: 'SAMEORIGIN',
 *     // ... other options
 *   },
 *   excludeRoutes: ['/api/webhook']
 * });
 * ```
 */

// Export types
export type {
	SecurityHeadersConfig,
	CSPDirectives,
	HSTSConfig,
	PermissionsPolicyConfig,
	EnvironmentConfig,
	SecurityHeaders,
	CSPReportConfig
} from './types';

// Export configuration
export {
	defaultSecurityConfig,
	getSecurityConfig,
	cspReportConfig
} from './config';

// Export header generation utilities
export {
	generateCSPHeader,
	generateHSTSHeader,
	generatePermissionsPolicyHeader,
	generateSecurityHeaders,
	applySecurityHeaders,
	getSecurityHeadersArray,
	validateCSPDirectives,
	getSecurityScore
} from './headers';

// Export middleware
export {
	createSecurityHeadersMiddleware,
	securityHeadersMiddleware,
	strictSecurityHeadersMiddleware,
	permissiveSecurityHeadersMiddleware,
	handleCSPReport,
	getSecurityHeadersForTesting
} from './middleware';

export type { SecurityMiddlewareOptions } from './middleware';

/**
 * Security Headers Types
 * Type definitions for security middleware configuration
 */

/**
 * Content Security Policy directives
 * Helps prevent XSS attacks by controlling resource loading
 */
export interface CSPDirectives {
	'default-src': string[];
	'script-src': string[];
	'style-src': string[];
	'img-src': string[];
	'font-src': string[];
	'connect-src': string[];
	'media-src': string[];
	'object-src': string[];
	'frame-src': string[];
	'frame-ancestors': string[];
	'base-uri': string[];
	'form-action': string[];
	'worker-src': string[];
	'manifest-src': string[];
	'upgrade-insecure-requests'?: boolean;
	'block-all-mixed-content'?: boolean;
}

/**
 * Strict Transport Security configuration
 * Enforces HTTPS connections
 */
export interface HSTSConfig {
	maxAge: number; // in seconds
	includeSubDomains: boolean;
	preload: boolean;
}

/**
 * Permissions Policy configuration
 * Controls which browser features and APIs can be used
 */
export interface PermissionsPolicyConfig {
	accelerometer?: string[];
	'ambient-light-sensor'?: string[];
	autoplay?: string[];
	battery?: string[];
	camera?: string[];
	'cross-origin-isolated'?: string[];
	'display-capture'?: string[];
	'document-domain'?: string[];
	'encrypted-media'?: string[];
	'execution-while-not-rendered'?: string[];
	'execution-while-out-of-viewport'?: string[];
	fullscreen?: string[];
	geolocation?: string[];
	gyroscope?: string[];
	'keyboard-map'?: string[];
	magnetometer?: string[];
	microphone?: string[];
	midi?: string[];
	'navigation-override'?: string[];
	payment?: string[];
	'picture-in-picture'?: string[];
	'publickey-credentials-get'?: string[];
	'screen-wake-lock'?: string[];
	'sync-xhr'?: string[];
	usb?: string[];
	'web-share'?: string[];
	'xr-spatial-tracking'?: string[];
	'clipboard-read'?: string[];
	'clipboard-write'?: string[];
	gamepad?: string[];
	'speaker-selection'?: string[];
	'conversion-measurement'?: string[];
	'focus-without-user-activation'?: string[];
	'hid'?: string[];
	'idle-detection'?: string[];
	'interest-cohort'?: string[];
	'serial'?: string[];
	'sync-script'?: string[];
	'trust-token-redemption'?: string[];
	'unload'?: string[];
	'window-placement'?: string[];
	'vertical-scroll'?: string[];
}

/**
 * Security headers configuration
 */
export interface SecurityHeadersConfig {
	// Enable/disable security features
	contentSecurityPolicy: boolean | CSPDirectives;
	strictTransportSecurity: boolean | HSTSConfig;
	permissionsPolicy: boolean | PermissionsPolicyConfig;
	xFrameOptions: 'DENY' | 'SAMEORIGIN' | false;
	xContentTypeOptions: boolean;
	xXssProtection: boolean;
	referrerPolicy:
		| 'no-referrer'
		| 'no-referrer-when-downgrade'
		| 'origin'
		| 'origin-when-cross-origin'
		| 'same-origin'
		| 'strict-origin'
		| 'strict-origin-when-cross-origin'
		| 'unsafe-url'
		| false;
	xDnsPrefetchControl: boolean;
	xDownloadOptions: boolean;
	xPermittedCrossDomainPolicies: 'none' | 'master-only' | 'by-content-type' | 'all' | false;
	crossOriginEmbedderPolicy: 'require-corp' | 'credentialless' | false;
	crossOriginOpenerPolicy: 'same-origin' | 'same-origin-allow-popups' | 'unsafe-none' | false;
	crossOriginResourcePolicy: 'same-origin' | 'same-site' | 'cross-origin' | false;
	originAgentCluster: boolean;
}

/**
 * Environment-specific configuration
 */
export interface EnvironmentConfig {
	development: Partial<SecurityHeadersConfig>;
	production: Partial<SecurityHeadersConfig>;
}

/**
 * Security headers result
 */
export interface SecurityHeaders {
	[key: string]: string;
}

/**
 * CSP Reporting Configuration (optional)
 * Set up a report-uri or report-to endpoint to receive CSP violation reports
 */
export interface CSPReportConfig {
	reportUri?: string; // Legacy: URL to send violation reports
	reportTo?: string; // Modern: Reporting API endpoint name
}

/**
 * Security Headers Configuration
 * Industry-standard security headers configuration for SvelteKit
 * Following OWASP best practices and modern security standards (2026)
 */

import type {
	SecurityHeadersConfig,
	CSPDirectives,
	HSTSConfig,
	PermissionsPolicyConfig
} from './types';

/**
 * Content Security Policy (CSP) Configuration
 * Prevents XSS, clickjacking, and other code injection attacks
 * 
 * IMPORTANT: Adjust these directives based on your application's needs
 * - Remove 'unsafe-inline' and 'unsafe-eval' for maximum security
 * - Add specific domains for external resources
 */
const cspDirectives: CSPDirectives = {
	// Default fallback for all directives
	'default-src': ["'self'"],

	// Scripts: restrict to self-hosted and trusted CDNs
	// TODO: Remove 'unsafe-inline' and 'unsafe-eval' once you implement nonce/hash-based CSP
	'script-src': [
		"'self'",
		"'unsafe-inline'", // Required for SvelteKit hydration (use nonce in production)
		"'unsafe-eval'" // Required for SvelteKit dev mode (remove in production)
	],

	// Styles: allow inline styles for frameworks
	'style-src': [
		"'self'",
		"'unsafe-inline'" // Required for component-scoped styles
	],

	// Images: allow self-hosted, data URIs, and HTTPS images
	'img-src': ["'self'", 'data:', 'https:', 'blob:'],

	// Fonts: allow self-hosted and data URIs
	'font-src': ["'self'", 'data:'],

	// API connections: restrict to your API endpoints
	'connect-src': [
		"'self'",
		'https://api.yourdomain.com' // Add your API domains
	],

	// Media: audio and video sources
	'media-src': ["'self'"],

	// Objects: block plugins like Flash
	'object-src': ["'none'"],

	// Frames: restrict iframe sources
	'frame-src': ["'self'"],

	// Frame ancestors: prevent clickjacking
	'frame-ancestors': ["'none'"],

	// Base URI: restrict base tag URLs
	'base-uri': ["'self'"],

	// Form actions: restrict form submissions
	'form-action': ["'self'"],

	// Web workers
	'worker-src': ["'self'", 'blob:'],

	// Web app manifests
	'manifest-src': ["'self'"],

	// Upgrade insecure requests (HTTP to HTTPS)
	'upgrade-insecure-requests': true,

	// Block mixed content
	'block-all-mixed-content': true
};

/**
 * Strict Transport Security (HSTS) Configuration
 * Enforces HTTPS connections for the specified duration
 * 
 * NOTES:
 * - Only applies in production (not on localhost)
 * - 2 years (63072000 seconds) is recommended for preload
 * - Preload: submit to hstspreload.org for browser-hardcoded HTTPS
 */
const hstsConfig: HSTSConfig = {
	maxAge: 63072000, // 2 years in seconds (required for preload)
	includeSubDomains: true,
	preload: true
};

/**
 * Permissions Policy Configuration (formerly Feature-Policy)
 * Controls which browser features and APIs can be used
 * 
 * Format: feature=(allowed-origins)
 * - () = disabled for all
 * - (self) = allowed for same origin
 * - (*) = allowed for all origins
 * - (origin1 origin2) = allowed for specific origins
 */
const permissionsPolicyConfig: PermissionsPolicyConfig = {
	// Sensors and device access
	accelerometer: [], // Disable accelerometer
	'ambient-light-sensor': [], // Disable ambient light sensor
	gyroscope: [], // Disable gyroscope
	magnetometer: [], // Disable magnetometer
	camera: [], // Disable camera (enable if needed: ['self'])
	microphone: [], // Disable microphone (enable if needed: ['self'])
	geolocation: [], // Disable geolocation (enable if needed: ['self'])
	usb: [], // Disable USB
	'serial': [], // Disable serial port access
	hid: [], // Disable HID devices

	// Media controls
	autoplay: ['self'], // Allow autoplay for same origin
	'encrypted-media': ['self'], // Allow encrypted media for same origin
	'picture-in-picture': ['self'], // Allow PiP for same origin
	'screen-wake-lock': [], // Disable screen wake lock

	// Display and UI
	fullscreen: ['self'], // Allow fullscreen for same origin
	'display-capture': [], // Disable screen capture

	// Payments
	payment: [], // Disable payment APIs (enable if needed: ['self'])

	// Privacy and tracking
	'interest-cohort': [], // Disable FLoC (Google's tracking)

	// Clipboard
	'clipboard-read': [], // Disable clipboard read
	'clipboard-write': ['self'], // Allow clipboard write for same origin

	// Other features
	'idle-detection': [], // Disable idle detection
	'sync-xhr': [], // Disable synchronous XHR
	'document-domain': [], // Disable document.domain
	midi: [], // Disable MIDI
	battery: [], // Disable battery status
	gamepad: [], // Disable gamepad
	'speaker-selection': [], // Disable speaker selection
	'web-share': ['self'], // Allow Web Share API for same origin
	'xr-spatial-tracking': [] // Disable VR/AR tracking
};

/**
 * Development Environment Configuration
 * More relaxed settings for development
 */
const developmentConfig: Partial<SecurityHeadersConfig> = {
	// CSP: More permissive for development (allows HMR, dev tools)
	contentSecurityPolicy: {
		...cspDirectives,
		'script-src': [
			"'self'",
			"'unsafe-inline'",
			"'unsafe-eval'", // Required for Vite HMR
			'localhost:*',
			'127.0.0.1:*'
		],
		'connect-src': [
			"'self'",
			'ws://localhost:*', // WebSocket for HMR
			'ws://127.0.0.1:*',
			'http://localhost:*',
			'http://127.0.0.1:*'
		],
		'upgrade-insecure-requests': false // Don't upgrade in dev
	},

	// HSTS: Disabled in development
	strictTransportSecurity: false,

	// Other headers: enabled
	permissionsPolicy: permissionsPolicyConfig,
	xFrameOptions: 'DENY',
	xContentTypeOptions: true,
	xXssProtection: true,
	referrerPolicy: 'strict-origin-when-cross-origin',
	xDnsPrefetchControl: true,
	xDownloadOptions: true,
	xPermittedCrossDomainPolicies: 'none',
	crossOriginEmbedderPolicy: false, // Can cause issues in dev
	crossOriginOpenerPolicy: false, // Can cause issues in dev
	crossOriginResourcePolicy: false, // Can cause issues in dev
	originAgentCluster: true
};

/**
 * Production Environment Configuration
 * Strict security settings for production
 */
const productionConfig: Partial<SecurityHeadersConfig> = {
	// CSP: Strict policy (consider using nonce/hash for inline scripts)
	contentSecurityPolicy: cspDirectives,

	// HSTS: Enforce HTTPS
	strictTransportSecurity: hstsConfig,

	// Permissions Policy: Restrictive
	permissionsPolicy: permissionsPolicyConfig,

	// Frame protection: Deny all framing
	xFrameOptions: 'DENY',

	// MIME type sniffing protection
	xContentTypeOptions: true,

	// XSS protection (legacy, but still useful for older browsers)
	xXssProtection: true,

	// Referrer policy: Balance privacy and functionality
	referrerPolicy: 'strict-origin-when-cross-origin',

	// DNS prefetching control
	xDnsPrefetchControl: true,

	// Download options (IE-specific)
	xDownloadOptions: true,

	// Cross-domain policies (Flash/PDF)
	xPermittedCrossDomainPolicies: 'none',

	// Cross-Origin policies: Enable for better isolation
	crossOriginEmbedderPolicy: 'require-corp', // Enables SharedArrayBuffer
	crossOriginOpenerPolicy: 'same-origin', // Prevents cross-origin window access
	crossOriginResourcePolicy: 'same-origin', // Prevents cross-origin resource loading

	// Origin-Agent-Cluster: Enable process isolation
	originAgentCluster: true
};

/**
 * Default security configuration
 * Selects development or production config based on environment
 */
export const defaultSecurityConfig = {
	development: developmentConfig,
	production: productionConfig
};

/**
 * Get security configuration for current environment
 */
export function getSecurityConfig(isDevelopment: boolean): Partial<SecurityHeadersConfig> {
	return isDevelopment ? developmentConfig : productionConfig;
}

import type { CSPReportConfig } from './types';

/**
 * Example CSP reporting configuration
 * Uncomment and configure if you want to receive CSP violation reports
 */
export const cspReportConfig: CSPReportConfig = {
	// reportUri: '/api/csp-report',
	// reportTo: 'csp-endpoint'
};

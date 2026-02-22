import { v4 as uuidv4 } from 'uuid';
import type { RequestEvent } from '@sveltejs/kit';

/**
 * Request context storage
 * Stores request-specific data that can be accessed throughout the request lifecycle
 */
export interface RequestContext {
	requestId: string;
	startTime: number;
	userId?: string;
	userEmail?: string;
	userRole?: string;
}

// Use event.locals to store request context
declare global {
	namespace App {
		interface Locals {
			requestId: string;
			startTime: number;
			userId?: string;
			userRole?: string;
		}
	}
}

/**
 * Generate unique request ID
 * Checks for existing X-Request-ID header or generates new UUID
 * 
 * @param event - SvelteKit request event
 * @returns Request ID
 */
export function generateRequestId(event: RequestEvent): string {
	// Check if request already has an ID (from load balancer, proxy, etc.)
	const existingId = event.request.headers.get('X-Request-ID') || 
	                   event.request.headers.get('X-Correlation-ID');

	if (existingId) {
		return existingId;
	}

	// Generate new UUID v4
	return uuidv4();
}

/**
 * Initialize request context
 * Sets up request ID and start time
 * 
 * @param event - SvelteKit request event
 */
export function initializeRequestContext(event: RequestEvent): void {
	event.locals.requestId = generateRequestId(event);
	event.locals.startTime = Date.now();
}

/**
 * Get request context from event
 * 
 * @param event - SvelteKit request event
 * @returns Request context
 */
export function getRequestContext(event: RequestEvent): RequestContext {
	return {
		requestId: event.locals.requestId,
		startTime: event.locals.startTime,
		userId: event.locals.userId,
		userRole: event.locals.userRole
	};
}

/**
 * Set user context
 * Call this after authentication to add user info to request context
 * 
 * @param event - SvelteKit request event
 * @param userId - User ID
 * @param userRole - User role
 */
export function setUserContext(
	event: RequestEvent,
	userId: string,
	userRole?: string
): void {
	event.locals.userId = userId;
	if (userRole) {
		event.locals.userRole = userRole;
	}
}

/**
 * Calculate request duration
 * 
 * @param event - SvelteKit request event
 * @returns Duration in milliseconds
 */
export function getRequestDuration(event: RequestEvent): number {
	return Date.now() - event.locals.startTime;
}

/**
 * Add request ID to response headers
 * 
 * @param headers - Response headers
 * @param requestId - Request ID
 */
export function addRequestIdHeader(headers: Headers, requestId: string): void {
	headers.set('X-Request-ID', requestId);
}

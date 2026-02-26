import type { ObjectId } from 'mongodb';

/**
 * RememberToken Model
 * 
 * Represents a persistent session token for "Remember Me" functionality.
 * Follows industry best practices for secure, long-lived authentication tokens.
 * 
 * Security Features:
 * - Tokens are hashed before storage (never store plain tokens)
 * - Device fingerprinting for additional security
 * - IP tracking for anomaly detection
 * - Token rotation on usage
 * - Configurable expiration (30-90 days typical)
 */
export interface RememberToken {
	_id?: ObjectId;
	
	/** User ID this token belongs to */
	userId: ObjectId;
	
	/** 
	 * bcrypt hashed version of the token
	 * The plain token is sent to the client as an httpOnly cookie
	 */
	tokenHash: string;
	
	/** 
	 * Selector - first part of the token for quick lookup
	 * Format: selector:validator (only validator is hashed)
	 */
	selector: string;
	
	/** Device fingerprint (User-Agent hash) */
	deviceFingerprint?: string;
	
	/** Device name/description for user reference */
	deviceName?: string;
	
	/** IP address when token was created */
	ipAddress?: string;
	
	/** Last IP address used with this token */
	lastUsedIp?: string;
	
	/** Token expiration date (typically 30-90 days) */
	expiresAt: Date;
	
	/** When the token was created */
	createdAt: Date;
	
	/** When the token was last used */
	lastUsedAt: Date;
	
	/** Whether this token has been revoked */
	isRevoked: boolean;
	
	/** Optional reason for revocation */
	revokedReason?: string;
	
	/** When the token was revoked */
	revokedAt?: Date;
}

/**
 * Request payload for creating a remember token
 */
export interface CreateRememberTokenRequest {
	userId: string;
	userAgent?: string;
	ipAddress?: string;
	expiresInDays?: number; // Default: 30 days
}

/**
 * Response when creating a remember token
 * The plainToken should be sent as an httpOnly cookie
 */
export interface RememberTokenResponse {
	/** The plain token to send to client (format: selector:validator) */
	plainToken: string;
	
	/** Token expiration date */
	expiresAt: Date;
	
	/** Device information */
	device?: {
		name: string;
		fingerprint: string;
	};
}

/**
 * Active session information for user display
 */
export interface ActiveSession {
	id: string;
	deviceName: string;
	ipAddress?: string;
	lastUsedAt: Date;
	createdAt: Date;
	isCurrent: boolean;
}

/**
 * Token validation result
 */
export interface TokenValidationResult {
	isValid: boolean;
	userId?: string;
	tokenId?: string;
	error?: 'EXPIRED' | 'REVOKED' | 'INVALID' | 'NOT_FOUND';
}

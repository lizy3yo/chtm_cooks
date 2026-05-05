import type { ObjectId } from 'mongodb';

/**
 * Failed Login Attempt
 * Persisted to MongoDB for audit and security monitoring.
 */
export interface FailedLoginAttempt {
	_id?: ObjectId;
	/** IP address of the requester */
	ip: string;
	/** Email that was attempted (or 'unknown' if not parseable) */
	email: string;
	/** Failure reason */
	reason: 'invalid_credentials' | 'account_inactive' | 'email_unverified' | 'rate_limited';
	/** Risk level derived from attempt pattern */
	risk: 'low' | 'medium' | 'high';
	/** When the attempt occurred */
	occurredAt: Date;
	/** User-Agent string */
	userAgent?: string;
}

/**
 * Security Settings Document
 * Singleton document stored in MongoDB (one per system).
 */
export interface SecuritySettingsDocument {
	_id?: ObjectId;
	/** Singleton key — always "global" */
	key: 'global';
	/** IP addresses that are blacklisted */
	blockedIPs: string[];
	/** Whether 2FA is required for admin accounts */
	require2FA: boolean;
	/** Session timeout in minutes */
	sessionTimeoutMinutes: number;
	/** Last updated timestamp */
	updatedAt: Date;
	/** Who last updated the settings */
	updatedBy?: string;
}

/** Default security settings */
export const DEFAULT_SECURITY_SETTINGS: Omit<SecuritySettingsDocument, '_id'> = {
	key: 'global',
	blockedIPs: [],
	require2FA: false,
	sessionTimeoutMinutes: 30,
	updatedAt: new Date()
};

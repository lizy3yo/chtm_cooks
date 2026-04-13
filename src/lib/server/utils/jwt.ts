import jwt, { type SignOptions } from 'jsonwebtoken';
import type { UserRole } from '../models/User';

// Environment variables with secure defaults
const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-change-in-production';
const JWT_REFRESH_SECRET = process.env.REFRESH_SECRET || 'fallback-refresh-secret';

// Industry-standard token lifetimes
const DEFAULT_ACCESS_TOKEN_EXPIRES_IN = '1h'; // 1 hour session timeout
const STAFF_ACCESS_TOKEN_EXPIRES_IN = '12h'; // Custodian/instructor session timeout
const REFRESH_TOKEN_EXPIRES_IN = '7d'; // 7 days - allows session renewal

export function getAccessTokenExpiresIn(role: UserRole): SignOptions['expiresIn'] {
	if (role === 'custodian' || role === 'instructor') {
		return STAFF_ACCESS_TOKEN_EXPIRES_IN;
	}

	return DEFAULT_ACCESS_TOKEN_EXPIRES_IN;
}

export interface JWTPayload {
	userId: string;
	email: string;
	role: UserRole;
}

/**
 * Generate access token (1 hour)
 * Used for API authentication
 */
export function generateAccessToken(payload: JWTPayload, expiresIn: SignOptions['expiresIn'] = getAccessTokenExpiresIn(payload.role)): string {
	return jwt.sign(payload, JWT_SECRET, { 
		expiresIn 
	} as SignOptions);
}

/**
 * Generate long-lived refresh token (7 days)
 * Used for renewing access tokens
 */
export function generateRefreshToken(payload: JWTPayload): string {
	return jwt.sign(payload, JWT_REFRESH_SECRET, { 
		expiresIn: REFRESH_TOKEN_EXPIRES_IN 
	} as SignOptions);
}

/**
 * Verify and decode access token
 * @throws jwt.JsonWebTokenError if invalid
 * @throws jwt.TokenExpiredError if expired
 */
export function verifyAccessToken(token: string): JWTPayload {
	return jwt.verify(token, JWT_SECRET) as JWTPayload;
}

/**
 * Verify and decode refresh token
 * @throws jwt.JsonWebTokenError if invalid
 * @throws jwt.TokenExpiredError if expired
 */
export function verifyRefreshToken(token: string): JWTPayload {
	return jwt.verify(token, JWT_REFRESH_SECRET) as JWTPayload;
}

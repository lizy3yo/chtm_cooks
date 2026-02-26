import jwt, { type SignOptions } from 'jsonwebtoken';
import type { UserRole } from '../models/User';

// Environment variables with secure defaults
const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-change-in-production';
const JWT_REFRESH_SECRET = process.env.REFRESH_SECRET || 'fallback-refresh-secret';

// Industry-standard token lifetimes
const ACCESS_TOKEN_EXPIRES_IN = '15m'; // 15 minutes - short-lived for security
const REFRESH_TOKEN_EXPIRES_IN = '7d'; // 7 days - allows session renewal

export interface JWTPayload {
	userId: string;
	email: string;
	role: UserRole;
}

/**
 * Generate short-lived access token (15 minutes)
 * Used for API authentication
 */
export function generateAccessToken(payload: JWTPayload): string {
	return jwt.sign(payload, JWT_SECRET, { 
		expiresIn: ACCESS_TOKEN_EXPIRES_IN 
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

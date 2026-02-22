import crypto from 'crypto';

/**
 * Generate a cryptographically secure random token
 * @param length - Length of the token in bytes (will be doubled when converted to hex)
 * @returns Hex string token
 */
export function generateSecureToken(length: number = 32): string {
	return crypto.randomBytes(length).toString('hex');
}

/**
 * Generate an email verification token and its expiration date
 * @param expiresInHours - Hours until token expires (default: 24 hours)
 * @returns Object containing token and expiration date
 */
export function generateEmailVerificationToken(expiresInHours: number = 24) {
	const token = generateSecureToken(32);
	const expires = new Date();
	expires.setHours(expires.getHours() + expiresInHours);

	return {
		token,
		expires
	};
}

/**
 * Generate a password reset token and its expiration date
 * @param expiresInHours - Hours until token expires (default: 1 hour)
 * @returns Object containing token and expiration date
 */
export function generatePasswordResetToken(expiresInHours: number = 1) {
	const token = generateSecureToken(32);
	const expires = new Date();
	expires.setHours(expires.getHours() + expiresInHours);

	return {
		token,
		expires
	};
}

/**
 * Hash a token for secure storage in database
 * Uses SHA256 to hash the token
 * @param token - Raw token to hash
 * @returns Hashed token
 */
export function hashToken(token: string): string {
	return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Verify if a token has expired
 * @param expiresAt - Expiration date to check
 * @returns True if token has expired
 */
export function isTokenExpired(expiresAt: Date): boolean {
	return new Date() > new Date(expiresAt);
}

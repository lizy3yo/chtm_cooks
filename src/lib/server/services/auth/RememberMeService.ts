import { getDatabase } from '$lib/server/db/mongodb';
import { ObjectId } from 'mongodb';
import { hashPassword, comparePassword } from '$lib/server/utils/password';
import crypto from 'crypto';
import type {
	RememberToken,
	CreateRememberTokenRequest,
	RememberTokenResponse,
	TokenValidationResult,
	ActiveSession
} from '$lib/server/models/RememberToken';
import type { DeviceInfo } from './types';
import { REMEMBER_ME_DEFAULTS } from './types';

/**
 * RememberMeService
 * 
 * Handles secure "Remember Me" functionality with industry best practices:
 * 
 * 1. Token Structure: Uses "selector:validator" pattern
 *    - Selector: Random string for database lookup (not secret)
 *    - Validator: Random string that's hashed before storage (secret)
 * 
 * 2. Security Features:
 *    - Stores only hashed tokens (bcrypt)
 *    - HttpOnly cookies prevent XSS attacks
 *    - Token rotation on each use
 *    - Device fingerprinting
 *    - IP tracking for anomaly detection
 *    - Configurable expiration
 *    - Ability to revoke tokens (logout from device)
 * 
 * 3. Performance:
 *    - Indexed lookups by selector
 *    - Automatic cleanup of expired tokens
 *    - Limits on tokens per user
 * 
 * Reference: OWASP Authentication Cheat Sheet
 * https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html
 */
export class RememberMeService {
	private readonly COLLECTION_NAME = 'remember_tokens';
	private indexesCreated = false;
	
	/**
	 * Ensure indexes are created (called automatically on first token creation)
	 * This handles the case where the collection doesn't exist yet at server startup
	 */
	private async ensureIndexes(): Promise<void> {
		if (this.indexesCreated) return;
		
		try {
			const db = await getDatabase();
			const collection = db.collection<RememberToken>(this.COLLECTION_NAME);
			
			// Create indexes for remember_tokens collection
			await Promise.all([
				// Selector + revoked status (critical for token lookup)
				collection.createIndex(
					{ selector: 1, isRevoked: 1 },
					{ name: 'idx_remember_tokens_selector_revoked' }
				),
				
				// User ID + active status (for listing user sessions)
				collection.createIndex(
					{ userId: 1, isRevoked: 1, expiresAt: 1 },
					{ name: 'idx_remember_tokens_user_active' }
				),
				
				// TTL index for automatic cleanup
				collection.createIndex(
					{ expiresAt: 1 },
					{ name: 'idx_remember_tokens_ttl', expireAfterSeconds: 0 }
				),
				
				// Revoked tokens cleanup index
				collection.createIndex(
					{ isRevoked: 1, revokedAt: 1 },
					{ 
						name: 'idx_remember_tokens_revoked_cleanup',
						partialFilterExpression: { isRevoked: true }
					}
				)
			]);
			
			this.indexesCreated = true;
			console.log('Remember tokens collection indexes created successfully');
		} catch (error) {
			// Log but don't fail - indexes might already exist
			console.warn('Could not create remember_tokens indexes:', error);
		}
	}
	
	/**
	 * Generate a cryptographically secure random token
	 * Format: selector:validator
	 * - Selector: 16 bytes (32 hex chars) - for DB lookup
	 * - Validator: 32 bytes (64 hex chars) - the secret part
	 */
	private generateToken(): { selector: string; validator: string; plainToken: string } {
		const selector = crypto.randomBytes(16).toString('hex');
		const validator = crypto.randomBytes(32).toString('hex');
		const plainToken = `${selector}:${validator}`;
		
		return { selector, validator, plainToken };
	}
	
	/**
	 * Parse a token into selector and validator parts
	 */
	private parseToken(token: string): { selector: string; validator: string } | null {
		const parts = token.split(':');
		if (parts.length !== 2) return null;
		
		const [selector, validator] = parts;
		if (!selector || !validator) return null;
		
		return { selector, validator };
	}
	
	/**
	 * Generate device fingerprint from User-Agent
	 */
	private generateDeviceFingerprint(userAgent: string): string {
		return crypto.createHash('sha256').update(userAgent).digest('hex');
	}
	
	/**
	 * Extract device name from User-Agent
	 */
	private extractDeviceName(userAgent?: string): string {
		if (!userAgent) return 'Unknown Device';
		
		// Simple device detection (you can use a library like ua-parser-js for better results)
		if (userAgent.includes('Mobile')) return 'Mobile Device';
		if (userAgent.includes('Tablet')) return 'Tablet';
		if (userAgent.includes('Windows')) return 'Windows PC';
		if (userAgent.includes('Mac')) return 'Mac';
		if (userAgent.includes('Linux')) return 'Linux PC';
		
		return 'Unknown Device';
	}
	
	/**
	 * Create a new remember-me token
	 * 
	 * @param request - Token creation parameters
	 * @returns The plain token and metadata (send token as httpOnly cookie)
	 */
	async createToken(request: CreateRememberTokenRequest): Promise<RememberTokenResponse> {
		const db = await getDatabase();
		const collection = db.collection<RememberToken>(this.COLLECTION_NAME);
		
		// Ensure indexes are created on first use
		await this.ensureIndexes();
		
		// Generate token components
		const { selector, validator, plainToken } = this.generateToken();
		
		// Hash the validator before storing
		const tokenHash = await hashPassword(validator);
		
		// Calculate expiration
		const expiresInDays = request.expiresInDays || REMEMBER_ME_DEFAULTS.EXPIRY_DAYS;
		const expiresAt = new Date();
		expiresAt.setDate(expiresAt.getDate() + expiresInDays);
		
		// Device information
		const deviceFingerprint = request.userAgent 
			? this.generateDeviceFingerprint(request.userAgent)
			: undefined;
		const deviceName = this.extractDeviceName(request.userAgent);
		
		// Create token document
		const token: RememberToken = {
			userId: new ObjectId(request.userId),
			tokenHash,
			selector,
			deviceFingerprint,
			deviceName,
			ipAddress: request.ipAddress,
			lastUsedIp: request.ipAddress,
			expiresAt,
			createdAt: new Date(),
			lastUsedAt: new Date(),
			isRevoked: false
		};
		
		// Check token limit per user
		await this.enforceTokenLimit(request.userId);
		
		// Insert token
		await collection.insertOne(token);
		
		return {
			plainToken,
			expiresAt,
			device: deviceFingerprint ? {
				name: deviceName,
				fingerprint: deviceFingerprint
			} : undefined
		};
	}
	
	/**
	 * Validate a remember-me token
	 * 
	 * @param plainToken - The token from the cookie
	 * @param deviceInfo - Current request device information
	 * @returns Validation result with user ID if valid
	 */
	async validateToken(
		plainToken: string,
		deviceInfo?: DeviceInfo
	): Promise<TokenValidationResult> {
		const db = await getDatabase();
		const collection = db.collection<RememberToken>(this.COLLECTION_NAME);
		
		// Parse token
		const parsed = this.parseToken(plainToken);
		if (!parsed) {
			return { isValid: false, error: 'INVALID' };
		}
		
		const { selector, validator } = parsed;
		
		// Find token by selector
		const token = await collection.findOne({
			selector,
			isRevoked: false
		});
		
		if (!token) {
			return { isValid: false, error: 'NOT_FOUND' };
		}
		
		// Check expiration
		if (token.expiresAt < new Date()) {
			// Delete expired token
			await collection.deleteOne({ _id: token._id });
			return { isValid: false, error: 'EXPIRED' };
		}
		
		// Verify token hash
		const isValid = await comparePassword(validator, token.tokenHash);
		if (!isValid) {
			// Invalid token - possible security breach, revoke all user tokens
			await this.revokeAllUserTokens(token.userId.toString());
			return { isValid: false, error: 'INVALID' };
		}
		
		// Update last used information
		await collection.updateOne(
			{ _id: token._id },
			{
				$set: {
					lastUsedAt: new Date(),
					lastUsedIp: deviceInfo?.ipAddress
				}
			}
		);
		
		return {
			isValid: true,
			userId: token.userId.toString(),
			tokenId: token._id!.toString()
		};
	}
	
	/**
	 * Rotate a token after successful validation
	 * This adds an extra layer of security by creating a new token
	 * and revoking the old one after each use.
	 * 
	 * @param oldTokenId - The ID of the token to rotate
	 * @param userId - User ID
	 * @param deviceInfo - Current device info
	 * @returns New token
	 */
	async rotateToken(
		oldTokenId: string,
		userId: string,
		deviceInfo?: DeviceInfo
	): Promise<RememberTokenResponse> {
		// Revoke old token
		await this.revokeToken(oldTokenId);
		
		// Create new token
		return this.createToken({
			userId,
			userAgent: deviceInfo?.userAgent,
			ipAddress: deviceInfo?.ipAddress
		});
	}
	
	/**
	 * Revoke a specific token (logout from device)
	 */
	async revokeToken(tokenId: string, reason?: string): Promise<boolean> {
		const db = await getDatabase();
		const collection = db.collection<RememberToken>(this.COLLECTION_NAME);
		
		const result = await collection.updateOne(
			{ _id: new ObjectId(tokenId) },
			{
				$set: {
					isRevoked: true,
					revokedReason: reason,
					revokedAt: new Date()
				}
			}
		);
		
		return result.modifiedCount > 0;
	}
	
	/**
	 * Revoke all tokens for a user (logout from all devices)
	 */
	async revokeAllUserTokens(userId: string, reason?: string): Promise<number> {
		const db = await getDatabase();
		const collection = db.collection<RememberToken>(this.COLLECTION_NAME);
		
		const result = await collection.updateMany(
			{ 
				userId: new ObjectId(userId),
				isRevoked: false
			},
			{
				$set: {
					isRevoked: true,
					revokedReason: reason || 'User logged out from all devices',
					revokedAt: new Date()
				}
			}
		);
		
		return result.modifiedCount;
	}
	
	/**
	 * Get all active sessions for a user
	 */
	async getUserSessions(userId: string, currentTokenId?: string): Promise<ActiveSession[]> {
		const db = await getDatabase();
		const collection = db.collection<RememberToken>(this.COLLECTION_NAME);
		
		const tokens = await collection
			.find({
				userId: new ObjectId(userId),
				isRevoked: false,
				expiresAt: { $gt: new Date() }
			})
			.sort({ lastUsedAt: -1 })
			.toArray();
		
		return tokens.map(token => ({
			id: token._id!.toString(),
			deviceName: token.deviceName || 'Unknown Device',
			ipAddress: token.lastUsedIp || token.ipAddress,
			lastUsedAt: token.lastUsedAt,
			createdAt: token.createdAt,
			isCurrent: token._id!.toString() === currentTokenId
		}));
	}
	
	/**
	 * Clean up expired and revoked tokens
	 * Should be run periodically (e.g., daily cron job)
	 */
	async cleanupExpiredTokens(): Promise<number> {
		const db = await getDatabase();
		const collection = db.collection<RememberToken>(this.COLLECTION_NAME);
		
		const result = await collection.deleteMany({
			$or: [
				{ expiresAt: { $lt: new Date() } },
				{ 
					isRevoked: true,
					revokedAt: { $lt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } // 30 days old
				}
			]
		});
		
		return result.deletedCount;
	}
	
	/**
	 * Enforce maximum number of tokens per user
	 * Removes oldest tokens if limit is exceeded
	 */
	private async enforceTokenLimit(userId: string): Promise<void> {
		const db = await getDatabase();
		const collection = db.collection<RememberToken>(this.COLLECTION_NAME);
		
		const tokens = await collection
			.find({
				userId: new ObjectId(userId),
				isRevoked: false,
				expiresAt: { $gt: new Date() }
			})
			.sort({ createdAt: -1 })
			.toArray();
		
		// If over limit, delete oldest tokens
		if (tokens.length >= REMEMBER_ME_DEFAULTS.MAX_SESSIONS_PER_USER) {
			const tokensToDelete = tokens.slice(REMEMBER_ME_DEFAULTS.MAX_SESSIONS_PER_USER - 1);
			const idsToDelete = tokensToDelete.map(t => t._id);
			
			await collection.deleteMany({
				_id: { $in: idsToDelete }
			});
		}
	}
	
	/**
	 * Get token by selector (for internal use)
	 */
	async getTokenBySelector(selector: string): Promise<RememberToken | null> {
		const db = await getDatabase();
		const collection = db.collection<RememberToken>(this.COLLECTION_NAME);
		
		return collection.findOne({ selector });
	}
}

// Export singleton instance
export const rememberMeService = new RememberMeService();

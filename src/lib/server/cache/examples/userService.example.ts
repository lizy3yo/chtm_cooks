/**
 * Example: User Service with Caching
 * 
 * Demonstrates how to integrate caching into your data services
 */

import { cacheService, TTL_PRESETS, CACHE_PREFIXES, CACHE_TAGS } from '$lib/server/cache';
import type { User } from '$lib/server/models/User';
import { logger } from '$lib/server/utils/logger';

/**
 * User Service with integrated caching
 */
export class CachedUserService {
	/**
	 * Get user by ID with caching
	 */
	static async getUserById(userId: string): Promise<User | null> {
		const cacheKey = `${CACHE_PREFIXES.USER}:${userId}`;

		try {
			// Try cache first
			const cached = await cacheService.get<User>(cacheKey);
			if (cached) {
				logger.debug('User fetched from cache', { userId });
				return cached;
			}

			// Cache miss - fetch from database
			// Replace with your actual database call
			const user = await this.fetchUserFromDB(userId);
			
			if (user) {
				// Store in cache
				await cacheService.set(cacheKey, user, {
					ttl: TTL_PRESETS.LONG,
					tags: [CACHE_TAGS.USER_DATA, CACHE_TAGS.USER_PROFILE]
				});
				logger.debug('User cached', { userId });
			}

			return user;
		} catch (error) {
			logger.error('Error fetching user', { userId, error });
			return null;
		}
	}

	/**
	 * Get multiple users with caching (batch operation)
	 */
	static async getUsersByIds(userIds: string[]): Promise<(User | null)[]> {
		const cacheKeys = userIds.map(id => `${CACHE_PREFIXES.USER}:${id}`);

		try {
			// Try to get all from cache
			const cachedUsers = await cacheService.getMany<User>(cacheKeys);

			// Find which users are missing
			const missingIndices: number[] = [];
			cachedUsers.forEach((user: User | null, index: number) => {
				if (!user) {
					missingIndices.push(index);
				}
			});

			// Fetch missing users from database
			if (missingIndices.length > 0) {
				const missingIds = missingIndices.map(i => userIds[i]);
				const fetchedUsers = await this.fetchUsersFromDB(missingIds);

				// Cache the fetched users
				const cacheEntries = fetchedUsers.map((user, idx) => ({
					key: `${CACHE_PREFIXES.USER}:${missingIds[idx]}`,
					value: user,
					ttl: TTL_PRESETS.LONG
				}));

				await cacheService.setMany(cacheEntries);

				// Merge results
				missingIndices.forEach((originalIndex, fetchedIndex) => {
					cachedUsers[originalIndex] = fetchedUsers[fetchedIndex];
				});
			}

			return cachedUsers;
		} catch (error) {
			logger.error('Error fetching users', { userIds, error });
			return userIds.map(() => null);
		}
	}

	/**
	 * Update user and invalidate cache
	 */
	static async updateUser(userId: string, updates: Partial<User>): Promise<boolean> {
		try {
			// Update in database
			const updated = await this.updateUserInDB(userId, updates);

			if (updated) {
				// Invalidate cache
				await this.invalidateUserCache(userId);
				logger.info('User updated and cache invalidated', { userId });
			}

			return updated;
		} catch (error) {
			logger.error('Error updating user', { userId, error });
			return false;
		}
	}

	/**
	 * Delete user and invalidate cache
	 */
	static async deleteUser(userId: string): Promise<boolean> {
		try {
			// Delete from database
			const deleted = await this.deleteUserFromDB(userId);

			if (deleted) {
				// Invalidate cache
				await this.invalidateUserCache(userId);
				logger.info('User deleted and cache invalidated', { userId });
			}

			return deleted;
		} catch (error) {
			logger.error('Error deleting user', { userId, error });
			return false;
		}
	}

	/**
	 * Invalidate cache for a specific user
	 */
	static async invalidateUserCache(userId: string): Promise<void> {
		const cacheKey = `${CACHE_PREFIXES.USER}:${userId}`;
		await cacheService.delete(cacheKey);
		
		// Also invalidate any related caches
		await cacheService.deletePattern(`${CACHE_PREFIXES.USER}:${userId}:*`);
	}

	/**
	 * Invalidate all user caches (use with caution)
	 */
	static async invalidateAllUserCaches(): Promise<void> {
		// Invalidate by tags
		await cacheService.invalidateByTags([
			CACHE_TAGS.USER_DATA,
			CACHE_TAGS.USER_PROFILE
		]);
		
		logger.info('All user caches invalidated');
	}

	/**
	 * Get user profile with extended caching
	 */
	static async getUserProfile(userId: string): Promise<any> {
		const cacheKey = `${CACHE_PREFIXES.USER}:${userId}:profile`;

		// Use the wrap method for cleaner code
		const result = await cacheService.wrap(
			cacheKey,
			async () => {
				// Fetch user and additional profile data
				const user = await this.fetchUserFromDB(userId);
				if (!user) return null;

				// Fetch additional profile data
				const profileData = await this.fetchUserProfileData(userId);

				return {
					...user,
					...profileData
				};
			},
			{
				ttl: TTL_PRESETS.MEDIUM,
				tags: [CACHE_TAGS.USER_PROFILE]
			}
		);

		return result.data;
	}

	/**
	 * Search users with caching
	 * Cache search results for common queries
	 */
	static async searchUsers(query: string, options: any = {}): Promise<User[]> {
		// Create a cache key based on search parameters
		const cacheKey = `${CACHE_PREFIXES.QUERY}:users:${query}:${JSON.stringify(options)}`;

		const result = await cacheService.wrap(
			cacheKey,
			() => this.searchUsersInDB(query, options),
			{
				ttl: TTL_PRESETS.SHORT, // Shorter TTL for search results
				tags: [CACHE_TAGS.USER_DATA]
			}
		);

		return result.data || [];
	}

	// ============================================
	// Database operations (replace with your actual implementation)
	// ============================================

	private static async fetchUserFromDB(userId: string): Promise<User | null> {
		// TODO: Replace with your actual database call
		// Example: return await db.users.findById(userId);
		return null;
	}

	private static async fetchUsersFromDB(userIds: string[]): Promise<(User | null)[]> {
		// TODO: Replace with your actual database call
		// Example: return await db.users.findByIds(userIds);
		return userIds.map(() => null);
	}

	private static async updateUserInDB(userId: string, updates: Partial<User>): Promise<boolean> {
		// TODO: Replace with your actual database call
		// Example: return await db.users.update(userId, updates);
		return false;
	}

	private static async deleteUserFromDB(userId: string): Promise<boolean> {
		// TODO: Replace with your actual database call
		// Example: return await db.users.delete(userId);
		return false;
	}

	private static async fetchUserProfileData(userId: string): Promise<any> {
		// TODO: Replace with your actual profile data fetch
		return {};
	}

	private static async searchUsersInDB(query: string, options: any): Promise<User[]> {
		// TODO: Replace with your actual search implementation
		return [];
	}
}

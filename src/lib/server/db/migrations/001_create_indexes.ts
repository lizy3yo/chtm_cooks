/**
 * Database Migration: Create Initial Indexes
 * 
 * Migration ID: 001
 * Description: Creates all defined indexes for the users collection
 * 
 * Run this migration to set up indexes for optimal query performance
 */

import { indexManager } from '../indexes';
import { userIndexes } from '../indexes/definitions';
import { logInfo, logError } from '$lib/server/utils/logger';

/**
 * Apply migration (create indexes)
 */
export async function up(): Promise<void> {
	try {
		logInfo('Running migration 001: Create initial indexes');

		const result = await indexManager.createIndexes(userIndexes);

		logInfo(`Migration 001 completed:`, {
			created: result.created,
			existed: result.existed,
			failed: result.failed,
			duration: `${result.totalExecutionTimeMs}ms`
		});

		if (result.failed > 0) {
			throw new Error(`Failed to create ${result.failed} indexes`);
		}
	} catch (error) {
		logError(error as Error, {
			context: 'migration_001_up'
		});
		throw error;
	}
}

/**
 * Rollback migration (drop indexes)
 */
export async function down(): Promise<void> {
	try {
		logInfo('Rolling back migration 001: Drop indexes');

		// Drop all indexes except _id (MongoDB won't let you drop _id anyway)
		await indexManager.dropAllIndexes('users');

		logInfo('Migration 001 rolled back successfully');
	} catch (error) {
		logError(error as Error, {
			context: 'migration_001_down'
		});
		throw error;
	}
}

/**
 * Migration metadata
 */
export const migration = {
	id: '001_create_indexes',
	version: 1,
	description: 'Create initial indexes for users collection',
	up,
	down
};

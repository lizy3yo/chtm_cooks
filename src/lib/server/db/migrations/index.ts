/**
 * Database Migrations Index
 * Central registry for all database migrations
 */

import * as migration001 from './001_create_indexes';

/**
 * All migrations in execution order
 */
export const migrations = [migration001.migration];

/**
 * Get migration by ID
 */
export function getMigration(id: string) {
	return migrations.find((m) => m.id === id);
}

/**
 * Run all migrations
 */
export async function runAllMigrations(): Promise<void> {
	for (const migration of migrations) {
		console.log(`Running migration: ${migration.id}`);
		await migration.up();
	}
}

/**
 * Rollback all migrations
 */
export async function rollbackAllMigrations(): Promise<void> {
	// Rollback in reverse order
	for (const migration of migrations.reverse()) {
		console.log(`Rolling back migration: ${migration.id}`);
		await migration.down();
	}
}

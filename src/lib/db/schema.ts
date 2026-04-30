/**
 * IndexedDB Schema for CHTM Cooks Offline-First Architecture
 * 
 * Industry Standard: Follows Dexie.js best practices and PWA offline patterns
 * Version: 1.0.0
 * 
 * @see https://dexie.org/
 */

import Dexie, { type EntityTable } from 'dexie';

// ────────────────────────────────────────────────────────────────────────────────
// Type Definitions
// ────────────────────────────────────────────────────────────────────────────────

/**
 * Cached catalog item from server
 */
export interface CachedCatalogItem {
	_id: string;
	name: string;
	category: string;
	quantity: number;
	available: number;
	imageUrl?: string;
	description?: string;
	unit?: string;
	location?: string;
	lastSynced: number; // Unix timestamp
	_version?: number; // For conflict resolution
}

/**
 * Cached borrow request
 */
export interface CachedBorrowRequest {
	_id: string;
	studentId: string;
	studentName?: string;
	items: Array<{
		catalogId: string;
		catalogName?: string;
		quantity: number;
	}>;
	status: 'pending' | 'approved' | 'rejected' | 'returned' | 'overdue';
	purpose?: string;
	expectedReturnDate?: string;
	actualReturnDate?: string;
	qrCode?: string;
	createdAt: number;
	updatedAt: number;
	lastSynced: number;
	_offline?: boolean; // Created while offline
	_version?: number; // For conflict resolution
}

/**
 * Cached inventory item
 */
export interface CachedInventoryItem {
	_id: string;
	catalogId: string;
	serialNumber?: string;
	status: 'available' | 'borrowed' | 'maintenance' | 'retired';
	condition?: string;
	notes?: string;
	lastSynced: number;
	_version?: number;
}

/**
 * Cached donation record
 */
export interface CachedDonation {
	_id: string;
	donorName: string;
	donorEmail?: string;
	items: Array<{
		name: string;
		quantity: number;
		category?: string;
	}>;
	status: 'pending' | 'approved' | 'rejected';
	notes?: string;
	createdAt: number;
	lastSynced: number;
	_offline?: boolean;
	_version?: number;
}

/**
 * Cached user profile
 */
export interface CachedUser {
	_id: string;
	email: string;
	firstName: string;
	lastName: string;
	role: 'student' | 'instructor' | 'custodian' | 'superadmin';
	studentId?: string;
	section?: string;
	profilePhotoUrl?: string;
	trustScore?: number;
	lastSynced: number;
	_version?: number;
}

/**
 * Cached analytics data
 */
export interface CachedAnalytics {
	key: string; // e.g., "student-stats:userId:semester"
	data: any;
	createdAt: number;
	expiresAt: number;
	lastSynced: number;
}

/**
 * Queued action for offline operations
 */
export interface QueuedAction {
	id?: number; // Auto-increment
	type:
		| 'CREATE_REQUEST'
		| 'UPDATE_REQUEST'
		| 'CANCEL_REQUEST'
		| 'APPROVE_REQUEST'
		| 'REJECT_REQUEST'
		| 'RETURN_REQUEST'
		| 'CREATE_DONATION'
		| 'UPDATE_INVENTORY'
		| 'UPDATE_PROFILE'
		| 'DELETE_ITEM';
	endpoint: string; // API endpoint
	method: 'POST' | 'PUT' | 'PATCH' | 'DELETE';
	payload: any;
	timestamp: number;
	retries: number;
	maxRetries: number;
	error?: string;
	userId?: string; // For tracking
}

/**
 * Sync metadata for tracking sync state
 */
export interface SyncMetadata {
	key: string; // e.g., "catalog", "requests", "inventory"
	lastSync: number;
	status: 'idle' | 'syncing' | 'error';
	errorMessage?: string;
	recordCount?: number;
}

/**
 * Conflict record for manual resolution
 */
export interface ConflictRecord {
	id?: number;
	entityType: 'request' | 'inventory' | 'donation' | 'user';
	entityId: string;
	localVersion: any;
	serverVersion: any;
	timestamp: number;
	resolved: boolean;
}

// ────────────────────────────────────────────────────────────────────────────────
// Database Class
// ────────────────────────────────────────────────────────────────────────────────

/**
 * CHTM Cooks Offline Database
 * 
 * Industry Standard: Implements offline-first patterns with:
 * - Optimistic updates
 * - Conflict resolution
 * - Background sync
 * - Data versioning
 */
export class CHTMCooksDatabase extends Dexie {
	// Tables
	catalog!: EntityTable<CachedCatalogItem, '_id'>;
	requests!: EntityTable<CachedBorrowRequest, '_id'>;
	inventory!: EntityTable<CachedInventoryItem, '_id'>;
	donations!: EntityTable<CachedDonation, '_id'>;
	users!: EntityTable<CachedUser, '_id'>;
	analytics!: EntityTable<CachedAnalytics, 'key'>;
	queue!: EntityTable<QueuedAction, 'id'>;
	syncMeta!: EntityTable<SyncMetadata, 'key'>;
	conflicts!: EntityTable<ConflictRecord, 'id'>;

	constructor() {
		super('CHTMCooksDB');

		// Version 1: Initial schema
		this.version(1).stores({
			catalog: '_id, category, name, lastSynced',
			requests: '_id, studentId, status, createdAt, lastSynced, _offline',
			inventory: '_id, catalogId, status, lastSynced',
			donations: '_id, status, createdAt, lastSynced, _offline',
			users: '_id, email, role, lastSynced',
			analytics: 'key, expiresAt, lastSynced',
			queue: '++id, type, timestamp, userId',
			syncMeta: 'key, lastSync, status',
			conflicts: '++id, entityType, entityId, timestamp, resolved'
		});
	}

	/**
	 * Clear all cached data (logout, reset)
	 */
	async clearAllData(): Promise<void> {
		await Promise.all([
			this.catalog.clear(),
			this.requests.clear(),
			this.inventory.clear(),
			this.donations.clear(),
			this.users.clear(),
			this.analytics.clear(),
			this.queue.clear(),
			this.syncMeta.clear(),
			this.conflicts.clear()
		]);
	}

	/**
	 * Clear expired analytics cache
	 */
	async clearExpiredAnalytics(): Promise<void> {
		const now = Date.now();
		await this.analytics.where('expiresAt').below(now).delete();
	}

	/**
	 * Get database size estimate (in bytes)
	 */
	async getStorageEstimate(): Promise<{ usage: number; quota: number }> {
		if ('storage' in navigator && 'estimate' in navigator.storage) {
			const estimate = await navigator.storage.estimate();
			return {
				usage: estimate.usage || 0,
				quota: estimate.quota || 0
			};
		}
		return { usage: 0, quota: 0 };
	}

	/**
	 * Export database for backup
	 */
	async exportDatabase(): Promise<Blob> {
		const { exportDB } = await import('dexie-export-import');
		return await exportDB(this);
	}

	/**
	 * Import database from backup
	 */
	async importDatabase(blob: Blob): Promise<void> {
		const { importDB } = await import('dexie-export-import');
		await importDB(blob);
	}
}

// ────────────────────────────────────────────────────────────────────────────────
// Singleton Instance
// ────────────────────────────────────────────────────────────────────────────────

/**
 * Global database instance
 * Industry Standard: Singleton pattern for database access
 */
export const db = new CHTMCooksDatabase();

// ────────────────────────────────────────────────────────────────────────────────
// Database Utilities
// ────────────────────────────────────────────────────────────────────────────────

/**
 * Initialize database and perform cleanup
 */
export async function initializeDatabase(): Promise<void> {
	try {
		// Open database
		await db.open();

		// Clear expired analytics
		await db.clearExpiredAnalytics();

		console.log('[DB] Database initialized successfully');
	} catch (error) {
		console.error('[DB] Failed to initialize database:', error);
		throw error;
	}
}

/**
 * Check if database is available
 */
export function isDatabaseAvailable(): boolean {
	return 'indexedDB' in window;
}

/**
 * Get storage usage percentage
 */
export async function getStorageUsagePercentage(): Promise<number> {
	const { usage, quota } = await db.getStorageEstimate();
	if (quota === 0) return 0;
	return (usage / quota) * 100;
}

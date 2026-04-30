/**
 * Offline-First Sync Service
 * 
 * Industry Standard: Implements background sync, conflict resolution,
 * and retry logic following PWA best practices
 * 
 * @see https://web.dev/offline-cookbook/
 */

import { writable, derived, get } from 'svelte/store';
import { browser } from '$app/environment';
import { db, type QueuedAction } from '$lib/db/schema';

// ────────────────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────────────────

export interface SyncStatus {
	online: boolean;
	syncing: boolean;
	lastSync: number | null;
	pendingActions: number;
	error: string | null;
}

export interface SyncResult {
	success: boolean;
	syncedActions: number;
	failedActions: number;
	errors: string[];
}

// ────────────────────────────────────────────────────────────────────────────────
// Stores
// ────────────────────────────────────────────────────────────────────────────────

/**
 * Sync status store
 * Industry Standard: Reactive state management for sync operations
 */
export const syncStatus = writable<SyncStatus>({
	online: browser ? navigator.onLine : true,
	syncing: false,
	lastSync: null,
	pendingActions: 0,
	error: null
});

/**
 * Derived store: Is app ready for offline use?
 */
export const isOfflineReady = derived(syncStatus, ($status) => {
	return $status.lastSync !== null;
});

// ────────────────────────────────────────────────────────────────────────────────
// Network Detection
// ────────────────────────────────────────────────────────────────────────────────

if (browser) {
	// Online event
	window.addEventListener('online', () => {
		console.log('[Sync] Network online');
		syncStatus.update((s) => ({ ...s, online: true, error: null }));
		// Auto-sync when back online
		setTimeout(() => syncAll(), 1000);
	});

	// Offline event
	window.addEventListener('offline', () => {
		console.log('[Sync] Network offline');
		syncStatus.update((s) => ({ ...s, online: false }));
	});

	// Visibility change (app becomes visible)
	document.addEventListener('visibilitychange', () => {
		if (!document.hidden && navigator.onLine) {
			const status = get(syncStatus);
			const timeSinceLastSync = status.lastSync ? Date.now() - status.lastSync : Infinity;
			// Sync if more than 5 minutes since last sync
			if (timeSinceLastSync > 5 * 60 * 1000) {
				syncAll();
			}
		}
	});
}

// ────────────────────────────────────────────────────────────────────────────────
// Queue Management
// ────────────────────────────────────────────────────────────────────────────────

/**
 * Add action to sync queue
 * Industry Standard: Optimistic updates with background sync
 */
export async function queueAction(
	type: QueuedAction['type'],
	endpoint: string,
	method: QueuedAction['method'],
	payload: any,
	userId?: string
): Promise<void> {
	try {
		await db.queue.add({
			type,
			endpoint,
			method,
			payload,
			timestamp: Date.now(),
			retries: 0,
			maxRetries: 3,
			userId
		});

		await updatePendingCount();

		console.log(`[Sync] Queued action: ${type}`);

		// Try to sync immediately if online
		if (get(syncStatus).online && !get(syncStatus).syncing) {
			syncAll();
		}
	} catch (error) {
		console.error('[Sync] Failed to queue action:', error);
		throw error;
	}
}

/**
 * Update pending action count
 */
async function updatePendingCount(): Promise<void> {
	try {
		const count = await db.queue.count();
		syncStatus.update((s) => ({ ...s, pendingActions: count }));
	} catch (error) {
		console.error('[Sync] Failed to update pending count:', error);
	}
}

/**
 * Clear all pending actions (use with caution)
 */
export async function clearQueue(): Promise<void> {
	await db.queue.clear();
	await updatePendingCount();
	console.log('[Sync] Queue cleared');
}

// ────────────────────────────────────────────────────────────────────────────────
// Sync Operations
// ────────────────────────────────────────────────────────────────────────────────

/**
 * Sync all data
 * Industry Standard: Comprehensive sync with error handling
 */
export async function syncAll(): Promise<SyncResult> {
	if (!browser || !navigator.onLine) {
		return {
			success: false,
			syncedActions: 0,
			failedActions: 0,
			errors: ['Offline']
		};
	}

	const status = get(syncStatus);
	if (status.syncing) {
		console.log('[Sync] Sync already in progress');
		return {
			success: false,
			syncedActions: 0,
			failedActions: 0,
			errors: ['Sync in progress']
		};
	}

	syncStatus.update((s) => ({ ...s, syncing: true, error: null }));
	console.log('[Sync] Starting sync...');

	const errors: string[] = [];
	let syncedActions = 0;
	let failedActions = 0;

	try {
		// Step 1: Process queued actions (writes)
		const queueResult = await processQueue();
		syncedActions += queueResult.synced;
		failedActions += queueResult.failed;
		errors.push(...queueResult.errors);

		// Step 2: Pull fresh data from server (reads)
		await Promise.allSettled([
			syncCatalog(),
			syncRequests(),
			syncInventory(),
			syncDonations()
		]);

		syncStatus.update((s) => ({
			...s,
			syncing: false,
			lastSync: Date.now(),
			error: errors.length > 0 ? errors[0] : null
		}));

		console.log(`[Sync] Sync completed: ${syncedActions} synced, ${failedActions} failed`);

		return {
			success: failedActions === 0,
			syncedActions,
			failedActions,
			errors
		};
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : 'Unknown error';
		console.error('[Sync] Sync failed:', error);

		syncStatus.update((s) => ({
			...s,
			syncing: false,
			error: errorMessage
		}));

		return {
			success: false,
			syncedActions,
			failedActions,
			errors: [errorMessage]
		};
	}
}

/**
 * Process action queue
 */
async function processQueue(): Promise<{ synced: number; failed: number; errors: string[] }> {
	const actions = await db.queue.orderBy('timestamp').toArray();
	let synced = 0;
	let failed = 0;
	const errors: string[] = [];

	console.log(`[Sync] Processing ${actions.length} queued actions`);

	for (const action of actions) {
		try {
			await executeAction(action);
			await db.queue.delete(action.id!);
			synced++;
			console.log(`[Sync] Action executed: ${action.type}`);
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : 'Unknown error';
			console.error(`[Sync] Action failed: ${action.type}`, error);

			// Retry logic
			if (action.retries < action.maxRetries) {
				await db.queue.update(action.id!, {
					retries: action.retries + 1,
					error: errorMessage
				});
				console.log(`[Sync] Action will retry (${action.retries + 1}/${action.maxRetries})`);
			} else {
				// Max retries reached, move to conflicts
				await db.conflicts.add({
					entityType: 'request', // Default, should be determined by action type
					entityId: action.payload._id || 'unknown',
					localVersion: action.payload,
					serverVersion: null,
					timestamp: Date.now(),
					resolved: false
				});
				await db.queue.delete(action.id!);
				failed++;
				errors.push(`${action.type}: ${errorMessage}`);
				console.error(`[Sync] Action failed permanently: ${action.type}`);
			}
		}
	}

	await updatePendingCount();

	return { synced, failed, errors };
}

/**
 * Execute a queued action
 */
async function executeAction(action: QueuedAction): Promise<any> {
	const token = localStorage.getItem('auth_token');

	if (!token) {
		throw new Error('No auth token available');
	}

	const response = await fetch(action.endpoint, {
		method: action.method,
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${token}`
		},
		body: JSON.stringify(action.payload)
	});

	if (!response.ok) {
		const errorText = await response.text();
		throw new Error(`HTTP ${response.status}: ${errorText}`);
	}

	const result = await response.json();

	// Update local cache with server response
	await updateLocalCacheAfterSync(action, result);

	return result;
}

/**
 * Update local cache after successful sync
 */
async function updateLocalCacheAfterSync(action: QueuedAction, serverResponse: any): Promise<void> {
	try {
		switch (action.type) {
			case 'CREATE_REQUEST':
				// Update local request with server ID
				if (serverResponse._id) {
					await db.requests.put({
						...action.payload,
						_id: serverResponse._id,
						lastSynced: Date.now(),
						_offline: false
					});
				}
				break;

			case 'UPDATE_REQUEST':
			case 'APPROVE_REQUEST':
			case 'REJECT_REQUEST':
			case 'RETURN_REQUEST':
				// Update request in cache
				if (serverResponse._id) {
					await db.requests.put({
						...serverResponse,
						lastSynced: Date.now()
					});
				}
				break;

			case 'CREATE_DONATION':
				if (serverResponse._id) {
					await db.donations.put({
						...serverResponse,
						lastSynced: Date.now(),
						_offline: false
					});
				}
				break;

			case 'UPDATE_INVENTORY':
				if (serverResponse._id) {
					await db.inventory.put({
						...serverResponse,
						lastSynced: Date.now()
					});
				}
				break;
		}
	} catch (error) {
		console.error('[Sync] Failed to update local cache:', error);
	}
}

// ────────────────────────────────────────────────────────────────────────────────
// Entity Sync Functions
// ────────────────────────────────────────────────────────────────────────────────

/**
 * Sync catalog from server
 */
async function syncCatalog(): Promise<void> {
	try {
		const token = localStorage.getItem('auth_token');
		if (!token) return;

		const response = await fetch('/api/catalog', {
			headers: { Authorization: `Bearer ${token}` }
		});

		if (!response.ok) throw new Error(`HTTP ${response.status}`);

		const items = await response.json();

		// Bulk update cache
		await db.catalog.bulkPut(
			items.map((item: any) => ({
				...item,
				lastSynced: Date.now(),
				_version: item._version || 1
			}))
		);

		await db.syncMeta.put({
			key: 'catalog',
			lastSync: Date.now(),
			status: 'idle',
			recordCount: items.length
		});

		console.log(`[Sync] Catalog synced: ${items.length} items`);
	} catch (error) {
		console.error('[Sync] Failed to sync catalog:', error);
		await db.syncMeta.put({
			key: 'catalog',
			lastSync: Date.now(),
			status: 'error',
			errorMessage: error instanceof Error ? error.message : 'Unknown error'
		});
	}
}

/**
 * Sync requests from server
 */
async function syncRequests(): Promise<void> {
	try {
		const token = localStorage.getItem('auth_token');
		if (!token) return;

		const response = await fetch('/api/borrow-requests', {
			headers: { Authorization: `Bearer ${token}` }
		});

		if (!response.ok) throw new Error(`HTTP ${response.status}`);

		const requests = await response.json();

		// Bulk update cache
		await db.requests.bulkPut(
			requests.map((req: any) => ({
				...req,
				lastSynced: Date.now(),
				_offline: false,
				_version: req._version || 1
			}))
		);

		await db.syncMeta.put({
			key: 'requests',
			lastSync: Date.now(),
			status: 'idle',
			recordCount: requests.length
		});

		console.log(`[Sync] Requests synced: ${requests.length} items`);
	} catch (error) {
		console.error('[Sync] Failed to sync requests:', error);
		await db.syncMeta.put({
			key: 'requests',
			lastSync: Date.now(),
			status: 'error',
			errorMessage: error instanceof Error ? error.message : 'Unknown error'
		});
	}
}

/**
 * Sync inventory from server
 */
async function syncInventory(): Promise<void> {
	try {
		const token = localStorage.getItem('auth_token');
		if (!token) return;

		const response = await fetch('/api/inventory', {
			headers: { Authorization: `Bearer ${token}` }
		});

		if (!response.ok) throw new Error(`HTTP ${response.status}`);

		const items = await response.json();

		await db.inventory.bulkPut(
			items.map((item: any) => ({
				...item,
				lastSynced: Date.now(),
				_version: item._version || 1
			}))
		);

		await db.syncMeta.put({
			key: 'inventory',
			lastSync: Date.now(),
			status: 'idle',
			recordCount: items.length
		});

		console.log(`[Sync] Inventory synced: ${items.length} items`);
	} catch (error) {
		console.error('[Sync] Failed to sync inventory:', error);
	}
}

/**
 * Sync donations from server
 */
async function syncDonations(): Promise<void> {
	try {
		const token = localStorage.getItem('auth_token');
		if (!token) return;

		const response = await fetch('/api/donations', {
			headers: { Authorization: `Bearer ${token}` }
		});

		if (!response.ok) throw new Error(`HTTP ${response.status}`);

		const donations = await response.json();

		await db.donations.bulkPut(
			donations.map((donation: any) => ({
				...donation,
				lastSynced: Date.now(),
				_offline: false,
				_version: donation._version || 1
			}))
		);

		await db.syncMeta.put({
			key: 'donations',
			lastSync: Date.now(),
			status: 'idle',
			recordCount: donations.length
		});

		console.log(`[Sync] Donations synced: ${donations.length} items`);
	} catch (error) {
		console.error('[Sync] Failed to sync donations:', error);
	}
}

// ────────────────────────────────────────────────────────────────────────────────
// Initialization
// ────────────────────────────────────────────────────────────────────────────────

/**
 * Initialize sync service
 * Industry Standard: Auto-sync on app load and periodic intervals
 */
export async function initializeSyncService(): Promise<void> {
	if (!browser) return;

	console.log('[Sync] Initializing sync service...');

	// Initial sync
	await syncAll();

	// Periodic sync every 5 minutes
	setInterval(() => {
		if (navigator.onLine && !get(syncStatus).syncing) {
			syncAll();
		}
	}, 5 * 60 * 1000);

	// Update pending count on init
	await updatePendingCount();

	console.log('[Sync] Sync service initialized');
}

// ────────────────────────────────────────────────────────────────────────────────
// Utility Functions
// ────────────────────────────────────────────────────────────────────────────────

/**
 * Force sync now (manual trigger)
 */
export async function forceSyncNow(): Promise<SyncResult> {
	console.log('[Sync] Force sync triggered');
	return await syncAll();
}

/**
 * Get sync statistics
 */
export async function getSyncStats(): Promise<{
	pendingActions: number;
	unresolvedConflicts: number;
	lastSyncTime: number | null;
	cacheSize: { catalog: number; requests: number; inventory: number; donations: number };
}> {
	const [pendingActions, unresolvedConflicts, catalogCount, requestsCount, inventoryCount, donationsCount] =
		await Promise.all([
			db.queue.count(),
			db.conflicts.where('resolved').equals(0).count(),
			db.catalog.count(),
			db.requests.count(),
			db.inventory.count(),
			db.donations.count()
		]);

	return {
		pendingActions,
		unresolvedConflicts,
		lastSyncTime: get(syncStatus).lastSync,
		cacheSize: {
			catalog: catalogCount,
			requests: requestsCount,
			inventory: inventoryCount,
			donations: donationsCount
		}
	};
}

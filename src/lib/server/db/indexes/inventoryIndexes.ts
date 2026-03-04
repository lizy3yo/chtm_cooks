import { getDatabase } from '../mongodb';
import { logger } from '../../utils/logger';

/**
 * Create indexes for inventory_history collection
 * For optimized querying of audit logs
 */
export async function createInventoryHistoryIndexes() {
	const db = await getDatabase();
	const collection = db.collection('inventory_history');

	try {
		await collection.createIndexes([
			// Index on timestamp for time-based queries (DESC for recent first)
			{ key: { timestamp: -1 }, name: 'idx_timestamp_desc' },
			
			// Compound index for filtering by action and timestamp
			{ key: { action: 1, timestamp: -1 }, name: 'idx_action_timestamp' },
			
			// Compound index for entity type and timestamp
			{ key: { entityType: 1, timestamp: -1 }, name: 'idx_entitytype_timestamp' },
			
			// Index for specific entity lookups
			{ key: { entityId: 1, timestamp: -1 }, name: 'idx_entityid_timestamp' },
			
			// Index for user activity tracking
			{ key: { userId: 1, timestamp: -1 }, name: 'idx_userid_timestamp' },
			
			// TTL index to auto-delete logs after 1 year (optional)
			{
				key: { timestamp: 1 },
				name: 'idx_timestamp_ttl',
				expireAfterSeconds: 31536000 // 365 days
			}
		]);

		logger.info('Inventory history indexes created successfully');
	} catch (error) {
		logger.error('Error creating inventory history indexes', { error });
		throw error;
	}
}

/**
 * Create indexes for inventory_deleted collection
 * For optimized retrieval and auto-deletion
 */
export async function createInventoryDeletedIndexes() {
	const db = await getDatabase();
	const collection = db.collection('inventory_deleted');

	try {
		await collection.createIndexes([
			// Index on deletedAt for sorting (DESC)
			{ key: { deletedAt: -1 }, name: 'idx_deletedat_desc' },
			
			// TTL index for automatic permanent deletion after 30 days
			{
				key: { scheduledDeletion: 1 },
				name: 'idx_scheduled_deletion_ttl',
				expireAfterSeconds: 0 // Delete immediately when scheduledDeletion date is reached
			},
			
			// Index for searching by item name
			{ key: { 'itemData.name': 1 }, name: 'idx_itemdata_name' },
			
			// Index on originalId for lookups
			{ key: { originalId: 1 }, name: 'idx_originalid' },
			
			// Index on deletedBy for audit
			{ key: { deletedBy: 1, deletedAt: -1 }, name: 'idx_deletedby_deletedat' }
		]);

		logger.info('Inventory deleted indexes created successfully');
	} catch (error) {
		logger.error('Error creating inventory deleted indexes', { error });
		throw error;
	}
}

/**
 * Create all indexes for inventory collections
 */
export async function createInventoryIndexes() {
	try {
		await createInventoryHistoryIndexes();
		await createInventoryDeletedIndexes();
		logger.info('All inventory indexes created successfully');
	} catch (error) {
		logger.error('Error creating inventory indexes', { error });
		throw error;
	}
}

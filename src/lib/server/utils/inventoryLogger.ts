import { getDatabase } from '$lib/server/db/mongodb';
import type { ObjectId } from 'mongodb';
import type { InventoryHistory, InventoryAction } from '$lib/server/models/InventoryHistory';

/**
 * Log inventory activity to history collection
 */
export async function logInventoryActivity(params: {
	action: InventoryAction;
	entityType: 'item' | 'category';
	entityId: ObjectId;
	entityName: string;
	userId: ObjectId;
	userName: string;
	userRole: string;
	changes?: {
		field: string;
		oldValue: any;
		newValue: any;
	}[];
	metadata?: Record<string, any>;
	ipAddress?: string;
	userAgent?: string;
}): Promise<void> {
	try {
		const db = await getDatabase();
		const historyCollection = db.collection<InventoryHistory>('inventory_history');

		const historyEntry: InventoryHistory = {
			action: params.action,
			entityType: params.entityType,
			entityId: params.entityId,
			entityName: params.entityName,
			userId: params.userId,
			userName: params.userName,
			userRole: params.userRole,
			changes: params.changes,
			metadata: params.metadata,
			ipAddress: params.ipAddress,
			userAgent: params.userAgent,
			timestamp: new Date()
		};

		await historyCollection.insertOne(historyEntry);
	} catch (error) {
		// Log error but don't fail the main operation
		console.error('Failed to log inventory activity:', error);
	}
}

/**
 * Compare two objects and return list of changes
 */
export function getObjectChanges(
	oldObj: Record<string, any>,
	newObj: Record<string, any>,
	fieldsToTrack: string[]
): { field: string; oldValue: any; newValue: any }[] {
	const changes: { field: string; oldValue: any; newValue: any }[] = [];

	for (const field of fieldsToTrack) {
		const oldValue = oldObj[field];
		const newValue = newObj[field];

		// Check if values are different
		if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) {
			changes.push({
				field,
				oldValue,
				newValue
			});
		}
	}

	return changes;
}

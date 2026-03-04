import type { ObjectId } from 'mongodb';
import type { InventoryItem } from './InventoryItem';
import type { InventoryCategory } from './InventoryCategory';

/**
 * Soft-Deleted Inventory Item
 * Items kept for 30 days before permanent deletion
 */
export interface DeletedInventoryItem {
	_id?: ObjectId;
	originalId: ObjectId;
	itemData: InventoryItem;
	deletedBy: ObjectId;
	deletedByName: string;
	deletedByRole: string;
	deletedAt: Date;
	scheduledDeletion: Date; // Auto-delete after 30 days
	reason?: string;
	ipAddress?: string;
}

/**
 * Soft-Deleted Inventory Category
 */
export interface DeletedInventoryCategory {
	_id?: ObjectId;
	originalId: ObjectId;
	categoryData: InventoryCategory;
	deletedBy: ObjectId;
	deletedByName: string;
	deletedByRole: string;
	deletedAt: Date;
	scheduledDeletion: Date; // Auto-delete after 30 days
	reason?: string;
	ipAddress?: string;
}

/**
 * API Response for Deleted Items
 */
export interface DeletedItemResponse {
	id: string;
	originalId: string;
	itemData: any;
	deletedBy: string;
	deletedByName: string;
	deletedByRole: string;
	deletedAt: Date;
	scheduledDeletion: Date;
	daysRemaining: number;
	reason?: string;
}

/**
 * API Response for Deleted Categories
 */
export interface DeletedCategoryResponse {
	id: string;
	originalId: string;
	categoryData: any;
	deletedBy: string;
	deletedByName: string;
	deletedByRole: string;
	deletedAt: Date;
	scheduledDeletion: Date;
	daysRemaining: number;
	reason?: string;
}

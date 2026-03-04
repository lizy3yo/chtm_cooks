import type { ObjectId } from 'mongodb';

/**
 * Inventory action types for audit trail
 */
export enum InventoryAction {
	CREATED = 'created',
	UPDATED = 'updated',
	DELETED = 'deleted',
	ARCHIVED = 'archived',
	RESTORED = 'restored',
	QUANTITY_CHANGED = 'quantity_changed',
	CATEGORY_CREATED = 'category_created',
	CATEGORY_UPDATED = 'category_updated',
	CATEGORY_DELETED = 'category_deleted',
	CATEGORY_ARCHIVED = 'category_archived',
	CATEGORY_RESTORED = 'category_restored'
}

/**
 * Inventory History Document (Activity Log)
 * Tracks all changes to inventory items and categories
 */
export interface InventoryHistory {
	_id?: ObjectId;
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
	metadata?: {
		previousQuantity?: number;
		newQuantity?: number;
		categoryId?: ObjectId;
		categoryName?: string;
		[key: string]: any;
	};
	ipAddress?: string;
	userAgent?: string;
	timestamp: Date;
}

/**
 * API Response for Inventory History
 */
export interface InventoryHistoryResponse {
	id: string;
	action: InventoryAction;
	entityType: 'item' | 'category';
	entityId: string;
	entityName: string;
	userId: string;
	userName: string;
	userRole: string;
	changes?: {
		field: string;
		oldValue: any;
		newValue: any;
	}[];
	metadata?: {
		previousQuantity?: number;
		newQuantity?: number;
		categoryId?: string;
		categoryName?: string;
		[key: string]: any;
	};
	ipAddress?: string;
	userAgent?: string;
	timestamp: Date;
}

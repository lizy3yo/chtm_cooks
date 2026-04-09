import type { ObjectId } from 'mongodb';

export enum ItemStatus {
	IN_STOCK = 'In Stock',
	LOW_STOCK = 'Low Stock',
	OUT_OF_STOCK = 'Out of Stock',
	ARCHIVED = 'Archived'
}

export interface InventoryItem {
	_id?: ObjectId;
	name: string;
	category: string;
	categoryId?: ObjectId;
	specification: string;
	toolsOrEquipment: string;
	picture?: string;
	quantity: number;
	donations?: number;
	eomCount: number; // End of Month Count
	location?: string;
	description?: string;
	status: ItemStatus;
	unitPrice?: number; // Price per unit for replacement tracking
	isConstant?: boolean; // Items that always appear on student request forms
	maxQuantityPerRequest?: number; // Maximum quantity allowed per request for constant items
	archived: boolean;
	createdAt: Date;
	updatedAt: Date;
	createdBy: ObjectId;
	updatedBy?: ObjectId;
}

export interface InventoryItemResponse {
	id: string;
	name: string;
	category: string;
	categoryId?: string;
	specification: string;
	toolsOrEquipment: string;
	picture?: string;
	quantity: number;
	donations?: number;
	eomCount: number;
	currentCount?: number;
	variance: number;
	location?: string;
	description?: string;
	status: ItemStatus;
	unitPrice?: number;
	isConstant?: boolean;
	maxQuantityPerRequest?: number;
	archived: boolean;
	createdAt: Date;
	updatedAt: Date;
}

export interface CreateInventoryItemRequest {
	name: string;
	category: string;
	categoryId?: string;
	specification?: string;
	toolsOrEquipment?: string;
	picture?: string;
	quantity: number;
	donations?: number;
	eomCount?: number;
	location?: string;
	unitPrice?: number;
	description?: string;
	isConstant?: boolean;
	maxQuantityPerRequest?: number;
}

export interface UpdateInventoryItemRequest extends Partial<CreateInventoryItemRequest> {
	archived?: boolean;
	replacePicture?: boolean;
}

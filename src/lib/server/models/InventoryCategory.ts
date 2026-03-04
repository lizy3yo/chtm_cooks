import type { ObjectId } from 'mongodb';

export interface InventoryCategory {
	_id?: ObjectId;
	name: string;
	description?: string;
	picture?: string;
	itemCount: number;
	archived: boolean;
	createdAt: Date;
	updatedAt: Date;
	createdBy: ObjectId;
	updatedBy?: ObjectId;
}

export interface InventoryCategoryResponse {
	id: string;
	name: string;
	description?: string;
	picture?: string;
	itemCount: number;
	archived: boolean;
	createdAt: Date;
	updatedAt: Date;
}

export interface CreateCategoryRequest {
	name: string;
	description?: string;
	picture?: string;
}

export interface UpdateCategoryRequest extends Partial<CreateCategoryRequest> {
	archived?: boolean;
}

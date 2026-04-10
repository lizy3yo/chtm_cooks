/**
 * Donation Model — Item-based donations only.
 *
 * Each donation record is linked to an inventory action:
 *   - inventoryAction = 'new_item'        → a new inventory item was created
 *   - inventoryAction = 'add_to_existing' → quantity was added to an existing item
 */

import type { ObjectId } from 'mongodb';

export { DonationStatus } from '$lib/shared/donationTypes';

// ─── Document ────────────────────────────────────────────────────────────────

export interface Donation {
	_id?: ObjectId;
	/** Auto-generated receipt number: DON-YYYY-XXXXXX */
	receiptNumber: string;
	/** Name of the donor (individual or organization) */
	donorName: string;
	/** Name / label of the donated item */
	itemName: string;
	/** Total quantity donated */
	quantity: number;
	/** Optional unit of measure (e.g. "pcs", "kg", "boxes") */
	unit?: string;
	/** Purpose / intended use of the donation */
	purpose: string;
	/** Date the donation was received */
	date: Date;
	/** Free-form notes */
	notes?: string;
	/** Whether this donation created a new inventory item or added to an existing one */
	inventoryAction: 'new_item' | 'add_to_existing';
	/** Reference to the inventory item this donation is linked to */
	inventoryItemId?: ObjectId;
	createdAt: Date;
	updatedAt: Date;
	createdBy: ObjectId;
}

// ─── API Response ─────────────────────────────────────────────────────────────

export interface DonationResponse {
	id: string;
	receiptNumber: string;
	donorName: string;
	itemName: string;
	quantity: number;
	unit?: string;
	purpose: string;
	date: string;
	notes?: string;
	inventoryAction: 'new_item' | 'add_to_existing';
	inventoryItemId?: string;
	createdAt: string;
	updatedAt: string;
}

// ─── Request Payloads ─────────────────────────────────────────────────────────

/** Create a brand-new donation that also creates a new inventory item */
export interface CreateDonationNewItemRequest {
	donorName: string;
	quantity: number;
	unit?: string;
	purpose: string;
	date: string;
	notes?: string;
	// Inventory item fields (mirrors CreateInventoryItemRequest)
	itemName: string;
	category: string;
	categoryId?: string;
	specification?: string;
	toolsOrEquipment?: string;
}

/** Create a donation that adds quantity to an existing inventory item */
export interface CreateDonationAddToExistingRequest {
	donorName: string;
	quantity: number;
	purpose: string;
	date: string;
	notes?: string;
	inventoryItemId: string;
}

export type CreateDonationRequest =
	| ({ inventoryAction: 'new_item' } & CreateDonationNewItemRequest)
	| ({ inventoryAction: 'add_to_existing' } & CreateDonationAddToExistingRequest);

/** Add quantity to an existing donation record */
export interface AddDonationQuantityRequest {
	quantityToAdd: number;
	notes?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function toDonationResponse(donation: Donation): DonationResponse {
	return {
		id: donation._id!.toString(),
		receiptNumber: donation.receiptNumber,
		donorName: donation.donorName,
		itemName: donation.itemName,
		quantity: donation.quantity,
		unit: donation.unit,
		purpose: donation.purpose,
		date: donation.date.toISOString().split('T')[0],
		notes: donation.notes,
		inventoryAction: donation.inventoryAction,
		inventoryItemId: donation.inventoryItemId?.toString(),
		createdAt: donation.createdAt.toISOString(),
		updatedAt: donation.updatedAt.toISOString()
	};
}

export const DONATIONS_COLLECTION = 'donations';

import type { ObjectId } from 'mongodb';

export { DonationType } from '$lib/shared/donationTypes';

export interface Donation {
	_id?: ObjectId;
	receiptNumber: string;
	donorName: string;
	type: DonationType;
	/** Monetary amount — only set when type === 'cash' */
	amount?: number;
	/** Item description — only set when type === 'item' */
	itemDescription?: string;
	purpose: string;
	date: Date;
	notes?: string;
	createdAt: Date;
	updatedAt: Date;
	createdBy: ObjectId;
}

export interface DonationResponse {
	id: string;
	receiptNumber: string;
	donorName: string;
	type: DonationType;
	amount?: number;
	itemDescription?: string;
	purpose: string;
	date: string;
	notes?: string;
	createdAt: string;
	updatedAt: string;
}

export interface CreateDonationRequest {
	donorName: string;
	type: DonationType;
	amount?: number;
	itemDescription?: string;
	purpose: string;
	date: string;
	notes?: string;
}

export function toDonationResponse(donation: Donation): DonationResponse {
	return {
		id: donation._id!.toString(),
		receiptNumber: donation.receiptNumber,
		donorName: donation.donorName,
		type: donation.type,
		amount: donation.amount,
		itemDescription: donation.itemDescription,
		purpose: donation.purpose,
		date: donation.date.toISOString().split('T')[0],
		notes: donation.notes,
		createdAt: donation.createdAt.toISOString(),
		updatedAt: donation.updatedAt.toISOString()
	};
}

export const DONATIONS_COLLECTION = 'donations';

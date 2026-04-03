import type { ObjectId } from 'mongodb';

export enum ObligationType {
	MISSING = 'missing',
	DAMAGED = 'damaged'
}

export enum ObligationStatus {
	PENDING = 'pending',
	REPLACED = 'replaced',
	WAIVED = 'waived'
}

export enum ResolutionType {
	REPLACEMENT = 'replacement',
	WAIVER = 'waiver'
}

export interface ReplacementObligation {
	_id?: ObjectId;
	borrowRequestId: ObjectId;
	studentId: ObjectId;
	itemId: ObjectId;
	itemName: string;
	itemCategory?: string;
	quantity: number;
	type: ObligationType;
	status: ObligationStatus;
	amount: number; // Represents quantity of items to be replaced
	amountPaid: number; // Represents quantity of items already replaced
	resolutionType?: ResolutionType;
	resolutionDate?: Date;
	resolutionNotes?: string;
	paymentReference?: string; // Repurposed as replacement reference/tracking number
	incidentDate: Date;
	incidentNotes?: string;
	dueDate: Date;
	createdAt: Date;
	updatedAt: Date;
	createdBy: ObjectId;
	updatedBy?: ObjectId;
}

export interface ReplacementObligationResponse {
	id: string;
	borrowRequestId: string;
	studentId: string;
	studentName?: string;
	studentEmail?: string;
	studentProfilePhotoUrl?: string;
	itemId: string;
	itemName: string;
	itemCategory?: string;
	quantity: number;
	type: ObligationType;
	status: ObligationStatus;
	amount: number; // Quantity of items to be replaced
	amountPaid: number; // Quantity of items already replaced
	balance: number; // Remaining items to be replaced
	resolutionType?: ResolutionType;
	resolutionDate?: Date;
	resolutionNotes?: string;
	paymentReference?: string; // Replacement tracking reference
	incidentDate: Date;
	incidentNotes?: string;
	dueDate: Date;
	createdAt: Date;
	updatedAt: Date;
}

export interface CreateReplacementObligationRequest {
	borrowRequestId: string;
	itemId: string;
	quantity: number;
	type: ObligationType;
	amount: number;
	incidentNotes?: string;
	dueDate: string;
}

export interface ResolveReplacementObligationRequest {
	resolutionType: ResolutionType;
	amountPaid?: number; // Quantity of items being replaced
	resolutionNotes?: string;
	paymentReference?: string; // Replacement tracking reference
}

export function toReplacementObligationResponse(
	obligation: ReplacementObligation,
	studentName?: string,
	studentEmail?: string,
	studentProfilePhotoUrl?: string
): ReplacementObligationResponse {
	return {
		id: obligation._id!.toString(),
		borrowRequestId: obligation.borrowRequestId.toString(),
		studentId: obligation.studentId.toString(),
		studentName,
		studentEmail,
		studentProfilePhotoUrl,
		itemId: obligation.itemId.toString(),
		itemName: obligation.itemName,
		itemCategory: obligation.itemCategory,
		quantity: obligation.quantity,
		type: obligation.type,
		status: obligation.status,
		amount: obligation.amount,
		amountPaid: obligation.amountPaid,
		balance: obligation.amount - obligation.amountPaid,
		resolutionType: obligation.resolutionType,
		resolutionDate: obligation.resolutionDate,
		resolutionNotes: obligation.resolutionNotes,
		paymentReference: obligation.paymentReference,
		incidentDate: obligation.incidentDate,
		incidentNotes: obligation.incidentNotes,
		dueDate: obligation.dueDate,
		createdAt: obligation.createdAt,
		updatedAt: obligation.updatedAt
	};
}

import type { ObjectId } from 'mongodb';

export enum ObligationType {
	MISSING = 'missing',
	DAMAGED = 'damaged'
}

export enum ObligationStatus {
	PENDING = 'pending',
	PAID = 'paid',
	REPLACED = 'replaced',
	WAIVED = 'waived'
}

export enum ResolutionType {
	PAYMENT = 'payment',
	REPLACEMENT = 'replacement',
	WAIVER = 'waiver'
}

export interface FinancialObligation {
	_id?: ObjectId;
	borrowRequestId: ObjectId;
	studentId: ObjectId;
	itemId: ObjectId;
	itemName: string;
	itemCategory?: string;
	quantity: number;
	type: ObligationType;
	status: ObligationStatus;
	amount: number;
	amountPaid: number;
	resolutionType?: ResolutionType;
	resolutionDate?: Date;
	resolutionNotes?: string;
	paymentReference?: string;
	incidentDate: Date;
	incidentNotes?: string;
	dueDate: Date;
	createdAt: Date;
	updatedAt: Date;
	createdBy: ObjectId;
	updatedBy?: ObjectId;
}

export interface FinancialObligationResponse {
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
	amount: number;
	amountPaid: number;
	balance: number;
	resolutionType?: ResolutionType;
	resolutionDate?: Date;
	resolutionNotes?: string;
	paymentReference?: string;
	incidentDate: Date;
	incidentNotes?: string;
	dueDate: Date;
	createdAt: Date;
	updatedAt: Date;
}

export interface CreateFinancialObligationRequest {
	borrowRequestId: string;
	itemId: string;
	quantity: number;
	type: ObligationType;
	amount: number;
	incidentNotes?: string;
	dueDate: string;
}

export interface ResolveFinancialObligationRequest {
	resolutionType: ResolutionType;
	amountPaid?: number;
	resolutionNotes?: string;
	paymentReference?: string;
}

export function toFinancialObligationResponse(
	obligation: FinancialObligation,
	studentName?: string,
	studentEmail?: string,
	studentProfilePhotoUrl?: string
): FinancialObligationResponse {
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

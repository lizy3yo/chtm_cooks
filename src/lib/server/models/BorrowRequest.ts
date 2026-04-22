import type { ObjectId } from 'mongodb';
import type { UserRole } from './User';

export enum BorrowRequestStatus {
	PENDING_INSTRUCTOR = 'pending_instructor',
	APPROVED_INSTRUCTOR = 'approved_instructor',
	READY_FOR_PICKUP = 'ready_for_pickup',
	BORROWED = 'borrowed',
	PENDING_RETURN = 'pending_return',
	MISSING = 'missing',
	RESOLVED = 'resolved',
	RETURNED = 'returned',
	CANCELLED = 'cancelled',
	REJECTED = 'rejected'
}

export enum ItemInspectionStatus {
	GOOD = 'good',
	DAMAGED = 'damaged',
	MISSING = 'missing'
}

export interface ItemInspection {
	status: ItemInspectionStatus;
	inspectedAt: Date;
	inspectedBy: ObjectId;
	notes?: string;
	replacementQuantity?: number; // Quantity selected for replacement
}

export interface BorrowRequestItem {
	itemId: ObjectId;
	name: string;
	quantity: number;
	category?: string;
	picture?: string;
	inspection?: ItemInspection; // Added for return inspection tracking
}

export interface BorrowRequest {
	_id?: ObjectId;
	studentId: ObjectId;
	instructorId?: ObjectId;
	custodianId?: ObjectId;
	classCodeId: ObjectId; // Required: Class code for this request
	items: BorrowRequestItem[];
	purpose: string;
	usageLocation?: 'school' | 'outdoor'; // Where equipment will be used
	borrowDate: Date;
	returnDate: Date;
	status: BorrowRequestStatus;
	rejectReason?: string;
	rejectionNotes?: string;
	approvedAt?: Date;
	rejectedAt?: Date;
	releasedAt?: Date;
	pickedUpAt?: Date;
	missingAt?: Date;
	resolvedAt?: Date;
	lastReminderAt?: Date;
	reminderCount?: number;
	returnedAt?: Date;
	createdAt: Date;
	updatedAt: Date;
	createdBy: ObjectId;
	updatedBy?: ObjectId;
}

export interface BorrowRequestResponseItem {
	itemId: string;
	name: string;
	quantity: number;
	category?: string;
	picture?: string;
	inspection?: {
		status: ItemInspectionStatus;
		inspectedAt: Date;
		inspectedBy: string;
		notes?: string;
		unitPrice?: number;
	};
}

export interface BorrowRequestResponse {
	id: string;
	studentId: string;
	instructorId?: string;
	custodianId?: string;
	classCodeId: string; // Required: Class code for this request
	items: BorrowRequestResponseItem[];
	purpose: string;
	usageLocation?: 'school' | 'outdoor'; // Where equipment will be used
	borrowDate: Date;
	returnDate: Date;
	status: BorrowRequestStatus;
	rejectReason?: string;
	rejectionNotes?: string;
	approvedAt?: Date;
	rejectedAt?: Date;
	releasedAt?: Date;
	pickedUpAt?: Date;
	missingAt?: Date;
	resolvedAt?: Date;
	lastReminderAt?: Date;
	reminderCount?: number;
	returnedAt?: Date;
	createdAt: Date;
	updatedAt: Date;
}

export interface CreateBorrowRequestItemInput {
	itemId: string;
	quantity: number;
}

export interface CreateBorrowRequestRequest {
	items: CreateBorrowRequestItemInput[];
	purpose: string;
	usageLocation?: 'school' | 'outdoor'; // Where equipment will be used
	borrowDate: string;
	returnDate: string;
	classCodeId: string; // Required: Class code selection
}

export interface RejectBorrowRequestRequest {
	reason: string;
	notes?: string;
}

export function toBorrowRequestResponse(request: BorrowRequest): BorrowRequestResponse {
	return {
		id: request._id!.toString(),
		studentId: request.studentId.toString(),
		instructorId: request.instructorId?.toString(),
		custodianId: request.custodianId?.toString(),
		classCodeId: request.classCodeId.toString(),
		items: request.items.map((item) => ({
			itemId: item.itemId.toString(),
			name: item.name,
			quantity: item.quantity,
			category: item.category,
			picture: item.picture,
			inspection: item.inspection ? {
				status: item.inspection.status,
				inspectedAt: item.inspection.inspectedAt,
				inspectedBy: item.inspection.inspectedBy.toString(),
				notes: item.inspection.notes,
				replacementQuantity: item.inspection.replacementQuantity
			} : undefined
		})),
		purpose: request.purpose,
		usageLocation: request.usageLocation,
		borrowDate: request.borrowDate,
		returnDate: request.returnDate,
		status: request.status,
		rejectReason: request.rejectReason,
		rejectionNotes: request.rejectionNotes,
		approvedAt: request.approvedAt,
		rejectedAt: request.rejectedAt,
		releasedAt: request.releasedAt,
		pickedUpAt: request.pickedUpAt,
		missingAt: request.missingAt,
		resolvedAt: request.resolvedAt,
		lastReminderAt: request.lastReminderAt,
		reminderCount: request.reminderCount,
		returnedAt: request.returnedAt,
		createdAt: request.createdAt,
		updatedAt: request.updatedAt
	};
}

export function canTransitionStatus(
	current: BorrowRequestStatus,
	next: BorrowRequestStatus,
	actorRole: UserRole
): boolean {
	if (current === next) {
		return true;
	}

	switch (current) {
		case BorrowRequestStatus.PENDING_INSTRUCTOR:
			return (
				(actorRole === 'instructor' &&
					(next === BorrowRequestStatus.APPROVED_INSTRUCTOR || next === BorrowRequestStatus.REJECTED)) ||
				(actorRole === 'student' && next === BorrowRequestStatus.CANCELLED)
			);
		case BorrowRequestStatus.APPROVED_INSTRUCTOR:
			return actorRole === 'custodian' && next === BorrowRequestStatus.READY_FOR_PICKUP;
		case BorrowRequestStatus.READY_FOR_PICKUP:
			return (actorRole === 'student' || actorRole === 'custodian') && next === BorrowRequestStatus.BORROWED;
		case BorrowRequestStatus.BORROWED:
			return (
				actorRole === 'custodian' &&
				(next === BorrowRequestStatus.PENDING_RETURN || next === BorrowRequestStatus.RETURNED || next === BorrowRequestStatus.MISSING)
			);
		case BorrowRequestStatus.PENDING_RETURN:
			return actorRole === 'custodian' && (next === BorrowRequestStatus.RETURNED || next === BorrowRequestStatus.MISSING);
		default:
			return false;
	}
}

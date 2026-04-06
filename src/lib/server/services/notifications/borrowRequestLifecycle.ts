import { ObjectId, type Db } from 'mongodb';
import type { BorrowRequest, BorrowRequestStatus } from '$lib/server/models/BorrowRequest';
import type { User } from '$lib/server/models/User';
import { UserRole } from '$lib/server/models/User';
import { createNotifications, type CreateNotificationInput } from './service';
import { sendBorrowRequestLifecycleEmail } from '$lib/server/services/email';
import { logger } from '$lib/server/utils/logger';

type RoleAudience = 'student' | 'instructor' | 'custodian';

export type BorrowLifecycleEvent =
	| 'submitted'
	| 'approved'
	| 'rejected'
	| 'ready_for_pickup'
	| 'picked_up'
	| 'return_initiated'
	| 'returned'
	| 'missing'
	| 'item_issue'
	| 'cancelled'
	| 'reminder_sent';

interface LifecycleRecipient {
	userId: ObjectId;
	role: RoleAudience;
	email?: string;
	firstName?: string;
}

interface NotifyBorrowRequestLifecycleInput {
	db: Db;
	request: BorrowRequest & { _id: ObjectId };
	event: BorrowLifecycleEvent;
	contextNotes?: string;
}

const STATUS_LABELS: Record<BorrowRequestStatus, string> = {
	pending_instructor: 'Pending Review',
	approved_instructor: 'Instructor Approved',
	ready_for_pickup: 'Ready for Pickup',
	borrowed: 'Borrowed',
	pending_return: 'Pending Return',
	missing: 'Missing / Damaged',
	resolved: 'Resolved',
	returned: 'Returned',
	cancelled: 'Cancelled',
	rejected: 'Rejected'
};

function requestCode(requestId: ObjectId): string {
	return `REQ-${requestId.toString().slice(-6).toUpperCase()}`;
}

function itemsSummary(request: BorrowRequest): string[] {
	return request.items.map((item) => `${item.name} (x${item.quantity})`);
}

function getRolePath(role: RoleAudience): string {
	if (role === 'student') return '/student/requests';
	if (role === 'instructor') return '/instructor/requests';
	return '/custodian/requests';
}

function getRoleLabel(role: RoleAudience): string {
	if (role === 'student') return 'Student Portal';
	if (role === 'instructor') return 'Instructor Portal';
	return 'Custodian Portal';
}

function getNotificationType(event: BorrowLifecycleEvent) {
	switch (event) {
		case 'submitted':
			return 'borrow_request_submitted';
		case 'approved':
			return 'borrow_request_approved';
		case 'rejected':
			return 'borrow_request_rejected';
		case 'ready_for_pickup':
			return 'borrow_request_ready_for_pickup';
		case 'picked_up':
			return 'borrow_request_picked_up';
		case 'return_initiated':
			return 'borrow_request_return_initiated';
		case 'returned':
			return 'borrow_request_returned';
		case 'missing':
			return 'borrow_request_missing';
		case 'item_issue':
			return 'borrow_request_item_issue';
		case 'cancelled':
			return 'borrow_request_cancelled';
		case 'reminder_sent':
			return 'borrow_request_reminder';
		default:
			return 'borrow_request_pending_review';
	}
}

function buildCopy(event: BorrowLifecycleEvent, role: RoleAudience, requestStatus: BorrowRequestStatus, code: string) {
	const statusLabel = STATUS_LABELS[requestStatus] || requestStatus;

	switch (event) {
		case 'submitted': {
			if (role === 'student') {
				return {
					title: `Request submitted (${code})`,
					message: `Your borrow request has been submitted and is now pending instructor review.`,
					emailSummary: 'Your request has been received and queued for instructor review.'
				};
			}
			return {
				title: `New request pending review (${code})`,
				message: `A new student request requires instructor review.`,
				emailSummary: 'A new borrow request was submitted and is waiting for review.'
			};
		}
		case 'approved':
			if (role === 'student') {
				return {
					title: `Instructor approved request (${code})`,
					message: `Your request has been approved and will be prepared for pickup.`,
					emailSummary: 'Your request was approved by the instructor and forwarded for preparation.'
				};
			}
			return {
				title: `Request approved for preparation (${code})`,
				message: `An approved request is now awaiting custodian release.`,
				emailSummary: 'A request has been approved and is ready for custodian processing.'
			};
		case 'rejected':
			return {
				title: `Request rejected (${code})`,
				message: `This request was rejected. Open details to review the reason.`,
				emailSummary: 'The request was rejected. Please review the reason in your portal.'
			};
		case 'ready_for_pickup':
			return {
				title: `Ready for pickup (${code})`,
				message: `Your approved request is ready for pickup.`,
				emailSummary: 'Your request has been prepared and is now ready for pickup.'
			};
		case 'picked_up':
			return {
				title: `Items picked up (${code})`,
				message: `The request has been marked as picked up and is now active.`,
				emailSummary: 'The request items were picked up and the borrow period is active.'
			};
		case 'return_initiated':
			if (role === 'student') {
				return {
					title: `Return request submitted (${code})`,
					message: `Your return request was submitted and is pending custodian inspection.`,
					emailSummary: 'Your return request has been submitted and is awaiting inspection.'
				};
			}
			return {
				title: `Return inspection required (${code})`,
				message: `A student initiated a return and this request is now pending inspection.`,
				emailSummary: 'A borrow request now requires return inspection.'
			};
		case 'returned':
			return {
				title: `Request returned (${code})`,
				message: `All items for this request were returned successfully.`,
				emailSummary: 'The request has been completed and returned successfully.'
			};
		case 'missing':
			return {
				title: `Item issue recorded (${code})`,
				message: `This request has been marked with missing or damaged item issues.`,
				emailSummary: 'This request includes missing or damaged items and requires follow-up.'
			};
		case 'item_issue':
			return {
				title: `Inspection flagged item issue (${code})`,
				message: `Inspection found missing or damaged items. Replacement obligations may apply.`,
				emailSummary: 'Inspection identified item issues and follow-up actions are required.'
			};
		case 'cancelled':
			if (role === 'student') {
				return {
					title: `Request cancelled (${code})`,
					message: `Your pending request has been cancelled.`,
					emailSummary: 'Your pending request has been cancelled.'
				};
			}
			return {
				title: `Student request cancelled (${code})`,
				message: `A student cancelled a pending request.`,
				emailSummary: 'A pending request was cancelled by the student.'
			};
		case 'reminder_sent':
			return {
				title: `Overdue reminder sent (${code})`,
				message: `A due-date reminder was sent for this borrow request.`,
				emailSummary: 'This is a reminder that your borrowed items are overdue for return.'
			};
		default:
			return {
				title: `Request updated (${code})`,
				message: `Request status is now ${statusLabel}.`,
				emailSummary: `Request status changed to ${statusLabel}.`
			};
	}
}

async function getRecipients(
	db: Db,
	request: BorrowRequest,
	event: BorrowLifecycleEvent
): Promise<LifecycleRecipient[]> {
	const usersCollection = db.collection<User>('users');
	const recipients = new Map<string, LifecycleRecipient>();

	const student = await usersCollection.findOne(
		{ _id: request.studentId },
		{ projection: { _id: 1, role: 1, email: 1, firstName: 1, isActive: 1 } }
	);

	if (student?.isActive && student.role === 'student') {
		recipients.set(student._id!.toString(), {
			userId: student._id!,
			role: 'student',
			email: student.email,
			firstName: student.firstName
		});
	}

	const addRoleUsers = async (role: RoleAudience) => {
		const userRole =
			role === 'student'
				? UserRole.STUDENT
				: role === 'instructor'
					? UserRole.INSTRUCTOR
					: UserRole.CUSTODIAN;
		const roleUsers = await usersCollection
			.find(
				{ role: userRole, isActive: true },
				{ projection: { _id: 1, role: 1, email: 1, firstName: 1 } }
			)
			.toArray();

		for (const roleUser of roleUsers) {
			recipients.set(roleUser._id!.toString(), {
				userId: roleUser._id!,
				role,
				email: roleUser.email,
				firstName: roleUser.firstName
			});
		}
	};

	if (event === 'submitted' || event === 'cancelled') {
		await addRoleUsers('instructor');
	}

	if (event === 'approved' || event === 'return_initiated') {
		await addRoleUsers('custodian');
	}

	if (event === 'missing' || event === 'item_issue' || event === 'returned' || event === 'picked_up') {
		if (request.instructorId) {
			const instructor = await usersCollection.findOne(
				{ _id: request.instructorId, role: UserRole.INSTRUCTOR, isActive: true },
				{ projection: { _id: 1, role: 1, email: 1, firstName: 1 } }
			);
			if (instructor?._id) {
				recipients.set(instructor._id.toString(), {
					userId: instructor._id,
					role: 'instructor',
					email: instructor.email,
					firstName: instructor.firstName
				});
			}
		}

		if (request.custodianId) {
			const custodian = await usersCollection.findOne(
				{ _id: request.custodianId, role: UserRole.CUSTODIAN, isActive: true },
				{ projection: { _id: 1, role: 1, email: 1, firstName: 1 } }
			);
			if (custodian?._id) {
				recipients.set(custodian._id.toString(), {
					userId: custodian._id,
					role: 'custodian',
					email: custodian.email,
					firstName: custodian.firstName
				});
			}
		}
	}

	if (event === 'rejected' || event === 'ready_for_pickup' || event === 'reminder_sent') {
		for (const [key, value] of recipients.entries()) {
			if (value.role !== 'student') {
				recipients.delete(key);
			}
		}
	}

	return Array.from(recipients.values());
}

export async function notifyBorrowRequestLifecycle(input: NotifyBorrowRequestLifecycleInput): Promise<void> {
	const { db, request, event, contextNotes } = input;
	const recipients = await getRecipients(db, request, event);
	if (recipients.length === 0) {
		return;
	}

	const code = requestCode(request._id);
	const requestItems = itemsSummary(request);
	const statusLabel = STATUS_LABELS[request.status] || request.status;

	const notifications: CreateNotificationInput[] = recipients.map((recipient) => {
		const copy = buildCopy(event, recipient.role, request.status, code);
		return {
			userId: recipient.userId,
			audienceRole: recipient.role,
			type: getNotificationType(event),
			title: copy.title,
			message: copy.message,
			borrowRequestId: request._id,
			link: `${getRolePath(recipient.role)}?requestId=${request._id.toString()}`,
			metadata: {
				status: request.status,
				requestCode: code,
				event
			}
		};
	});

	await createNotifications(db, notifications);

	const emailTasks = recipients
		.filter((recipient) => Boolean(recipient.email))
		.map(async (recipient) => {
			const copy = buildCopy(event, recipient.role, request.status, code);
			const isStudentRecipient = recipient.role === 'student';
			try {
				await sendBorrowRequestLifecycleEmail({
					to: recipient.email!,
					firstName: recipient.firstName || 'User',
					title: copy.title,
					summary: copy.emailSummary,
					requestCode: code,
					statusLabel,
					roleLabel: getRoleLabel(recipient.role),
					ctaPath: `${getRolePath(recipient.role)}?requestId=${request._id.toString()}`,
					items: requestItems,
					notes: contextNotes,
					qrRawValue: isStudentRecipient ? request._id.toString() : undefined,
					qrCaption: isStudentRecipient
						? 'Show this QR code to the custodian when processing this request.'
						: undefined
				});
			} catch (error) {
				logger.warn('Borrow request notification email failed', {
					requestId: request._id.toString(),
					recipientRole: recipient.role,
					recipientUserId: recipient.userId.toString(),
					error: error instanceof Error ? error.message : String(error)
				});
			}
		});

	await Promise.allSettled(emailTasks);
}

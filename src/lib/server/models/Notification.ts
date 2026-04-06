import type { ObjectId } from 'mongodb';
export type NotificationAudienceRole = 'student' | 'instructor' | 'custodian' | 'superadmin';

export type NotificationType =
	| 'borrow_request_submitted'
	| 'borrow_request_pending_review'
	| 'borrow_request_approved'
	| 'borrow_request_rejected'
	| 'borrow_request_ready_for_pickup'
	| 'borrow_request_picked_up'
	| 'borrow_request_return_initiated'
	| 'borrow_request_returned'
	| 'borrow_request_missing'
	| 'borrow_request_item_issue'
	| 'borrow_request_cancelled'
	| 'borrow_request_reminder';

export interface Notification {
	_id?: ObjectId;
	userId: ObjectId;
	audienceRole: NotificationAudienceRole;
	type: NotificationType;
	title: string;
	message: string;
	link?: string;
	borrowRequestId?: ObjectId;
	metadata?: Record<string, unknown>;
	isRead: boolean;
	readAt?: Date;
	createdAt: Date;
	updatedAt: Date;
}

export interface NotificationResponse {
	id: string;
	userId: string;
	audienceRole: NotificationAudienceRole;
	type: NotificationType;
	title: string;
	message: string;
	link?: string;
	borrowRequestId?: string;
	metadata?: Record<string, unknown>;
	isRead: boolean;
	readAt?: Date;
	createdAt: Date;
	updatedAt: Date;
}

export function toNotificationResponse(notification: Notification): NotificationResponse {
	return {
		id: notification._id!.toString(),
		userId: notification.userId.toString(),
		audienceRole: notification.audienceRole,
		type: notification.type,
		title: notification.title,
		message: notification.message,
		link: notification.link,
		borrowRequestId: notification.borrowRequestId?.toString(),
		metadata: notification.metadata,
		isRead: notification.isRead,
		readAt: notification.readAt,
		createdAt: notification.createdAt,
		updatedAt: notification.updatedAt
	};
}

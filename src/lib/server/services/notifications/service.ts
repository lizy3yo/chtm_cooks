import { ObjectId, type Db } from 'mongodb';
import {
	type Notification,
	type NotificationAudienceRole,
	type NotificationResponse,
	type NotificationType,
	toNotificationResponse
} from '$lib/server/models/Notification';

export const NOTIFICATIONS_COLLECTION = 'notifications';

export interface CreateNotificationInput {
	userId: ObjectId;
	audienceRole: NotificationAudienceRole;
	type: NotificationType;
	title: string;
	message: string;
	link?: string;
	borrowRequestId?: ObjectId;
	metadata?: Record<string, unknown>;
}

function getNotificationCollection(db: Db) {
	return db.collection<Notification>(NOTIFICATIONS_COLLECTION);
}

export async function createNotifications(db: Db, inputs: CreateNotificationInput[]): Promise<void> {
	if (inputs.length === 0) {
		return;
	}

	const now = new Date();
	const docs: Notification[] = inputs.map((input) => ({
		userId: input.userId,
		audienceRole: input.audienceRole,
		type: input.type,
		title: input.title,
		message: input.message,
		link: input.link,
		borrowRequestId: input.borrowRequestId,
		metadata: input.metadata,
		isRead: false,
		createdAt: now,
		updatedAt: now
	}));

	await getNotificationCollection(db).insertMany(docs);
}

export async function listNotificationsForUser(
	db: Db,
	userId: string,
	limit = 25,
	skip = 0
): Promise<{ notifications: NotificationResponse[]; unreadCount: number }> {
	const normalizedLimit = Number.isFinite(limit) ? Math.min(100, Math.max(1, limit)) : 25;
	const normalizedSkip = Number.isFinite(skip) ? Math.max(0, skip) : 0;
	const objectUserId = new ObjectId(userId);
	const collection = getNotificationCollection(db);

	const [notifications, unreadCount] = await Promise.all([
		collection
			.find({ userId: objectUserId })
			.sort({ createdAt: -1 })
			.skip(normalizedSkip)
			.limit(normalizedLimit)
			.toArray(),
		collection.countDocuments({ userId: objectUserId, isRead: false })
	]);

	return {
		notifications: notifications.map((notification) => toNotificationResponse(notification)),
		unreadCount
	};
}

export async function markNotificationAsRead(db: Db, userId: string, notificationId: string): Promise<boolean> {
	if (!ObjectId.isValid(notificationId)) {
		return false;
	}

	const now = new Date();
	const result = await getNotificationCollection(db).updateOne(
		{
			_id: new ObjectId(notificationId),
			userId: new ObjectId(userId)
		},
		{
			$set: {
				isRead: true,
				readAt: now,
				updatedAt: now
			}
		}
	);

	return result.matchedCount > 0;
}

export async function markAllNotificationsAsRead(db: Db, userId: string): Promise<number> {
	const now = new Date();
	const result = await getNotificationCollection(db).updateMany(
		{
			userId: new ObjectId(userId),
			isRead: false
		},
		{
			$set: {
				isRead: true,
				readAt: now,
				updatedAt: now
			}
		}
	);

	return result.modifiedCount;
}

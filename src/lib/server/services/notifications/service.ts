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

	// Enrich notifications with actor's profile photo
	const borrowRequestIds = notifications
		.map((n) => n.borrowRequestId)
		.filter((id): id is ObjectId => id !== undefined);

	let borrowRequests: any[] = [];
	if (borrowRequestIds.length > 0) {
		borrowRequests = await db
			.collection('borrow_requests')
			.find(
				{ _id: { $in: borrowRequestIds } },
				{ projection: { studentId: 1, instructorId: 1, custodianId: 1 } }
			)
			.toArray();
	}

	const requestMap = new Map(borrowRequests.map((r) => [r._id.toString(), r]));

	// Pre-calculate actorId for each notification so we can fetch all necessary users
	const notifActorIds = new Map<string, ObjectId>();
	const userIds = new Set<string>();

	for (const notif of notifications) {
		const req = notif.borrowRequestId ? requestMap.get(notif.borrowRequestId.toString()) : undefined;

		let actorId: ObjectId | undefined;
		const event = notif.metadata?.event as string | undefined;

		// support_message_received notifications already have actorName and actorPhotoUrl
		// stored in metadata at creation time — skip the DB re-lookup so we don't
		// accidentally overwrite them with the recipient's own profile photo.
		if (notif.type === 'support_message_received') {
			continue;
		}

		if (!req) {
			actorId = notif.userId;
		} else {
			if (event) {
				if (['submitted', 'cancelled', 'return_initiated'].includes(event)) {
					actorId = req.studentId;
				} else if (['approved', 'rejected'].includes(event)) {
					actorId = req.instructorId;
				} else if (['ready_for_pickup', 'picked_up', 'returned', 'missing', 'item_issue'].includes(event)) {
					actorId = req.custodianId;
				}
			} else {
				if (notif.type.includes('submitted') || notif.type.includes('cancelled') || notif.type.includes('return_initiated')) {
					actorId = req.studentId;
				} else if (notif.type.includes('approved') || notif.type.includes('rejected')) {
					actorId = req.instructorId;
				} else if (notif.type.includes('ready_for_pickup') || notif.type.includes('picked_up') || notif.type.includes('returned') || notif.type.includes('missing') || notif.type.includes('item_issue')) {
					actorId = req.custodianId;
				}
			}
		}

		if (!actorId) actorId = notif.userId;

		if (actorId) {
			notifActorIds.set(notif._id!.toString(), actorId);
			userIds.add(actorId.toString());
		}
	}

	if (userIds.size > 0) {
		const users = await db
			.collection('users')
			.find(
				{ _id: { $in: Array.from(userIds).map((id) => new ObjectId(id)) } },
				{ projection: { profilePhotoUrl: 1, firstName: 1, lastName: 1 } }
			)
			.toArray();

		const userMap = new Map(users.map((u) => [u._id.toString(), u]));

		for (const notif of notifications) {
			const actorId = notifActorIds.get(notif._id!.toString());
			if (actorId) {
				const user = userMap.get(actorId.toString());
				if (user) {
					if (!notif.metadata) notif.metadata = {};
					if (user.profilePhotoUrl) {
						notif.metadata.actorPhotoUrl = user.profilePhotoUrl;
					}
					notif.metadata.actorName = `${user.firstName || ''} ${user.lastName || ''}`.trim();
				}
			}
		}
	}

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

/**
 * Support message notification helper.
 *
 * Fires in-app notifications when a support ticket message is sent:
 *   - New ticket (owner → superadmin):  all superadmins are notified
 *   - Reply from superadmin (→ owner):  the ticket owner is notified
 *   - Reply from owner (→ superadmin):  all superadmins are notified
 *
 * Each notification carries the sender's name, a message preview, and
 * their profile photo URL (if available) so the notification UI can
 * render a rich avatar + preview card — matching the existing borrow-
 * request notification pattern.
 */

import { ObjectId, type Db } from 'mongodb';
import type { NotificationAudienceRole } from '$lib/server/models/Notification';
import { createNotifications, type CreateNotificationInput } from './service';
import type { User } from '$lib/server/models/User';

const PREVIEW_LEN = 80;

function preview(text: string): string {
	return text.length > PREVIEW_LEN ? `${text.slice(0, PREVIEW_LEN)}…` : text;
}

export interface SupportNotificationContext {
	db: Db;
	ticketId: string;
	ticketSubject: string;
	/** The user who sent the message */
	senderId: string;
	senderRole: 'student' | 'instructor' | 'custodian' | 'superadmin';
	senderName: string;
	messageBody: string;
	/** The ticket owner's user ID (student / instructor / custodian) */
	ownerId: string;
	ownerRole: 'student' | 'instructor' | 'custodian';
}

/**
 * Resolve the sender's profile photo URL from the users collection.
 * Returns undefined if the user has no photo or the lookup fails.
 */
async function getSenderPhoto(db: Db, senderId: string): Promise<string | undefined> {
	try {
		if (!ObjectId.isValid(senderId)) return undefined;
		const user = await db
			.collection<User>('users')
			.findOne({ _id: new ObjectId(senderId) }, { projection: { profilePhotoUrl: 1 } });
		return user?.profilePhotoUrl ?? undefined;
	} catch {
		return undefined;
	}
}

/**
 * Fetch all superadmin user IDs so we can fan-out the notification.
 */
async function getSuperadminIds(db: Db): Promise<ObjectId[]> {
	const admins = await db
		.collection<User>('users')
		.find({ role: 'superadmin', isActive: true }, { projection: { _id: 1 } })
		.toArray();
	return admins.map((a) => a._id!);
}

export async function notifySupportMessage(ctx: SupportNotificationContext): Promise<void> {
	const { db, ticketId, ticketSubject, senderId, senderRole, senderName, messageBody, ownerId, ownerRole } = ctx;

	const senderPhoto = await getSenderPhoto(db, senderId);
	const msgPreview = preview(messageBody);
	const link = `/support?ticketId=${ticketId}`;

	const inputs: CreateNotificationInput[] = [];

	if (senderRole === 'superadmin') {
		// ── Superadmin replied → notify the ticket owner ──────────────────────
		if (!ObjectId.isValid(ownerId)) return;

		inputs.push({
			userId: new ObjectId(ownerId),
			audienceRole: ownerRole as NotificationAudienceRole,
			type: 'support_message_received',
			title: 'New reply from Support Team',
			message: msgPreview,
			link,
			metadata: {
				ticketId,
				ticketSubject,
				senderName,
				senderRole,
				actorName: senderName,
				...(senderPhoto ? { actorPhotoUrl: senderPhoto } : {})
			}
		});
	} else {
		// ── Owner sent a message → notify all superadmins ─────────────────────
		const superadminIds = await getSuperadminIds(db);
		const roleLabel = senderRole.charAt(0).toUpperCase() + senderRole.slice(1);

		for (const adminId of superadminIds) {
			inputs.push({
				userId: adminId,
				audienceRole: 'superadmin',
				type: 'support_message_received',
				title: `New support message from ${senderName} (${roleLabel})`,
				message: msgPreview,
				link: `/superadmin/support?ticketId=${ticketId}`,
				metadata: {
					ticketId,
					ticketSubject,
					senderName,
					senderRole,
					actorName: senderName,
					...(senderPhoto ? { actorPhotoUrl: senderPhoto } : {})
				}
			});
		}
	}

	if (inputs.length > 0) {
		await createNotifications(db, inputs).catch(() => {
			// Non-fatal — notification failure must never break the main flow
		});
	}
}

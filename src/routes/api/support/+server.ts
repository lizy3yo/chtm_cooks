/**
 * /api/support
 *
 * GET    — list tickets (owner sees own; superadmin sees all)
 * POST   — create a new ticket (student, instructor, custodian)
 * PATCH  — send a reply, update status, or mark as read
 */
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { ObjectId } from 'mongodb';
import { getDatabase } from '$lib/server/db/mongodb';
import { getUserFromToken } from '$lib/server/middleware/auth/verify';
import { rateLimit, RateLimitPresets } from '$lib/server/middleware/rateLimit';
import { sanitizeInput } from '$lib/server/utils/validation';
import { logger } from '$lib/server/utils/logger';
import type { SupportMessage, SupportChatEntry, SupportTicketOwnerRole } from '$lib/server/models/SupportMessage';
import { toSupportMessageResponse } from '$lib/server/models/SupportMessage';
import type { User } from '$lib/server/models/User';
import {
	publishSupportEvent,
	SUPPORT_SUPERADMIN_CHANNEL,
	supportUserChannel
} from '$lib/server/realtime/supportEvents';
import { notifySupportMessage } from '$lib/server/services/notifications';

const COLLECTION = 'support_messages';
const MAX_SUBJECT_LEN = 120;
const MAX_BODY_LEN = 2000;

/** Roles that are allowed to open and reply to support tickets. */
const TICKET_OWNER_ROLES: SupportTicketOwnerRole[] = ['student', 'instructor', 'custodian'];

function isTicketOwnerRole(role: string): role is SupportTicketOwnerRole {
	return TICKET_OWNER_ROLES.includes(role as SupportTicketOwnerRole);
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function enrichTickets(db: Awaited<ReturnType<typeof getDatabase>>, tickets: SupportMessage[]) {
	const ownerIds = [...new Set(tickets.map((t) => t.studentId.toString()))];
	const usersCol = db.collection<User>('users');
	const users = ownerIds.length
		? await usersCol
				.find(
					{ _id: { $in: ownerIds.map((id) => new ObjectId(id)) } },
					{ projection: { firstName: 1, lastName: 1, email: 1 } }
				)
				.toArray()
		: [];
	const userMap = new Map(users.map((u) => [u._id!.toString(), u]));

	return tickets.map((t) => {
		const u = userMap.get(t.studentId.toString());
		return toSupportMessageResponse(
			t,
			u ? `${u.firstName} ${u.lastName}`.trim() : undefined,
			u?.email
		);
	});
}

// ─── GET /api/support ────────────────────────────────────────────────────────

export const GET: RequestHandler = async (event) => {
	const rl = await rateLimit(event, RateLimitPresets.API);
	if (rl instanceof Response) return rl;

	const user = getUserFromToken(event);
	if (!user) return json({ error: 'Unauthorized' }, { status: 401 });

	try {
		const db = await getDatabase();
		const col = db.collection<SupportMessage>(COLLECTION);

		const url = new URL(event.request.url);
		const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10));
		const limit = Math.min(50, Math.max(1, parseInt(url.searchParams.get('limit') || '20', 10)));
		const skip = (page - 1) * limit;
		const status = url.searchParams.get('status') || undefined;

		const filter: Record<string, unknown> = {};

		if (isTicketOwnerRole(user.role)) {
			// Owners only see their own tickets
			filter.studentId = new ObjectId(user.userId);
		} else if (user.role === 'superadmin') {
			// Superadmin sees all tickets — no additional filter
		} else {
			return json({ error: 'Forbidden' }, { status: 403 });
		}

		if (status && ['open', 'in_progress', 'resolved', 'closed'].includes(status)) {
			filter.status = status;
		}

		const [tickets, total] = await Promise.all([
			col.find(filter).sort({ lastMessageAt: -1 }).skip(skip).limit(limit).toArray(),
			col.countDocuments(filter)
		]);

		const enriched = await enrichTickets(db, tickets);

		return json({
			tickets: enriched,
			pagination: { page, limit, total, totalPages: Math.ceil(total / limit) }
		});
	} catch (err) {
		logger.error('GET /api/support error', { err });
		return json({ error: 'Internal server error' }, { status: 500 });
	}
};

// ─── POST /api/support ───────────────────────────────────────────────────────

export const POST: RequestHandler = async (event) => {
	const rl = await rateLimit(event, RateLimitPresets.API);
	if (rl instanceof Response) return rl;

	const user = getUserFromToken(event);
	if (!user) return json({ error: 'Unauthorized' }, { status: 401 });

	if (!isTicketOwnerRole(user.role)) {
		return json({ error: 'Only students, instructors, and custodians can open support tickets' }, { status: 403 });
	}

	try {
		const body = await event.request.json();
		const subject = sanitizeInput((body.subject ?? '').toString()).slice(0, MAX_SUBJECT_LEN).trim();
		const message = sanitizeInput((body.message ?? '').toString()).slice(0, MAX_BODY_LEN).trim();

		if (!subject) return json({ error: 'Subject is required' }, { status: 400 });
		if (!message) return json({ error: 'Message is required' }, { status: 400 });

		const db = await getDatabase();
		const usersCol = db.collection<User>('users');
		const ownerDoc = await usersCol.findOne(
			{ _id: new ObjectId(user.userId) },
			{ projection: { firstName: 1, lastName: 1 } }
		);
		const senderName = ownerDoc
			? `${ownerDoc.firstName} ${ownerDoc.lastName}`.trim()
			: user.role.charAt(0).toUpperCase() + user.role.slice(1);

		const now = new Date();
		const firstEntry: SupportChatEntry = {
			_id: new ObjectId(),
			sender: user.role as SupportTicketOwnerRole,
			senderId: new ObjectId(user.userId),
			senderName,
			body: message,
			sentAt: now
		};

		const ticket: SupportMessage = {
			studentId: new ObjectId(user.userId),
			ownerRole: user.role as SupportTicketOwnerRole,
			subject,
			messages: [firstEntry],
			status: 'open',
			lastMessageAt: now,
			unreadBySuperadmin: 1,
			unreadByStudent: 0,
			createdAt: now,
			updatedAt: now
		};

		const col = db.collection<SupportMessage>(COLLECTION);
		const result = await col.insertOne(ticket);
		ticket._id = result.insertedId;

		publishSupportEvent([SUPPORT_SUPERADMIN_CHANNEL], {
			action: 'ticket_created',
			ticketId: result.insertedId.toString(),
			ownerId: user.userId,
			occurredAt: now.toISOString()
		});

		// Notify all superadmins — fire-and-forget, non-fatal
		notifySupportMessage({
			db,
			ticketId: result.insertedId.toString(),
			ticketSubject: subject,
			senderId: user.userId,
			senderRole: user.role as 'student' | 'instructor' | 'custodian',
			senderName,
			messageBody: message,
			ownerId: user.userId,
			ownerRole: user.role as 'student' | 'instructor' | 'custodian'
		}).catch(() => { /* non-fatal */ });

		logger.info('Support ticket created', {
			ticketId: result.insertedId.toString(),
			ownerId: user.userId,
			ownerRole: user.role
		});

		return json(toSupportMessageResponse(ticket, senderName), { status: 201 });
	} catch (err) {
		logger.error('POST /api/support error', { err });
		return json({ error: 'Internal server error' }, { status: 500 });
	}
};

// ─── PATCH /api/support?ticketId=xxx ─────────────────────────────────────────

export const PATCH: RequestHandler = async (event) => {
	const rl = await rateLimit(event, RateLimitPresets.API);
	if (rl instanceof Response) return rl;

	const user = getUserFromToken(event);
	if (!user) return json({ error: 'Unauthorized' }, { status: 401 });

	const ticketId = new URL(event.request.url).searchParams.get('ticketId');
	if (!ticketId || !ObjectId.isValid(ticketId)) {
		return json({ error: 'Valid ticketId is required' }, { status: 400 });
	}

	try {
		const body = await event.request.json();
		const db = await getDatabase();
		const col = db.collection<SupportMessage>(COLLECTION);

		const ticket = await col.findOne({ _id: new ObjectId(ticketId) });
		if (!ticket) return json({ error: 'Ticket not found' }, { status: 404 });

		// Access control — owner can only access their own ticket
		if (isTicketOwnerRole(user.role) && ticket.studentId.toString() !== user.userId) {
			return json({ error: 'Forbidden' }, { status: 403 });
		}
		if (!isTicketOwnerRole(user.role) && user.role !== 'superadmin') {
			return json({ error: 'Forbidden' }, { status: 403 });
		}

		const now = new Date();
		const updates: Record<string, unknown> = { updatedAt: now };

		// ── Send a reply ──────────────────────────────────────────────────────
		if (body.message) {
			const msgBody = sanitizeInput((body.message ?? '').toString()).slice(0, MAX_BODY_LEN).trim();
			if (!msgBody) return json({ error: 'Message body is required' }, { status: 400 });

			const usersCol = db.collection<User>('users');
			const senderDoc = await usersCol.findOne(
				{ _id: new ObjectId(user.userId) },
				{ projection: { firstName: 1, lastName: 1 } }
			);
			const senderName = senderDoc
				? `${senderDoc.firstName} ${senderDoc.lastName}`.trim()
				: user.role === 'superadmin' ? 'Support Team' : user.role.charAt(0).toUpperCase() + user.role.slice(1);

			const entry: SupportChatEntry = {
				_id: new ObjectId(),
				sender: user.role === 'superadmin' ? 'superadmin' : (user.role as SupportTicketOwnerRole),
				senderId: new ObjectId(user.userId),
				senderName,
				body: msgBody,
				sentAt: now
			};

			updates['$push'] = { messages: entry };
			updates['lastMessageAt'] = now;

			if (user.role === 'superadmin') {
				updates['unreadByStudent'] = (ticket.unreadByStudent ?? 0) + 1;
				updates['unreadBySuperadmin'] = 0;
				// Auto-set to in_progress when superadmin first replies
				if (ticket.status === 'open') updates['status'] = 'in_progress';
			} else {
				updates['unreadBySuperadmin'] = (ticket.unreadBySuperadmin ?? 0) + 1;
				updates['unreadByStudent'] = 0;
			}

			const { $push, ...setFields } = updates as { $push: unknown; [k: string]: unknown };
			await col.updateOne(
				{ _id: new ObjectId(ticketId) },
				{ $set: setFields, $push: $push as Record<string, unknown> }
			);

			const channels = [
				SUPPORT_SUPERADMIN_CHANNEL,
				supportUserChannel(ticket.studentId.toString())
			];
			publishSupportEvent(channels, {
				action: 'message_sent',
				ticketId,
				ownerId: ticket.studentId.toString(),
				occurredAt: now.toISOString()
			});

			// Notify the recipient — fire-and-forget, non-fatal
			notifySupportMessage({
				db,
				ticketId,
				ticketSubject: ticket.subject,
				senderId: user.userId,
				senderRole: user.role as 'student' | 'instructor' | 'custodian' | 'superadmin',
				senderName,
				messageBody: msgBody,
				ownerId: ticket.studentId.toString(),
				ownerRole: (ticket.ownerRole ?? 'student') as 'student' | 'instructor' | 'custodian'
			}).catch(() => { /* non-fatal */ });
		}

		// ── Update status (superadmin only) ───────────────────────────────────
		if (body.status && user.role === 'superadmin') {
			const validStatuses = ['open', 'in_progress', 'resolved', 'closed'];
			if (!validStatuses.includes(body.status)) {
				return json({ error: 'Invalid status' }, { status: 400 });
			}
			await col.updateOne(
				{ _id: new ObjectId(ticketId) },
				{ $set: { status: body.status, updatedAt: now } }
			);
			publishSupportEvent(
				[SUPPORT_SUPERADMIN_CHANNEL, supportUserChannel(ticket.studentId.toString())],
				{
					action: 'status_changed',
					ticketId,
					ownerId: ticket.studentId.toString(),
					occurredAt: now.toISOString()
				}
			);
		}

		// ── Mark as read ──────────────────────────────────────────────────────
		if (body.markRead) {
			if (user.role === 'superadmin') {
				await col.updateOne(
					{ _id: new ObjectId(ticketId) },
					{ $set: { unreadBySuperadmin: 0, updatedAt: now } }
				);
			} else {
				await col.updateOne(
					{ _id: new ObjectId(ticketId) },
					{ $set: { unreadByStudent: 0, updatedAt: now } }
				);
			}
		}

		const updated = await col.findOne({ _id: new ObjectId(ticketId) });
		if (!updated) return json({ error: 'Ticket not found after update' }, { status: 404 });

		const [enriched] = await enrichTickets(db, [updated]);
		return json(enriched);
	} catch (err) {
		logger.error('PATCH /api/support error', { err });
		return json({ error: 'Internal server error' }, { status: 500 });
	}
};

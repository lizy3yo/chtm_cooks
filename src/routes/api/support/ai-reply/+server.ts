/**
 * POST /api/support/ai-reply
 *
 * Called after a user sends a message to an existing support ticket.
 * Fetches an ARIA response and appends it to the ticket as a superadmin message
 * so both the user and the superadmin see the full thread.
 *
 * The superadmin can take over at any time — once a human replies, the client
 * should stop calling this endpoint for that ticket.
 */
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { ObjectId } from 'mongodb';
import { getDatabase } from '$lib/server/db/mongodb';
import { getUserFromToken } from '$lib/server/middleware/auth/verify';
import { rateLimit, RateLimitPresets } from '$lib/server/middleware/rateLimit';
import { sanitizeInput } from '$lib/server/utils/validation';
import { logger } from '$lib/server/utils/logger';
import type { SupportMessage, SupportChatEntry } from '$lib/server/models/SupportMessage';
import { toSupportMessageResponse } from '$lib/server/models/SupportMessage';
import { notifySupportMessage } from '$lib/server/services/notifications';
import type { User } from '$lib/server/models/User';
import { createAiChatResponse, type ChatMessage } from '$lib/server/services/aiChat';
import {
	publishSupportEvent,
	SUPPORT_SUPERADMIN_CHANNEL,
	supportUserChannel
} from '$lib/server/realtime/supportEvents';

const COLLECTION = 'support_messages';
const MAX_BODY_LEN = 2000;
const ARIA_SENDER_NAME = 'ARIA';

/** Roles that are allowed to trigger an AI reply. */
const TICKET_OWNER_ROLES = ['student', 'instructor', 'custodian'];

async function enrichOne(db: Awaited<ReturnType<typeof getDatabase>>, ticket: SupportMessage) {
	const usersCol = db.collection<User>('users');
	const owner = await usersCol.findOne(
		{ _id: ticket.studentId },
		{ projection: { firstName: 1, lastName: 1, email: 1 } }
	);
	return toSupportMessageResponse(
		ticket,
		owner ? `${owner.firstName} ${owner.lastName}`.trim() : undefined,
		owner?.email
	);
}

export const POST: RequestHandler = async (event) => {
	const rl = await rateLimit(event, RateLimitPresets.API);
	if (rl instanceof Response) return rl;

	const user = getUserFromToken(event);
	if (!user) return json({ error: 'Unauthorized' }, { status: 401 });
	if (!TICKET_OWNER_ROLES.includes(user.role)) {
		return json({ error: 'Forbidden' }, { status: 403 });
	}

	try {
		const body = await event.request.json();
		const ticketId = (body.ticketId ?? '').toString().trim();
		if (!ticketId || !ObjectId.isValid(ticketId)) {
			return json({ error: 'Valid ticketId is required' }, { status: 400 });
		}

		const db = await getDatabase();
		const col = db.collection<SupportMessage>(COLLECTION);

		const ticket = await col.findOne({ _id: new ObjectId(ticketId) });
		if (!ticket) return json({ error: 'Ticket not found' }, { status: 404 });

		// Only the ticket owner can trigger an AI reply
		if (ticket.studentId.toString() !== user.userId) {
			return json({ error: 'Forbidden' }, { status: 403 });
		}

		// If a human (superadmin) has already replied, do not send an AI reply —
		// the human has taken over the conversation.
		const hasHumanReply = ticket.messages.some((m) => m.sender === 'superadmin');
		if (hasHumanReply) {
			const enriched = await enrichOne(db, ticket);
			return json({ ticket: enriched, skipped: true });
		}

		// Build conversation history for ARIA (user messages only — keep it clean)
		const history: ChatMessage[] = ticket.messages
			.filter((m) => m.sender !== 'superadmin')
			.map((m) => ({
				role: m.sender === 'superadmin' ? 'assistant' : 'user',
				content: m.body
			}));

		// Call ARIA
		let ariaText = '';
		try {
			const aiRes = await createAiChatResponse(history, {
				userRole: user.role,
				userId: user.userId
			});

			// The AI service returns an SSE stream — collect it fully
			const reader = aiRes.body?.getReader();
			const decoder = new TextDecoder();
			if (reader) {
				while (true) {
					const { done, value } = await reader.read();
					if (done) break;
					const chunk = decoder.decode(value, { stream: true });
					for (const line of chunk.split('\n')) {
						if (!line.startsWith('data: ')) continue;
						const raw = line.slice(6).trim();
						if (raw === '[DONE]') break;
						try {
							const parsed = JSON.parse(raw);
							const token = parsed?.choices?.[0]?.delta?.content ?? '';
							ariaText += token;
						} catch { /* ignore */ }
					}
				}
			}
		} catch (err) {
			logger.warn('ARIA response failed, using fallback', { err });
		}

		if (!ariaText.trim()) {
			ariaText = 'I was unable to process your request at this time. A member of our support team will follow up shortly.';
		}

		// Append ARIA's reply to the ticket as a superadmin-sender message
		// (so it appears on the left side for the user, and is visible to the superadmin)
		const now = new Date();
		const ariaEntry: SupportChatEntry = {
			_id: new ObjectId(),
			sender: 'superadmin',
			senderId: new ObjectId(), // system ID — no real user
			senderName: ARIA_SENDER_NAME,
			body: sanitizeInput(ariaText).slice(0, MAX_BODY_LEN),
			sentAt: now
		};

		await col.updateOne(
			{ _id: new ObjectId(ticketId) },
			{
				$push: { messages: ariaEntry },
				$set: {
					lastMessageAt: now,
					updatedAt: now,
					unreadByStudent: (ticket.unreadByStudent ?? 0) + 1
				}
			}
		);

		// Notify both sides via SSE
		publishSupportEvent(
			[SUPPORT_SUPERADMIN_CHANNEL, supportUserChannel(ticket.studentId.toString())],
			{
				action: 'message_sent',
				ticketId,
				ownerId: ticket.studentId.toString(),
				occurredAt: now.toISOString()
			}
		);

		// Notify the ticket owner that ARIA replied — fire-and-forget, non-fatal
		notifySupportMessage({
			db,
			ticketId,
			ticketSubject: ticket.subject,
			senderId: new ObjectId().toString(), // ARIA has no real user ID
			senderRole: 'superadmin',
			senderName: ARIA_SENDER_NAME,
			messageBody: ariaText,
			ownerId: ticket.studentId.toString(),
			ownerRole: (ticket.ownerRole ?? 'student') as 'student' | 'instructor' | 'custodian'
		}).catch(() => { /* non-fatal */ });

		const updated = await col.findOne({ _id: new ObjectId(ticketId) });
		const enriched = await enrichOne(db, updated!);
		return json({ ticket: enriched, skipped: false });
	} catch (err) {
		logger.error('POST /api/support/ai-reply error', { err });
		return json({ error: 'Internal server error' }, { status: 500 });
	}
};

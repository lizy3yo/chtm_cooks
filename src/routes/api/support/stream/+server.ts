/**
 * GET /api/support/stream
 *
 * Server-Sent Events endpoint for real-time support chat updates.
 * Students, instructors, and custodians receive events for their own tickets.
 * Superadmins receive events for all tickets.
 */
import type { RequestHandler } from './$types';
import { getUserFromToken } from '$lib/server/middleware/auth/verify';
import {
	subscribeToSupportChannel,
	SUPPORT_SUPERADMIN_CHANNEL,
	supportUserChannel,
	type SupportRealtimeEvent
} from '$lib/server/realtime/supportEvents';

const TICKET_OWNER_ROLES = ['student', 'instructor', 'custodian'];

export const GET: RequestHandler = async (event) => {
	const user = getUserFromToken(event);
	if (!user) {
		return new Response('Unauthorized', { status: 401 });
	}

	const isOwner = TICKET_OWNER_ROLES.includes(user.role);
	const isSuperadmin = user.role === 'superadmin';

	if (!isOwner && !isSuperadmin) {
		return new Response('Forbidden', { status: 403 });
	}

	const channel = isSuperadmin
		? SUPPORT_SUPERADMIN_CHANNEL
		: supportUserChannel(user.userId);

	let unsubscribe: (() => void) | null = null;
	let controller: ReadableStreamDefaultController<Uint8Array> | null = null;
	const encoder = new TextEncoder();

	function send(data: string) {
		try {
			controller?.enqueue(encoder.encode(`data: ${data}\n\n`));
		} catch {
			// Stream closed
		}
	}

	const stream = new ReadableStream<Uint8Array>({
		start(ctrl) {
			controller = ctrl;
			send(JSON.stringify({ type: 'connected' }));
			unsubscribe = subscribeToSupportChannel(channel, (evt: SupportRealtimeEvent) => {
				send(JSON.stringify(evt));
			});
		},
		cancel() {
			unsubscribe?.();
			unsubscribe = null;
			controller = null;
		}
	});

	// Heartbeat every 25 seconds to keep the connection alive through proxies
	const heartbeatInterval = setInterval(() => {
		send(JSON.stringify({ type: 'heartbeat' }));
	}, 25_000);

	event.request.signal.addEventListener('abort', () => {
		clearInterval(heartbeatInterval);
		unsubscribe?.();
	});

	return new Response(stream, {
		headers: {
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-cache',
			Connection: 'keep-alive',
			'X-Accel-Buffering': 'no'
		}
	});
};

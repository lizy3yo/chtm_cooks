/**
 * GET /api/financial-obligations/stream
 *
 * Authenticated SSE endpoint for real-time financial obligation change notifications.
 * Only custodians and superadmins may subscribe (students receive events via the
 * borrow-requests stream which already covers obligation_updated actions).
 *
 * Protocol:
 *   - `event: connected`                  — acknowledges successful subscription.
 *   - `event: financial_obligation_change` — an obligation was created, resolved, or
 *                                            a borrow request was auto-resolved; client
 *                                            should re-fetch its obligations list.
 *   - `event: heartbeat`                  — keepalive; no client action needed.
 *
 * Headers required by reverse proxies:
 *   X-Accel-Buffering: no  (nginx)
 *   Cache-Control: no-cache
 */

import { getUserFromToken } from '$lib/server/middleware/auth/verify';
import {
	subscribeToFinancialObligationChannel,
	type FinancialObligationRealtimeEvent
} from '$lib/server/realtime/financialObligationEvents';
import type { RequestHandler } from './$types';

const HEARTBEAT_INTERVAL_MS = 20_000;
const RETRY_INTERVAL_MS = 3_000;

const ALLOWED_ROLES = new Set(['custodian', 'superadmin']);

export const GET: RequestHandler = async (event) => {
	const user = getUserFromToken(event);
	if (!user) {
		return new Response('Unauthorized', { status: 401 });
	}

	if (!ALLOWED_ROLES.has(user.role)) {
		return new Response('Forbidden', { status: 403 });
	}

	// Custodians subscribe to the role channel; superadmins subscribe to both.
	const channels =
		user.role === 'superadmin'
			? ['role:custodian', 'role:superadmin']
			: ['role:custodian'];

	let cleanupStream = () => {};

	const stream = new ReadableStream({
		start(controller) {
			const encoder = new TextEncoder();
			let closed = false;
			let eventId = Date.now();

			const cleanupFns: Array<() => void> = [];

			const cleanup = () => {
				if (closed) return;
				closed = true;
				for (const fn of cleanupFns) fn();
				try {
					controller.close();
				} catch {
					// Already closed.
				}
			};
			cleanupStream = cleanup;

			const encode = (data: string) => encoder.encode(data);

			const sendRaw = (raw: string) => {
				if (closed) return;
				try {
					controller.enqueue(encode(raw));
				} catch {
					cleanup();
				}
			};

			const send = (eventName: string, data: unknown) => {
				sendRaw(`id: ${eventId++}\nevent: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`);
			};

			// Advise clients how long to wait before reconnect attempts.
			sendRaw(`retry: ${RETRY_INTERVAL_MS}\n\n`);

			// Acknowledge connection immediately.
			send('connected', { channels, ts: new Date().toISOString() });

			// Forward broker events to this SSE client.
			const onEvent = (brokerEvent: FinancialObligationRealtimeEvent) => {
				send('financial_obligation_change', brokerEvent);
			};

			const unsubscribers = channels.map((ch) =>
				subscribeToFinancialObligationChannel(ch, onEvent)
			);
			cleanupFns.push(...unsubscribers);

			// Keepalive heartbeat so the connection is not cut by idle timeouts.
			const heartbeat = setInterval(() => {
				send('heartbeat', { ts: new Date().toISOString() });
			}, HEARTBEAT_INTERVAL_MS);
			cleanupFns.push(() => clearInterval(heartbeat));

			// Cleanup on client disconnect.
			event.request.signal.addEventListener('abort', cleanup, { once: true });
		},
		cancel() {
			cleanupStream();
		}
	});

	return new Response(stream, {
		headers: {
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-cache, no-transform',
			Connection: 'keep-alive',
			'X-Accel-Buffering': 'no'
		}
	});
};

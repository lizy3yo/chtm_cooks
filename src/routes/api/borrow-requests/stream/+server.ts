/**
 * GET /api/borrow-requests/stream
 *
 * Authenticated Server-Sent Events endpoint.
 * Each connected client receives real-time borrow-request lifecycle events
 * for every channel that matches their role/identity.
 *
 * Protocol:
 *   - `event: borrow_request_change` — a mutation occurred; client should
 *     re-fetch its list/detail data.
 *   - `event: heartbeat` — keepalive; no action needed.
 *   - `event: connected` — acknowledges successful subscription.
 *
 * Headers required by reverse proxies:
 *   X-Accel-Buffering: no  (nginx)
 *   Cache-Control: no-cache
 */

import { getUserFromToken } from '$lib/server/middleware/auth/verify';
import {
	subscribeToBorrowRequestChannel,
	type BorrowRequestRealtimeEvent
} from '$lib/server/realtime/borrowRequestEvents';
import { getBorrowRequestRealtimeChannels } from '../shared';
import type { RequestHandler } from './$types';

const HEARTBEAT_INTERVAL_MS = 20_000;
const RETRY_INTERVAL_MS = 3_000;

export const GET: RequestHandler = async (event) => {
	const user = getUserFromToken(event);
	if (!user) {
		return new Response('Unauthorized', { status: 401 });
	}

	const channels = getBorrowRequestRealtimeChannels(user);
	if (channels.length === 0) {
		return new Response('Forbidden', { status: 403 });
	}

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

			const encode = (sseData: string) => encoder.encode(sseData);

			const sendRaw = (raw: string) => {
				if (closed) return;
				try {
					controller.enqueue(encode(raw));
				} catch {
					cleanup();
				}
			};

			const send = (eventName: string, data: unknown) => {
				sendRaw(
					`id: ${eventId++}\nevent: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`
				);
			};

			// Advise clients how long to wait before reconnect attempts.
			sendRaw(`retry: ${RETRY_INTERVAL_MS}\n\n`);

			// Acknowledge connection immediately.
			send('connected', { channels, ts: new Date().toISOString() });

			// Forward broker events to this SSE client.
			const onEvent = (brokerEvent: BorrowRequestRealtimeEvent) => {
				send('borrow_request_change', brokerEvent);
			};

			// Subscribe to all relevant channels and collect cleanup functions.
			const unsubscribers = channels.map((ch) =>
				subscribeToBorrowRequestChannel(ch, onEvent)
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

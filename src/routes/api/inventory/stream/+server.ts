/**
 * GET /api/inventory/stream
 *
 * Authenticated Server-Sent Events endpoint for inventory change notifications.
 * All connected clients (students, instructors, custodians, superadmins) receive
 * real-time events whenever an inventory item or category is mutated.
 *
 * Protocol:
 *   - `event: connected`           — acknowledges successful subscription.
 *   - `event: inventory_change`    — an item or category was mutated; client
 *                                    should re-fetch its catalog / inventory data.
 *   - `event: heartbeat`           — keepalive; no client action needed.
 *
 * Headers:
 *   X-Accel-Buffering: no  — disable nginx proxy buffering
 *   Cache-Control: no-cache
 */

import { getUserFromToken } from '$lib/server/middleware/auth/verify';
import {
	subscribeToInventoryChannel,
	INVENTORY_CHANNEL,
	type InventoryRealtimeEvent
} from '$lib/server/realtime/inventoryEvents';
import type { RequestHandler } from './$types';

const HEARTBEAT_INTERVAL_MS = 20_000;

export const GET: RequestHandler = async (event) => {
	const user = getUserFromToken(event);
	if (!user) {
		return new Response('Unauthorized', { status: 401 });
	}

	// All authenticated roles that can view inventory may subscribe.
	if (!['student', 'instructor', 'custodian', 'superadmin'].includes(user.role)) {
		return new Response('Forbidden', { status: 403 });
	}

	const stream = new ReadableStream({
		start(controller) {
			const encode = (data: string) => new TextEncoder().encode(data);

			const send = (eventName: string, payload: unknown) => {
				try {
					controller.enqueue(
						encode(`event: ${eventName}\ndata: ${JSON.stringify(payload)}\n\n`)
					);
				} catch {
					// Stream already closed.
				}
			};

			// Acknowledge connection immediately.
			send('connected', { channel: INVENTORY_CHANNEL, ts: new Date().toISOString() });

			// Forward broker events to this SSE client.
			const onEvent = (brokerEvent: InventoryRealtimeEvent) => {
				send('inventory_change', brokerEvent);
			};

			const unsubscribe = subscribeToInventoryChannel(INVENTORY_CHANNEL, onEvent);

			// Keepalive heartbeat.
			const heartbeat = setInterval(() => {
				send('heartbeat', { ts: new Date().toISOString() });
			}, HEARTBEAT_INTERVAL_MS);

			// Cleanup on client disconnect.
			event.request.signal.addEventListener('abort', () => {
				clearInterval(heartbeat);
				unsubscribe();
				try {
					controller.close();
				} catch {
					// Already closed.
				}
			});
		}
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

/**
 * GET /api/donations/stream
 *
 * Authenticated SSE endpoint for real-time donation change notifications.
 * Only custodians and superadmins may subscribe.
 *
 * Protocol:
 *   - `event: connected`         — acknowledges successful subscription.
 *   - `event: donation_change`   — a donation was created or deleted; client
 *                                  should re-fetch its donations list.
 *   - `event: heartbeat`         — keepalive; no client action needed.
 */

import { getUserFromToken } from '$lib/server/middleware/auth/verify';
import {
	subscribeToDonationChannel,
	DONATION_CHANNEL,
	type DonationRealtimeEvent
} from '$lib/server/realtime/donationEvents';
import type { RequestHandler } from './$types';

const HEARTBEAT_INTERVAL_MS = 20_000;

export const GET: RequestHandler = async (event) => {
	const user = getUserFromToken(event);
	if (!user) return new Response('Unauthorized', { status: 401 });

	if (!['custodian', 'superadmin'].includes(user.role)) {
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

			send('connected', { channel: DONATION_CHANNEL, ts: new Date().toISOString() });

			const onEvent = (brokerEvent: DonationRealtimeEvent) => {
				send('donation_change', brokerEvent);
			};

			const unsubscribe = subscribeToDonationChannel(DONATION_CHANNEL, onEvent);

			const heartbeat = setInterval(() => {
				send('heartbeat', { ts: new Date().toISOString() });
			}, HEARTBEAT_INTERVAL_MS);

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

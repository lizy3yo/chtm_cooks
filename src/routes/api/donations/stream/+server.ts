/**
 * GET /api/donations/stream
 *
 * Authenticated SSE endpoint for real-time donation change notifications.
 * Only custodians and superadmins may subscribe.
 *
 * Industry Standard:
 *   - Server-Sent Events (SSE) for push notifications
 *   - Automatic reconnection on connection loss
 *   - Heartbeat to keep connection alive and detect dead connections
 *   - Proper cleanup on disconnect
 *   - Follows patterns used by Shopify, Stripe, GitHub, and other modern platforms
 *
 * Protocol:
 *   - `event: connected`         — acknowledges successful subscription.
 *   - `event: donation_change`   — a donation was created, updated, or deleted;
 *                                  client should re-fetch its donations list.
 *   - `event: heartbeat`         — keepalive; no client action needed.
 */

import { getUserFromToken } from '$lib/server/middleware/auth/verify';
import {
	subscribeToDonationChannel,
	DONATION_CHANNEL,
	type DonationRealtimeEvent
} from '$lib/server/realtime/donationEvents';
import type { RequestHandler } from './$types';

const HEARTBEAT_INTERVAL_MS = 20_000; // 20 seconds

export const GET: RequestHandler = async (event) => {
	const user = getUserFromToken(event);
	if (!user) return new Response('Unauthorized', { status: 401 });

	if (!['custodian', 'superadmin'].includes(user.role)) {
		return new Response('Forbidden', { status: 403 });
	}

	const stream = new ReadableStream({
		start(controller) {
			const encoder = new TextEncoder();
			let isClosed = false;

			const send = (eventName: string, payload: unknown) => {
				if (isClosed) return;
				
				try {
					const message = `event: ${eventName}\ndata: ${JSON.stringify(payload)}\n\n`;
					controller.enqueue(encoder.encode(message));
				} catch (error) {
					console.error('[DONATION-SSE-STREAM] Failed to send event:', error);
					isClosed = true;
				}
			};

			// Send initial connection confirmation
			send('connected', { 
				channel: DONATION_CHANNEL, 
				ts: new Date().toISOString(),
				userId: user.userId,
				userRole: user.role
			});

			console.log('[DONATION-SSE-STREAM] Client connected:', {
				userId: user.userId,
				userRole: user.role,
				channel: DONATION_CHANNEL
			});

			// Subscribe to donation changes
			const onEvent = (brokerEvent: DonationRealtimeEvent) => {
				console.log('[DONATION-SSE-STREAM] Event received from broker:', {
					userId: user.userId,
					action: brokerEvent.action,
					entityId: brokerEvent.entityId
				});
				send('donation_change', brokerEvent);
			};

			const unsubscribe = subscribeToDonationChannel(DONATION_CHANNEL, onEvent);

			// Heartbeat to keep connection alive and detect dead connections
			const heartbeat = setInterval(() => {
				if (isClosed) {
					clearInterval(heartbeat);
					return;
				}
				send('heartbeat', { ts: new Date().toISOString() });
			}, HEARTBEAT_INTERVAL_MS);

			// Cleanup on connection close
			event.request.signal.addEventListener('abort', () => {
				console.log('[DONATION-SSE-STREAM] Client disconnected:', {
					userId: user.userId,
					userRole: user.role
				});
				
				isClosed = true;
				clearInterval(heartbeat);
				unsubscribe();
				
				try {
					controller.close();
				} catch {
					// Controller may already be closed
				}
			});
		}
	});

	return new Response(stream, {
		headers: {
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-cache, no-transform',
			'Connection': 'keep-alive',
			'X-Accel-Buffering': 'no' // Disable nginx buffering
		}
	});
};

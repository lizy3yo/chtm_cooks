/**
 * SSE endpoint for real-time class-code change notifications.
 *
 * Architecture mirrors users/stream/+server.ts:
 *   - Authenticated superadmins subscribe to the `class-codes:all` channel.
 *   - Backend publishes events after every class-code mutation or enrollment change.
 *   - Clients receive events and re-fetch the list or patch stats in-place.
 *
 * Industry Standard:
 *   - Server-Sent Events (SSE) for push notifications
 *   - Automatic reconnection on connection loss (browser-native)
 *   - Heartbeat to keep connection alive through proxies
 */

import type { RequestHandler } from './$types';
import { getUserFromToken } from '$lib/server/middleware/auth/verify';
import {
	subscribeToClassCodeChannel,
	CLASS_CODE_CHANNEL,
	type ClassCodeRealtimeEvent
} from '$lib/server/realtime/classCodeEvents';

/**
 * GET /api/class-codes/stream
 *
 * Establishes an SSE connection for real-time class-code updates.
 * Only superadmins can subscribe.
 */
export const GET: RequestHandler = async (event) => {
	const user = getUserFromToken(event);
	if (!user) return new Response('Unauthorized', { status: 401 });
	if (user.role !== 'superadmin') {
		return new Response('Forbidden: Superadmin access required', { status: 403 });
	}

	const stream = new ReadableStream({
		start(controller) {
			const encoder = new TextEncoder();

			function enqueue(eventName: string, data: unknown) {
				try {
					controller.enqueue(
						encoder.encode(`event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`)
					);
				} catch {
					// Controller may be closed — swallow silently
				}
			}

			// Initial handshake
			enqueue('connected', { timestamp: new Date().toISOString() });

			console.log('[CLASS-CODE-SSE-STREAM] Client connected:', {
				userId: user.userId,
				userRole: user.role
			});

			// Subscribe to class-code events
			const unsubscribe = subscribeToClassCodeChannel(
				CLASS_CODE_CHANNEL,
				(ccEvent: ClassCodeRealtimeEvent) => {
					console.log('[CLASS-CODE-SSE-STREAM] Event → client:', ccEvent.action);
					enqueue('class_code_change', ccEvent);
				}
			);

			// Heartbeat every 30s to keep connection alive through proxies
			const heartbeatInterval = setInterval(() => {
				try {
					controller.enqueue(encoder.encode('event: heartbeat\ndata: ping\n\n'));
				} catch {
					clearInterval(heartbeatInterval);
				}
			}, 30_000);

			// Cleanup on disconnect
			event.request.signal.addEventListener('abort', () => {
				console.log('[CLASS-CODE-SSE-STREAM] Client disconnected:', { userId: user.userId });
				clearInterval(heartbeatInterval);
				unsubscribe();
				try {
					controller.close();
				} catch {
					// Already closed — ignore
				}
			});
		}
	});

	return new Response(stream, {
		headers: {
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-cache, no-transform',
			Connection: 'keep-alive',
			'X-Accel-Buffering': 'no' // Disable nginx buffering
		}
	});
};

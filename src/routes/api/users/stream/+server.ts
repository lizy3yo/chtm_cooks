/**
 * SSE endpoint for real-time user change notifications.
 *
 * Architecture:
 *   - Authenticated superadmins subscribe to the `users:all` channel (user CRUD)
 *     AND the `profiles:all` channel (profile photo updates).
 *   - Backend publishes events after every user mutation or profile-photo upload.
 *   - Clients receive events and can refresh their local cache or patch in-place.
 *
 * Industry Standard:
 *   - Server-Sent Events (SSE) for push notifications
 *   - Automatic reconnection on connection loss (browser-native)
 *   - Heartbeat to keep connection alive through proxies
 *   - Follows patterns used by Shopify, Stripe, and other modern platforms
 */

import type { RequestHandler } from './$types';
import { getUserFromToken } from '$lib/server/middleware/auth/verify';
import {
	subscribeToUserChannel,
	USER_CHANNEL,
	type UserRealtimeEvent
} from '$lib/server/realtime/userEvents';
import {
	subscribeToProfileChannel,
	PROFILES_BROADCAST_CHANNEL,
	type ProfileRealtimeEvent
} from '$lib/server/realtime/profileEvents';

/**
 * GET /api/users/stream
 *
 * Establishes an SSE connection for real-time user updates.
 * Only superadmins can subscribe.
 */
export const GET: RequestHandler = async (event) => {
	// Verify authentication
	const user = getUserFromToken(event);
	if (!user) {
		return new Response('Unauthorized', { status: 401 });
	}

	// Verify superadmin role
	if (user.role !== 'superadmin') {
		return new Response('Forbidden: Superadmin access required', { status: 403 });
	}

	// Create SSE stream
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

			// ── Initial handshake ──────────────────────────────────────────────
			enqueue('connected', { timestamp: new Date().toISOString() });

			console.log('[USER-SSE-STREAM] Client connected:', {
				userId: user.userId,
				userRole: user.role
			});

			// ── Subscribe to user-level CRUD events (users:all) ───────────────
			const unsubscribeUsers = subscribeToUserChannel(
				USER_CHANNEL,
				(userEvent: UserRealtimeEvent) => {
					console.log('[USER-SSE-STREAM] CRUD event → client:', userEvent.action);
					enqueue('user_change', userEvent);
				}
			);

			// ── Subscribe to profile-photo events (profiles:all) ───────────────
			// Fires whenever ANY user uploads or removes their profile photo.
			// The client uses userId to patch the avatar in-place without a full
			// table reload — giving a smooth, Twitter/LinkedIn-style live update.
			const unsubscribeProfiles = subscribeToProfileChannel(
				PROFILES_BROADCAST_CHANNEL,
				(profileEvent: ProfileRealtimeEvent) => {
					if (profileEvent.action !== 'photo_updated') return;
					console.log('[USER-SSE-STREAM] Photo event → client:', profileEvent.userId);
					enqueue('profile_photo_updated', profileEvent);
				}
			);

			// ── Heartbeat (every 30 s) ─────────────────────────────────────────
			const heartbeatInterval = setInterval(() => {
				try {
					controller.enqueue(encoder.encode('event: heartbeat\ndata: ping\n\n'));
				} catch {
					clearInterval(heartbeatInterval);
				}
			}, 30_000);

			// ── Cleanup on disconnect ──────────────────────────────────────────
			event.request.signal.addEventListener('abort', () => {
				console.log('[USER-SSE-STREAM] Client disconnected:', { userId: user.userId });
				clearInterval(heartbeatInterval);
				unsubscribeUsers();
				unsubscribeProfiles();
				try {
					controller.close();
				} catch {
					// Already closed — ignore
				}
			});
		}
	});

	// Return SSE response with proper headers
	return new Response(stream, {
		headers: {
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-cache, no-transform',
			Connection: 'keep-alive',
			'X-Accel-Buffering': 'no' // Disable nginx buffering
		}
	});
};

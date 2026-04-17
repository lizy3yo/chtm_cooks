/**
 * SSE endpoint for real-time inventory change notifications.
 * 
 * Architecture:
 *   - Authenticated users subscribe to the `inventory:all` channel
 *   - Backend publishes events after every inventory mutation
 *   - Clients receive events and refresh their local cache
 * 
 * Industry Standard:
 *   - Server-Sent Events (SSE) for push notifications
 *   - Automatic reconnection on connection loss
 *   - Heartbeat to keep connection alive
 *   - Follows patterns used by Shopify, Stripe, and other modern platforms
 */

import type { RequestHandler } from './$types';
import { getUserFromToken } from '$lib/server/middleware/auth/verify';
import {
	subscribeToInventoryChannel,
	INVENTORY_CHANNEL,
	type InventoryRealtimeEvent
} from '$lib/server/realtime/inventoryEvents';

/**
 * GET /api/inventory/stream
 * 
 * Establishes an SSE connection for real-time inventory updates.
 * All authenticated users can subscribe.
 */
export const GET: RequestHandler = async (event) => {
	// Verify authentication
	const user = getUserFromToken(event);
	if (!user) {
		return new Response('Unauthorized', { status: 401 });
	}

	// Create SSE stream
	const stream = new ReadableStream({
		start(controller) {
			const encoder = new TextEncoder();

			// Send initial connection confirmation
			controller.enqueue(
				encoder.encode(`event: connected\ndata: ${JSON.stringify({ timestamp: new Date().toISOString() })}\n\n`)
			);

			console.log('[SSE-STREAM] Client connected:', {
				userId: user.userId,
				userRole: user.role,
				channel: INVENTORY_CHANNEL
			});

			// Subscribe to inventory changes
			const unsubscribe = subscribeToInventoryChannel(
				INVENTORY_CHANNEL,
				(inventoryEvent: InventoryRealtimeEvent) => {
					try {
						const message = `event: inventory_change\ndata: ${JSON.stringify(inventoryEvent)}\n\n`;
						controller.enqueue(encoder.encode(message));
						
						console.log('[SSE-STREAM] Event sent to client:', {
							userId: user.userId,
							action: inventoryEvent.action,
							entityId: inventoryEvent.entityId,
							entityName: inventoryEvent.entityName
						});
					} catch (error) {
						console.error('[SSE-STREAM] Failed to send event:', error);
					}
				}
			);

			// Heartbeat to keep connection alive (every 30 seconds)
			const heartbeatInterval = setInterval(() => {
				try {
					controller.enqueue(encoder.encode(': heartbeat\n\n'));
				} catch (error) {
					console.error('[SSE-STREAM] Heartbeat failed:', error);
					clearInterval(heartbeatInterval);
				}
			}, 30000);

			// Cleanup on connection close
			event.request.signal.addEventListener('abort', () => {
				console.log('[SSE-STREAM] Client disconnected:', {
					userId: user.userId,
					userRole: user.role
				});
				
				clearInterval(heartbeatInterval);
				unsubscribe();
				
				try {
					controller.close();
				} catch {
					// Controller may already be closed
				}
			});
		}
	});

	// Return SSE response with proper headers
	return new Response(stream, {
		headers: {
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-cache, no-transform',
			'Connection': 'keep-alive',
			'X-Accel-Buffering': 'no' // Disable nginx buffering
		}
	});
};

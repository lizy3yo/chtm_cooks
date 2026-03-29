/**
 * GET /api/reports/analytics/stream
 *
 * SSE endpoint that notifies the analytics page when underlying data changes
 * (borrow requests, financial obligations, donations, inventory).
 * Custodian / superadmin only.
 */

import { getUserFromToken } from '$lib/server/middleware/auth/verify';
import { subscribeToBorrowRequestChannel } from '$lib/server/realtime/borrowRequestEvents';
import { subscribeToFinancialObligationChannel } from '$lib/server/realtime/financialObligationEvents';
import { subscribeToDonationChannel, DONATION_CHANNEL } from '$lib/server/realtime/donationEvents';
import { subscribeToInventoryChannel, INVENTORY_CHANNEL } from '$lib/server/realtime/inventoryEvents';
import type { RequestHandler } from './$types';

const HEARTBEAT_INTERVAL_MS = 20_000;
const RETRY_INTERVAL_MS = 3_000;
const ALLOWED_ROLES = new Set(['custodian', 'superadmin']);

export const GET: RequestHandler = async (event) => {
	const user = getUserFromToken(event);
	if (!user) return new Response('Unauthorized', { status: 401 });
	if (!ALLOWED_ROLES.has(user.role)) return new Response('Forbidden', { status: 403 });

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
				try { controller.close(); } catch { /* already closed */ }
			};
			cleanupStream = cleanup;

			const send = (eventName: string, data: unknown) => {
				if (closed) return;
				try {
					controller.enqueue(
						encoder.encode(`id: ${eventId++}\nevent: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`)
					);
				} catch { cleanup(); }
			};

			controller.enqueue(encoder.encode(`retry: ${RETRY_INTERVAL_MS}\n\n`));
			send('connected', { ts: new Date().toISOString() });

			const notify = () => send('analytics_change', { ts: new Date().toISOString() });

			// Subscribe to all data sources that affect analytics
			cleanupFns.push(subscribeToBorrowRequestChannel('role:custodian', notify));
			cleanupFns.push(subscribeToFinancialObligationChannel('role:custodian', notify));
			cleanupFns.push(subscribeToDonationChannel(DONATION_CHANNEL, notify));
			cleanupFns.push(subscribeToInventoryChannel(INVENTORY_CHANNEL, notify));

			const heartbeat = setInterval(() => {
				send('heartbeat', { ts: new Date().toISOString() });
			}, HEARTBEAT_INTERVAL_MS);
			cleanupFns.push(() => clearInterval(heartbeat));

			event.request.signal.addEventListener('abort', cleanup, { once: true });
		},
		cancel() { cleanupStream(); }
	});

	return new Response(stream, {
		headers: {
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-cache, no-transform',
			'Connection': 'keep-alive',
			'X-Accel-Buffering': 'no'
		}
	});
};

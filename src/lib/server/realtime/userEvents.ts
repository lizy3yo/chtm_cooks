/**
 * In-process SSE event broker for user change notifications.
 *
 * Architecture mirrors inventoryEvents.ts and donationEvents.ts:
 *   - One global singleton (`globalThis.__userRealtimeBroker`) so the
 *     broker survives SvelteKit HMR restarts without dropping listeners.
 *   - Single broadcast channel `users:all` — superadmins subscribe to it.
 *   - Publishers call `publishUserChange()` after every create / update / delete.
 *
 * Industry Standard:
 *   - In-memory pub/sub pattern used by Redis, RabbitMQ, and other message brokers
 *   - Singleton pattern ensures consistency across HMR reloads
 *   - Defensive error handling prevents cascading failures
 */

export type UserRealtimeAction = 'user_created' | 'user_updated' | 'user_deleted';

export interface UserRealtimeEvent {
	action: UserRealtimeAction;
	userId: string;
	occurredAt: string;
}

type Listener = (event: UserRealtimeEvent) => void;

interface BrokerState {
	listeners: Map<string, Set<Listener>>;
}

declare global {
	// eslint-disable-next-line no-var
	var __userRealtimeBroker: BrokerState | undefined;
}

function getBrokerState(): BrokerState {
	if (!globalThis.__userRealtimeBroker) {
		globalThis.__userRealtimeBroker = { listeners: new Map() };
		console.log('[USER-SSE-BROKER] Broker initialized');
	}
	return globalThis.__userRealtimeBroker;
}

/**
 * Subscribe a listener to a channel.
 * Returns an unsubscribe function — call it in SSE stream cleanup.
 */
export function subscribeToUserChannel(channel: string, listener: Listener): () => void {
	const broker = getBrokerState();
	if (!broker.listeners.has(channel)) {
		broker.listeners.set(channel, new Set());
	}
	broker.listeners.get(channel)!.add(listener);

	console.log('[USER-SSE-BROKER] Listener subscribed:', {
		channel,
		totalListeners: broker.listeners.get(channel)?.size || 0
	});

	return () => {
		broker.listeners.get(channel)?.delete(listener);
		if (broker.listeners.get(channel)?.size === 0) {
			broker.listeners.delete(channel);
		}
		console.log('[USER-SSE-BROKER] Listener unsubscribed:', {
			channel,
			remainingListeners: broker.listeners.get(channel)?.size || 0
		});
	};
}

/**
 * Broadcast an event to every listener subscribed to any of the given channels.
 */
export function publishUserChange(channels: string[], event: UserRealtimeEvent): void {
	const broker = getBrokerState();
	const notified = new Set<Listener>();

	console.log('[USER-SSE-BROKER] ===== PUBLISHING EVENT =====');
	console.log('[USER-SSE-BROKER] Channels:', channels);
	console.log('[USER-SSE-BROKER] Event:', JSON.stringify(event, null, 2));
	console.log('[USER-SSE-BROKER] Active listeners:', broker.listeners.size);

	for (const channel of channels) {
		const set = broker.listeners.get(channel);
		console.log(`[USER-SSE-BROKER] Channel "${channel}" has ${set?.size || 0} listeners`);
		if (!set) continue;
		for (const listener of set) {
			if (!notified.has(listener)) {
				notified.add(listener);
				try {
					listener(event);
					console.log('[USER-SSE-BROKER] ✓ Event sent to listener');
				} catch (error) {
					console.error('[USER-SSE-BROKER] ✗ Listener error:', error);
					// A crashing listener must not bring down other subscribers.
				}
			}
		}
	}

	console.log('[USER-SSE-BROKER] Total listeners notified:', notified.size);
	console.log('[USER-SSE-BROKER] ============================');
}

/** The single broadcast channel used for all user events. */
export const USER_CHANNEL = 'users:all';

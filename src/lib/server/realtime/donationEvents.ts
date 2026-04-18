/**
 * In-process SSE event broker for donation change notifications.
 *
 * Architecture mirrors inventoryEvents.ts:
 *   - One global singleton (`globalThis.__donationRealtimeBroker`) so the
 *     broker survives SvelteKit HMR restarts without dropping listeners.
 *   - Single broadcast channel `donations:all` — every connected custodian /
 *     superadmin subscribes to it.
 *   - Publishers call `publishDonationChange()` after every create / update / delete.
 *
 * Industry Standard:
 *   - In-memory pub/sub pattern used by Redis, RabbitMQ, and other message brokers
 *   - Singleton pattern ensures consistency across HMR reloads
 *   - Defensive error handling prevents cascading failures
 */

export type DonationRealtimeAction = 'donation_created' | 'donation_updated' | 'donation_deleted';

export interface DonationRealtimeEvent {
	action: DonationRealtimeAction;
	entityId: string;
	occurredAt: string;
}

type Listener = (event: DonationRealtimeEvent) => void;

interface BrokerState {
	listeners: Map<string, Set<Listener>>;
}

declare global {
	// eslint-disable-next-line no-var
	var __donationRealtimeBroker: BrokerState | undefined;
}

function getBrokerState(): BrokerState {
	if (!globalThis.__donationRealtimeBroker) {
		globalThis.__donationRealtimeBroker = { listeners: new Map() };
		console.log('[DONATION-SSE-BROKER] Broker initialized');
	}
	return globalThis.__donationRealtimeBroker;
}

/**
 * Subscribe a listener to a channel.
 * Returns an unsubscribe function — call it in SSE stream cleanup.
 */
export function subscribeToDonationChannel(channel: string, listener: Listener): () => void {
	const broker = getBrokerState();
	if (!broker.listeners.has(channel)) {
		broker.listeners.set(channel, new Set());
	}
	broker.listeners.get(channel)!.add(listener);

	console.log('[DONATION-SSE-BROKER] Listener subscribed:', {
		channel,
		totalListeners: broker.listeners.get(channel)?.size || 0
	});

	return () => {
		broker.listeners.get(channel)?.delete(listener);
		if (broker.listeners.get(channel)?.size === 0) {
			broker.listeners.delete(channel);
		}
		console.log('[DONATION-SSE-BROKER] Listener unsubscribed:', {
			channel,
			remainingListeners: broker.listeners.get(channel)?.size || 0
		});
	};
}

/**
 * Broadcast an event to every listener subscribed to any of the given channels.
 */
export function publishDonationChange(channels: string[], event: DonationRealtimeEvent): void {
	const broker = getBrokerState();
	const notified = new Set<Listener>();

	console.log('[DONATION-SSE-BROKER] ===== PUBLISHING EVENT =====');
	console.log('[DONATION-SSE-BROKER] Channels:', channels);
	console.log('[DONATION-SSE-BROKER] Event:', JSON.stringify(event, null, 2));
	console.log('[DONATION-SSE-BROKER] Active listeners:', broker.listeners.size);

	for (const channel of channels) {
		const set = broker.listeners.get(channel);
		console.log(`[DONATION-SSE-BROKER] Channel "${channel}" has ${set?.size || 0} listeners`);
		if (!set) continue;
		for (const listener of set) {
			if (!notified.has(listener)) {
				notified.add(listener);
				try {
					listener(event);
					console.log('[DONATION-SSE-BROKER] ✓ Event sent to listener');
				} catch (error) {
					console.error('[DONATION-SSE-BROKER] ✗ Listener error:', error);
					// A crashing listener must not bring down other subscribers.
				}
			}
		}
	}
	
	console.log('[DONATION-SSE-BROKER] Total listeners notified:', notified.size);
	console.log('[DONATION-SSE-BROKER] ============================');
}

/** The single broadcast channel used for all donation events. */
export const DONATION_CHANNEL = 'donations:all';

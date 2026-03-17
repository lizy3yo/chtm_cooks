/**
 * In-process SSE event broker for donation change notifications.
 *
 * Architecture mirrors inventoryEvents.ts:
 *   - One global singleton (`globalThis.__donationRealtimeBroker`) so the
 *     broker survives SvelteKit HMR restarts without dropping listeners.
 *   - Single broadcast channel `donations:all` — every connected custodian /
 *     superadmin subscribes to it.
 *   - Publishers call `publishDonationChange()` after every create / delete.
 */

export type DonationRealtimeAction = 'donation_created' | 'donation_deleted';

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

	return () => {
		broker.listeners.get(channel)?.delete(listener);
		if (broker.listeners.get(channel)?.size === 0) {
			broker.listeners.delete(channel);
		}
	};
}

/**
 * Broadcast an event to every listener subscribed to any of the given channels.
 */
export function publishDonationChange(channels: string[], event: DonationRealtimeEvent): void {
	const broker = getBrokerState();
	const notified = new Set<Listener>();

	for (const channel of channels) {
		const set = broker.listeners.get(channel);
		if (!set) continue;
		for (const listener of set) {
			if (!notified.has(listener)) {
				notified.add(listener);
				try {
					listener(event);
				} catch {
					// A crashing listener must not bring down other subscribers.
				}
			}
		}
	}
}

/** The single broadcast channel used for all donation events. */
export const DONATION_CHANNEL = 'donations:all';

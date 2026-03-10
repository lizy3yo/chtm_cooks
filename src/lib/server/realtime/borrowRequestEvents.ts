/**
 * In-process SSE event broker for borrow-request lifecycle notifications.
 *
 * Architecture:
 *   - One global singleton (`globalThis.__borrowRequestRealtimeBroker`) so the
 *     broker survives SvelteKit HMR restarts without dropping registered listeners.
 *   - Channels are plain strings: `student:<userId>`, `instructor:<userId>`,
 *     `custodian:<userId>`, `role:instructor`, `role:custodian`, `role:superadmin`.
 *   - Every mutation publishes to all channels that care about the affected request,
 *     so every connected client that subscribes to any matching channel is notified.
 */

export type BorrowRequestRealtimeAction =
	| 'created'
	| 'approved'
	| 'rejected'
	| 'released'
	| 'picked_up'
	| 'return_initiated'
	| 'returned'
	| 'missing'
	| 'cancelled'
	| 'items_inspected'
	| 'reminder_sent';

export interface BorrowRequestRealtimeEvent {
	action: BorrowRequestRealtimeAction;
	requestId: string;
	studentId: string;
	status: string;
	occurredAt: string;
}

type Listener = (event: BorrowRequestRealtimeEvent) => void;

interface BrokerState {
	listeners: Map<string, Set<Listener>>;
}

declare global {
	// eslint-disable-next-line no-var
	var __borrowRequestRealtimeBroker: BrokerState | undefined;
}

function getBrokerState(): BrokerState {
	if (!globalThis.__borrowRequestRealtimeBroker) {
		globalThis.__borrowRequestRealtimeBroker = { listeners: new Map() };
	}
	return globalThis.__borrowRequestRealtimeBroker;
}

/**
 * Subscribe a listener to a specific channel.
 * Returns an unsubscribe function — call it in SSE stream cleanup.
 */
export function subscribeToBorrowRequestChannel(
	channel: string,
	listener: Listener
): () => void {
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
 * Listeners on different channels may receive the same event — that is intentional
 * (the client reconciles by re-fetching, not by processing the event payload itself).
 */
export function publishBorrowRequestChange(
	channels: string[],
	event: BorrowRequestRealtimeEvent
): void {
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

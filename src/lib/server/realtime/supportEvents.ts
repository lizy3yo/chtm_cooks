/**
 * In-process SSE event broker for support/chat notifications.
 *
 * Architecture mirrors userEvents.ts and borrowRequestEvents.ts:
 *   - One global singleton so the broker survives SvelteKit HMR restarts.
 *   - Channels:
 *       `support:superadmin`       — all new messages for the superadmin inbox
 *       `support:user:<userId>`    — replies directed at a specific ticket owner
 *                                    (student, instructor, or custodian)
 */

export type SupportRealtimeAction =
	| 'ticket_created'
	| 'message_sent'
	| 'status_changed'
	| 'ticket_resolved';

export interface SupportRealtimeEvent {
	action: SupportRealtimeAction;
	ticketId: string;
	/** ID of the ticket owner (student / instructor / custodian) */
	ownerId: string;
	occurredAt: string;
}

type Listener = (event: SupportRealtimeEvent) => void;

interface BrokerState {
	listeners: Map<string, Set<Listener>>;
}

declare global {
	// eslint-disable-next-line no-var
	var __supportRealtimeBroker: BrokerState | undefined;
}

function getBrokerState(): BrokerState {
	if (!globalThis.__supportRealtimeBroker) {
		globalThis.__supportRealtimeBroker = { listeners: new Map() };
	}
	return globalThis.__supportRealtimeBroker;
}

export function subscribeToSupportChannel(channel: string, listener: Listener): () => void {
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

export function publishSupportEvent(channels: string[], event: SupportRealtimeEvent): void {
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

export const SUPPORT_SUPERADMIN_CHANNEL = 'support:superadmin';

/** Personal channel for any ticket owner (student, instructor, custodian). */
export function supportUserChannel(userId: string): string {
	return `support:user:${userId}`;
}

/** @deprecated Use supportUserChannel instead */
export function supportStudentChannel(userId: string): string {
	return supportUserChannel(userId);
}

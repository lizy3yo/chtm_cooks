/**
 * In-process SSE event broker for financial obligation change notifications.
 *
 * Architecture mirrors borrowRequestEvents.ts:
 *   - One global singleton (`globalThis.__financialObligationRealtimeBroker`) so the
 *     broker survives SvelteKit HMR restarts without dropping registered listeners.
 *   - Channels:
 *       `role:custodian`   — all custodian/superadmin-visible events
 *       `role:superadmin`  — superadmin-only events
 *       `student:<userId>` — per-student obligation events
 *   - Publishers call `publishFinancialObligationChange()` after every mutation.
 */

export type FinancialObligationRealtimeAction =
	| 'obligation_created'
	| 'obligation_resolved'
	| 'obligation_updated'
	| 'request_auto_resolved';

export interface FinancialObligationRealtimeEvent {
	action: FinancialObligationRealtimeAction;
	obligationId?: string;
	borrowRequestId: string;
	studentId: string;
	occurredAt: string;
}

type Listener = (event: FinancialObligationRealtimeEvent) => void;

interface BrokerState {
	listeners: Map<string, Set<Listener>>;
}

declare global {
	// eslint-disable-next-line no-var
	var __financialObligationRealtimeBroker: BrokerState | undefined;
}

function getBrokerState(): BrokerState {
	if (!globalThis.__financialObligationRealtimeBroker) {
		globalThis.__financialObligationRealtimeBroker = { listeners: new Map() };
	}
	return globalThis.__financialObligationRealtimeBroker;
}

/**
 * Subscribe a listener to a channel.
 * Returns an unsubscribe function — call it in SSE stream cleanup.
 */
export function subscribeToFinancialObligationChannel(
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
 * Deduplicates so a listener on multiple channels only receives the event once.
 */
export function publishFinancialObligationChange(
	channels: string[],
	event: FinancialObligationRealtimeEvent
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

/**
 * Derive the SSE channels that should receive an event for a given obligation mutation.
 *
 * Fan-out targets:
 *   - Always: role channels for custodians and superadmins
 *   - Always: the owning student's personal channel
 */
export function getFinancialObligationRealtimeChannels(studentId: string): string[] {
	return [`student:${studentId}`, 'role:custodian', 'role:superadmin'];
}

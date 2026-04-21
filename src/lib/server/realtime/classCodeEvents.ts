/**
 * In-process SSE event broker for class-code change notifications.
 *
 * Architecture mirrors userEvents.ts:
 *   - One global singleton (`globalThis.__classCodeRealtimeBroker`) so the
 *     broker survives SvelteKit HMR restarts without dropping listeners.
 *   - Single broadcast channel `class-codes:all` — superadmins subscribe.
 *   - Publishers call `publishClassCodeChange()` after every mutation.
 *
 * Industry Standard:
 *   - In-memory pub/sub pattern used by Redis, RabbitMQ, and other message brokers
 *   - Singleton pattern ensures consistency across HMR reloads
 *   - Defensive error handling prevents cascading failures
 */

export type ClassCodeRealtimeAction =
	| 'class_created'
	| 'class_updated'
	| 'class_archived'
	| 'class_deleted'
	| 'enrollment_updated';

export interface ClassCodeRealtimeEvent {
	action: ClassCodeRealtimeAction;
	classCodeId: string;
	occurredAt: string;
}

type Listener = (event: ClassCodeRealtimeEvent) => void;

interface BrokerState {
	listeners: Map<string, Set<Listener>>;
}

declare global {
	// eslint-disable-next-line no-var
	var __classCodeRealtimeBroker: BrokerState | undefined;
}

function getBrokerState(): BrokerState {
	if (!globalThis.__classCodeRealtimeBroker) {
		globalThis.__classCodeRealtimeBroker = { listeners: new Map() };
		console.log('[CLASS-CODE-SSE-BROKER] Broker initialized');
	}
	return globalThis.__classCodeRealtimeBroker;
}

/**
 * Subscribe a listener to a channel.
 * Returns an unsubscribe function — call it in SSE stream cleanup.
 */
export function subscribeToClassCodeChannel(
	channel: string,
	listener: Listener
): () => void {
	const broker = getBrokerState();
	if (!broker.listeners.has(channel)) {
		broker.listeners.set(channel, new Set());
	}
	broker.listeners.get(channel)!.add(listener);

	console.log('[CLASS-CODE-SSE-BROKER] Listener subscribed:', {
		channel,
		totalListeners: broker.listeners.get(channel)?.size || 0
	});

	return () => {
		broker.listeners.get(channel)?.delete(listener);
		if (broker.listeners.get(channel)?.size === 0) {
			broker.listeners.delete(channel);
		}
		console.log('[CLASS-CODE-SSE-BROKER] Listener unsubscribed:', {
			channel,
			remainingListeners: broker.listeners.get(channel)?.size || 0
		});
	};
}

/**
 * Broadcast an event to every listener subscribed to any of the given channels.
 */
export function publishClassCodeChange(
	channels: string[],
	event: ClassCodeRealtimeEvent
): void {
	const broker = getBrokerState();
	const notified = new Set<Listener>();

	console.log('[CLASS-CODE-SSE-BROKER] Publishing event:', event.action, 'on', channels);

	for (const channel of channels) {
		const set = broker.listeners.get(channel);
		if (!set) continue;
		for (const listener of set) {
			if (!notified.has(listener)) {
				notified.add(listener);
				try {
					listener(event);
				} catch (error) {
					console.error('[CLASS-CODE-SSE-BROKER] Listener error:', error);
					// A crashing listener must not bring down other subscribers.
				}
			}
		}
	}

	console.log('[CLASS-CODE-SSE-BROKER] Notified listeners:', notified.size);
}

/** The single broadcast channel used for all class-code events. */
export const CLASS_CODE_CHANNEL = 'class-codes:all';

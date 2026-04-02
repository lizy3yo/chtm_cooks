/**
 * In-process SSE event broker for inventory change notifications.
 *
 * Architecture mirrors borrowRequestEvents.ts:
 *   - One global singleton (`globalThis.__inventoryRealtimeBroker`) so the
 *     broker survives SvelteKit HMR restarts without dropping listeners.
 *   - Single broadcast channel `inventory:all` — every connected authenticated
 *     user subscribes to it, because inventory visibility is role-wide.
 *   - Publishers call `publishInventoryChange()` after every create / update /
 *     delete on items or categories.
 */

export type InventoryRealtimeAction =
	| 'item_created'
	| 'item_updated'
	| 'item_archived'
	| 'item_restored'
	| 'item_deleted'
	| 'category_created'
	| 'category_updated'
	| 'category_deleted';

export interface InventoryRealtimeEvent {
	action: InventoryRealtimeAction;
	entityType: 'item' | 'category';
	entityId: string;
	entityName: string;
	occurredAt: string;
}

type Listener = (event: InventoryRealtimeEvent) => void;

interface BrokerState {
	listeners: Map<string, Set<Listener>>;
}

declare global {
	// eslint-disable-next-line no-var
	var __inventoryRealtimeBroker: BrokerState | undefined;
}

function getBrokerState(): BrokerState {
	if (!globalThis.__inventoryRealtimeBroker) {
		globalThis.__inventoryRealtimeBroker = { listeners: new Map() };
	}
	return globalThis.__inventoryRealtimeBroker;
}

/**
 * Subscribe a listener to a channel.
 * Returns an unsubscribe function — call it in SSE stream cleanup.
 */
export function subscribeToInventoryChannel(
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
 */
export function publishInventoryChange(
	channels: string[],
	event: InventoryRealtimeEvent
): void {
	const broker = getBrokerState();
	const notified = new Set<Listener>();

	console.log('[SSE-BROKER] ===== PUBLISHING EVENT =====');
	console.log('[SSE-BROKER] Channels:', channels);
	console.log('[SSE-BROKER] Event:', JSON.stringify(event, null, 2));
	console.log('[SSE-BROKER] Active listeners:', broker.listeners.size);

	for (const channel of channels) {
		const set = broker.listeners.get(channel);
		console.log(`[SSE-BROKER] Channel "${channel}" has ${set?.size || 0} listeners`);
		if (!set) continue;
		for (const listener of set) {
			if (!notified.has(listener)) {
				notified.add(listener);
				try {
					listener(event);
					console.log('[SSE-BROKER] ✓ Event sent to listener');
				} catch (error) {
					console.error('[SSE-BROKER] ✗ Listener error:', error);
					// A crashing listener must not bring down other subscribers.
				}
			}
		}
	}
	
	console.log('[SSE-BROKER] Total listeners notified:', notified.size);
	console.log('[SSE-BROKER] ============================');
}

/** The single broadcast channel used for all inventory events. */
export const INVENTORY_CHANNEL = 'inventory:all';

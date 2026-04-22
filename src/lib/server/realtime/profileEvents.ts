/**
 * In-process SSE event broker for profile updates.
 */

export type ProfileRealtimeAction = 'profile_updated' | 'photo_updated' | 'password_changed';

export interface ProfileRealtimeEvent {
	action: ProfileRealtimeAction;
	userId: string;
	occurredAt: string;
}

/** Global channel so the superadmin users-list stream can detect any photo change. */
export const PROFILES_BROADCAST_CHANNEL = 'profiles:all';

type Listener = (event: ProfileRealtimeEvent) => void;

interface BrokerState {
	listeners: Map<string, Set<Listener>>;
}

declare global {
	// eslint-disable-next-line no-var
	var __profileRealtimeBroker: BrokerState | undefined;
}

function getBrokerState(): BrokerState {
	if (!globalThis.__profileRealtimeBroker) {
		globalThis.__profileRealtimeBroker = { listeners: new Map() };
	}
	return globalThis.__profileRealtimeBroker;
}

export function getProfileChannel(userId: string): string {
	return `profile:${userId}`;
}

export function subscribeToProfileChannel(channel: string, listener: Listener): () => void {
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

export function publishProfileEvent(channels: string[], event: ProfileRealtimeEvent): void {
	const broker = getBrokerState();
	const notified = new Set<Listener>();

	for (const channel of channels) {
		const set = broker.listeners.get(channel);
		if (!set) continue;

		for (const listener of set) {
			if (notified.has(listener)) continue;
			notified.add(listener);
			try {
				listener(event);
			} catch {
				// Isolate listener failures.
			}
		}
	}
}

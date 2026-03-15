import type { RequestHandler } from './$types';
import { UserRole } from '$lib/server/models/User';
import {
	getProfileChannel,
	subscribeToProfileChannel,
	type ProfileRealtimeEvent
} from '$lib/server/realtime/profileEvents';
import { getAuthenticatedProfileUser } from '../shared';

const HEARTBEAT_INTERVAL_MS = 20_000;

export const GET: RequestHandler = async (event) => {
	const authUser = getAuthenticatedProfileUser(event);
	if (!authUser) {
		return new Response('Unauthorized', { status: 401 });
	}

	if (authUser.role !== UserRole.STUDENT) {
		return new Response('Forbidden', { status: 403 });
	}

	const stream = new ReadableStream({
		start(controller) {
			const encode = (data: string) => new TextEncoder().encode(data);
			const send = (eventName: string, payload: unknown) => {
				try {
					controller.enqueue(encode(`event: ${eventName}\ndata: ${JSON.stringify(payload)}\n\n`));
				} catch {
					// Stream is closed.
				}
			};

			send('connected', { channel: getProfileChannel(authUser.userId), ts: new Date().toISOString() });

			const onProfileEvent = (profileEvent: ProfileRealtimeEvent) => {
				send('profile_change', profileEvent);
			};

			const unsubscribe = subscribeToProfileChannel(getProfileChannel(authUser.userId), onProfileEvent);
			const heartbeat = setInterval(() => {
				send('heartbeat', { ts: new Date().toISOString() });
			}, HEARTBEAT_INTERVAL_MS);

			event.request.signal.addEventListener('abort', () => {
				clearInterval(heartbeat);
				unsubscribe();
				try {
					controller.close();
				} catch {
					// Already closed.
				}
			});
		}
	});

	return new Response(stream, {
		headers: {
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-cache',
			Connection: 'keep-alive',
			'X-Accel-Buffering': 'no'
		}
	});
};

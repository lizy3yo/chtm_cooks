import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDatabase } from '$lib/server/db/mongodb';
import { rateLimit, RateLimitPresets } from '$lib/server/middleware/rateLimit';
import { logger } from '$lib/server/utils/logger';
import { getAuthenticatedUser } from '../borrow-requests/shared';
import { listNotificationsForUser, markAllNotificationsAsRead } from '$lib/server/services/notifications';

export const GET: RequestHandler = async (event) => {
	const rateLimitResult = await rateLimit(event, RateLimitPresets.API);
	if (rateLimitResult instanceof Response) {
		return rateLimitResult;
	}

	try {
		const user = getAuthenticatedUser(event);
		if (!user) {
			return json({ error: 'Unauthorized' }, { status: 401 });
		}

		const url = new URL(event.request.url);
		const parsedLimit = Number.parseInt(url.searchParams.get('limit') || '25', 10);
		const parsedSkip = Number.parseInt(url.searchParams.get('skip') || '0', 10);

		const db = await getDatabase();
		const payload = await listNotificationsForUser(db, user.userId, parsedLimit, parsedSkip);
		return json(payload);
	} catch (error) {
		logger.error('Error listing notifications', { error });
		return json({ error: 'Failed to fetch notifications' }, { status: 500 });
	}
};

export const PATCH: RequestHandler = async (event) => {
	const rateLimitResult = await rateLimit(event, RateLimitPresets.API);
	if (rateLimitResult instanceof Response) {
		return rateLimitResult;
	}

	try {
		const user = getAuthenticatedUser(event);
		if (!user) {
			return json({ error: 'Unauthorized' }, { status: 401 });
		}

		const db = await getDatabase();
		const markedCount = await markAllNotificationsAsRead(db, user.userId);
		return json({ success: true, markedCount });
	} catch (error) {
		logger.error('Error marking all notifications as read', { error });
		return json({ error: 'Failed to mark notifications as read' }, { status: 500 });
	}
};

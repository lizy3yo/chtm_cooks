import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDatabase } from '$lib/server/db/mongodb';
import { rateLimit, RateLimitPresets } from '$lib/server/middleware/rateLimit';
import { logger } from '$lib/server/utils/logger';
import { getAuthenticatedUser } from '../../../borrow-requests/shared';
import { markNotificationAsRead } from '$lib/server/services/notifications';

export const POST: RequestHandler = async (event) => {
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
		const updated = await markNotificationAsRead(db, user.userId, event.params.id);
		if (!updated) {
			return json({ error: 'Notification not found' }, { status: 404 });
		}

		return json({ success: true });
	} catch (error) {
		logger.error('Error marking notification as read', { error });
		return json({ error: 'Failed to mark notification as read' }, { status: 500 });
	}
};

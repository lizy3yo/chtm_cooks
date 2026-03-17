/**
 * GET    /api/donations/:id  — fetch single donation
 * DELETE /api/donations/:id  — delete a donation record
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDatabase } from '$lib/server/db/mongodb';
import type { Donation } from '$lib/server/models/Donation';
import { toDonationResponse, DONATIONS_COLLECTION } from '$lib/server/models/Donation';
import { rateLimit, RateLimitPresets } from '$lib/server/middleware/rateLimit';
import { logger } from '$lib/server/utils/logger';
import { cacheService } from '$lib/server/cache';
import { publishDonationChange, DONATION_CHANNEL } from '$lib/server/realtime/donationEvents';
import {
	getAuthenticatedUser,
	buildDonationDetailCacheKey,
	invalidateDonationCaches,
	parseObjectId,
	DONATIONS_CACHE_TAG
} from '../shared';

const ALLOWED_ROLES = ['custodian', 'superadmin'];

// ─── GET ─────────────────────────────────────────────────────────────────────

export const GET: RequestHandler = async (event) => {
	const rateLimitResult = await rateLimit(event, RateLimitPresets.API);
	if (rateLimitResult instanceof Response) return rateLimitResult;

	try {
		const user = getAuthenticatedUser(event);
		if (!user) return json({ error: 'Unauthorized' }, { status: 401 });
		if (!ALLOWED_ROLES.includes(user.role))
			return json({ error: 'Forbidden: Insufficient permissions' }, { status: 403 });

		const id = event.params.id;
		const objectId = parseObjectId(id);
		if (!objectId) return json({ error: 'Invalid donation ID' }, { status: 400 });

		const cacheKey = buildDonationDetailCacheKey(id);
		const cached = await cacheService.get(cacheKey);
		if (cached) return json(cached);

		const db = await getDatabase();
		const donation = await db
			.collection<Donation>(DONATIONS_COLLECTION)
			.findOne({ _id: objectId });

		if (!donation) return json({ error: 'Donation not found' }, { status: 404 });

		const response = { donation: toDonationResponse(donation) };
		await cacheService.set(cacheKey, response, { ttl: 120, tags: [DONATIONS_CACHE_TAG] });

		return json(response);
	} catch (error) {
		logger.error('donations', 'Failed to retrieve donation', { error });
		return json({ error: 'Internal server error' }, { status: 500 });
	}
};

// ─── DELETE ──────────────────────────────────────────────────────────────────

export const DELETE: RequestHandler = async (event) => {
	const rateLimitResult = await rateLimit(event, RateLimitPresets.API);
	if (rateLimitResult instanceof Response) return rateLimitResult;

	try {
		const user = getAuthenticatedUser(event);
		if (!user) return json({ error: 'Unauthorized' }, { status: 401 });
		if (!ALLOWED_ROLES.includes(user.role))
			return json({ error: 'Forbidden: Insufficient permissions' }, { status: 403 });

		const id = event.params.id;
		const objectId = parseObjectId(id);
		if (!objectId) return json({ error: 'Invalid donation ID' }, { status: 400 });

		const db = await getDatabase();
		const result = await db
			.collection<Donation>(DONATIONS_COLLECTION)
			.deleteOne({ _id: objectId });

		if (result.deletedCount === 0) return json({ error: 'Donation not found' }, { status: 404 });

		await invalidateDonationCaches();

		publishDonationChange([DONATION_CHANNEL], {
			action: 'donation_deleted',
			entityId: id,
			occurredAt: new Date().toISOString()
		});

		logger.info('donations', 'Donation deleted', { userId: user.userId, donationId: id });

		return json({ success: true, message: 'Donation deleted successfully' });
	} catch (error) {
		logger.error('donations', 'Failed to delete donation', { error });
		return json({ error: 'Internal server error' }, { status: 500 });
	}
};

/**
 * GET    /api/donations/:id  — fetch single donation
 * PATCH  /api/donations/:id  — add quantity to an existing donation
 * DELETE /api/donations/:id  — delete a donation record
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDatabase } from '$lib/server/db/mongodb';
import type { Donation, AddDonationQuantityRequest } from '$lib/server/models/Donation';
import { toDonationResponse, DONATIONS_COLLECTION } from '$lib/server/models/Donation';
import { sanitizeInput } from '$lib/server/utils/validation';
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
const MAX_NOTES_LENGTH = 1000;

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
		await cacheService.set(cacheKey, response, { ttl: 3600, tags: [DONATIONS_CACHE_TAG] });

		return json(response);
	} catch (error) {
		logger.error('donations', 'Failed to retrieve donation', { error });
		return json({ error: 'Internal server error' }, { status: 500 });
	}
};

// ─── PATCH ───────────────────────────────────────────────────────────────────

export const PATCH: RequestHandler = async (event) => {
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

		const body: AddDonationQuantityRequest = await event.request.json();

		if (!Number.isInteger(body.quantityToAdd) || body.quantityToAdd < 1) {
			return json({ error: 'quantityToAdd must be a positive integer' }, { status: 400 });
		}

		const notes = body.notes
			? sanitizeInput(body.notes.trim()).slice(0, MAX_NOTES_LENGTH)
			: undefined;

		const db = await getDatabase();
		const col = db.collection<Donation>(DONATIONS_COLLECTION);

		const now = new Date();
		const updateFields: Record<string, unknown> = {
			updatedAt: now,
			$inc: undefined // placeholder, handled below
		};

		const result = await col.findOneAndUpdate(
			{ _id: objectId },
			{
				$inc: { quantity: body.quantityToAdd },
				$set: {
					updatedAt: now,
					...(notes !== undefined ? { notes } : {})
				}
			},
			{ returnDocument: 'after' }
		);

		if (!result) return json({ error: 'Donation not found' }, { status: 404 });

		await invalidateDonationCaches();

		publishDonationChange([DONATION_CHANNEL], {
			action: 'donation_updated',
			entityId: id,
			occurredAt: now.toISOString()
		});

		logger.info('donations', 'Donation quantity updated', {
			userId: user.userId,
			donationId: id,
			quantityAdded: body.quantityToAdd,
			newQuantity: result.quantity
		});

		return json(toDonationResponse(result));
	} catch (error) {
		logger.error('donations', 'Failed to update donation quantity', { error });
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

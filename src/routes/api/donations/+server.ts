/**
 * GET  /api/donations  — paginated list (custodian / superadmin)
 * POST /api/donations  — create a new donation record
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDatabase } from '$lib/server/db/mongodb';
import { ObjectId } from 'mongodb';
import {
	type Donation,
	type CreateDonationRequest,
	DonationType,
	toDonationResponse,
	DONATIONS_COLLECTION
} from '$lib/server/models/Donation';
import { sanitizeInput } from '$lib/server/utils/validation';
import { rateLimit, RateLimitPresets } from '$lib/server/middleware/rateLimit';
import { logger } from '$lib/server/utils/logger';
import { cacheService } from '$lib/server/cache';
import { publishDonationChange, DONATION_CHANNEL } from '$lib/server/realtime/donationEvents';
import {
	getAuthenticatedUser,
	buildDonationsListCacheKey,
	invalidateDonationCaches,
	generateReceiptNumber,
	DONATIONS_CACHE_TAG
} from './shared';

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

		const url = new URL(event.request.url);
		const typeParam = url.searchParams.get('type') || undefined;
		const parsedPage = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10));
		const parsedLimit = Math.min(200, Math.max(1, parseInt(url.searchParams.get('limit') || '50', 10)));
		const skip = (parsedPage - 1) * parsedLimit;
		const skipCache = url.searchParams.has('_t');

		// Validate type filter
		if (typeParam && !Object.values(DonationType).includes(typeParam as DonationType)) {
			return json({ error: 'Invalid donation type filter' }, { status: 400 });
		}

		const cacheKey = buildDonationsListCacheKey({ type: typeParam, page: parsedPage, limit: parsedLimit });

		if (!skipCache) {
			const cached = await cacheService.get(cacheKey);
			if (cached) return json(cached);
		}

		const db = await getDatabase();
		const col = db.collection<Donation>(DONATIONS_COLLECTION);

		const filter: Record<string, unknown> = {};
		if (typeParam) filter.type = typeParam;

		const [donations, total] = await Promise.all([
			col.find(filter).sort({ createdAt: -1 }).skip(skip).limit(parsedLimit).toArray(),
			col.countDocuments(filter)
		]);

		const response = {
			donations: donations.map(toDonationResponse),
			total,
			page: parsedPage,
			limit: parsedLimit,
			pages: Math.ceil(total / parsedLimit)
		};

		await cacheService.set(cacheKey, response, { ttl: 120, tags: [DONATIONS_CACHE_TAG] });

		logger.info('donations', 'Retrieved donations list', {
			userId: user.userId,
			count: donations.length,
			total
		});

		return json(response);
	} catch (error) {
		logger.error('donations', 'Failed to retrieve donations', { error });
		return json({ error: 'Internal server error' }, { status: 500 });
	}
};

// ─── POST ────────────────────────────────────────────────────────────────────

export const POST: RequestHandler = async (event) => {
	const rateLimitResult = await rateLimit(event, RateLimitPresets.API);
	if (rateLimitResult instanceof Response) return rateLimitResult;

	try {
		const user = getAuthenticatedUser(event);
		if (!user) return json({ error: 'Unauthorized' }, { status: 401 });
		if (!ALLOWED_ROLES.includes(user.role))
			return json({ error: 'Forbidden: Insufficient permissions' }, { status: 403 });

		const body: CreateDonationRequest = await event.request.json();

		// ── Validation ──────────────────────────────────────────────────────
		if (!body.donorName?.trim()) {
			return json({ error: 'Donor name is required' }, { status: 400 });
		}
		if (!Object.values(DonationType).includes(body.type)) {
			return json({ error: 'Invalid donation type' }, { status: 400 });
		}
		if (body.type === DonationType.CASH) {
			if (body.amount === undefined || body.amount <= 0) {
				return json({ error: 'A positive amount is required for cash donations' }, { status: 400 });
			}
		} else {
			if (!body.itemDescription?.trim()) {
				return json({ error: 'Item description is required for item donations' }, { status: 400 });
			}
		}
		if (!body.purpose?.trim()) {
			return json({ error: 'Purpose is required' }, { status: 400 });
		}
		if (!body.date) {
			return json({ error: 'Date is required' }, { status: 400 });
		}

		// ── Sanitize ─────────────────────────────────────────────────────────
		const donorName = sanitizeInput(body.donorName.trim()).slice(0, 200);
		const purpose = sanitizeInput(body.purpose.trim()).slice(0, 500);
		const itemDescription = body.itemDescription
			? sanitizeInput(body.itemDescription.trim()).slice(0, 500)
			: undefined;
		const notes = body.notes ? sanitizeInput(body.notes.trim()).slice(0, 1000) : undefined;
		const donationDate = new Date(body.date);
		if (isNaN(donationDate.getTime())) {
			return json({ error: 'Invalid date format' }, { status: 400 });
		}

		const db = await getDatabase();
		const col = db.collection<Donation>(DONATIONS_COLLECTION);

		// Generate receipt number based on total count
		const totalCount = await col.countDocuments();
		const receiptNumber = generateReceiptNumber(totalCount);

		const now = new Date();
		const newDonation: Donation = {
			receiptNumber,
			donorName,
			type: body.type,
			amount: body.type === DonationType.CASH ? body.amount : undefined,
			itemDescription: body.type === DonationType.ITEM ? itemDescription : undefined,
			purpose,
			date: donationDate,
			notes,
			createdAt: now,
			updatedAt: now,
			createdBy: new ObjectId(user.userId)
		};

		const result = await col.insertOne(newDonation);
		newDonation._id = result.insertedId;

		await invalidateDonationCaches();

		publishDonationChange([DONATION_CHANNEL], {
			action: 'donation_created',
			entityId: newDonation._id.toString(),
			occurredAt: now.toISOString()
		});

		logger.info('donations', 'Donation created', {
			userId: user.userId,
			donationId: newDonation._id.toString(),
			receiptNumber,
			type: body.type
		});

		return json(toDonationResponse(newDonation), { status: 201 });
	} catch (error) {
		logger.error('donations', 'Failed to create donation', { error });
		return json({ error: 'Internal server error' }, { status: 500 });
	}
};

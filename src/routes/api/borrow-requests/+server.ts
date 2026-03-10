import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDatabase } from '$lib/server/db/mongodb';
import { ObjectId } from 'mongodb';
import { rateLimit, RateLimitPresets } from '$lib/server/middleware/rateLimit';
import { sanitizeInput } from '$lib/server/utils/validation';
import { cacheService } from '$lib/server/cache';
import { logger } from '$lib/server/utils/logger';
import type { InventoryItem } from '$lib/server/models/InventoryItem';
import {
	BorrowRequestStatus,
	type BorrowRequest,
	type CreateBorrowRequestRequest,
	type BorrowRequestResponse,
	toBorrowRequestResponse
} from '$lib/server/models/BorrowRequest';
import type { User } from '$lib/server/models/User';
import {
	BORROW_REQUESTS_COLLECTION,
	buildBorrowRequestListCacheKey,
	getAuthenticatedUser,
	invalidateBorrowRequestCaches,
	isBorrowRequestStatus
} from './shared';
import { validateCreateBorrowRequest, validateItems, validatePurpose, validateDates } from '$lib/server/middleware/borrowRequestValidation';

function escapeRegex(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

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
		const status = url.searchParams.get('status') || undefined;
		const rawStatuses = url.searchParams.get('statuses') || '';
		const statuses = rawStatuses
			.split(',')
			.map((value) => sanitizeInput(value))
			.filter((value) => value.length > 0);

		const rawSearch = url.searchParams.get('search') || '';
		const search = sanitizeInput(rawSearch).slice(0, 80) || undefined;

		const sortBy = url.searchParams.get('sortBy') === 'returnDate' ? 'returnDate' : 'createdAt';

		const parsedPage = Number.parseInt(url.searchParams.get('page') || '1', 10);
		const parsedLimit = Number.parseInt(url.searchParams.get('limit') || '20', 10);
		const page = Number.isFinite(parsedPage) ? Math.max(1, parsedPage) : 1;
		const limit = Number.isFinite(parsedLimit) ? Math.min(100, Math.max(1, parsedLimit)) : 20;
		const skip = (page - 1) * limit;

		if (status && !isBorrowRequestStatus(status)) {
			return json({ error: 'Invalid status filter' }, { status: 400 });
		}

		if (statuses.length > 0 && statuses.some((value) => !isBorrowRequestStatus(value))) {
			return json({ error: 'Invalid statuses filter' }, { status: 400 });
		}

		const cacheKey = buildBorrowRequestListCacheKey({
			role: user.role,
			userId: user.userId,
			status,
			statuses,
			search,
			sortBy,
			page,
			limit
		});

		const cached = await cacheService.get<{
			requests: ReturnType<typeof toBorrowRequestResponse>[];
			total: number;
			page: number;
			limit: number;
			pages: number;
		}>(cacheKey);

		if (cached && user.role !== 'custodian') {
			return json(cached);
		}

		const db = await getDatabase();
		const collection = db.collection<BorrowRequest>(BORROW_REQUESTS_COLLECTION);

		const filter: Record<string, unknown> = {};
		if (status) {
			filter.status = status;
		} else if (statuses.length > 0) {
			filter.status = { $in: statuses };
		}
		if (user.role === 'student') {
			filter.studentId = new ObjectId(user.userId);
		}
		if (user.role === 'custodian') {
			if (status === BorrowRequestStatus.PENDING_INSTRUCTOR) {
				return json({
					requests: [],
					total: 0,
					page,
					limit,
					pages: 0
				});
			}

			if (!status) {
				filter.status = { $ne: BorrowRequestStatus.PENDING_INSTRUCTOR };
			}
		}
		if (search) {
			const safeSearchRegex = escapeRegex(search);
			filter.$or = [
				{ purpose: { $regex: safeSearchRegex, $options: 'i' } },
				{ 'items.name': { $regex: safeSearchRegex, $options: 'i' } }
			];
		}

		const sort: Record<string, 1 | -1> =
			sortBy === 'returnDate' ? { returnDate: 1, createdAt: -1 } : { createdAt: -1 };

		const [requests, total] = await Promise.all([
			collection
				.find(filter)
				.sort(sort)
				.skip(skip)
				.limit(limit)
				.toArray(),
			collection.countDocuments(filter)
		]);

		const usersCollection = db.collection<User>('users');
		const userIds = [...new Set(
			requests.flatMap((request) => [
				request.studentId,
				request.instructorId,
				request.custodianId
			].filter((id): id is ObjectId => Boolean(id)).map((id) => id.toString()))
		)];

		const userDocs = userIds.length > 0
			? await usersCollection
				.find(
					{ _id: { $in: userIds.map((id) => new ObjectId(id)) } },
					{ projection: { firstName: 1, lastName: 1, email: 1, yearLevel: 1, block: 1 } }
				)
				.toArray()
			: [];

		const userMap = new Map(userDocs.map((userDoc) => [userDoc._id!.toString(), userDoc]));

		const enrichedRequests = requests.map((requestDoc) => {
			const base = toBorrowRequestResponse(requestDoc) as BorrowRequestResponse & {
				student?: Record<string, unknown>;
				instructor?: Record<string, unknown>;
				custodian?: Record<string, unknown>;
			};
			const student = userMap.get(base.studentId);
			const instructor = base.instructorId ? userMap.get(base.instructorId) : undefined;
			const custodian = base.custodianId ? userMap.get(base.custodianId) : undefined;

			return {
				...base,
				student: student ? {
					id: student._id!.toString(),
					email: student.email,
					firstName: student.firstName,
					lastName: student.lastName,
					fullName: `${student.firstName} ${student.lastName}`.trim(),
					yearLevel: student.yearLevel,
					block: student.block
				} : undefined,
				instructor: instructor ? {
					id: instructor._id!.toString(),
					email: instructor.email,
					firstName: instructor.firstName,
					lastName: instructor.lastName,
					fullName: `${instructor.firstName} ${instructor.lastName}`.trim()
				} : undefined,
				custodian: custodian ? {
					id: custodian._id!.toString(),
					email: custodian.email,
					firstName: custodian.firstName,
					lastName: custodian.lastName,
					fullName: `${custodian.firstName} ${custodian.lastName}`.trim()
				} : undefined
			};
		});

		const response = {
			requests: enrichedRequests,
			total,
			page,
			limit,
			pages: Math.ceil(total / limit)
		};

		await cacheService.set(cacheKey, response, { ttl: 90 });
		return json(response);
	} catch (error) {
		logger.error('Error fetching borrow requests', { error });
		return json({ error: 'Failed to fetch borrow requests' }, { status: 500 });
	}
};

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

		if (user.role !== 'student') {
			return json({ error: 'Forbidden: Only students can create requests' }, { status: 403 });
		}

		// Parse and validate request body
		let body: CreateBorrowRequestRequest;
		try {
			body = (await event.request.json()) as CreateBorrowRequestRequest;
		} catch (error) {
			logger.error('Failed to parse request body', { error });
			return json({ error: 'Invalid JSON payload' }, { status: 400 });
		}

		// Validate complete request using middleware
		const validation = validateCreateBorrowRequest(body);
		if (!validation.valid) {
			logger.warn('Borrow request validation failed', { 
				userId: user.userId, 
				error: validation.error 
			});
			return json({ error: validation.error }, { status: 400 });
		}

		// Extract sanitized data
		const sanitized = validation.sanitized!;
		const normalizedItems = sanitized.items as Array<{ itemId: ObjectId; quantity: number }>;
		const purpose = sanitized.purpose as string;
		const borrowDate = new Date(sanitized.borrowDate as string);
		const returnDate = new Date(sanitized.returnDate as string);

		const db = await getDatabase();
		const inventoryCollection = db.collection<InventoryItem>('inventory_items');
		const requestCollection = db.collection<BorrowRequest>(BORROW_REQUESTS_COLLECTION);

		// Verify all items exist and have sufficient stock
		const inventoryDocs = await inventoryCollection
			.find({
				_id: { $in: normalizedItems.map((item) => item.itemId) },
				archived: false
			})
			.toArray();

		if (inventoryDocs.length !== normalizedItems.length) {
			logger.warn('Borrow request failed: Some inventory items not found', {
				userId: user.userId,
				requestedItems: normalizedItems.length,
				foundItems: inventoryDocs.length
			});
			return json({ error: 'One or more inventory items were not found' }, { status: 404 });
		}

		// Build inventory map and check stock
		const inventoryById = new Map(inventoryDocs.map((doc) => [doc._id!.toString(), doc]));
		for (const item of normalizedItems) {
			const inventoryItem = inventoryById.get(item.itemId.toString());
			if (!inventoryItem) {
				return json({ error: 'One or more inventory items were not found' }, { status: 404 });
			}
			if (inventoryItem.quantity < item.quantity) {
				logger.warn('Borrow request failed: Insufficient stock', {
					userId: user.userId,
					itemName: inventoryItem.name,
					requested: item.quantity,
					available: inventoryItem.quantity
				});
				return json({ 
					error: `Insufficient stock for ${inventoryItem.name}. Available: ${inventoryItem.quantity}, Requested: ${item.quantity}` 
				}, { status: 409 });
			}
		}

		const now = new Date();
		const newRequest: BorrowRequest = {
			studentId: new ObjectId(user.userId),
			items: normalizedItems.map((item) => {
				const inventoryItem = inventoryById.get(item.itemId.toString())!;
				return {
					itemId: item.itemId,
					name: inventoryItem.name,
					quantity: item.quantity,
					category: inventoryItem.category,
					picture: inventoryItem.picture
				};
			}),
			purpose,
			borrowDate,
			returnDate,
			status: BorrowRequestStatus.PENDING_INSTRUCTOR,
			createdAt: now,
			updatedAt: now,
			createdBy: new ObjectId(user.userId)
		};

		const result = await requestCollection.insertOne(newRequest);
		newRequest._id = result.insertedId;

		// Invalidate all relevant caches
		await invalidateBorrowRequestCaches();

		logger.info('Borrow request created successfully', {
			userId: user.userId,
			requestId: result.insertedId.toString(),
			itemCount: normalizedItems.length
		});

		return json(toBorrowRequestResponse(newRequest), { status: 201 });
	} catch (error) {
		logger.error('Error creating borrow request', { error, userId: event.locals.user?.userId });
		return json({ error: 'Failed to create borrow request' }, { status: 500 });
	}
};

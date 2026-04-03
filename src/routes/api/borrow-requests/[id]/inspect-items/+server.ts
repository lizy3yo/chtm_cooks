import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDatabase } from '$lib/server/db/mongodb';
import { ObjectId } from 'mongodb';
import type { BorrowRequest, BorrowRequestItem, ItemInspectionStatus } from '$lib/server/models/BorrowRequest';
import type { ReplacementObligation, ObligationType } from '$lib/server/models/ReplacementObligation';
import { BorrowRequestStatus } from '$lib/server/models/BorrowRequest';
import { ObligationStatus } from '$lib/server/models/ReplacementObligation';
import { rateLimit, RateLimitPresets } from '$lib/server/middleware/rateLimit';
import { logger } from '$lib/server/utils/logger';
import { sanitizeInput } from '$lib/server/utils/validation';
import { getAuthenticatedUser, BORROW_REQUESTS_COLLECTION, invalidateBorrowRequestCaches, publishBorrowRequestRealtimeEvent } from '../../shared';
import { REPLACEMENT_OBLIGATIONS_COLLECTION, invalidateReplacementObligationCaches } from '../../../replacement-obligations/shared';

interface ItemInspectionInput {
	itemId: string;
	status: ItemInspectionStatus;
	notes?: string;
	replacementQuantity?: number;
}

interface InspectItemsRequest {
	items: ItemInspectionInput[];
}

function isValidInspectionStatus(value: string): value is ItemInspectionStatus {
	return value === 'good' || value === 'damaged' || value === 'missing';
}

/**
 * POST /api/borrow-requests/[id]/inspect-items
 * Perform item-level inspection during return
 * Creates replacement obligations for damaged/missing items
 * Custodian only
 */
export const POST: RequestHandler = async (event) => {
	const rateLimitResult = await rateLimit(event, RateLimitPresets.API);
	if (rateLimitResult instanceof Response) {
		return rateLimitResult;
	}

	try {
		const user = getAuthenticatedUser(event);
		if (!user || (user.role !== 'custodian' && user.role !== 'superadmin')) {
			logger.warn('item-inspection', 'Unauthorized access attempt', { userId: user?.userId });
			return json({ error: 'Unauthorized' }, { status: 403 });
		}

		const requestId = event.params.id;
		if (!ObjectId.isValid(requestId)) {
			return json({ error: 'Invalid request ID' }, { status: 400 });
		}

		let body: InspectItemsRequest;
		try {
			body = (await event.request.json()) as InspectItemsRequest;
		} catch {
			return json({ error: 'Invalid JSON payload' }, { status: 400 });
		}

		if (!body.items || !Array.isArray(body.items) || body.items.length === 0) {
			return json({ error: 'Items array is required' }, { status: 400 });
		}

		const seenItemIds = new Set<string>();
		for (const item of body.items) {
			if (!ObjectId.isValid(item.itemId)) {
				return json({ error: 'Invalid item ID in inspection payload' }, { status: 400 });
			}
			if (seenItemIds.has(item.itemId)) {
				return json({ error: 'Duplicate item IDs are not allowed in inspection payload' }, { status: 400 });
			}
			seenItemIds.add(item.itemId);
			if (!isValidInspectionStatus(item.status)) {
				return json({ error: 'Invalid inspection status' }, { status: 400 });
			}
			if (
				item.replacementQuantity !== undefined &&
				(!Number.isInteger(item.replacementQuantity) || item.replacementQuantity <= 0)
			) {
				return json({ error: 'Replacement quantity must be a valid positive integer' }, { status: 400 });
			}
			if (item.notes !== undefined) {
				item.notes = sanitizeInput(item.notes).slice(0, 500);
			}
		}

		const db = await getDatabase();
		const now = new Date();

		// Get the borrow request
		const borrowRequest = await db
			.collection<BorrowRequest>('borrow_requests')
			.findOne({ _id: new ObjectId(requestId) });

		if (!borrowRequest) {
			return json({ error: 'Request not found' }, { status: 404 });
		}

		// Must be in borrowed or pending_return status
		if (
			borrowRequest.status !== BorrowRequestStatus.BORROWED &&
			borrowRequest.status !== BorrowRequestStatus.PENDING_RETURN
		) {
			return json(
				{ error: 'Can only inspect items for borrowed or pending return requests' },
				{ status: 400 }
			);
		}

		// Validate all item IDs exist in the request
		const requestItemIds = new Set(borrowRequest.items.map((item) => item.itemId.toString()));
		for (const inspectionItem of body.items) {
			if (!requestItemIds.has(inspectionItem.itemId)) {
				return json(
					{ error: `Item ${inspectionItem.itemId} not found in this request` },
					{ status: 400 }
				);
			}
		}

		// Build inspection map
		const inspectionMap = new Map<string, ItemInspectionInput>();
		for (const item of body.items) {
			inspectionMap.set(item.itemId, item);
		}

		// Update items with inspection data
		const updatedItems: BorrowRequestItem[] = borrowRequest.items.map((item) => {
			const inspection = inspectionMap.get(item.itemId.toString());
			if (inspection) {
				return {
					...item,
					inspection: {
						status: inspection.status,
						inspectedAt: now,
						inspectedBy: new ObjectId(user.userId),
						notes: inspection.notes,
						replacementQuantity: inspection.replacementQuantity
					}
				};
			}
			return item;
		});

		// Determine if any items are damaged or missing
		const hasDamagedOrMissing = body.items.some(
			(item) => item.status === 'damaged' || item.status === 'missing'
		);

		// Calculate new status 
		let newStatus: BorrowRequestStatus = borrowRequest.status;
		const allInspected = updatedItems.every((item) => item.inspection);

		if (allInspected) {
			if (hasDamagedOrMissing) {
				newStatus = BorrowRequestStatus.MISSING; // Use MISSING status for items with issues
			} else {
				newStatus = BorrowRequestStatus.RETURNED; // All items are good
			}
		}

		// Update borrow request
		const updateResult = await db.collection<BorrowRequest>('borrow_requests').updateOne(
			{ _id: new ObjectId(requestId) },
			{
				$set: {
					items: updatedItems,
					status: newStatus,
					returnedAt: allInspected && !hasDamagedOrMissing ? now : undefined,
					missingAt: hasDamagedOrMissing ? now : undefined,
					updatedAt: now,
					updatedBy: new ObjectId(user.userId)
				}
			}
		);

		if (updateResult.matchedCount === 0) {
			return json({ error: 'Failed to update request' }, { status: 500 });
		}

		// Create replacement obligations for damaged/missing items
		const obligations: ReplacementObligation[] = [];
		for (const inspectionItem of body.items) {
			if (inspectionItem.status === 'damaged' || inspectionItem.status === 'missing') {
				const originalItem = borrowRequest.items.find(
					(item) => item.itemId.toString() === inspectionItem.itemId
				);
				if (!originalItem) continue;

				const replacementQuantity = inspectionItem.replacementQuantity ?? 1;

				// Calculate due date (30 days from incident)
				const dueDate = new Date(now);
				dueDate.setDate(dueDate.getDate() + 30);

				const obligation: ReplacementObligation = {
					borrowRequestId: new ObjectId(requestId),
					studentId: borrowRequest.studentId,
					itemId: originalItem.itemId,
					itemName: originalItem.name,
					itemCategory: originalItem.category,
					quantity: originalItem.quantity,
					type: inspectionItem.status === 'missing' ? 'missing' as ObligationType : 'damaged' as ObligationType,
					status: ObligationStatus.PENDING,
					amount: replacementQuantity,
					amountPaid: 0,
					incidentDate: now,
					incidentNotes: inspectionItem.notes,
					dueDate,
					createdAt: now,
					updatedAt: now,
					createdBy: new ObjectId(user.userId)
				};

				obligations.push(obligation);
			}
		}

		// Insert replacement obligations
		if (obligations.length > 0) {
			await db.collection<ReplacementObligation>(REPLACEMENT_OBLIGATIONS_COLLECTION).insertMany(obligations);
		}

		// If all good, restore inventory
		if (allInspected && !hasDamagedOrMissing) {
			for (const item of borrowRequest.items) {
				await db
					.collection('inventory_items')
					.updateOne({ _id: item.itemId }, { $inc: { quantity: item.quantity } });
			}
		}

		// For items marked as good, restore inventory even if other items have issues
		for (const inspectionItem of body.items) {
			if (inspectionItem.status === 'good') {
				const originalItem = borrowRequest.items.find(
					(item) => item.itemId.toString() === inspectionItem.itemId
				);
				if (originalItem) {
					await db
						.collection('inventory_items')
						.updateOne({ _id: originalItem.itemId }, { $inc: { quantity: originalItem.quantity } });
				}
			}
		}

		logger.info('item-inspection', 'Items inspected', {
			requestId,
			userId: user.userId,
			itemsInspected: body.items.length,
			obligationsCreated: obligations.length,
			newStatus
		});

		await invalidateBorrowRequestCaches();
		await invalidateReplacementObligationCaches();
		publishBorrowRequestRealtimeEvent(
			{ ...borrowRequest, _id: new ObjectId(requestId), status: newStatus },
			'items_inspected',
			now
		);

		return json({
			success: true,
			message: 'Items inspected successfully',
			status: newStatus,
			obligationsCreated: obligations.length
		});
	} catch (error) {
		logger.error('item-inspection', 'Inspection failed', { error });
		return json({ error: 'Internal server error' }, { status: 500 });
	}
};

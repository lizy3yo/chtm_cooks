import { ObjectId } from 'mongodb';
import type { Collection } from 'mongodb';
import type { RequestEvent } from '@sveltejs/kit';
import type { JWTPayload } from '$lib/server/utils/jwt';
import type { BorrowRequest } from '$lib/server/models/BorrowRequest';
import type { InventoryItem } from '$lib/server/models/InventoryItem';
import { getUserFromToken } from '$lib/server/middleware/auth/verify';
import { cacheService } from '$lib/server/cache';
import {
	publishBorrowRequestChange,
	type BorrowRequestRealtimeAction,
	type BorrowRequestRealtimeEvent
} from '$lib/server/realtime/borrowRequestEvents';

export const BORROW_REQUESTS_COLLECTION = 'borrow_requests';

export function getAuthenticatedUser(event: RequestEvent): JWTPayload | null {
	return getUserFromToken(event);
}

export function hasRole(user: JWTPayload, roles: string[]): boolean {
	return roles.includes(user.role);
}

export function parseObjectId(id: string): ObjectId | null {
	if (!ObjectId.isValid(id)) {
		return null;
	}

	return new ObjectId(id);
}

export function isBorrowRequestStatus(value: string): boolean {
       return [
	       'pending_instructor',
	       'approved_instructor',
	       'ready_for_pickup',
	       'borrowed',
	       'pending_return',
	       'missing',
	       'resolved',
	       'returned',
	       'cancelled',
	       'rejected'
       ].includes(value);
}

export function canAccessBorrowRequest(user: JWTPayload, request: BorrowRequest): boolean {
	if (user.role === 'superadmin') {
		return true;
	}

	if (user.role === 'student') {
		return request.studentId.toString() === user.userId;
	}

	return user.role === 'instructor' || user.role === 'custodian';
}

export async function invalidateBorrowRequestCaches(): Promise<void> {
	await Promise.all([
		cacheService.deletePattern('borrow-requests:*'),
		cacheService.deletePattern('inventory:items:*'),
		cacheService.invalidateByTags(['inventory-catalog'])
	]);
}

export function buildBorrowRequestListCacheKey(input: {
	role: string;
	userId: string;
	status?: string;
	statuses?: string[];
	search?: string;
	sortBy?: 'createdAt' | 'returnDate';
	page: number;
	limit: number;
}): string {
	const status = input.status || 'all';
	const statuses = input.statuses && input.statuses.length > 0
		? [...input.statuses].sort().join(',')
		: 'none';
	const search = input.search?.trim().toLowerCase() || 'none';
	const sortBy = input.sortBy || 'createdAt';
	return `borrow-requests:list:${input.role}:${input.userId}:${status}:${statuses}:${search}:${sortBy}:${input.page}:${input.limit}`;
}

export function buildBorrowRequestDetailCacheKey(id: string): string {
	return `borrow-requests:detail:${id}`;
}

export async function decrementInventoryForBorrow(
	inventoryCollection: Collection<InventoryItem>,
	items: BorrowRequest['items']
): Promise<{ ok: boolean; message?: string }> {
	const decremented: Array<{ itemId: ObjectId; quantity: number }> = [];

	for (const item of items) {
		const result = await inventoryCollection.updateOne(
			{
				_id: item.itemId,
				archived: false,
				quantity: { $gte: item.quantity }
			},
			{
				$inc: { quantity: -item.quantity },
				$set: { updatedAt: new Date() }
			}
		);

		if (result.modifiedCount !== 1) {
			for (const rollback of decremented) {
				await inventoryCollection.updateOne(
					{ _id: rollback.itemId },
					{ $inc: { quantity: rollback.quantity }, $set: { updatedAt: new Date() } }
				);
			}

			return {
				ok: false,
				message: `Insufficient stock for item ${item.name}`
			};
		}

		decremented.push({ itemId: item.itemId, quantity: item.quantity });
	}

	return { ok: true };
}

export async function incrementInventoryOnReturn(
	inventoryCollection: Collection<InventoryItem>,
	items: BorrowRequest['items']
): Promise<void> {
	for (const item of items) {
		await inventoryCollection.updateOne(
			{ _id: item.itemId },
			{ $inc: { quantity: item.quantity }, $set: { updatedAt: new Date() } }
		);
	}
}

/**
 * Determine which SSE channels a connected user should subscribe to.
 *
 * Channel model:
 *   - `student:<userId>`    — events for that student's own requests
 *   - `instructor:<userId>` — events for requests assigned to that instructor
 *   - `custodian:<userId>`  — events for requests being handled by that custodian
 *   - `role:instructor`     — all instructor-visible events (superadmin gets all role channels)
 *   - `role:custodian`      — all custodian-visible events
 *   - `role:superadmin`     — superadmin-only events
 */
export function getBorrowRequestRealtimeChannels(user: JWTPayload): string[] {
	switch (user.role) {
		case 'student':
			return [`student:${user.userId}`];
		case 'instructor':
			return [`instructor:${user.userId}`, 'role:instructor'];
		case 'custodian':
			return [`custodian:${user.userId}`, 'role:custodian'];
		case 'superadmin':
			return ['role:instructor', 'role:custodian', 'role:superadmin'];
		default:
			return [];
	}
}

/**
 * Derive all SSE channels that should receive an event for a given borrow request,
 * then publish the event to the broker.
 *
 * Fan-out targets:
 *   - Always: the owning student's personal channel
 *   - Always: role channels for instructors and custodians (they view all requests)
 *   - When known: the specific instructor / custodian's personal channel
 */
export function publishBorrowRequestRealtimeEvent(
	request: BorrowRequest & { _id: ObjectId },
	action: BorrowRequestRealtimeAction,
	occurredAt: Date = new Date()
): void {
	const channels: string[] = [
		`student:${request.studentId.toString()}`,
		'role:instructor',
		'role:custodian',
		'role:superadmin'
	];

	if (request.instructorId) {
		channels.push(`instructor:${request.instructorId.toString()}`);
	}
	if (request.custodianId) {
		channels.push(`custodian:${request.custodianId.toString()}`);
	}

	const event: BorrowRequestRealtimeEvent = {
		action,
		requestId: request._id.toString(),
		studentId: request.studentId.toString(),
		status: request.status,
		occurredAt: occurredAt.toISOString()
	};

	publishBorrowRequestChange(channels, event);
}

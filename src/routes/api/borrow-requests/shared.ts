import { ObjectId } from 'mongodb';
import type { Collection } from 'mongodb';
import type { RequestEvent } from '@sveltejs/kit';
import type { JWTPayload } from '$lib/server/utils/jwt';
import type { BorrowRequest } from '$lib/server/models/BorrowRequest';
import type { InventoryItem } from '$lib/server/models/InventoryItem';
import { getUserFromToken } from '$lib/server/middleware/auth/verify';
import { cacheService } from '$lib/server/cache';

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
		'returned',
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
	search?: string;
	page: number;
	limit: number;
}): string {
	const status = input.status || 'all';
	const search = input.search?.trim().toLowerCase() || 'none';
	return `borrow-requests:list:${input.role}:${input.userId}:${status}:${search}:${input.page}:${input.limit}`;
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

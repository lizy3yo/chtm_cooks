import { ObjectId } from 'mongodb';
import { cacheService } from '$lib/server/cache';
import { getUserFromToken } from '$lib/server/middleware/auth/verify';
import type { RequestEvent } from '@sveltejs/kit';

export const DONATIONS_CACHE_TAG = 'donations';

export function getAuthenticatedUser(event: RequestEvent) {
	return getUserFromToken(event);
}

export function buildDonationsListCacheKey(params: {
	type?: string;
	page: number;
	limit: number;
}): string {
	return ['donations:list', params.type || 'all', String(params.page), String(params.limit)].join(
		':'
	);
}

export function buildDonationDetailCacheKey(id: string): string {
	return `donations:detail:${id}`;
}

export async function invalidateDonationCaches(): Promise<void> {
	await Promise.all([
		cacheService.deletePattern('donations:*'),
		cacheService.invalidateByTags([DONATIONS_CACHE_TAG])
	]);
}

export function parseObjectId(id: string): ObjectId | null {
	if (!ObjectId.isValid(id)) return null;
	return new ObjectId(id);
}

/**
 * Generate a sequential receipt number: DON-YYYY-XXXXXX
 * Uses the current count of documents to produce a zero-padded suffix.
 */
export function generateReceiptNumber(count: number): string {
	const year = new Date().getFullYear();
	const seq = String(count + 1).padStart(6, '0');
	return `DON-${year}-${seq}`;
}

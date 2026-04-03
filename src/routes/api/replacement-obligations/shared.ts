import { ObjectId } from 'mongodb';
import { cacheService } from '$lib/server/cache';
import {
	ObligationStatus,
	ResolutionType,
	type ResolveReplacementObligationRequest
} from '$lib/server/models/ReplacementObligation';
import { getUserFromToken } from '$lib/server/middleware/auth/verify';
import { sanitizeInput } from '$lib/server/utils/validation';
import type { RequestEvent } from '@sveltejs/kit';
import {
	publishReplacementObligationChange,
	getReplacementObligationRealtimeChannels,
	type ReplacementObligationRealtimeAction,
	type ReplacementObligationRealtimeEvent
} from '$lib/server/realtime/replacementObligationEvents';

export const REPLACEMENT_OBLIGATIONS_COLLECTION = 'replacement_obligations';
export const REPLACEMENT_OBLIGATIONS_CACHE_TAG = 'replacement-obligations';

export function getAuthenticatedUser(event: RequestEvent) {
	return getUserFromToken(event);
}

export function isObligationStatus(value: string): value is ObligationStatus {
	return Object.values(ObligationStatus).includes(value as ObligationStatus);
}

export function isResolutionType(value: string): value is ResolutionType {
	return Object.values(ResolutionType).includes(value as ResolutionType);
}

export function buildReplacementObligationsListCacheKey(input: {
	role: string;
	userId: string;
	status?: ObligationStatus;
	studentId?: string;
	page: number;
	limit: number;
}): string {
	return [
		'replacement-obligations:list',
		input.role,
		input.userId,
		input.status || 'all',
		input.studentId || 'self',
		String(input.page),
		String(input.limit)
	].join(':');
}

export function buildReplacementObligationDetailCacheKey(id: string): string {
	return `replacement-obligations:detail:${id}`;
}

export async function invalidateReplacementObligationCaches(): Promise<void> {
	await Promise.all([
		cacheService.deletePattern('replacement-obligations:*'),
		cacheService.invalidateByTags([REPLACEMENT_OBLIGATIONS_CACHE_TAG])
	]);
}

export function sanitizeResolutionPayload(body: ResolveReplacementObligationRequest): ResolveReplacementObligationRequest {
	return {
		resolutionType: body.resolutionType,
		amountPaid: typeof body.amountPaid === 'number' ? body.amountPaid : undefined,
		resolutionNotes: body.resolutionNotes ? sanitizeInput(body.resolutionNotes).slice(0, 500) : undefined,
		paymentReference: body.paymentReference ? sanitizeInput(body.paymentReference).slice(0, 120) : undefined
	};
}

export function parseObjectId(id: string): ObjectId | null {
	if (!ObjectId.isValid(id)) {
		return null;
	}

	return new ObjectId(id);
}

/**
 * Publish a replacement obligation realtime event to all subscribed SSE clients.
 * Fan-out targets: the owning student's channel + role:custodian + role:superadmin.
 */
export function publishReplacementObligationRealtimeEvent(
	studentId: string,
	action: ReplacementObligationRealtimeAction,
	borrowRequestId: string,
	obligationId?: string,
	occurredAt: Date = new Date()
): void {
	const channels = getReplacementObligationRealtimeChannels(studentId);
	const event: ReplacementObligationRealtimeEvent = {
		action,
		obligationId,
		borrowRequestId,
		studentId,
		occurredAt: occurredAt.toISOString()
	};
	publishReplacementObligationChange(channels, event);
}

/**
 * Borrow Request Validation Middleware
 * 
 * Industry-standard validation for equipment borrow request operations.
 * 
 * Business Rules:
 * - Same-day return policy: All equipment must be returned on the same day
 * - Minimum borrow duration: 1 hour
 * - Maximum borrow duration: 12 hours per day
 * - Maximum items per request: 10
 * - Maximum advance booking: 90 days
 * 
 * Implements:
 * - Input sanitization and validation
 * - Business rule enforcement
 * - Security checks and authorization
 * - Data integrity validation
 * - ISO 8601 datetime handling
 * 
 * @module borrowRequestValidation
 * @version 2.0.0
 */

import { json } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';
import { ObjectId } from 'mongodb';
import { sanitizeInput } from '../utils/validation';
import { AppError } from '../errors/AppError';

/**
 * Validation result type
 */
export interface ValidationResult {
	valid: boolean;
	error?: string;
	sanitized?: Record<string, unknown>;
}

/**
 * Item validation constraints
 */
const ITEM_CONSTRAINTS = {
	MIN_QUANTITY: 1,
	MAX_QUANTITY: 50,
	MAX_ITEMS_PER_REQUEST: 10
};

/**
 * Date validation constraints
 */
const DATE_CONSTRAINTS = {
	MIN_BORROW_DAYS_AHEAD: 0, // Allow same-day requests
	MAX_BORROW_DAYS_AHEAD: 90, // Max 3 months in advance
	MIN_BORROW_DURATION_HOURS: 1, // Minimum 1 hour
	MAX_BORROW_DURATION_HOURS: 12, // Maximum 12 hours (same-day return policy)
	SAME_DAY_RETURN_REQUIRED: true // Equipment must be returned same day
};

/**
 * Calculate duration between two datetimes
 * @returns Duration in hours (rounded to 2 decimal places)
 */
export function calculateDurationHours(borrowDate: Date, returnDate: Date): number {
	const durationMs = returnDate.getTime() - borrowDate.getTime();
	const durationHours = durationMs / (1000 * 60 * 60);
	return Math.round(durationHours * 100) / 100; // Round to 2 decimal places
}

/**
 * Check if two dates are on the same calendar day
 */
export function isSameDay(date1: Date, date2: Date): boolean {
	return (
		date1.getFullYear() === date2.getFullYear() &&
		date1.getMonth() === date2.getMonth() &&
		date1.getDate() === date2.getDate()
	);
}

/**
 * Purpose validation constraints
 */
const PURPOSE_CONSTRAINTS = {
	MIN_LENGTH: 3,
	MAX_LENGTH: 500,
	// Allow common request punctuation used by the UI, e.g. "Lab Exercise: ... | Notes: ..."
	REQUIRED_PATTERN: /^[a-zA-Z0-9\s.,!?':;()\-/&|]+$/
};

/**
 * Validate ObjectId format
 */
export function validateObjectId(id: string, fieldName: string = 'ID'): ValidationResult {
	if (!id || typeof id !== 'string') {
		return {
			valid: false,
			error: `${fieldName} is required`
		};
	}

	if (!ObjectId.isValid(id)) {
		return {
			valid: false,
			error: `Invalid ${fieldName} format`
		};
	}

	return { valid: true };
}

/**
 * Validate item array
 */
export function validateItems(items: unknown): ValidationResult {
	// Check array
	if (!Array.isArray(items)) {
		return {
			valid: false,
			error: 'Items must be an array'
		};
	}

	// Check length
	if (items.length === 0) {
		return {
			valid: false,
			error: 'At least one item is required'
		};
	}

	if (items.length > ITEM_CONSTRAINTS.MAX_ITEMS_PER_REQUEST) {
		return {
			valid: false,
			error: `Maximum ${ITEM_CONSTRAINTS.MAX_ITEMS_PER_REQUEST} items per request`
		};
	}

	// Validate each item
	const sanitizedItems: Array<{ itemId: ObjectId; quantity: number }> = [];
	const seenItemIds = new Set<string>();

	for (let i = 0; i < items.length; i++) {
		const item = items[i];

		// Check structure
		if (!item || typeof item !== 'object') {
			return {
				valid: false,
				error: `Item at index ${i} is invalid`
			};
		}

		// Validate itemId
		const itemIdValidation = validateObjectId(
			(item as { itemId?: string }).itemId || '',
			`Item ID at index ${i}`
		);
		if (!itemIdValidation.valid) {
			return itemIdValidation;
		}

		const itemId = (item as { itemId: string }).itemId;

		// Check for duplicates
		if (seenItemIds.has(itemId)) {
			return {
				valid: false,
				error: `Duplicate item detected: ${itemId}`
			};
		}
		seenItemIds.add(itemId);

		// Validate quantity
		const quantity = (item as { quantity?: unknown }).quantity;
		if (typeof quantity !== 'number' || !Number.isInteger(quantity)) {
			return {
				valid: false,
				error: `Quantity for item at index ${i} must be an integer`
			};
		}

		if (quantity < ITEM_CONSTRAINTS.MIN_QUANTITY || quantity > ITEM_CONSTRAINTS.MAX_QUANTITY) {
			return {
				valid: false,
				error: `Quantity must be between ${ITEM_CONSTRAINTS.MIN_QUANTITY} and ${ITEM_CONSTRAINTS.MAX_QUANTITY}`
			};
		}

		sanitizedItems.push({
			itemId: new ObjectId(itemId),
			quantity
		});
	}

	return {
		valid: true,
		sanitized: { items: sanitizedItems }
	};
}

/**
 * Validate purpose text
 */
export function validatePurpose(purpose: unknown): ValidationResult {
	if (typeof purpose !== 'string') {
		return {
			valid: false,
			error: 'Purpose must be a string'
		};
	}

	const sanitized = sanitizeInput(purpose);

	if (sanitized.length < PURPOSE_CONSTRAINTS.MIN_LENGTH) {
		return {
			valid: false,
			error: `Purpose must be at least ${PURPOSE_CONSTRAINTS.MIN_LENGTH} characters`
		};
	}

	if (sanitized.length > PURPOSE_CONSTRAINTS.MAX_LENGTH) {
		return {
			valid: false,
			error: `Purpose must not exceed ${PURPOSE_CONSTRAINTS.MAX_LENGTH} characters`
		};
	}

	if (!PURPOSE_CONSTRAINTS.REQUIRED_PATTERN.test(sanitized)) {
		return {
			valid: false,
			error: 'Purpose contains invalid characters'
		};
	}

	return {
		valid: true,
		sanitized: { purpose: sanitized }
	};
}

/**
 * Validate borrow and return dates with time (same-day return policy)
 * 
 * Business Rules:
 * - Equipment must be returned on the same day it's borrowed
 * - Minimum borrow duration: 1 hour
 * - Maximum borrow duration: 12 hours (within same day)
 * - Borrow datetime cannot be in the past
 * - Return time must be after borrow time on the same day
 */
export function validateDates(borrowDate: unknown, returnDate: unknown): ValidationResult {
	// Parse dates with time
	const borrow = typeof borrowDate === 'string' ? new Date(borrowDate) : null;
	const returns = typeof returnDate === 'string' ? new Date(returnDate) : null;

	if (!borrow || Number.isNaN(borrow.getTime())) {
		return {
			valid: false,
			error: 'Invalid borrow date format. Expected ISO 8601 datetime (YYYY-MM-DDTHH:MM)'
		};
	}

	if (!returns || Number.isNaN(returns.getTime())) {
		return {
			valid: false,
			error: 'Invalid return date format. Expected ISO 8601 datetime (YYYY-MM-DDTHH:MM)'
		};
	}

	const now = new Date();
	const minimumBorrowDate = new Date(now);
	minimumBorrowDate.setHours(0, 0, 0, 0);
	const maximumBorrowDate = new Date(minimumBorrowDate);
	maximumBorrowDate.setDate(maximumBorrowDate.getDate() + 2);
	
	// Check borrow date is within the allowed request window
	if (borrow < minimumBorrowDate) {
		return {
			valid: false,
			error: 'Borrow date cannot be in the past'
		};
	}

	if (borrow > maximumBorrowDate) {
		return {
			valid: false,
			error: 'Borrow date must be within the next 2 days'
		};
	}

	// Check borrow date is not too far in advance
	const maxAdvanceDate = new Date(now.getTime() + DATE_CONSTRAINTS.MAX_BORROW_DAYS_AHEAD * 24 * 60 * 60 * 1000);
	if (borrow > maxAdvanceDate) {
		return {
			valid: false,
			error: `Cannot schedule equipment borrow more than ${DATE_CONSTRAINTS.MAX_BORROW_DAYS_AHEAD} days in advance`
		};
	}

	// Enforce same-day return policy
	if (DATE_CONSTRAINTS.SAME_DAY_RETURN_REQUIRED && !isSameDay(borrow, returns)) {
		return {
			valid: false,
			error: 'Equipment must be returned on the same day. Same-day return policy is enforced.'
		};
	}

	// Check return datetime is after borrow datetime
	if (returns <= borrow) {
		return {
			valid: false,
			error: 'Return time must be after borrow time'
		};
	}

	// Calculate and validate duration
	const durationHours = calculateDurationHours(borrow, returns);
	
	// Validate minimum duration
	if (durationHours < DATE_CONSTRAINTS.MIN_BORROW_DURATION_HOURS) {
		return {
			valid: false,
			error: `Minimum borrow duration is ${DATE_CONSTRAINTS.MIN_BORROW_DURATION_HOURS} hour(s)`
		};
	}

	// Validate maximum duration
	if (durationHours > DATE_CONSTRAINTS.MAX_BORROW_DURATION_HOURS) {
		return {
			valid: false,
			error: `Maximum borrow duration is ${DATE_CONSTRAINTS.MAX_BORROW_DURATION_HOURS} hours per day`
		};
	}

	// Validate return time doesn't exceed end of day (23:59)
	const returnHour = returns.getHours();
	const returnMinute = returns.getMinutes();
	if (returnHour > 23 || (returnHour === 23 && returnMinute > 59)) {
		return {
			valid: false,
			error: 'Return time must be within the same day (before midnight)'
		};
	}

	return {
		valid: true,
		sanitized: {
			borrowDate: borrow.toISOString(),
			returnDate: returns.toISOString()
		}
	};
}

/**
 * Validate complete borrow request creation payload
 */
export function validateCreateBorrowRequest(body: unknown): ValidationResult {
	if (!body || typeof body !== 'object') {
		return {
			valid: false,
			error: 'Invalid request body'
		};
	}

	const data = body as Record<string, unknown>;

	// Validate items
	const itemsValidation = validateItems(data.items);
	if (!itemsValidation.valid) {
		return itemsValidation;
	}

	// Validate purpose
	const purposeValidation = validatePurpose(data.purpose);
	if (!purposeValidation.valid) {
		return purposeValidation;
	}

	// Validate dates
	const datesValidation = validateDates(data.borrowDate, data.returnDate);
	if (!datesValidation.valid) {
		return datesValidation;
	}

	// Combine sanitized data
	return {
		valid: true,
		sanitized: {
			...itemsValidation.sanitized,
			...purposeValidation.sanitized,
			...datesValidation.sanitized
		}
	};
}

/**
 * Validate rejection reason
 */
export function validateRejectionReason(reason: unknown, notes?: unknown): ValidationResult {
	if (typeof reason !== 'string' || reason.trim().length === 0) {
		return {
			valid: false,
			error: 'Rejection reason is required'
		};
	}

	const sanitizedReason = sanitizeInput(reason);
	if (sanitizedReason.length < 3 || sanitizedReason.length > 200) {
		return {
			valid: false,
			error: 'Rejection reason must be between 3 and 200 characters'
		};
	}

	const sanitized: Record<string, string> = {
		rejectReason: sanitizedReason
	};

	if (notes && typeof notes === 'string') {
		const sanitizedNotes = sanitizeInput(notes);
		if (sanitizedNotes.length > 500) {
			return {
				valid: false,
				error: 'Rejection notes must not exceed 500 characters'
			};
		}
		sanitized.rejectionNotes = sanitizedNotes;
	}

	return {
		valid: true,
		sanitized
	};
}

/**
 * Validation middleware wrapper for route handlers
 * 
 * Usage:
 * const validation = validateCreateBorrowRequest(body);
 * if (!validation.valid) {
 *   return json({ error: validation.error }, { status: 400 });
 * }
 * const sanitized = validation.sanitized;
 */
export function createValidationMiddleware(
	validator: (data: unknown) => ValidationResult
) {
	return (data: unknown): Response | null => {
		const result = validator(data);
		if (!result.valid) {
			return json({ error: result.error }, { status: 400 });
		}
		return null;
	};
}

/**
 * Security check: Verify user can modify request
 */
export function canModifyRequest(
	userId: string,
	userRole: string,
	request: { studentId: string; status: string }
): { allowed: boolean; reason?: string } {
	// Students can only cancel their own pending requests
	if (userRole === 'student') {
		if (request.studentId !== userId) {
			return {
				allowed: false,
				reason: 'Cannot modify requests from other students'
			};
		}
		if (request.status !== 'pending_instructor') {
			return {
				allowed: false,
				reason: 'Can only cancel pending requests'
			};
		}
		return { allowed: true };
	}

	// Instructors can approve/reject pending requests
	if (userRole === 'instructor') {
		if (request.status !== 'pending_instructor') {
			return {
				allowed: false,
				reason: 'Request is not in pending state'
			};
		}
		return { allowed: true };
	}

	// Custodians can release approved requests
	if (userRole === 'custodian') {
		if (!['approved_instructor', 'borrowed'].includes(request.status)) {
			return {
				allowed: false,
				reason: 'Request cannot be processed at current status'
			};
		}
		return { allowed: true };
	}

	// Admins can do anything
	if (userRole === 'superadmin') {
		return { allowed: true };
	}

	return {
		allowed: false,
		reason: 'Insufficient permissions'
	};
}

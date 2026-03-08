/**
 * Borrow Request Validation Middleware
 * 
 * Industry-standard validation for borrow request operations
 * Implements:
 * - Input sanitization
 * - Business rule validation
 * - Security checks
 * - Data integrity enforcement
 * 
 * @module borrowRequestValidation
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
	MIN_BORROW_DAYS_AHEAD: 0, // Can borrow same day
	MAX_BORROW_DAYS_AHEAD: 90, // Max 3 months in advance
	MIN_BORROW_DURATION: 1, // At least 1 day
	MAX_BORROW_DURATION: 30 // Max 30 days
};

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
 * Validate borrow and return dates
 */
export function validateDates(borrowDate: unknown, returnDate: unknown): ValidationResult {
	// Parse dates
	const borrow = typeof borrowDate === 'string' ? new Date(borrowDate) : null;
	const returns = typeof returnDate === 'string' ? new Date(returnDate) : null;

	if (!borrow || Number.isNaN(borrow.getTime())) {
		return {
			valid: false,
			error: 'Invalid borrow date format'
		};
	}

	if (!returns || Number.isNaN(returns.getTime())) {
		return {
			valid: false,
			error: 'Invalid return date format'
		};
	}

	// Normalize to start of day
	const now = new Date();
	now.setHours(0, 0, 0, 0);
	
	const borrowDay = new Date(borrow);
	borrowDay.setHours(0, 0, 0, 0);
	
	const returnDay = new Date(returns);
	returnDay.setHours(0, 0, 0, 0);

	// Check borrow date is not too far in the past
	const daysBeforeBorrow = Math.floor((borrowDay.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
	
	if (daysBeforeBorrow < -1) { // Allow 1 day grace for timezone issues
		return {
			valid: false,
			error: 'Borrow date cannot be in the past'
		};
	}

	// Check borrow date is not too far in advance
	if (daysBeforeBorrow > DATE_CONSTRAINTS.MAX_BORROW_DAYS_AHEAD) {
		return {
			valid: false,
			error: `Cannot borrow more than ${DATE_CONSTRAINTS.MAX_BORROW_DAYS_AHEAD} days in advance`
		};
	}

	// Check return date is after borrow date
	if (returnDay <= borrowDay) {
		return {
			valid: false,
			error: 'Return date must be after borrow date'
		};
	}

	// Check duration
	const duration = Math.floor((returnDay.getTime() - borrowDay.getTime()) / (1000 * 60 * 60 * 24));
	
	if (duration < DATE_CONSTRAINTS.MIN_BORROW_DURATION) {
		return {
			valid: false,
			error: `Minimum borrow duration is ${DATE_CONSTRAINTS.MIN_BORROW_DURATION} day(s)`
		};
	}

	if (duration > DATE_CONSTRAINTS.MAX_BORROW_DURATION) {
		return {
			valid: false,
			error: `Maximum borrow duration is ${DATE_CONSTRAINTS.MAX_BORROW_DURATION} days`
		};
	}

	return {
		valid: true,
		sanitized: {
			borrowDate: borrowDay.toISOString(),
			returnDate: returnDay.toISOString()
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

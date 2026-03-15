/**
 * Student profile validation helpers.
 */

import { sanitizeInput } from '$lib/server/utils/validation';
import { validatePassword } from '$lib/server/utils/password';

export interface ProfileValidationResult<T = Record<string, unknown>> {
	valid: boolean;
	error?: string;
	sanitized?: T;
}

const NAME_REGEX = /^[a-zA-Z\s'-]+$/;
const YEAR_LEVELS = new Set(['1st Year', '2nd Year', '3rd Year', '4th Year']);
const BLOCK_REGEX = /^[A-Za-z0-9\- ]{1,10}$/;

export interface StudentProfileUpdateInput {
	firstName: string;
	lastName: string;
	yearLevel: string;
	block: string;
}

export function validateStudentProfileUpdate(body: unknown): ProfileValidationResult<StudentProfileUpdateInput> {
	if (!body || typeof body !== 'object') {
		return { valid: false, error: 'Invalid request body' };
	}

	const input = body as Record<string, unknown>;
	const firstNameRaw = typeof input.firstName === 'string' ? sanitizeInput(input.firstName) : '';
	const lastNameRaw = typeof input.lastName === 'string' ? sanitizeInput(input.lastName) : '';
	const yearLevelRaw = typeof input.yearLevel === 'string' ? sanitizeInput(input.yearLevel) : '';
	const blockRaw = typeof input.block === 'string' ? sanitizeInput(input.block).toUpperCase() : '';

	if (!firstNameRaw || firstNameRaw.length < 2 || firstNameRaw.length > 50 || !NAME_REGEX.test(firstNameRaw)) {
		return {
			valid: false,
			error: 'First name must be 2-50 characters and contain only letters, spaces, hyphens, and apostrophes'
		};
	}

	if (!lastNameRaw || lastNameRaw.length < 2 || lastNameRaw.length > 50 || !NAME_REGEX.test(lastNameRaw)) {
		return {
			valid: false,
			error: 'Last name must be 2-50 characters and contain only letters, spaces, hyphens, and apostrophes'
		};
	}

	if (!YEAR_LEVELS.has(yearLevelRaw)) {
		return {
			valid: false,
			error: 'Year level is invalid'
		};
	}

	if (!BLOCK_REGEX.test(blockRaw)) {
		return {
			valid: false,
			error: 'Block must be 1-10 characters and can only contain letters, numbers, spaces, and hyphens'
		};
	}

	return {
		valid: true,
		sanitized: {
			firstName: firstNameRaw,
			lastName: lastNameRaw,
			yearLevel: yearLevelRaw,
			block: blockRaw
		}
	};
}

export function validatePasswordChange(body: unknown): ProfileValidationResult<{ currentPassword: string; newPassword: string }> {
	if (!body || typeof body !== 'object') {
		return { valid: false, error: 'Invalid request body' };
	}

	const input = body as Record<string, unknown>;
	const currentPassword = typeof input.currentPassword === 'string' ? input.currentPassword : '';
	const newPassword = typeof input.newPassword === 'string' ? input.newPassword : '';

	if (!currentPassword || !newPassword) {
		return { valid: false, error: 'Current password and new password are required' };
	}

	if (currentPassword === newPassword) {
		return { valid: false, error: 'New password must be different from current password' };
	}

	const passwordValidation = validatePassword(newPassword);
	if (!passwordValidation.valid) {
		return { valid: false, error: passwordValidation.message || 'Invalid password' };
	}

	return {
		valid: true,
		sanitized: {
			currentPassword,
			newPassword
		}
	};
}

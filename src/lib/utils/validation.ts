import type { ValidationError } from '$lib/types/auth';

/**
 * Email validation
 */
export function validateEmail(email: string): ValidationError | null {
	if (!email) {
		return { field: 'email', message: 'Email is required' };
	}
	
	const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
	if (!emailRegex.test(email)) {
		return { field: 'email', message: 'Invalid email format' };
	}
	
	return null;
}

/**
 * Student email validation (must end with @gordoncollege.edu.ph)
 */
export function validateStudentEmail(email: string): ValidationError | null {
	const emailError = validateEmail(email);
	if (emailError) return emailError;
	
	if (!email.endsWith('@gordoncollege.edu.ph')) {
		return { 
			field: 'email', 
			message: 'Students must use a @gordoncollege.edu.ph email address' 
		};
	}
	
	return null;
}

/**
 * Password validation
 */
export function validatePassword(password: string): ValidationError | null {
	if (!password) {
		return { field: 'password', message: 'Password is required' };
	}
	
	if (password.length < 8) {
		return { field: 'password', message: 'Password must be at least 8 characters long' };
	}
	
	if (!/[A-Z]/.test(password)) {
		return { field: 'password', message: 'Password must contain at least one uppercase letter' };
	}
	
	if (!/[a-z]/.test(password)) {
		return { field: 'password', message: 'Password must contain at least one lowercase letter' };
	}
	
	if (!/[0-9]/.test(password)) {
		return { field: 'password', message: 'Password must contain at least one number' };
	}
	
	if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
		return { field: 'password', message: 'Password must contain at least one special character' };
	}
	
	return null;
}

/**
 * Password confirmation validation
 */
export function validatePasswordConfirmation(
	password: string, 
	confirmPassword: string
): ValidationError | null {
	if (!confirmPassword) {
		return { field: 'confirmPassword', message: 'Please confirm your password' };
	}
	
	if (password !== confirmPassword) {
		return { field: 'confirmPassword', message: 'Passwords do not match' };
	}
	
	return null;
}

/**
 * Name validation
 */
export function validateName(name: string, fieldName: string = 'name'): ValidationError | null {
	// Convert fieldName to display name (firstName -> First Name)
	const displayName = fieldName === 'firstName' ? 'First Name' : 
	                     fieldName === 'lastName' ? 'Last Name' : fieldName;
	
	if (!name || !name.trim()) {
		return { field: fieldName, message: `${displayName} is required` };
	}
	
	if (name.trim().length < 2) {
		return { field: fieldName, message: `${displayName} must be at least 2 characters` };
	}
	
	if (!/^[a-zA-Z\s'-]+$/.test(name)) {
		return { field: fieldName, message: `${displayName} can only contain letters, spaces, hyphens, and apostrophes` };
	}
	
	return null;
}

/**
 * Required field validation
 */
export function validateRequired(value: string | boolean | undefined, fieldName: string): ValidationError | null {
	// Convert fieldName to display name
	const displayNames: Record<string, string> = {
		yearLevel: 'Year Level',
		block: 'Block/Section',
		agreedToTerms: 'Terms and Conditions agreement'
	};
	
	const displayName = displayNames[fieldName] || 
	                    fieldName.charAt(0).toUpperCase() + fieldName.slice(1);
	
	if (value === undefined || value === null || value === '' || value === false) {
		return { 
			field: fieldName, 
			message: `${displayName} is required` 
		};
	}
	return null;
}

/**
 * Batch validation for multiple fields
 */
export function batchValidate(validators: Array<ValidationError | null>): ValidationError[] {
	return validators.filter((error): error is ValidationError => error !== null);
}

/**
 * Get password strength (0-4)
 */
export function getPasswordStrength(password: string): {
	score: number;
	label: string;
	color: string;
} {
	let score = 0;
	
	if (password.length >= 8) score++;
	if (password.length >= 12) score++;
	if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++;
	if (/[0-9]/.test(password)) score++;
	if (/[!@#$%^&*(),.?":{}|<>]/.test(password)) score++;
	
	const labels = ['Very Weak', 'Weak', 'Fair', 'Good', 'Strong'];
	const colors = ['#ef4444', '#f97316', '#eab308', '#84cc16', '#22c55e'];
	
	const index = Math.min(Math.floor(score / 1.25), 4);
	
	return {
		score: index,
		label: labels[index],
		color: colors[index]
	};
}

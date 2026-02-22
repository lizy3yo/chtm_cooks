import { UserRole } from '../models/User';

export function validateEmail(email: string): boolean {
	const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
	return emailRegex.test(email);
}

export function validateRole(role: string): role is UserRole {
	return Object.values(UserRole).includes(role as UserRole);
}

export function sanitizeInput(input: string): string {
	return input.trim();
}

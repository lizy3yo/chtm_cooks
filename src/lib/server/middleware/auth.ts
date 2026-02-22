import { json } from '@sveltejs/kit';
import { verifyAccessToken } from '../utils/jwt';
import type { UserRole } from '../models/User';
import type { JWTPayload } from '../utils/jwt';

export function extractToken(authHeader: string | null): string | null {
	if (!authHeader || !authHeader.startsWith('Bearer ')) {
		return null;
	}
	return authHeader.substring(7);
}

export function authenticateToken(authHeader: string | null): {
	success: boolean;
	payload?: JWTPayload;
	error?: Response;
} {
	const token = extractToken(authHeader);

	if (!token) {
		return {
			success: false,
			error: json({ error: 'Access token required' }, { status: 401 })
		};
	}

	try {
		const payload = verifyAccessToken(token);
		return { success: true, payload };
	} catch (error) {
		return {
			success: false,
			error: json({ error: 'Invalid or expired token' }, { status: 401 })
		};
	}
}

export function authorizeRoles(userRole: UserRole, allowedRoles: UserRole[]): boolean {
	return allowedRoles.includes(userRole);
}

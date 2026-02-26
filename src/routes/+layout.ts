import { redirect } from '@sveltejs/kit';
import type { LayoutLoad } from './$types';

export const load: LayoutLoad = async ({ url }) => {
	// List of public routes that don't require authentication
	const publicRoutes = ['/auth/login', '/auth/register', '/auth/staff-access', '/auth/forgot-password', '/auth/reset-password', '/auth/verify-email'];
	
	// If current path is a public route, allow access
	if (publicRoutes.some(route => url.pathname.startsWith(route))) {
		return {};
	}
	
	// For all other routes, this will be handled by specific layout guards
	return {};
};

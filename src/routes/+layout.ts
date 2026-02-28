import type { LayoutLoad } from './$types';

export const load: LayoutLoad = async () => {
	// Authentication is handled by specific layout guards in protected routes
	return {};
};

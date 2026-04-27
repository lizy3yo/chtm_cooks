import type { RequestHandler } from './$types';
import { POST as createIndexesPOST } from '../+server';

/**
 * POST /api/inventory/indexes/create
 * Alias route for index creation endpoint.
 */
export const POST: RequestHandler = async (event) => {
	return createIndexesPOST(event as any);
};

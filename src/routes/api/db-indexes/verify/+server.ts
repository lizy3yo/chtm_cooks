/**
 * Verify Database Indexes Endpoint
 * 
 * POST /api/db-indexes/verify
 * Verifies all defined indexes exist in the database
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { indexManager } from '$lib/server/db/indexes';

/**
 * POST /api/db-indexes/verify
 * Verify all indexes exist
 */
export const POST: RequestHandler = async () => {
	try {
		const verification = await indexManager.verifyAllIndexes();

		return json({
			status: verification.verified ? 'ok' : 'incomplete',
			message: verification.verified
				? 'All indexes are present'
				: `${verification.missing.length} indexes are missing`,
			timestamp: new Date().toISOString(),
			verification,
			recommendation: verification.verified
				? 'All indexes are properly configured'
				: 'Run POST /api/db-indexes/create to create missing indexes'
		});
	} catch (error) {
		return json(
			{
				status: 'error',
				message: error instanceof Error ? error.message : 'Failed to verify indexes',
				timestamp: new Date().toISOString()
			},
			{ status: 500 }
		);
	}
};

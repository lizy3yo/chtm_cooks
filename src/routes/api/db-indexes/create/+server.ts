/**
 * Create Database Indexes Endpoint
 * 
 * POST /api/db-indexes/create
 * Creates all defined indexes in the database
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { indexManager } from '$lib/server/db/indexes';

/**
 * POST /api/db-indexes/create
 * Create all defined indexes
 */
export const POST: RequestHandler = async ({ request }) => {
	try {
		const body = await request.json().catch(() => ({}));
		const { collection } = body;

		// Create indexes for specific collection or all collections
		const result = collection
			? await indexManager.createCollectionIndexes(collection)
			: await indexManager.createAllIndexes();

		const success = result.failed === 0;

		return json(
			{
				status: success ? 'ok' : 'partial',
				message: success
					? 'All indexes created successfully'
					: `${result.failed} indexes failed to create`,
				timestamp: new Date().toISOString(),
				result: {
					totalIndexes: result.totalIndexes,
					created: result.created,
					existed: result.existed,
					failed: result.failed,
					executionTimeMs: result.totalExecutionTimeMs
				},
				details: result.results
			},
			{ status: success ? 200 : 207 } // 207 Multi-Status for partial success
		);
	} catch (error) {
		return json(
			{
				status: 'error',
				message: error instanceof Error ? error.message : 'Failed to create indexes',
				timestamp: new Date().toISOString()
			},
			{ status: 500 }
		);
	}
};

/**
 * Database Indexes Management Endpoint
 * 
 * Endpoints for managing and monitoring database indexes
 * 
 * GET    /api/db-indexes           - List all indexes and their status
 * POST   /api/db-indexes/create    - Create all indexes
 * POST   /api/db-indexes/verify    - Verify all indexes exist
 * GET    /api/db-indexes/health    - Health check for indexes
 * GET    /api/db-indexes/:collection - Get indexes for specific collection
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { indexManager, allIndexDefinitions } from '$lib/server/db/indexes';

/**
 * GET /api/db-indexes
 * List all defined indexes and their status
 */
export const GET: RequestHandler = async () => {
	try {
		// Get status for all collections
		const collections = [...new Set(allIndexDefinitions.map((idx) => idx.collection))];

		const statuses = await Promise.all(
			collections.map(async (collection) => {
				const summary = await indexManager.getCollectionSummary(collection);
				const health = await indexManager.healthCheck(collection);

				return {
					collection,
					summary,
					health
				};
			})
		);

		// Verify all indexes
		const verification = await indexManager.verifyAllIndexes();

		return json({
			status: 'ok',
			timestamp: new Date().toISOString(),
			collections: statuses,
			verification,
			totalDefinedIndexes: allIndexDefinitions.length,
			info: {
				message: 'Database indexes status',
				endpoints: {
					create: 'POST /api/db-indexes/create',
					verify: 'POST /api/db-indexes/verify',
					health: 'GET /api/db-indexes/health',
					collection: 'GET /api/db-indexes/:collection'
				}
			}
		});
	} catch (error) {
		return json(
			{
				status: 'error',
				message: error instanceof Error ? error.message : 'Failed to get index status',
				timestamp: new Date().toISOString()
			},
			{ status: 500 }
		);
	}
};

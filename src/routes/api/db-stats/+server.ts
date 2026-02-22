/**
 * Database Statistics Endpoint
 * 
 * GET /api/db-stats
 * GET /api/db-stats/:collection
 * 
 * Provides detailed database and collection statistics
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { indexManager } from '$lib/server/db/indexes';
import { getDatabase } from '$lib/server/db/mongodb';

/**
 * GET /api/db-stats
 * Get overall database statistics
 */
export const GET: RequestHandler = async ({ url }) => {
	try {
		const db = await getDatabase();

		// Get database stats
		const dbStats = await db.stats();

		// Get list of collections
		const collections = await db.listCollections().toArray();
		const collectionNames = collections.map((c) => c.name);

		// Get stats for each collection
		const collectionStats = await Promise.all(
			collectionNames.map(async (name) => {
				const summary = await indexManager.getCollectionSummary(name);
				return {
					name,
					summary
				};
			})
		);

		return json({
			status: 'ok',
			timestamp: new Date().toISOString(),
			database: {
				name: dbStats.db,
				collections: dbStats.collections,
				views: dbStats.views,
				dataSize: formatBytes(dbStats.dataSize),
				storageSize: formatBytes(dbStats.storageSize),
				indexSize: formatBytes(dbStats.indexSize),
				totalSize: formatBytes(dbStats.dataSize + dbStats.indexSize),
				indexes: dbStats.indexes,
				avgObjSize: formatBytes(dbStats.avgObjSize)
			},
			collections: collectionStats,
			info: {
				message: 'Database statistics and collection summaries',
				endpoint: `GET ${url.origin}/api/db-stats/:collection for detailed collection stats`
			}
		});
	} catch (error) {
		return json(
			{
				status: 'error',
				message: error instanceof Error ? error.message : 'Failed to get database stats',
				timestamp: new Date().toISOString()
			},
			{ status: 500 }
		);
	}
};

/**
 * Format bytes to human-readable format
 */
function formatBytes(bytes: number): string {
	if (bytes === 0) return '0 B';

	const k = 1024;
	const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
	const i = Math.floor(Math.log(bytes) / Math.log(k));

	return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}

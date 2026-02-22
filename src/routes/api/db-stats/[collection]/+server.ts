/**
 * Collection Statistics Endpoint
 * 
 * GET /api/db-stats/:collection
 * Detailed statistics for a specific collection
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { indexManager } from '$lib/server/db/indexes';
import { getDatabase } from '$lib/server/db/mongodb';

/**
 * GET /api/db-stats/:collection
 * Get detailed stats for a specific collection
 */
export const GET: RequestHandler = async ({ params }) => {
	try {
		const { collection } = params;

		if (!collection) {
			return json(
				{
					status: 'error',
					message: 'Collection name is required',
					timestamp: new Date().toISOString()
				},
				{ status: 400 }
			);
		}

		const db = await getDatabase();

		// Get collection stats
		const stats = await db.command({ collStats: collection });

		// Get index summary
		const summary = await indexManager.getCollectionSummary(collection);

		// Get index health
		const health = await indexManager.healthCheck(collection);

		// Get index statistics
		const indexStats = await indexManager.getIndexStats(collection);

		return json({
			status: 'ok',
			timestamp: new Date().toISOString(),
			collection,
			stats: {
				documentCount: stats.count,
				dataSize: formatBytes(stats.size),
				storageSize: formatBytes(stats.storageSize),
				avgDocumentSize: formatBytes(stats.avgObjSize),
				indexes: stats.nindexes,
				totalIndexSize: formatBytes(stats.totalIndexSize)
			},
			summary,
			health,
			indexStats,
			performance: {
				indexToDataRatio: summary ? summary.indexToDataRatio.toFixed(2) : '0',
				explanation: summary ? getIndexRatioExplanation(summary.indexToDataRatio) : ''
			}
		});
	} catch (error) {
		return json(
			{
				status: 'error',
				message: error instanceof Error ? error.message : 'Failed to get collection stats',
				timestamp: new Date().toISOString()
			},
			{ status: 500 }
		);
	}
};

function formatBytes(bytes: number): string {
	if (bytes === 0) return '0 B';

	const k = 1024;
	const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
	const i = Math.floor(Math.log(bytes) / Math.log(k));

	return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}

function getIndexRatioExplanation(ratio: number): string {
	if (ratio < 0.1) {
		return 'Low index overhead - efficient index usage';
	}
	if (ratio < 0.3) {
		return 'Moderate index overhead - acceptable for most applications';
	}
	if (ratio < 0.5) {
		return 'High index overhead - consider reviewing unused indexes';
	}
	return 'Very high index overhead - may impact write performance significantly';
}

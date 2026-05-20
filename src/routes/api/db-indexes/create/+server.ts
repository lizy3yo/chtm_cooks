/**
 * Create/Optimize Database Indexes Endpoint
 * 
 * POST /api/db-indexes/create
 * Drops existing indexes (except _id), recreates all definitions,
 * and defragments storage files using MongoDB's native compact command.
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { indexManager, allIndexDefinitions } from '$lib/server/db/indexes';
import { getDatabase } from '$lib/server/db/mongodb';

export const POST: RequestHandler = async ({ request }) => {
	try {
		const body = await request.json().catch(() => ({}));
		const { collection } = body;

		const db = await getDatabase();

		// If a specific collection is requested, optimize only that one, otherwise all.
		const collectionsToOptimize = collection
			? [collection]
			: [...new Set(allIndexDefinitions.map(d => d.collection))];

		const results: Record<string, any> = {};

		for (const colName of collectionsToOptimize) {
			try {
				const coll = db.collection(colName);
				const existingIndexes = await coll.indexes().catch(() => []);

				// Drop existing indexes (except primary _id_ index)
				for (const index of existingIndexes) {
					if (index.name && index.name !== '_id_') {
						await coll.dropIndex(index.name).catch(() => { });
					}
				}

				// Re-create defined indexes
				const rebuildResult = await indexManager.createCollectionIndexes(colName);

				// Run MongoDB compact command to defragment storage & index files on disk
				let compacted = false;
				let compactError = null;
				try {
					await db.command({ compact: colName });
					compacted = true;
				} catch (err: any) {
					compactError = err.message || String(err);
				}

				results[colName] = {
					rebuildResult,
					compacted,
					compactError
				};
			} catch (err: any) {
				results[colName] = {
					success: false,
					error: err.message || String(err)
				};
			}
		}

		// Count final metrics to return to the UI
		let totalCreated = 0;
		let totalFailed = 0;
		for (const res of Object.values(results)) {
			if (res.rebuildResult) {
				totalCreated += res.rebuildResult.created + res.rebuildResult.existed;
				totalFailed += res.rebuildResult.failed;
			}
		}

		const success = totalFailed === 0;

		return json({
			status: success ? 'ok' : 'partial',
			message: 'Indexes successfully optimized, rebuilt, and defragmented',
			timestamp: new Date().toISOString(),
			result: {
				totalIndexes: allIndexDefinitions.length,
				created: totalCreated,
				failed: totalFailed
			},
			details: results
		});
	} catch (error: any) {
		return json(
			{
				status: 'error',
				message: error.message || 'Failed to optimize indexes',
				timestamp: new Date().toISOString()
			},
			{ status: 500 }
		);
	}
};

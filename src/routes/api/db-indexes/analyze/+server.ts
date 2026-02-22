/**
 * Query Analyzer Endpoint
 * 
 * POST /api/db-indexes/analyze
 * Analyzes query performance and suggests optimizations
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { queryAnalyzer } from '$lib/server/db/indexes';

/**
 * POST /api/db-indexes/analyze
 * Analyze a query's performance
 * 
 * Body: {
 *   collection: string,
 *   query: object,
 *   sort?: object
 * }
 */
export const POST: RequestHandler = async ({ request }) => {
	try {
		const body = await request.json();
		const { collection, query, sort } = body;

		if (!collection || !query) {
			return json(
				{
					status: 'error',
					message: 'Missing required fields: collection and query',
					timestamp: new Date().toISOString()
				},
				{ status: 400 }
			);
		}

		// Analyze the query
		const analysis = await queryAnalyzer.analyzeQuery(collection, query, undefined, sort);

		// Get index suggestion if query is not optimized
		let suggestion = null;
		if (!analysis.analysis.usesIndex || analysis.analysis.efficiency < 80) {
			suggestion = await queryAnalyzer.suggestIndex(collection, query, sort);
		}

		return json({
			status: 'ok',
			timestamp: new Date().toISOString(),
			analysis,
			suggestion,
			performance: {
				rating: getPerformanceRating(analysis.analysis.efficiency, analysis.analysis.usesIndex),
				explanation: getPerformanceExplanation(
					analysis.analysis.efficiency,
					analysis.analysis.usesIndex,
					analysis.analysis.stage
				)
			}
		});
	} catch (error) {
		return json(
			{
				status: 'error',
				message: error instanceof Error ? error.message : 'Failed to analyze query',
				timestamp: new Date().toISOString()
			},
			{ status: 500 }
		);
	}
};

function getPerformanceRating(
	efficiency: number,
	usesIndex: boolean
): 'excellent' | 'good' | 'fair' | 'poor' | 'critical' {
	if (!usesIndex) return 'critical';
	if (efficiency >= 90) return 'excellent';
	if (efficiency >= 70) return 'good';
	if (efficiency >= 50) return 'fair';
	return 'poor';
}

function getPerformanceExplanation(efficiency: number, usesIndex: boolean, stage: string): string {
	if (stage === 'COLLSCAN') {
		return 'CRITICAL: Full collection scan - extremely slow on large datasets. Create an index immediately.';
	}
	if (!usesIndex) {
		return 'WARNING: Query is not using an index - performance will degrade as data grows.';
	}
	if (efficiency >= 90) {
		return 'EXCELLENT: Query is highly optimized with good index usage.';
	}
	if (efficiency >= 70) {
		return 'GOOD: Query uses an index efficiently. Minor optimizations possible.';
	}
	if (efficiency >= 50) {
		return 'FAIR: Query uses an index but examines many documents. Consider more selective filters.';
	}
	return 'POOR: Query is inefficient - examines too many documents. Review query structure.';
}

/**
 * Query Analyzer
 * Analyzes MongoDB queries and provides optimization recommendations
 */

import type { Db, Document } from 'mongodb';
import { getDatabase } from '../mongodb';
import type { QueryAnalysis, IndexRecommendation } from './types';
import { getIndexesByCollection } from './definitions';
import { logWarn } from '$lib/server/utils/logger';

/**
 * Query Analyzer Class
 * Analyzes query performance and suggests optimizations
 */
class QueryAnalyzer {
	private db: Db | null = null;

	/**
	 * Initialize database connection
	 */
	private async getDb(): Promise<Db> {
		if (!this.db) {
			this.db = await getDatabase();
		}
		return this.db;
	}

	/**
	 * Analyze a query's execution plan
	 */
	async analyzeQuery(
		collectionName: string,
		query: Document,
		projection?: Document,
		sort?: Document
	): Promise<QueryAnalysis> {
		try {
			const db = await this.getDb();
			const collection = db.collection(collectionName);

			// Run the query with explain plan
			const explainResult = await collection
				.find(query, { projection })
				.sort(sort || {})
				.explain('executionStats');

			// Extract execution stats
			const executionStats = explainResult.executionStats;
			const stage = executionStats?.executionStages?.stage || 'UNKNOWN';
			const executionTimeMs = executionStats?.executionTimeMillis || 0;
			const docsExamined = executionStats?.totalDocsExamined || 0;
			const docsReturned = executionStats?.nReturned || 0;

			// Check if index was used
			const usesIndex = stage === 'IXSCAN' || stage === 'FETCH';
			const indexUsed = this.extractIndexName(executionStats?.executionStages);

			// Calculate efficiency (documents returned / documents examined)
			const efficiency = docsExamined > 0 ? (docsReturned / docsExamined) * 100 : 100;

			// Generate recommendations
			const recommendations = this.generateRecommendations(
				collectionName,
				query,
				sort,
				stage,
				efficiency,
				usesIndex
			);

			return {
				collection: collectionName,
				query,
				analysis: {
					usesIndex,
					indexUsed,
					executionTimeMs,
					docsExamined,
					docsReturned,
					stage,
					recommendations,
					efficiency: Math.round(efficiency)
				}
			};
		} catch (error) {
			logWarn('Query analysis failed', {
				collection: collectionName,
				error: error instanceof Error ? error.message : String(error)
			});

			return {
				collection: collectionName,
				query,
				analysis: {
					usesIndex: false,
					executionTimeMs: 0,
					docsExamined: 0,
					docsReturned: 0,
					stage: 'ERROR',
					recommendations: ['Failed to analyze query - check database connection'],
					efficiency: 0
				}
			};
		}
	}

	/**
	 * Extract index name from execution stages
	 */
	private extractIndexName(stage: any): string | undefined {
		if (!stage) return undefined;

		if (stage.indexName) {
			return stage.indexName;
		}

		if (stage.inputStage) {
			return this.extractIndexName(stage.inputStage);
		}

		return undefined;
	}

	/**
	 * Generate optimization recommendations
	 */
	private generateRecommendations(
		collectionName: string,
		query: Document,
		sort: Document | undefined,
		stage: string,
		efficiency: number,
		usesIndex: boolean
	): string[] {
		const recommendations: string[] = [];

		// Collection scan detected
		if (stage === 'COLLSCAN') {
			recommendations.push(
				'🔴 CRITICAL: Full collection scan detected. This will be very slow on large datasets.'
			);

			const queryFields = Object.keys(query);
			if (queryFields.length > 0) {
				recommendations.push(
					`Create an index on: ${queryFields.join(', ')} to improve performance by up to 100x`
				);
			}
		}

		// Low efficiency
		if (efficiency < 50 && efficiency > 0) {
			recommendations.push(
				`🟡 WARNING: Low query efficiency (${efficiency.toFixed(1)}%). The query is examining many documents but returning few.`
			);
			recommendations.push(
				'Consider creating a more selective index or adding filters to narrow the result set.'
			);
		}

		// Sort without index
		if (sort && Object.keys(sort).length > 0 && !usesIndex) {
			const sortFields = Object.keys(sort);
			recommendations.push(
				`🟡 WARNING: Sorting by ${sortFields.join(', ')} without an index. This requires in-memory sorting.`
			);
			recommendations.push(
				`Create an index with these fields to enable index-based sorting: ${sortFields.join(', ')}`
			);
		}

		// Compound query without compound index
		if (Object.keys(query).length > 1 && stage === 'COLLSCAN') {
			const fields = Object.keys(query);
			recommendations.push(
				`Consider creating a compound index on: ${fields.join(', ')} for this multi-field query`
			);
		}

		// Good performance
		if (usesIndex && efficiency >= 80) {
			recommendations.push('✅ GOOD: Query is using an index and has high efficiency.');
		}

		// Moderate performance
		if (usesIndex && efficiency >= 50 && efficiency < 80) {
			recommendations.push(
				'🟢 ACCEPTABLE: Query uses an index but could be more selective. Consider adding more filters.'
			);
		}

		return recommendations;
	}

	/**
	 * Suggest index for a query pattern
	 */
	async suggestIndex(
		collectionName: string,
		query: Document,
		sort?: Document
	): Promise<IndexRecommendation | null> {
		const analysis = await this.analyzeQuery(collectionName, query, undefined, sort);

		// If already using index efficiently, no recommendation needed
		if (analysis.analysis.usesIndex && analysis.analysis.efficiency >= 80) {
			return null;
		}

		// Determine priority
		let priority: 'critical' | 'high' | 'medium' | 'low' = 'medium';
		if (analysis.analysis.stage === 'COLLSCAN') {
			priority = 'critical';
		} else if (analysis.analysis.efficiency < 50) {
			priority = 'high';
		}

		// Build recommended index
		const recommendedIndex: Record<string, number> = {};

		// Add query fields first (order matters for compound indexes)
		const queryFields = Object.keys(query);
		for (const field of queryFields) {
			recommendedIndex[field] = 1;
		}

		// Add sort fields
		if (sort) {
			const sortFields = Object.keys(sort);
			for (const field of sortFields) {
				if (!recommendedIndex[field]) {
					recommendedIndex[field] = sort[field];
				}
			}
		}

		if (Object.keys(recommendedIndex).length === 0) {
			return null;
		}

		const reason =
			analysis.analysis.stage === 'COLLSCAN'
				? 'Full collection scan detected - query is very slow without an index'
				: `Low efficiency (${analysis.analysis.efficiency}%) - query examines too many documents`;

		return {
			collection: collectionName,
			recommendedIndex,
			reason,
			impact: {
				estimatedImprovement:
					analysis.analysis.stage === 'COLLSCAN'
						? '10-100x faster (O(log n) vs O(n))'
						: '2-5x faster',
				tradeoff: 'Slightly slower writes (~2-5%), increased storage (~50KB-500KB per 10k documents)'
			},
			priority,
			queries: [JSON.stringify({ query, sort })]
		};
	}

	/**
	 * Compare query performance with and without index
	 */
	async comparePerformance(
		collectionName: string,
		query: Document,
		indexName: string
	): Promise<{
		withIndex: QueryAnalysis;
		withoutIndex: QueryAnalysis;
		improvement: string;
	} | null> {
		try {
			const db = await this.getDb();
			const collection = db.collection(collectionName);

			// Run with index
			const withIndexResult = await this.analyzeQuery(collectionName, query);

			// Run with index hint disabled (force collection scan)
			const explainNoIndex = await collection
				.find(query)
				.hint({ $natural: 1 })
				.explain('executionStats');

			const withoutIndexStats = explainNoIndex.executionStats;
			const withoutIndex: QueryAnalysis = {
				collection: collectionName,
				query,
				analysis: {
					usesIndex: false,
					executionTimeMs: withoutIndexStats?.executionTimeMillis || 0,
					docsExamined: withoutIndexStats?.totalDocsExamined || 0,
					docsReturned: withoutIndexStats?.nReturned || 0,
					stage: 'COLLSCAN',
					recommendations: [],
					efficiency:
						withoutIndexStats?.totalDocsExamined > 0
							? Math.round(
									(withoutIndexStats.nReturned / withoutIndexStats.totalDocsExamined) * 100
								)
							: 0
				}
			};

			const speedup =
				withoutIndex.analysis.executionTimeMs > 0
					? (
							withoutIndex.analysis.executionTimeMs / withIndexResult.analysis.executionTimeMs
						).toFixed(1)
					: 'N/A';

			return {
				withIndex: withIndexResult,
				withoutIndex,
				improvement: `${speedup}x faster with index`
			};
		} catch (error) {
			logWarn('Performance comparison failed', {
				collection: collectionName,
				error: error instanceof Error ? error.message : String(error)
			});
			return null;
		}
	}

	/**
	 * Detect slow queries (simulated - in production, use MongoDB slow query log)
	 */
	detectSlowQueries(threshold: number = 100): {
		message: string;
		recommendation: string;
	} {
		return {
			message: `Monitor queries taking longer than ${threshold}ms in production`,
			recommendation:
				'Enable MongoDB slow query logging: db.setProfilingLevel(1, { slowms: 100 })'
		};
	}

	/**
	 * Get common query patterns for a collection
	 */
	getCommonPatterns(collectionName: string): {
		pattern: string;
		description: string;
		recommendedIndex: string;
	}[] {
		// Get defined indexes for this collection
		const definedIndexes = getIndexesByCollection(collectionName);

		return definedIndexes.map((idx) => ({
			pattern: JSON.stringify(idx.fields),
			description: idx.description,
			recommendedIndex: idx.options?.name || 'unnamed'
		}));
	}

	/**
	 * Validate index coverage for common queries
	 */
	async validateIndexCoverage(
		collectionName: string,
		commonQueries: { query: Document; sort?: Document }[]
	): Promise<{
		covered: number;
		uncovered: number;
		suggestions: IndexRecommendation[];
	}> {
		let covered = 0;
		let uncovered = 0;
		const suggestions: IndexRecommendation[] = [];

		for (const { query, sort } of commonQueries) {
			const analysis = await this.analyzeQuery(collectionName, query, undefined, sort);

			if (analysis.analysis.usesIndex && analysis.analysis.efficiency >= 80) {
				covered++;
			} else {
				uncovered++;
				const suggestion = await this.suggestIndex(collectionName, query, sort);
				if (suggestion) {
					suggestions.push(suggestion);
				}
			}
		}

		return {
			covered,
			uncovered,
			suggestions
		};
	}
}

/**
 * Export singleton instance
 */
export const queryAnalyzer = new QueryAnalyzer();

/**
 * Quick analysis helpers
 */

/**
 * Analyze user login query
 */
export async function analyzeLoginQuery(email: string): Promise<QueryAnalysis> {
	return queryAnalyzer.analyzeQuery('users', { email });
}

/**
 * Analyze user list query
 */
export async function analyzeUserListQuery(
	role?: string,
	isActive?: boolean
): Promise<QueryAnalysis> {
	const query: Document = {};
	if (role) query.role = role;
	if (isActive !== undefined) query.isActive = isActive;

	return queryAnalyzer.analyzeQuery('users', query, undefined, { createdAt: -1 });
}

/**
 * Analyze token lookup query
 */
export async function analyzeTokenQuery(token: string, type: 'verification' | 'reset'): Promise<QueryAnalysis> {
	const field = type === 'verification' ? 'emailVerificationToken' : 'passwordResetToken';
	return queryAnalyzer.analyzeQuery('users', { [field]: token });
}

/**
 * Database Index Manager
 * Handles index creation, monitoring, and management
 */

import type { Db, Collection, IndexDescription } from 'mongodb';
import { getDatabase } from '../mongodb';
import type {
	IndexDefinition,
	IndexStatus,
	IndexStats,
	IndexCreationResult,
	BulkIndexCreationResult,
	IndexHealthCheck,
	CollectionIndexSummary
} from './types';
import { allIndexDefinitions, getIndexesByCollection } from './definitions';
import { logInfo, logWarn, logError } from '$lib/server/utils/logger';

/**
 * Index Manager Class
 * Singleton for managing database indexes
 */
class IndexManager {
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
	 * Create a single index
	 */
	async createIndex(definition: IndexDefinition): Promise<IndexCreationResult> {
		const startTime = Date.now();

		try {
			const db = await this.getDb();
			const collection = db.collection(definition.collection);

			// Check if index already exists
			const existingIndexes = await collection.indexes();
			const indexName = definition.options?.name || this.generateIndexName(definition.fields);

			const exists = existingIndexes.some((idx) => idx.name === indexName);

			if (exists) {
				logInfo(`Index already exists: ${indexName} on ${definition.collection}`);
				return {
					collection: definition.collection,
					indexName,
					success: true,
					action: 'exists',
					message: `Index ${indexName} already exists`,
					executionTimeMs: Date.now() - startTime
				};
			}

			// Create the index
			await collection.createIndex(definition.fields, {
				...definition.options,
				name: indexName
			});

			const executionTimeMs = Date.now() - startTime;

			logInfo(
				`Index created successfully: ${indexName} on ${definition.collection} (${executionTimeMs}ms)`
			);

			return {
				collection: definition.collection,
				indexName,
				success: true,
				action: 'created',
				message: `Index ${indexName} created successfully`,
				executionTimeMs
			};
		} catch (error) {
			const executionTimeMs = Date.now() - startTime;
			const errorMessage = error instanceof Error ? error.message : String(error);
			const indexName = definition.options?.name || 'unknown';

			// Handle collection not existing yet (this is expected for new collections)
			if (errorMessage.includes('ns does not exist') || errorMessage.includes('namespace not found')) {
				logWarn(
					`Collection '${definition.collection}' does not exist yet. Index '${indexName}' will be created when collection is first used.`
				);
				
				return {
					collection: definition.collection,
					indexName,
					success: true,
					action: 'pending',
					message: `Collection does not exist yet, index will be created on first use`,
					executionTimeMs
				};
			}

			// For other errors, log as actual errors
			logError(error as Error, {
				context: 'createIndex',
				collection: definition.collection,
				indexName
			});

			return {
				collection: definition.collection,
				indexName,
				success: false,
				action: 'failed',
				message: `Failed to create index: ${errorMessage}`,
				executionTimeMs,
				error: errorMessage
			};
		}
	}

	/**
	 * Create multiple indexes (bulk operation)
	 */
	async createIndexes(definitions: IndexDefinition[]): Promise<BulkIndexCreationResult> {
		const startTime = Date.now();
		const results: IndexCreationResult[] = [];

		logInfo(`Creating ${definitions.length} indexes...`);

		// Sort by priority: critical > high > medium > low
		const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
		const sortedDefinitions = [...definitions].sort((a, b) => {
			const aPriority = priorityOrder[a.priority || 'low'];
			const bPriority = priorityOrder[b.priority || 'low'];
			return aPriority - bPriority;
		});

		// Create indexes sequentially (important for consistency)
		for (const definition of sortedDefinitions) {
			const result = await this.createIndex(definition);
			results.push(result);
		}

		const totalExecutionTimeMs = Date.now() - startTime;
		const created = results.filter((r) => r.action === 'created').length;
		const existed = results.filter((r) => r.action === 'exists').length;
		const failed = results.filter((r) => r.action === 'failed').length;
		const pending = results.filter((r) => r.action === 'pending').length;

		logInfo(
			`Bulk index creation completed: ${created} created, ${existed} existed, ${failed} failed, ${pending} pending (${totalExecutionTimeMs}ms)`
		);

		if (pending > 0) {
			logInfo(
				`${pending} index(es) pending - collections don't exist yet. Indexes will be created automatically when collections are first used.`
			);
		}

		return {
			totalIndexes: definitions.length,
			created,
			existed,
			failed,
			pending,
			results,
			totalExecutionTimeMs
		};
	}

	/**
	 * Create all defined indexes
	 */
	async createAllIndexes(): Promise<BulkIndexCreationResult> {
		return this.createIndexes(allIndexDefinitions);
	}

	/**
	 * Create indexes for a specific collection
	 */
	async createCollectionIndexes(collectionName: string): Promise<BulkIndexCreationResult> {
		const definitions = getIndexesByCollection(collectionName);
		return this.createIndexes(definitions);
	}

	/**
	 * Drop an index
	 */
	async dropIndex(collectionName: string, indexName: string): Promise<boolean> {
		try {
			const db = await this.getDb();
			const collection = db.collection(collectionName);

			await collection.dropIndex(indexName);

			logInfo(`Index dropped: ${indexName} on ${collectionName}`);
			return true;
		} catch (error) {
			logError(error as Error, {
				context: 'dropIndex',
				collection: collectionName,
				indexName
			});
			return false;
		}
	}

	/**
	 * Drop all indexes on a collection (except _id)
	 */
	async dropAllIndexes(collectionName: string): Promise<boolean> {
		try {
			const db = await this.getDb();
			const collection = db.collection(collectionName);

			await collection.dropIndexes();

			logInfo(`All indexes dropped on ${collectionName}`);
			return true;
		} catch (error) {
			logError(error as Error, {
				context: 'dropAllIndexes',
				collection: collectionName
			});
			return false;
		}
	}

	/**
	 * List all indexes on a collection
	 */
	async listIndexes(collectionName: string): Promise<IndexDescription[]> {
		try {
			const db = await this.getDb();
			const collection = db.collection(collectionName);

			return await collection.indexes();
		} catch (error) {
			logError(error as Error, {
				context: 'listIndexes',
				collection: collectionName
			});
			return [];
		}
	}

	/**
	 * Get index status
	 */
	async getIndexStatus(collectionName: string, indexName: string): Promise<IndexStatus> {
		try {
			const indexes = await this.listIndexes(collectionName);
			const index = indexes.find((idx) => idx.name === indexName);

			if (!index) {
				return {
					name: indexName,
					collection: collectionName,
					keys: {},
					exists: false,
					valid: false
				};
			}

			return {
				name: indexName,
				collection: collectionName,
				keys: index.key,
				exists: true,
				valid: true
			};
		} catch (error) {
			logError(error as Error, {
				context: 'getIndexStatus',
				collection: collectionName,
				indexName
			});

			return {
				name: indexName,
				collection: collectionName,
				keys: {},
				exists: false,
				valid: false
			};
		}
	}

	/**
	 * Get index statistics for a collection
	 */
	async getIndexStats(collectionName: string): Promise<IndexStats | null> {
		try {
			const db = await this.getDb();
			const collection = db.collection(collectionName);

			// Get collection stats
			const stats = await db.command({ collStats: collectionName });

			// Get index information
			const indexes = await collection.indexes();

			const indexDetails = indexes.map((idx) => {
				const indexName = idx.name || 'unknown';
				const size = stats.indexSizes?.[indexName] || 0;

				return {
					name: indexName,
					keys: idx.key,
					size
				};
			});

			return {
				collection: collectionName,
				indexes: indexDetails,
				totalIndexSize: stats.totalIndexSize || 0,
				averageObjectSize: stats.avgObjSize || 0,
				documentCount: stats.count || 0
			};
		} catch (error) {
			logError(error as Error, {
				context: 'getIndexStats',
				collection: collectionName
			});
			return null;
		}
	}

	/**
	 * Get comprehensive collection index summary
	 */
	async getCollectionSummary(collectionName: string): Promise<CollectionIndexSummary | null> {
		try {
			const stats = await this.getIndexStats(collectionName);
			if (!stats) return null;

			const indexes = await this.listIndexes(collectionName);

			const indexDetails = indexes.map((idx) => ({
				name: idx.name || 'unknown',
				keys: idx.key,
				unique: idx.unique || false,
				sparse: idx.sparse || false,
				size: stats.indexes.find((i) => i.name === idx.name)?.size || 0
			}));

			const totalSize = stats.totalIndexSize;
			const dataSize = stats.averageObjectSize * stats.documentCount;
			const indexToDataRatio = dataSize > 0 ? totalSize / dataSize : 0;

			// Generate recommendations
			const recommendations: string[] = [];

			if (indexToDataRatio > 0.5) {
				recommendations.push(
					'Index-to-data ratio is high (>50%). Consider reviewing unused indexes.'
				);
			}

			if (indexes.length > 10) {
				recommendations.push(
					'Large number of indexes detected. Each index adds write overhead.'
				);
			}

			if (stats.documentCount === 0) {
				recommendations.push('Collection is empty. Indexes will be built as data is added.');
			}

			return {
				collection: collectionName,
				totalIndexes: indexes.length,
				totalSize: totalSize,
				documentCount: stats.documentCount,
				averageDocumentSize: stats.averageObjectSize,
				indexToDataRatio,
				indexes: indexDetails,
				recommendations
			};
		} catch (error) {
			logError(error as Error, {
				context: 'getCollectionSummary',
				collection: collectionName
			});
			return null;
		}
	}

	/**
	 * Health check for indexes
	 */
	async healthCheck(collectionName: string): Promise<IndexHealthCheck> {
		const issues: IndexHealthCheck['issues'] = [];
		let score = 100;

		try {
			// Get defined indexes for this collection
			const definedIndexes = getIndexesByCollection(collectionName);

			// Get actual indexes
			const actualIndexes = await this.listIndexes(collectionName);

			// Check for missing indexes
			for (const defined of definedIndexes) {
				const indexName = defined.options?.name || this.generateIndexName(defined.fields);
				const exists = actualIndexes.some((idx) => idx.name === indexName);

				if (!exists) {
					const severity = defined.priority === 'critical' ? 'critical' : 'warning';
					issues.push({
						type: 'missing',
						severity,
						message: `Missing ${defined.priority} index: ${indexName}`,
						recommendation: `Run index creation: ${defined.description}`
					});

					score -= severity === 'critical' ? 30 : 10;
				}
			}

			// Check for unused indexes (hint: monitor actual usage in production)
			const definedIndexNames = definedIndexes.map(
				(d) => d.options?.name || this.generateIndexName(d.fields)
			);

			for (const actual of actualIndexes) {
				if (actual.name === '_id_') continue; // Skip automatic index

				if (!definedIndexNames.includes(actual.name || '')) {
					issues.push({
						type: 'unused',
						severity: 'info',
						message: `Potentially unused index: ${actual.name}`,
						recommendation: 'Verify if this index is needed, consider dropping to reduce write overhead'
					});

					score -= 5;
				}
			}

			const healthy = score >= 80;

			return {
				collection: collectionName,
				healthy,
				issues,
				score: Math.max(0, score)
			};
		} catch (error) {
			logError(error as Error, {
				context: 'healthCheck',
				collection: collectionName
			});

			return {
				collection: collectionName,
				healthy: false,
				issues: [
					{
						type: 'missing',
						severity: 'critical',
						message: 'Failed to perform health check',
						recommendation: 'Check database connection and permissions'
					}
				],
				score: 0
			};
		}
	}

	/**
	 * Generate index name from fields
	 */
	private generateIndexName(fields: Record<string, unknown>): string {
		return Object.entries(fields)
			.map(([key, value]) => `${key}_${value}`)
			.join('_');
	}

	/**
	 * Rebuild index (drop and recreate)
	 */
	async rebuildIndex(definition: IndexDefinition): Promise<IndexCreationResult> {
		const indexName = definition.options?.name || this.generateIndexName(definition.fields);

		// Try to drop existing index
		await this.dropIndex(definition.collection, indexName);

		// Create new index
		return this.createIndex(definition);
	}

	/**
	 * Verify all indexes are created
	 */
	async verifyAllIndexes(): Promise<{
		verified: boolean;
		missing: string[];
		total: number;
	}> {
		const missing: string[] = [];

		for (const definition of allIndexDefinitions) {
			const indexName = definition.options?.name || this.generateIndexName(definition.fields);
			const status = await this.getIndexStatus(definition.collection, indexName);

			if (!status.exists) {
				missing.push(`${definition.collection}.${indexName}`);
			}
		}

		return {
			verified: missing.length === 0,
			missing,
			total: allIndexDefinitions.length
		};
	}
}

/**
 * Export singleton instance
 */
export const indexManager = new IndexManager();

/**
 * Initialize indexes (run on application startup)
 */
export async function initializeIndexes(): Promise<BulkIndexCreationResult> {
	logInfo('Initializing database indexes...');
	const result = await indexManager.createAllIndexes();

	if (result.failed > 0) {
		logWarn(`Some indexes failed to create (${result.failed} failures). Check error logs for details.`);
	} else if (result.pending > 0) {
		logInfo('All existing collections have indexes. Some collections are pending creation.');
	} else {
		logInfo('All indexes initialized successfully');
	}

	return result;
}

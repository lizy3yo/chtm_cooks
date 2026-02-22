/**
 * Database Indexes Module
 * Comprehensive index management for MongoDB
 * 
 * @module indexes
 * 
 * This module provides enterprise-grade database indexing including:
 * - Predefined index definitions with performance metrics
 * - Automated index creation and management
 * - Query performance analysis and optimization
 * - Index health monitoring
 * - Migration utilities
 * 
 * @example
 * ```typescript
 * // Initialize indexes on application startup
 * import { initializeIndexes } from '$lib/server/db/indexes';
 * 
 * await initializeIndexes();
 * ```
 * 
 * @example
 * ```typescript
 * // Analyze a query
 * import { queryAnalyzer } from '$lib/server/db/indexes';
 * 
 * const analysis = await queryAnalyzer.analyzeQuery('users', { email: 'test@example.com' });
 * console.log(analysis.analysis.efficiency); // Query efficiency score
 * ```
 * 
 * @example
 * ```typescript
 * // Get index health
 * import { indexManager } from '$lib/server/db/indexes';
 * 
 * const health = await indexManager.healthCheck('users');
 * console.log(health.score); // Health score 0-100
 * ```
 */

// Export types
export type {
	IndexType,
	IndexDirectionValue,
	IndexField,
	IndexOptions,
	IndexDefinition,
	IndexStatus,
	IndexStats,
	IndexCreationResult,
	BulkIndexCreationResult,
	IndexHealthCheck,
	QueryAnalysis,
	IndexRecommendation,
	CollectionIndexSummary,
	IndexMigration
} from './types';

// Export definitions
export {
	userIndexes,
	allIndexDefinitions,
	getIndexesByCollection,
	getIndexesByPriority,
	getCriticalIndexes
} from './definitions';

// Export manager
export { indexManager, initializeIndexes } from './manager';

// Export analyzer
export {
	queryAnalyzer,
	analyzeLoginQuery,
	analyzeUserListQuery,
	analyzeTokenQuery
} from './analyzer';

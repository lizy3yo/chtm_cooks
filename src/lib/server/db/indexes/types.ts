/**
 * Database Index Types
 * Type definitions for MongoDB index management
 */

import type { IndexDirection, Document } from 'mongodb';

/**
 * Index types supported by MongoDB
 */
export type IndexType =
	| 'single' // Single field index
	| 'compound' // Multiple fields index
	| 'text' // Full-text search index
	| 'geospatial' // Geospatial index (2d, 2dsphere)
	| 'hashed' // Hashed index for sharding
	| 'wildcard' // Wildcard index for dynamic schemas
	| 'ttl'; // Time-to-live index for auto-deletion

/**
 * Index direction
 */
export type IndexDirectionValue = IndexDirection | '2d' | '2dsphere' | 'text' | 'hashed';

/**
 * Index field specification
 */
export interface IndexField {
	[key: string]: IndexDirectionValue;
}

/**
 * Index options (extended from MongoDB)
 */
export interface IndexOptions {
	// Basic options
	name?: string; // Index name
	unique?: boolean; // Unique constraint
	sparse?: boolean; // Only index documents with the field
	background?: boolean; // Build in background (deprecated in 4.2+)
	
	// Partial index (conditional)
	partialFilterExpression?: Document;
	
	// TTL index
	expireAfterSeconds?: number; // Auto-delete documents after N seconds
	
	// Text index options
	weights?: Document; // Field weights for text search
	default_language?: string; // Language for text index
	language_override?: string; // Field name for language override
	
	// Collation
	collation?: {
		locale: string;
		strength?: number;
		caseLevel?: boolean;
		caseFirst?: string;
		numericOrdering?: boolean;
		alternate?: string;
		maxVariable?: string;
		backwards?: boolean;
	};
	
	// Wildcard options
	wildcardProjection?: Document;
	
	// Hidden index (MongoDB 4.4+)
	hidden?: boolean;
}

/**
 * Index definition
 */
export interface IndexDefinition {
	// Collection name
	collection: string;
	
	// Index fields
	fields: IndexField;
	
	// Index options
	options?: IndexOptions;
	
	// Index type (for documentation)
	type: IndexType;
	
	// Description/purpose
	description: string;
	
	// Priority (for creation order)
	priority?: 'critical' | 'high' | 'medium' | 'low';
	
	// When this index is used
	usedFor?: string[];
	
	// Performance impact
	impact?: {
		readImprovement?: string; // e.g., "10x faster for email lookups"
		writeImpact?: string; // e.g., "5% slower writes"
		storageSize?: string; // e.g., "~10MB for 100k users"
	};
}

/**
 * Index status
 */
export interface IndexStatus {
	name: string;
	collection: string;
	keys: Document;
	exists: boolean;
	valid: boolean;
	size?: number; // Size in bytes
	usageCount?: number; // Times used (if available)
	building?: boolean; // Currently building
}

/**
 * Index statistics
 */
export interface IndexStats {
	collection: string;
	indexes: {
		name: string;
		keys: Document;
		size: number; // Bytes
		usageStats?: {
			ops: number;
			since: Date;
		};
	}[];
	totalIndexSize: number;
	averageObjectSize: number;
	documentCount: number;
}

/**
 * Index health check result
 */
export interface IndexHealthCheck {
	collection: string;
	healthy: boolean;
	issues: {
		type: 'missing' | 'unused' | 'duplicate' | 'inefficient';
		severity: 'critical' | 'warning' | 'info';
		message: string;
		recommendation?: string;
	}[];
	score: number; // 0-100
}

/**
 * Query analysis result
 */
export interface QueryAnalysis {
	collection: string;
	query: Document;
	analysis: {
		usesIndex: boolean;
		indexUsed?: string;
		executionTimeMs: number;
		docsExamined: number;
		docsReturned: number;
		stage: string; // COLLSCAN, IXSCAN, etc.
		recommendations: string[];
		efficiency: number; // 0-100
	};
}

/**
 * Index creation result
 */
export interface IndexCreationResult {
	collection: string;
	indexName: string;
	success: boolean;
	action: 'created' | 'exists' | 'failed' | 'pending';
	message: string;
	executionTimeMs?: number;
	error?: string;
}

/**
 * Bulk index creation result
 */
export interface BulkIndexCreationResult {
	totalIndexes: number;
	created: number;
	existed: number;
	failed: number;
	pending: number;
	results: IndexCreationResult[];
	totalExecutionTimeMs: number;
}

/**
 * Index migration
 */
export interface IndexMigration {
	id: string; // Migration ID (e.g., '001_initial_indexes')
	description: string;
	indexes: IndexDefinition[];
	up: () => Promise<void>; // Apply migration
	down: () => Promise<void>; // Rollback migration
	version: number;
	appliedAt?: Date;
}

/**
 * Index recommendation
 */
export interface IndexRecommendation {
	collection: string;
	recommendedIndex: IndexField;
	reason: string;
	impact: {
		estimatedImprovement: string;
		tradeoff: string;
	};
	priority: 'critical' | 'high' | 'medium' | 'low';
	queries: string[]; // Example queries that would benefit
}

/**
 * Collection index summary
 */
export interface CollectionIndexSummary {
	collection: string;
	totalIndexes: number;
	totalSize: number;
	documentCount: number;
	averageDocumentSize: number;
	indexToDataRatio: number; // Index size / Data size
	indexes: {
		name: string;
		keys: Document;
		unique: boolean;
		sparse: boolean;
		size: number;
		usage?: number;
	}[];
	recommendations: string[];
}

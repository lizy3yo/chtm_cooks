/**
 * Query Optimizer Utilities
 * 
 * Provides utilities for optimizing MongoDB aggregation queries
 * and monitoring query performance in analytics endpoints.
 */

import { logger } from './logger';

export interface QueryPerformanceMetrics {
	queryName: string;
	duration: number;
	resultCount: number;
	timestamp: Date;
}

/**
 * Wraps an aggregation pipeline with performance monitoring
 */
export async function monitoredAggregate<T>(
	collection: any,
	pipeline: any[],
	queryName: string,
	options: { allowDiskUse?: boolean } = {}
): Promise<T[]> {
	const startTime = Date.now();
	
	try {
		const results = await collection.aggregate(pipeline, {
			allowDiskUse: options.allowDiskUse ?? true,
			...options
		}).toArray();
		
		const duration = Date.now() - startTime;
		
		// Log slow queries (> 1 second)
		if (duration > 1000) {
			logger.warn('analytics-performance', `Slow query detected: ${queryName}`, {
				duration,
				resultCount: results.length,
				pipeline: JSON.stringify(pipeline)
			});
		}
		
		return results as T[];
	} catch (error) {
		const duration = Date.now() - startTime;
		logger.error('analytics-performance', `Query failed: ${queryName}`, {
			duration,
			error: error instanceof Error ? error.message : String(error)
		});
		throw error;
	}
}

/**
 * Standard aggregation options for analytics queries
 */
export const ANALYTICS_AGGREGATION_OPTIONS = {
	allowDiskUse: true,
	maxTimeMS: 30000, // 30 second timeout
	comment: 'analytics-report-query'
} as const;

/**
 * Adds index hints to aggregation pipeline for better performance
 */
export function withIndexHint(pipeline: any[], indexName: string): any[] {
	return [
		{ $hint: indexName },
		...pipeline
	];
}

/**
 * Batches multiple aggregation queries for parallel execution
 */
export async function parallelAggregations<T extends Record<string, any>>(
	queries: Record<keyof T, { name: string; promise: Promise<any> }>
): Promise<T> {
	const startTime = Date.now();
	
	try {
		const entries = Object.entries(queries);
		const results = await Promise.all(entries.map(([, q]) => q.promise));
		const duration = Date.now() - startTime;
		
		logger.info('analytics-performance', 'Parallel aggregations completed', {
			duration,
			queryCount: entries.length,
			avgDuration: Math.round(duration / entries.length)
		});
		
		return entries.reduce((acc, [key], idx) => {
			acc[key as keyof T] = results[idx];
			return acc;
		}, {} as T);
	} catch (error) {
		const duration = Date.now() - startTime;
		logger.error('analytics-performance', 'Parallel aggregations failed', {
			duration,
			error: error instanceof Error ? error.message : String(error)
		});
		throw error;
	}
}

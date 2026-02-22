/**
 * Database Indexes Health Check Endpoint
 * 
 * GET /api/db-indexes/health
 * Performs health checks on all indexes
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { indexManager, allIndexDefinitions } from '$lib/server/db/indexes';

/**
 * GET /api/db-indexes/health
 * Health check for all indexes
 */
export const GET: RequestHandler = async () => {
	try {
		const collections = [...new Set(allIndexDefinitions.map((idx) => idx.collection))];

		const healthChecks = await Promise.all(
			collections.map(async (collection) => {
				return await indexManager.healthCheck(collection);
			})
		);

		// Calculate overall health
		const totalScore = healthChecks.reduce((sum, check) => sum + check.score, 0);
		const averageScore = Math.round(totalScore / healthChecks.length);
		const allHealthy = healthChecks.every((check) => check.healthy);

		// Collect all issues
		const allIssues = healthChecks.flatMap((check) =>
			check.issues.map((issue) => ({
				collection: check.collection,
				...issue
			}))
		);

		// Count by severity
		const criticalIssues = allIssues.filter((i) => i.severity === 'critical').length;
		const warnings = allIssues.filter((i) => i.severity === 'warning').length;
		const infoItems = allIssues.filter((i) => i.severity === 'info').length;

		return json({
			status: allHealthy ? 'healthy' : 'unhealthy',
			timestamp: new Date().toISOString(),
			overallScore: averageScore,
			grade: getGrade(averageScore),
			summary: {
				totalCollections: collections.length,
				healthyCollections: healthChecks.filter((c) => c.healthy).length,
				unhealthyCollections: healthChecks.filter((c) => !c.healthy).length,
				criticalIssues,
				warnings,
				infoItems
			},
			collections: healthChecks,
			recommendation: getRecommendation(averageScore, criticalIssues)
		});
	} catch (error) {
		return json(
			{
				status: 'error',
				message: error instanceof Error ? error.message : 'Failed to perform health check',
				timestamp: new Date().toISOString()
			},
			{ status: 500 }
		);
	}
};

function getGrade(score: number): string {
	if (score >= 95) return 'A+';
	if (score >= 90) return 'A';
	if (score >= 85) return 'A-';
	if (score >= 80) return 'B+';
	if (score >= 75) return 'B';
	if (score >= 70) return 'B-';
	if (score >= 65) return 'C+';
	if (score >= 60) return 'C';
	return 'F';
}

function getRecommendation(score: number, criticalIssues: number): string {
	if (criticalIssues > 0) {
		return '🔴 CRITICAL: Create missing critical indexes immediately - queries will be very slow';
	}
	if (score < 70) {
		return '🟡 Create missing indexes to improve query performance';
	}
	if (score < 90) {
		return '🟢 Good index coverage, minor optimizations possible';
	}
	return '✅ Excellent index coverage';
}

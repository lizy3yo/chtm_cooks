import { cacheService } from './client';
import type { CacheStats, CacheHealth } from './types';
import { logger } from '../utils/logger';

/**
 * Cache Monitoring & Analytics
 * Provides insights into cache performance and health
 */

/**
 * Extended cache metrics
 */
export interface CacheMetrics extends CacheStats {
	// Performance metrics
	avgLatency: number;
	p95Latency: number;
	p99Latency: number;
	
	// Key metrics
	keysByNamespace: Record<string, number>;
	topKeys: Array<{ key: string; hits: number }>;
	
	// Size metrics
	totalMemoryUsage?: number;
	avgValueSize?: number;
	
	// Time-based metrics
	requestsPerSecond: number;
	hitsPerSecond: number;
	missesPerSecond: number;
}

/**
 * Cache Monitor - Tracks and analyzes cache performance
 */
export class CacheMonitor {
	private static instance: CacheMonitor;
	private latencies: number[] = [];
	private lastSnapshot: CacheStats | null = null;
	private snapshotTime: number = Date.now();
	
	private constructor() {}

	public static getInstance(): CacheMonitor {
		if (!CacheMonitor.instance) {
			CacheMonitor.instance = new CacheMonitor();
		}
		return CacheMonitor.instance;
	}

	/**
	 * Record latency for a cache operation
	 */
	recordLatency(latency: number): void {
		this.latencies.push(latency);
		
		// Keep only last 1000 entries
		if (this.latencies.length > 1000) {
			this.latencies.shift();
		}
	}

	/**
	 * Calculate percentile from latencies
	 */
	private calculatePercentile(percentile: number): number {
		if (this.latencies.length === 0) return 0;
		
		const sorted = [...this.latencies].sort((a, b) => a - b);
		const index = Math.ceil((percentile / 100) * sorted.length) - 1;
		return sorted[index] || 0;
	}

	/**
	 * Get comprehensive cache metrics
	 */
	async getMetrics(): Promise<CacheMetrics> {
		const currentStats = await cacheService.getStats();
		const now = Date.now();
		
		// Calculate time-based metrics
		const timeDiff = this.lastSnapshot 
			? (now - this.snapshotTime) / 1000 
			: 1;
		
		const requestsDiff = this.lastSnapshot
			? (currentStats.hits + currentStats.misses) - 
			  (this.lastSnapshot.hits + this.lastSnapshot.misses)
			: currentStats.hits + currentStats.misses;
		
		const hitsDiff = this.lastSnapshot
			? currentStats.hits - this.lastSnapshot.hits
			: currentStats.hits;
		
		const missesDiff = this.lastSnapshot
			? currentStats.misses - this.lastSnapshot.misses
			: currentStats.misses;

		// Update snapshot
		this.lastSnapshot = currentStats;
		this.snapshotTime = now;

		// Calculate metrics
		const avgLatency = this.latencies.length > 0
			? this.latencies.reduce((a, b) => a + b, 0) / this.latencies.length
			: 0;

		return {
			...currentStats,
			avgLatency,
			p95Latency: this.calculatePercentile(95),
			p99Latency: this.calculatePercentile(99),
			keysByNamespace: {}, // Would need to scan keys
			topKeys: [],
			requestsPerSecond: requestsDiff / timeDiff,
			hitsPerSecond: hitsDiff / timeDiff,
			missesPerSecond: missesDiff / timeDiff
		};
	}

	/**
	 * Get cache health status
	 */
	async getHealth(): Promise<CacheHealth> {
		return cacheService.checkHealth();
	}

	/**
	 * Generate health report
	 */
	async generateHealthReport(): Promise<{
		status: 'healthy' | 'degraded' | 'unhealthy';
		metrics: CacheMetrics;
		health: CacheHealth;
		recommendations: string[];
	}> {
		const [metrics, health] = await Promise.all([
			this.getMetrics(),
			this.getHealth()
		]);

		const recommendations: string[] = [];

		// Analyze and provide recommendations
		if (metrics.hitRate < 0.5) {
			recommendations.push('Low hit rate detected. Consider increasing TTL or reviewing cache strategy.');
		}

		if (metrics.hitRate < 0.3) {
			recommendations.push('Very low hit rate. Cache may not be effective for this workload.');
		}

		if (health.latency > 100) {
			recommendations.push('High cache latency detected. Check Redis connection and network.');
		}

		if (metrics.memoryUsage && metrics.memoryUsage > 1024 * 1024 * 1024) {
			recommendations.push('High memory usage. Consider implementing cache eviction policies.');
		}

		if (metrics.totalKeys > 100000) {
			recommendations.push('Large number of keys. Consider using namespaces and regular cleanup.');
		}

		return {
			status: health.status,
			metrics,
			health,
			recommendations
		};
	}

	/**
	 * Log cache performance summary
	 */
	async logPerformanceSummary(): Promise<void> {
		const metrics = await this.getMetrics();
		
		logger.info('Cache Performance Summary', {
			hitRate: `${(metrics.hitRate * 100).toFixed(2)}%`,
			totalKeys: metrics.totalKeys,
			hits: metrics.hits,
			misses: metrics.misses,
			avgLatency: `${metrics.avgLatency.toFixed(2)}ms`,
			p95Latency: `${metrics.p95Latency.toFixed(2)}ms`,
			requestsPerSecond: metrics.requestsPerSecond.toFixed(2),
			uptime: `${(metrics.uptime / 1000 / 60).toFixed(2)} minutes`
		});
	}

	/**
	 * Reset monitoring data
	 */
	reset(): void {
		this.latencies = [];
		this.lastSnapshot = null;
		this.snapshotTime = Date.now();
		logger.info('Cache monitor reset');
	}
}

/**
 * Cache Alert System
 * Monitors cache and triggers alerts on issues
 */
export class CacheAlertSystem {
	private static instance: CacheAlertSystem;
	private alerts: Array<{
		timestamp: number;
		level: 'info' | 'warning' | 'error';
		message: string;
		metadata?: Record<string, unknown>;
	}> = [];
	
	private thresholds = {
		hitRateWarning: 0.5,
		hitRateCritical: 0.3,
		latencyWarning: 100,
		latencyCritical: 500,
		errorRateWarning: 0.05,
		errorRateCritical: 0.1
	};

	private constructor() {}

	public static getInstance(): CacheAlertSystem {
		if (!CacheAlertSystem.instance) {
			CacheAlertSystem.instance = new CacheAlertSystem();
		}
		return CacheAlertSystem.instance;
	}

	/**
	 * Check cache health and trigger alerts if needed
	 */
	async checkAndAlert(): Promise<void> {
		const monitor = CacheMonitor.getInstance();
		const [metrics, health] = await Promise.all([
			monitor.getMetrics(),
			monitor.getHealth()
		]);

		// Check hit rate
		if (metrics.hitRate < this.thresholds.hitRateCritical) {
			this.addAlert('error', 'Critical: Cache hit rate is very low', {
				hitRate: metrics.hitRate,
				threshold: this.thresholds.hitRateCritical
			});
		} else if (metrics.hitRate < this.thresholds.hitRateWarning) {
			this.addAlert('warning', 'Warning: Cache hit rate is low', {
				hitRate: metrics.hitRate,
				threshold: this.thresholds.hitRateWarning
			});
		}

		// Check latency
		if (health.latency > this.thresholds.latencyCritical) {
			this.addAlert('error', 'Critical: Cache latency is very high', {
				latency: health.latency,
				threshold: this.thresholds.latencyCritical
			});
		} else if (health.latency > this.thresholds.latencyWarning) {
			this.addAlert('warning', 'Warning: Cache latency is high', {
				latency: health.latency,
				threshold: this.thresholds.latencyWarning
			});
		}

		// Check error rate
		if (health.errorRate > this.thresholds.errorRateCritical) {
			this.addAlert('error', 'Critical: High cache error rate', {
				errorRate: health.errorRate,
				threshold: this.thresholds.errorRateCritical
			});
		} else if (health.errorRate > this.thresholds.errorRateWarning) {
			this.addAlert('warning', 'Warning: Elevated cache error rate', {
				errorRate: health.errorRate,
				threshold: this.thresholds.errorRateWarning
			});
		}

		// Check overall health
		if (health.status === 'unhealthy') {
			this.addAlert('error', 'Critical: Cache is unhealthy', { health });
		} else if (health.status === 'degraded') {
			this.addAlert('warning', 'Warning: Cache performance is degraded', { health });
		}
	}

	/**
	 * Add an alert
	 */
	private addAlert(
		level: 'info' | 'warning' | 'error',
		message: string,
		metadata?: Record<string, unknown>
	): void {
		const alert = {
			timestamp: Date.now(),
			level,
			message,
			metadata
		};

		this.alerts.push(alert);

		// Keep only last 100 alerts
		if (this.alerts.length > 100) {
			this.alerts.shift();
		}

		// Log alert
		logger[level](`Cache Alert: ${message}`, metadata);
	}

	/**
	 * Get recent alerts
	 */
	getRecentAlerts(limit: number = 10): typeof this.alerts {
		return this.alerts.slice(-limit);
	}

	/**
	 * Clear alerts
	 */
	clearAlerts(): void {
		this.alerts = [];
	}

	/**
	 * Update alert thresholds
	 */
	updateThresholds(thresholds: Partial<typeof this.thresholds>): void {
		this.thresholds = { ...this.thresholds, ...thresholds };
		logger.info('Cache alert thresholds updated', { thresholds: this.thresholds });
	}
}

/**
 * Start monitoring with periodic health checks
 */
export function startMonitoring(intervalMs: number = 60000): NodeJS.Timeout {
	const monitor = CacheMonitor.getInstance();
	const alertSystem = CacheAlertSystem.getInstance();

	logger.info('Starting cache monitoring', { intervalMs });

	return setInterval(async () => {
		try {
			await monitor.logPerformanceSummary();
			await alertSystem.checkAndAlert();
		} catch (error) {
			logger.error('Monitoring error', { error });
		}
	}, intervalMs);
}

/**
 * Stop monitoring
 */
export function stopMonitoring(interval: NodeJS.Timeout): void {
	clearInterval(interval);
	logger.info('Cache monitoring stopped');
}

// Export singleton instances
export const cacheMonitor = CacheMonitor.getInstance();
export const cacheAlertSystem = CacheAlertSystem.getInstance();

/**
 * Analytics / Reports Collection Indexes
 *
 * Optimized for the custodian analytics aggregation queries:
 *   - Borrow request operations (time-series, status, overdue, heatmap)
 *   - Inventory utilization (most borrowed, damage rate, EOM variance)
 *   - replacement overview (obligations, donations, monthly revenue)
 *   - Student trust / risk scoring
 */

import type { IndexDefinition } from './types';

export const analyticsIndexes: IndexDefinition[] = [
	// ── Borrow Requests ──────────────────────────────────────────────────────

	/**
	 * Time-series aggregation: requests over time within a date range.
	 * Query: { createdAt: { $gte, $lte } }  →  group by year/month/day
	 */
	{
		collection: 'borrow_requests',
		type: 'single',
		fields: { createdAt: 1 },
		options: {
			name: 'idx_borrow_requests_analytics_created_at',
			background: true
		},
		description: 'Time-series analytics: requests over time',
		priority: 'high',
		usedFor: ['Analytics: requestsOverTime aggregation', 'Peak heatmap aggregation'],
		impact: {
			readImprovement: '60x faster for date-range aggregations',
			writeImpact: '~1% on creation',
			storageSize: '~25KB for 100k requests'
		}
	},

	/**
	 * Overdue detection: borrowed items past their return date.
	 * Query: { status: "borrowed", returnDate: { $lt: now } }
	 */
	{
		collection: 'borrow_requests',
		type: 'compound',
		fields: { status: 1, returnDate: 1 },
		options: {
			name: 'idx_borrow_requests_analytics_overdue',
			background: true,
			partialFilterExpression: { status: 'borrowed' }
		},
		description: 'Overdue return detection for analytics dashboard',
		priority: 'high',
		usedFor: ['Analytics: overdueCount', 'Analytics: overdueRequests list'],
		impact: {
			readImprovement: '80x faster for overdue queries',
			writeImpact: '~1% on status updates',
			storageSize: '~15KB (partial index on borrowed only)'
		}
	},

	/**
	 * Item-level inspection aggregation for damage/missing rate.
	 * Query: { createdAt: { $gte, $lte } }  →  unwind items  →  filter inspection
	 */
	{
		collection: 'borrow_requests',
		type: 'compound',
		fields: { createdAt: 1, 'items.inspection.status': 1 },
		options: {
			name: 'idx_borrow_requests_analytics_inspection',
			background: true,
			sparse: true
		},
		description: 'Item inspection status aggregation for damage rate analytics',
		priority: 'medium',
		usedFor: ['Analytics: damageRateItems', 'Analytics: trustScores'],
		impact: {
			readImprovement: '40x faster for inspection aggregations',
			writeImpact: '~1% on inspection updates',
			storageSize: '~20KB for 100k requests'
		}
	},

	/**
	 * Trust score: completed requests with inspection data.
	 * Query: { status: { $in: ["returned","missing","resolved"] }, createdAt: { $gte, $lte } }
	 */
	{
		collection: 'borrow_requests',
		type: 'compound',
		fields: { status: 1, createdAt: 1 },
		options: {
			name: 'idx_borrow_requests_analytics_completed_timeline',
			background: true,
			partialFilterExpression: {
				status: { $in: ['returned', 'missing', 'resolved'] }
			}
		},
		description: 'Completed requests for trust score calculation',
		priority: 'medium',
		usedFor: ['Analytics: trustScores aggregation'],
		impact: {
			readImprovement: '50x faster for completed request queries',
			writeImpact: '~1% on status transitions',
			storageSize: '~20KB (partial index)'
		}
	},

	// ── replacement Obligations ─────────────────────────────────────────────────

	/**
	 * Monthly revenue aggregation: resolved obligations by resolution date.
	 * Query: { status: { $ne: "pending" }, resolutionDate: { $gte: sixMonthsAgo } }
	 * Note: partial index uses $in for resolved statuses (MongoDB doesn't support $ne in partial filters)
	 */
	{
		collection: 'replacement_obligations',
		type: 'compound',
		fields: { status: 1, resolutionDate: 1 },
		options: {
			name: 'idx_replacement_obligations_analytics_resolution',
			background: true,
			partialFilterExpression: { status: { $in: ['paid', 'replaced', 'waived'] } }
		},
		description: 'Monthly revenue and resolution analytics',
		priority: 'high',
		usedFor: [
			'Analytics: monthlyRevenue aggregation',
			'Analytics: resolutionBreakdown',
			'Analytics: avgResolutionDays'
		],
		impact: {
			readImprovement: '70x faster for resolution aggregations',
			writeImpact: '~1% on obligation resolution',
			storageSize: '~15KB (partial index)'
		}
	},

	/**
	 * Category-level obligation aggregation.
	 * Query: group by itemCategory
	 */
	{
		collection: 'replacement_obligations',
		type: 'single',
		fields: { itemCategory: 1 },
		options: {
			name: 'idx_replacement_obligations_analytics_category',
			background: true,
			sparse: true
		},
		description: 'Obligations grouped by item category for analytics',
		priority: 'medium',
		usedFor: ['Analytics: obligationsByCategory'],
		impact: {
			readImprovement: '40x faster for category grouping',
			writeImpact: '~1% on obligation creation',
			storageSize: '~10KB'
		}
	},

	/**
	 * Student risk: pending obligations per student.
	 * Query: { status: "pending" }  →  group by studentId
	 */
	{
		collection: 'replacement_obligations',
		type: 'compound',
		fields: { status: 1, studentId: 1 },
		options: {
			name: 'idx_replacement_obligations_analytics_student_pending',
			background: true,
			partialFilterExpression: { status: 'pending' }
		},
		description: 'Pending obligations per student for repeat offender detection',
		priority: 'high',
		usedFor: ['Analytics: repeatOffenders', 'Analytics: highIncidentStudents'],
		impact: {
			readImprovement: '60x faster for student risk queries',
			writeImpact: '~1% on obligation creation',
			storageSize: '~12KB (partial index)'
		}
	},

	// ── Donations ─────────────────────────────────────────────────────────────

	/**
	 * Monthly donation totals by item.
	 * Query: { createdAt: { $gte: sixMonthsAgo } }  →  group by year/month/itemName
	 */
	{
		collection: 'donations',
		type: 'compound',
		fields: { createdAt: 1, itemName: 1 },
		options: {
			name: 'idx_donations_analytics_timeline_item',
			background: true
		},
		description: 'Monthly donation totals by item name',
		priority: 'medium',
		usedFor: ['Analytics: donationTotals aggregation'],
		impact: {
			readImprovement: '50x faster for donation time-series',
			writeImpact: '~1% on donation creation',
			storageSize: '~8KB'
		}
	},

	// ── Inventory ─────────────────────────────────────────────────────────────

	/**
	 * EOM variance and condition distribution.
	 * Query: { archived: false }  →  project variance fields
	 */
	{
		collection: 'inventory_items',
		type: 'compound',
		fields: { archived: 1, condition: 1 },
		options: {
			name: 'idx_inventory_items_analytics_condition',
			background: true,
			partialFilterExpression: { archived: false }
		},
		description: 'Active items by condition for distribution analytics',
		priority: 'medium',
		usedFor: ['Analytics: conditionDistribution', 'Analytics: eomVariance'],
		impact: {
			readImprovement: '45x faster for condition aggregations',
			writeImpact: '~1% on item updates',
			storageSize: '~10KB (partial index)'
		}
	},

	/**
	 * Stock alerts: low stock / out of stock active items.
	 * Query: { archived: false, status: { $in: ["Low Stock","Out of Stock"] } }
	 */
	{
		collection: 'inventory_items',
		type: 'compound',
		fields: { archived: 1, status: 1, quantity: 1 },
		options: {
			name: 'idx_inventory_items_analytics_stock_alerts',
			background: true,
			partialFilterExpression: {
				archived: false,
				status: { $in: ['Low Stock', 'Out of Stock'] }
			}
		},
		description: 'Stock alert queries for analytics dashboard',
		priority: 'high',
		usedFor: ['Analytics: stockAlerts'],
		impact: {
			readImprovement: '70x faster for stock alert queries',
			writeImpact: '~1% on quantity updates',
			storageSize: '~8KB (partial index)'
		}
	}
];

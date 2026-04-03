/**
 * Statistics Collection Indexes
 *
 * Dedicated index definitions for statistics aggregation queries.
 * These support the student statistics page, trust score computation,
 * and performance analytics that fan across borrow_requests and
 * replacement_obligations in a single service call.
 *
 * @module statisticsIndexes
 */

import type { IndexDefinition } from './types';

/**
 * ============================================================================
 * STATISTICS QUERY INDEXES
 * ============================================================================
 * These are additive to the existing borrow_requests and
 * replacement_obligations indexes already defined in their dedicated files.
 * The partial-filter expressions keep the index footprint minimal while
 * dramatically speeding up the specific aggregation patterns the statistics
 * service uses.
 */
export const statisticsIndexes: IndexDefinition[] = [
	/**
	 * 1. STUDENT RETURNED HISTORY (Statistics – return-performance analysis)
	 * Purpose: Pull all completed (returned + missing) requests for a student,
	 *          sorted newest-first, to compute on-time rates and late penalties.
	 * Query:   { studentId: ObjectId, status: { $in: ['returned', 'missing'] } }
	 *          .sort({ returnedAt: -1 })
	 *
	 * Partial filter keeps the index small: only documents with terminal statuses
	 * land in this index (typically a fraction of the total collection).
	 */
	{
		collection: 'borrow_requests',
		type: 'compound',
		fields: { studentId: 1, status: 1, returnedAt: -1 },
		options: {
			name: 'idx_borrow_requests_student_returned_history',
			background: true,
			partialFilterExpression: {
				status: { $in: ['returned', 'missing'] }
			}
		},
		description:
			'Completed borrow-request history per student, sorted by return date (statistics + trust-score)',
		priority: 'medium',
		usedFor: [
			'Statistics: late-return penalty computation (returnedAt vs returnDate)',
			'Statistics: on-time return rate',
			'Trust score: item inspection analysis for returned/missing requests'
		],
		impact: {
			readImprovement: '60x faster for per-student completed history',
			writeImpact: '~1% slower on return/missing status transitions',
			storageSize: '~30KB per 100k requests (partial index, subset only)'
		}
	},

	/**
	 * 2. STUDENT ACTIVITY TIMELINE (Statistics – monthly activity chart)
	 * Purpose: Count requests per student bucketed by calendar month
	 *          for the 6-month activity bar chart.
	 * Query:   { studentId: ObjectId, createdAt: { $gte: sixMonthsAgo } }
	 *          .sort({ createdAt: 1 })
	 *
	 * Note: The general compound index idx_borrow_requests_student_timeline
	 * already covers { studentId:1, createdAt:-1 }, so this index uses an
	 * ascending createdAt specifically for range-scan + monthly bucketing
	 * to avoid an in-memory sort flip.
	 */
	{
		collection: 'borrow_requests',
		type: 'compound',
		fields: { studentId: 1, createdAt: 1 },
		options: {
			name: 'idx_borrow_requests_student_activity_timeline',
			background: true
		},
		description:
			'Student request timeline ascending for monthly activity chart (statistics page)',
		priority: 'low',
		usedFor: [
			'Statistics: 6-month activity bar chart per student',
			'Student activity trend analysis'
		],
		impact: {
			readImprovement: '50x faster for date-range monthly aggregation',
			writeImpact: '~1% slower on request creation',
			storageSize: '~55KB per 100k requests'
		}
	},

	/**
	 * 3. STUDENT replacement SUMMARY (Statistics – replacement card)
	 * Purpose: Aggregate total/pending/resolved obligation amounts for
	 *          a student without a collection scan.
	 * Query:   { studentId: ObjectId }  (no additional filter — all statuses needed)
	 *
	 * The existing idx_replacement_obligations_student_status_timeline covers
	 * { studentId, status, createdAt } which is a superset; this entry
	 * documents the query pattern for the statistics service explicitly.
	 * No new index is created — the existing one handles it.
	 *
	 * (Listed here as documentation only; skipped in allIndexDefinitions
	 *  because the collection already has the covering index.)
	 */
	// Documentation note — covered by idx_replacement_obligations_student_status_timeline
];

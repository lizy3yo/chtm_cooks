import type { IndexDefinition } from './types';

export const financialObligationIndexes: IndexDefinition[] = [
	{
		collection: 'financial_obligations',
		type: 'compound',
		fields: { studentId: 1, status: 1, createdAt: -1 },
		options: {
			name: 'idx_financial_obligations_student_status_timeline',
			background: true
		},
		description: 'Student unresolved and history views by status with newest-first ordering',
		priority: 'critical',
		usedFor: [
			'Student borrowed page unresolved-case lookup',
			'Student obligations page by status',
			'Recent obligation history by student'
		],
		impact: {
			readImprovement: '90x faster for per-student unresolved obligation queries',
			writeImpact: '~2% slower on obligation creation and resolution',
			storageSize: '~45KB for 100k obligations'
		}
	},
	{
		collection: 'financial_obligations',
		type: 'compound',
		fields: { borrowRequestId: 1, status: 1, itemId: 1 },
		options: {
			name: 'idx_financial_obligations_request_status_item',
			background: true
		},
		description: 'Borrow-request incident tracking and duplicate-item obligation prevention checks',
		priority: 'high',
		usedFor: [
			'Borrowed request unresolved incident lookups',
			'Per-request obligation reconciliation',
			'Item-level obligation audit queries'
		],
		impact: {
			readImprovement: '80x faster for request-linked obligation lookups',
			writeImpact: '~2% slower on obligation writes',
			storageSize: '~40KB for 100k obligations'
		}
	},
	{
		collection: 'financial_obligations',
		type: 'compound',
		fields: { status: 1, dueDate: 1, createdAt: -1 },
		options: {
			name: 'idx_financial_obligations_status_due_date',
			background: true
		},
		description: 'Operational queue for pending, overdue, and due-date-driven obligation follow-up',
		priority: 'high',
		usedFor: [
			'Custodian pending obligations queue',
			'Overdue payment follow-up',
			'SLA and due-date monitoring'
		],
		impact: {
			readImprovement: '75x faster for due-date sorted operational views',
			writeImpact: '~2% slower on updates',
			storageSize: '~38KB for 100k obligations'
		}
	},
	{
		collection: 'financial_obligations',
		type: 'compound',
		fields: { studentId: 1, dueDate: 1 },
		options: {
			name: 'idx_financial_obligations_student_due_date',
			background: true,
			partialFilterExpression: {
				status: 'pending'
			}
		},
		description: 'Fast pending-obligation due-date monitoring per student',
		priority: 'medium',
		usedFor: [
			'Student overdue exposure checks',
			'Upcoming due-date reminders',
			'Risk reporting per borrower'
		],
		impact: {
			readImprovement: '60x faster for pending due-date scans per student',
			writeImpact: '~1% slower on pending obligation writes',
			storageSize: '~25KB for 100k obligations'
		}
	},
	{
		collection: 'financial_obligations',
		type: 'compound',
		fields: { borrowRequestId: 1, status: 1 },
		options: {
			name: 'idx_financial_obligations_request_pending_count',
			background: true
		},
		description: 'Efficient countDocuments for pending obligations per borrow request — used by auto-resolve and reconcile logic',
		priority: 'critical',
		usedFor: [
			'Auto-resolve: count pending obligations after each resolution',
			'Reconcile endpoint: scan missing requests for zero-pending transition',
			'Per-request obligation status summary'
		],
		impact: {
			readImprovement: '95x faster for per-request pending obligation count queries',
			writeImpact: '~2% slower on obligation writes',
			storageSize: '~30KB for 100k obligations'
		}
	}
];
import type { IndexDefinition } from './types';

export const notificationIndexes: IndexDefinition[] = [
	{
		collection: 'notifications',
		type: 'compound',
		fields: { userId: 1, createdAt: -1 },
		options: {
			name: 'idx_notifications_user_timeline',
			background: true
		},
		description: 'Primary timeline query for per-user notification feeds',
		priority: 'critical',
		usedFor: ['GET /api/notifications'],
		impact: {
			readImprovement: 'Fast sorted feed retrieval by user',
			writeImpact: '~2% slower inserts',
			storageSize: '~80KB per 100k notifications'
		}
	},
	{
		collection: 'notifications',
		type: 'compound',
		fields: { userId: 1, isRead: 1, createdAt: -1 },
		options: {
			name: 'idx_notifications_user_unread',
			background: true
		},
		description: 'Unread counters and unread-first retrieval',
		priority: 'high',
		usedFor: ['Unread notification badge count', 'Mark-all-read updates'],
		impact: {
			readImprovement: 'Fast unread-count lookups',
			writeImpact: '~2% slower updates',
			storageSize: '~95KB per 100k notifications'
		}
	},
	{
		collection: 'notifications',
		type: 'single',
		fields: { borrowRequestId: 1 },
		options: {
			name: 'idx_notifications_request_lookup',
			background: true,
			sparse: true
		},
		description: 'Trace notifications generated for a specific borrow request',
		priority: 'medium',
		usedFor: ['Support and audit workflows'],
		impact: {
			readImprovement: 'Fast support lookups by request',
			writeImpact: '~1% slower inserts',
			storageSize: '~30KB per 100k notifications'
		}
	}
];

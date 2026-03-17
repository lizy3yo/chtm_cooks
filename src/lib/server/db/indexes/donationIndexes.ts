import type { IndexDefinition } from './types';

export const donationIndexes: IndexDefinition[] = [
	{
		collection: 'donations',
		type: 'single',
		fields: { receiptNumber: 1 },
		options: {
			unique: true,
			name: 'idx_donations_receipt_number_unique'
		},
		description: 'Unique receipt number lookup and uniqueness enforcement',
		priority: 'critical',
		usedFor: ['Receipt number uniqueness check on creation', 'Receipt lookup by number'],
		impact: {
			readImprovement: '100x faster for receipt lookups',
			writeImpact: '~2% slower on donation creation',
			storageSize: '~10KB for 10k donations'
		}
	},
	{
		collection: 'donations',
		type: 'single',
		fields: { createdAt: -1 },
		options: {
			name: 'idx_donations_created_at_desc'
		},
		description: 'Default list ordering — newest donations first',
		priority: 'high',
		usedFor: ['Donation list page (default sort)', 'Recent donations widget'],
		impact: {
			readImprovement: '50x faster for sorted list queries',
			writeImpact: '~1% slower on donation creation',
			storageSize: '~8KB for 10k donations'
		}
	},
	{
		collection: 'donations',
		type: 'compound',
		fields: { type: 1, createdAt: -1 },
		options: {
			name: 'idx_donations_type_created_at'
		},
		description: 'Filter donations by type with newest-first ordering',
		priority: 'high',
		usedFor: ['Filter by cash/item type', 'Type-specific reports'],
		impact: {
			readImprovement: '60x faster for type-filtered queries',
			writeImpact: '~2% slower on donation creation',
			storageSize: '~12KB for 10k donations'
		}
	},
	{
		collection: 'donations',
		type: 'single',
		fields: { date: -1 },
		options: {
			name: 'idx_donations_date_desc'
		},
		description: 'Date-based queries and range filters',
		priority: 'medium',
		usedFor: ['Date range filtering', 'Monthly/yearly donation reports'],
		impact: {
			readImprovement: '40x faster for date-range queries',
			writeImpact: '~1% slower on donation creation',
			storageSize: '~8KB for 10k donations'
		}
	}
];

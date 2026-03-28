/**
 * Donation Collection Indexes
 * Item-based donations — no monetary fields.
 */

import type { IndexDefinition } from './types';

export const donationIndexes: IndexDefinition[] = [
	// ── Critical ──────────────────────────────────────────────────────────────

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
		usedFor: ['Receipt number uniqueness on creation', 'Receipt lookup by number'],
		impact: {
			readImprovement: '100x faster for receipt lookups',
			writeImpact: '~2% slower on donation creation',
			storageSize: '~10KB for 10k donations'
		}
	},

	// ── High ──────────────────────────────────────────────────────────────────

	{
		collection: 'donations',
		type: 'single',
		fields: { createdAt: -1 },
		options: { name: 'idx_donations_created_at_desc' },
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
		type: 'single',
		fields: { itemName: 1 },
		options: { name: 'idx_donations_item_name' },
		description: 'Item name lookup and search',
		priority: 'high',
		usedFor: ['Search by item name', 'Item-based filtering', 'Autocomplete'],
		impact: {
			readImprovement: '60x faster for item name queries',
			writeImpact: '~1% slower on donation creation',
			storageSize: '~12KB for 10k donations'
		}
	},

	{
		collection: 'donations',
		type: 'single',
		fields: { donorName: 1 },
		options: { name: 'idx_donations_donor_name' },
		description: 'Donor name lookup and search',
		priority: 'high',
		usedFor: ['Search by donor name', 'Donor history queries'],
		impact: {
			readImprovement: '50x faster for donor queries',
			writeImpact: '~1% slower on donation creation',
			storageSize: '~10KB for 10k donations'
		}
	},

	// ── Medium ────────────────────────────────────────────────────────────────

	{
		collection: 'donations',
		type: 'single',
		fields: { date: -1 },
		options: { name: 'idx_donations_date_desc' },
		description: 'Date-based queries and range filters',
		priority: 'medium',
		usedFor: ['Date range filtering', 'Monthly/yearly donation reports'],
		impact: {
			readImprovement: '40x faster for date-range queries',
			writeImpact: '~1% slower on donation creation',
			storageSize: '~8KB for 10k donations'
		}
	},

	{
		collection: 'donations',
		type: 'text',
		fields: { itemName: 'text', donorName: 'text', purpose: 'text' },
		options: {
			name: 'idx_donations_text_search',
			weights: { itemName: 10, donorName: 5, purpose: 3 },
			default_language: 'english'
		},
		description: 'Full-text search across item name, donor, and purpose',
		priority: 'medium',
		usedFor: ['Search bar on donations tab', 'Multi-field text queries'],
		impact: {
			readImprovement: 'Enables full-text search',
			writeImpact: '~4% slower on creation/update',
			storageSize: '~30KB for 10k donations'
		}
	},

	{
		collection: 'donations',
		type: 'single',
		fields: { createdBy: 1 },
		options: { name: 'idx_donations_created_by' },
		description: 'Lookup donations by the user who recorded them',
		priority: 'medium',
		usedFor: ['Audit trail per custodian', 'User-specific donation history'],
		impact: {
			readImprovement: '40x faster for user-scoped queries',
			writeImpact: '~1% slower on donation creation',
			storageSize: '~8KB for 10k donations'
		}
	}
];

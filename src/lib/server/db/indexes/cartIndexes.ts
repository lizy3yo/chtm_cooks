/**
 * Cart Indexes
 * Optimizes student cart queries for performance
 */

import type { IndexDefinition } from './types';

/**
 * ============================================================================
 * STUDENT CARTS COLLECTION INDEXES
 * ============================================================================
 * Collection: student_carts
 * Average Document Size: ~1-5KB (depends on items count)
 * Expected Growth: 1k-100k carts (one per student)
 * TTL: 90 days of inactivity
 */

export const cartIndexes: IndexDefinition[] = [
	/**
	 * 1. STUDENT ID INDEX (Critical - Primary Lookup)
	 * Used for: Finding cart by student ID
	 * Query Pattern: db.student_carts.findOne({ studentId: ObjectId(...) })
	 */
	{
		collection: 'student_carts',
		type: 'single',
		fields: { studentId: 1 },
		options: {
			unique: true,
			name: 'idx_student_carts_student_id',
			background: true
		},
		description: 'Unique student ID for cart lookup (one cart per student)',
		priority: 'critical',
		usedFor: [
			'Get student cart (most common query)',
			'Update cart items',
			'Cart operations (add/remove/update)'
		],
		impact: {
			readImprovement: '100x faster - O(log n) vs O(n)',
			writeImpact: '~2% slower on cart creation',
			storageSize: '~50KB for 10k carts'
		}
	},

	/**
	 * 2. ITEMS ITEM ID INDEX
	 * Used for: Finding carts containing specific items
	 * Query Pattern: db.student_carts.find({ 'items.itemId': ObjectId(...) })
	 */
	{
		collection: 'student_carts',
		type: 'single',
		fields: { 'items.itemId': 1 },
		options: {
			name: 'idx_student_carts_items_item_id',
			background: true
		},
		description: 'Find carts containing specific inventory items',
		priority: 'medium',
		usedFor: [
			'Item popularity analytics',
			'Inventory item deletion validation',
			'Cart cleanup when items are removed'
		],
		impact: {
			readImprovement: '50x faster for item-based queries',
			writeImpact: '~2% slower on cart updates',
			storageSize: '~30KB for 10k carts'
		}
	},

	/**
	 * 3. UPDATED AT TTL INDEX (Automatic Cleanup)
	 * Used for: Auto-delete inactive carts after 90 days
	 * MongoDB will automatically delete documents
	 */
	{
		collection: 'student_carts',
		type: 'ttl',
		fields: { updatedAt: 1 },
		options: {
			name: 'idx_student_carts_updated_at_ttl',
			background: true,
			expireAfterSeconds: 90 * 24 * 60 * 60 // 90 days in seconds
		},
		description: 'TTL index for automatic cleanup of inactive carts',
		priority: 'medium',
		usedFor: [
			'Auto-delete carts inactive for 90 days',
			'Database maintenance and cleanup',
			'Storage optimization'
		],
		impact: {
			readImprovement: 'N/A (maintenance index)',
			writeImpact: 'Minimal - MongoDB handles cleanup automatically',
			storageSize: 'Reduces database size over time'
		}
	}
];

/**
 * Database Index Definitions
 * Comprehensive index definitions for all collections
 * 
 * IMPORTANT: Keep this file updated as your schema evolves
 * Each index should have a clear purpose and performance justification
 */

import type { IndexDefinition } from './types';

/**
 * ============================================================================
 * USER COLLECTION INDEXES
 * ============================================================================
 * Collection: users
 * Average Document Size: ~500 bytes
 * Expected Growth: 10k-1M users
 */

export const userIndexes: IndexDefinition[] = [
	/**
	 * PRIMARY KEY INDEX (Automatic)
	 * MongoDB automatically creates an index on _id
	 * No need to define explicitly
	 */

	/**
	 * 1. EMAIL INDEX (Critical - Authentication)
	 * Used for: Login, user lookup, uniqueness constraint
	 * Query Pattern: db.users.findOne({ email: "user@example.com" })
	 */
	{
		collection: 'users',
		type: 'single',
		fields: { email: 1 },
		options: {
			unique: true,
			name: 'idx_users_email_unique',
			collation: {
				locale: 'en',
				strength: 2 // Case-insensitive
			}
		},
		description: 'Unique case-insensitive email lookup for authentication',
		priority: 'critical',
		usedFor: [
			'User login (findOne by email)',
			'Registration email uniqueness check',
			'Password reset email lookup',
			'User profile retrieval by email'
		],
		impact: {
			readImprovement: '100x faster - O(log n) vs O(n)',
			writeImpact: '~2-3% slower on user creation',
			storageSize: '~50KB for 10k users, ~5MB for 1M users'
		}
	},

	/**
	 * 2. EMAIL VERIFICATION TOKEN INDEX
	 * Used for: Email verification flow
	 * Query Pattern: db.users.findOne({ emailVerificationToken: "token123" })
	 */
	{
		collection: 'users',
		type: 'single',
		fields: { emailVerificationToken: 1 },
		options: {
			unique: true,
			sparse: true, // Only index documents that have this field
			name: 'idx_users_email_verification_token',
			partialFilterExpression: {
				emailVerificationToken: { $exists: true },
				emailVerified: false
			}
		},
		description: 'Fast lookup for email verification tokens',
		priority: 'high',
		usedFor: ['Email verification endpoint (verify-email)'],
		impact: {
			readImprovement: '50x faster for token lookups',
			writeImpact: 'Minimal (~1% on user creation)',
			storageSize: '~20KB for 10k unverified users'
		}
	},

	/**
	 * 3. PASSWORD RESET TOKEN INDEX
	 * Used for: Password reset flow
	 * Query Pattern: db.users.findOne({ passwordResetToken: "token456" })
	 */
	{
		collection: 'users',
		type: 'single',
		fields: { passwordResetToken: 1 },
		options: {
			unique: true,
			sparse: true,
			name: 'idx_users_password_reset_token',
			partialFilterExpression: {
				passwordResetToken: { $exists: true },
				passwordResetExpires: { $gt: new Date() }
			}
		},
		description: 'Fast lookup for password reset tokens',
		priority: 'high',
		usedFor: ['Password reset endpoint (reset-password)'],
		impact: {
			readImprovement: '50x faster for token lookups',
			writeImpact: 'Minimal (~1% on reset requests)',
			storageSize: '~10KB for active reset tokens'
		}
	},

	/**
	 * 4. ROLE + ACTIVE STATUS INDEX (Compound)
	 * Used for: Filtering users by role and status
	 * Query Pattern: db.users.find({ role: "student", isActive: true })
	 */
	{
		collection: 'users',
		type: 'compound',
		fields: {
			role: 1,
			isActive: 1
		},
		options: {
			name: 'idx_users_role_active'
		},
		description: 'Filter users by role and active status',
		priority: 'high',
		usedFor: [
			'Admin dashboard (list active students)',
			'User management queries',
			'Role-based access control checks'
		],
		impact: {
			readImprovement: '20x faster for role-based queries',
			writeImpact: '~3% slower on user updates',
			storageSize: '~30KB for 10k users'
		}
	},

	/**
	 * 5. CREATED AT INDEX (Sorting)
	 * Used for: Sorting users by registration date
	 * Query Pattern: db.users.find({}).sort({ createdAt: -1 })
	 */
	{
		collection: 'users',
		type: 'single',
		fields: { createdAt: -1 },
		options: {
			name: 'idx_users_created_at_desc'
		},
		description: 'Sort users by registration date (newest first)',
		priority: 'medium',
		usedFor: [
			'Admin dashboard (recent users)',
			'User list with pagination',
			'Analytics queries'
		],
		impact: {
			readImprovement: '10x faster for sorted queries',
			writeImpact: '~2% slower on user creation',
			storageSize: '~40KB for 10k users'
		}
	},

	/**
	 * 6. LAST LOGIN INDEX
	 * Used for: Finding inactive users, analytics
	 * Query Pattern: db.users.find({ lastLogin: { $lt: thirtyDaysAgo } })
	 */
	{
		collection: 'users',
		type: 'single',
		fields: { lastLogin: -1 },
		options: {
			name: 'idx_users_last_login_desc',
			sparse: true // Only index users who have logged in
		},
		description: 'Find inactive users and login analytics',
		priority: 'medium',
		usedFor: [
			'Inactive users report',
			'User engagement analytics',
			'Cleanup tasks for dormant accounts'
		],
		impact: {
			readImprovement: '15x faster for date-range queries',
			writeImpact: '~1% slower on login',
			storageSize: '~35KB for 10k users'
		}
	},

	/**
	 * 7. COMPOUND INDEX: ROLE + YEAR LEVEL + BLOCK (Student-specific)
	 * Used for: Student listings and filtering
	 * Query Pattern: db.users.find({ role: "student", yearLevel: "3", block: "A" })
	 */
	{
		collection: 'users',
		type: 'compound',
		fields: {
			role: 1,
			yearLevel: 1,
			block: 1
		},
		options: {
			name: 'idx_users_student_class',
			partialFilterExpression: {
				role: 'student'
			}
		},
		description: 'Fast lookup for students by year level and block',
		priority: 'high',
		usedFor: [
			'Student class listings',
			'Instructor dashboards (view students)',
			'Class management features'
		],
		impact: {
			readImprovement: '30x faster for class queries',
			writeImpact: '~2% slower on student creation',
			storageSize: '~25KB for 10k students'
		}
	},

	/**
	 * 8. EMAIL VERIFIED + ACTIVE STATUS (Compound)
	 * Used for: Finding verified active users
	 * Query Pattern: db.users.find({ emailVerified: true, isActive: true })
	 */
	{
		collection: 'users',
		type: 'compound',
		fields: {
			emailVerified: 1,
			isActive: 1
		},
		options: {
			name: 'idx_users_verified_active'
		},
		description: 'Filter users by verification and active status',
		priority: 'medium',
		usedFor: [
			'Email campaigns (verified users only)',
			'Active user reports',
			'Security audits'
		],
		impact: {
			readImprovement: '15x faster for status queries',
			writeImpact: '~2% slower on status updates',
			storageSize: '~20KB for 10k users'
		}
	},

	/**
	 * 9. TEXT SEARCH INDEX (Full-text search)
	 * Used for: Searching users by name or email
	 * Query Pattern: db.users.find({ $text: { $search: "John Doe" } })
	 */
	{
		collection: 'users',
		type: 'text',
		fields: {
			email: 'text',
			firstName: 'text',
			lastName: 'text'
		},
		options: {
			name: 'idx_users_text_search',
			weights: {
				email: 10, // Email matches are most important
				firstName: 5,
				lastName: 5
			},
			default_language: 'english'
		},
		description: 'Full-text search across user names and emails',
		priority: 'medium',
		usedFor: [
			'Admin search functionality',
			'User autocomplete',
			'Global user search'
		],
		impact: {
			readImprovement: 'Enables full-text search capabilities',
			writeImpact: '~5% slower on user creation/updates',
			storageSize: '~100KB for 10k users'
		}
	},

	/**
	 * 10. TTL INDEX: Auto-delete unverified users after 30 days
	 * Used for: Automatic cleanup of abandoned registrations
	 * MongoDB will automatically delete documents
	 */
	{
		collection: 'users',
		type: 'ttl',
		fields: { createdAt: 1 },
		options: {
			name: 'idx_users_ttl_unverified',
			expireAfterSeconds: 30 * 24 * 60 * 60, // 30 days in seconds
			partialFilterExpression: {
				emailVerified: false,
				isActive: false
			}
		},
		description: 'Auto-delete unverified inactive users after 30 days',
		priority: 'low',
		usedFor: ['Automatic cleanup of abandoned registrations'],
		impact: {
			readImprovement: 'N/A (cleanup only)',
			writeImpact: 'Minimal background process',
			storageSize: 'Reduces database size over time'
		}
	}
];

/**
 * ============================================================================
 * FUTURE COLLECTION INDEXES
 * ============================================================================
 * Add index definitions for other collections here as your schema grows
 */

/**
 * Example: Session collection indexes
 * Uncomment and customize when you add session management
 */
/*
export const sessionIndexes: IndexDefinition[] = [
	{
		collection: 'sessions',
		type: 'single',
		fields: { token: 1 },
		options: {
			unique: true,
			name: 'idx_sessions_token'
		},
		description: 'Fast lookup for session tokens',
		priority: 'critical',
		usedFor: ['Session validation on each request']
	},
	{
		collection: 'sessions',
		type: 'ttl',
		fields: { expiresAt: 1 },
		options: {
			name: 'idx_sessions_ttl',
			expireAfterSeconds: 0 // Delete at expiration time
		},
		description: 'Auto-delete expired sessions',
		priority: 'high',
		usedFor: ['Automatic session cleanup']
	}
];
*/

/**
 * ALL INDEX DEFINITIONS
 * Export all indexes in one array for easy access
 */
export const allIndexDefinitions: IndexDefinition[] = [
	...userIndexes
	// ...sessionIndexes,
	// ...otherCollectionIndexes,
];

/**
 * Get indexes by collection name
 */
export function getIndexesByCollection(collectionName: string): IndexDefinition[] {
	return allIndexDefinitions.filter((index) => index.collection === collectionName);
}

/**
 * Get indexes by priority
 */
export function getIndexesByPriority(
	priority: 'critical' | 'high' | 'medium' | 'low'
): IndexDefinition[] {
	return allIndexDefinitions.filter((index) => index.priority === priority);
}

/**
 * Get critical indexes (must be created first)
 */
export function getCriticalIndexes(): IndexDefinition[] {
	return getIndexesByPriority('critical');
}

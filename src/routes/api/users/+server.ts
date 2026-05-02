import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDatabase } from '$lib/server/db/mongodb';
import { ObjectId } from 'mongodb';
import type { User, UserRole } from '$lib/server/models/User';
import { UserRole as UserRoleEnum } from '$lib/server/models/User';
import { hashPassword } from '$lib/server/utils/password';
import { validateEmail, sanitizeInput } from '$lib/server/utils/validation';
import { getUserFromToken } from '$lib/server/middleware/auth/verify';
import { rateLimit, RateLimitPresets } from '$lib/server/middleware/rateLimit';
import { logger } from '$lib/server/utils/logger';
import { publishUserChange, USER_CHANNEL } from '$lib/server/realtime/userEvents';

/**
 * Shared auth + rate-limit guard for all superadmin-only handlers.
 *
 * Order matters:
 *  1. Decode the JWT first — we need the userId to key the rate-limit bucket
 *     per-user rather than per-IP (multiple admins behind the same NAT would
 *     otherwise share a single bucket and starve each other).
 *  2. Apply SUPERADMIN_API rate limit keyed by userId.
 *  3. Enforce the superadmin role.
 *
 * Returns the decoded payload on success, or a ready-to-return Response on
 * any failure (401 / 403 / 429).
 */
async function guardSuperadmin(event: Parameters<RequestHandler>[0]) {
	// ── 1. Authentication ────────────────────────────────────────────────────
	const decoded = getUserFromToken(event);
	if (!decoded) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	// ── 2. Rate limit — keyed by userId, not IP ──────────────────────────────
	//    Superadmin pages fire several parallel requests on mount (stats query
	//    fans out to 4 concurrent calls) plus 30-second polling and SSE-driven
	//    refreshes.  60 req/min (the generic API preset) is exhausted in seconds.
	//    SUPERADMIN_API allows 600 req/min and scopes the counter to the
	//    authenticated user so one admin never affects another.
	const rateLimitResult = await rateLimit(event, RateLimitPresets.SUPERADMIN_API, decoded.userId);
	if (rateLimitResult instanceof Response) {
		return rateLimitResult;
	}

	// ── 3. Authorisation ─────────────────────────────────────────────────────
	if (decoded.role !== 'superadmin') {
		logger.warn('Non-superadmin attempted to access /api/users', {
			userId: decoded.userId,
			role: decoded.role,
			ip: event.getClientAddress()
		});
		return json({ error: 'Forbidden: Superadmin access required' }, { status: 403 });
	}

	return decoded;
}

// ─── GET /api/users ──────────────────────────────────────────────────────────

/**
 * GET /api/users
 * Returns a paginated, filterable list of all users.
 * Superadmin only.
 */
export const GET: RequestHandler = async (event) => {
	const { request } = event;

	const guard = await guardSuperadmin(event);
	if (guard instanceof Response) return guard;

	try {
		const db = await getDatabase();
		const usersCollection = db.collection<User>('users');

		const url = new URL(request.url);
		const role = url.searchParams.get('role');
		const search = url.searchParams.get('search');
		const page = parseInt(url.searchParams.get('page') || '1');
		const limit = parseInt(url.searchParams.get('limit') || '50');
		const skip = (page - 1) * limit;

		const filter: Record<string, unknown> = {};
		if (role) filter.role = role;
		if (search) {
			filter.$or = [
				{ email: { $regex: search, $options: 'i' } },
				{ firstName: { $regex: search, $options: 'i' } },
				{ lastName: { $regex: search, $options: 'i' } }
			];
		}

		const [users, total] = await Promise.all([
			usersCollection
				.find(filter, {
					projection: {
						password: 0,
						emailVerificationToken: 0,
						passwordResetToken: 0,
						passwordResetExpires: 0,
						emailVerificationExpires: 0
					}
				})
				.sort({ createdAt: -1 })
				.skip(skip)
				.limit(limit)
				.toArray(),
			usersCollection.countDocuments(filter)
		]);

		const formattedUsers = users.map((user) => ({
			id: user._id?.toString(),
			email: user.email,
			role: user.role,
			firstName: user.firstName,
			lastName: user.lastName,
			profilePhotoUrl: user.profilePhotoUrl ?? null,
			isActive: user.isActive,
			emailVerified: user.emailVerified,
			createdAt: user.createdAt,
			lastLogin: user.lastLogin,
			yearLevel: user.yearLevel,
			block: user.block
		}));

		return json({
			users: formattedUsers,
			pagination: {
				page,
				limit,
				total,
				totalPages: Math.ceil(total / limit)
			}
		});
	} catch (error) {
		logger.error('Error fetching users:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
};

// ─── POST /api/users ─────────────────────────────────────────────────────────

/**
 * POST /api/users
 * Creates a new user account.
 * Superadmin only.
 */
export const POST: RequestHandler = async (event) => {
	const { request } = event;

	const guard = await guardSuperadmin(event);
	if (guard instanceof Response) return guard;
	const decoded = guard;

	try {
		const body = await request.json();
		const { email, password, role, firstName, lastName, yearLevel, block } = body;

		if (!email || !password || !role || !firstName || !lastName) {
			return json({ error: 'All fields are required' }, { status: 400 });
		}

		const sanitizedEmail = sanitizeInput(email.toLowerCase());
		if (!validateEmail(sanitizedEmail)) {
			return json({ error: 'Invalid email format' }, { status: 400 });
		}

		const validRoles: UserRole[] = [UserRoleEnum.STUDENT, UserRoleEnum.CUSTODIAN, UserRoleEnum.INSTRUCTOR, UserRoleEnum.SUPERADMIN];
		if (!validRoles.includes(role)) {
			return json({ error: 'Invalid role' }, { status: 400 });
		}

		if (password.length < 8) {
			return json({ error: 'Password must be at least 8 characters long' }, { status: 400 });
		}

		const db = await getDatabase();
		const usersCollection = db.collection<User>('users');

		const existingUser = await usersCollection.findOne(
			{ email: sanitizedEmail },
			{ collation: { locale: 'en', strength: 2 } }
		);
		if (existingUser) {
			return json({ error: 'Email already registered' }, { status: 409 });
		}

		const hashedPassword = await hashPassword(password);

		const newUser: User = {
			email: sanitizedEmail,
			password: hashedPassword,
			role: role as UserRole,
			firstName: sanitizeInput(firstName),
			lastName: sanitizeInput(lastName),
			isActive: true,
			emailVerified: true,
			createdAt: new Date(),
			updatedAt: new Date(),
			...(role === 'student' && yearLevel ? { yearLevel } : {}),
			...(role === 'student' && block ? { block } : {})
		};

		const result = await usersCollection.insertOne(newUser);

		logger.info('User created by superadmin', {
			newUserId: result.insertedId.toString(),
			newUserEmail: sanitizedEmail,
			newUserRole: role,
			createdBy: decoded.userId,
			ip: event.getClientAddress()
		});

		publishUserChange([USER_CHANNEL], {
			action: 'user_created',
			userId: result.insertedId.toString(),
			occurredAt: new Date().toISOString()
		});

		return json(
			{
				success: true,
				message: 'User created successfully',
				user: {
					id: result.insertedId.toString(),
					email: newUser.email,
					role: newUser.role,
					firstName: newUser.firstName,
					lastName: newUser.lastName,
					isActive: newUser.isActive,
					emailVerified: newUser.emailVerified,
					createdAt: newUser.createdAt
				}
			},
			{ status: 201 }
		);
	} catch (error) {
		logger.error('Error creating user:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
};

// ─── PATCH /api/users?userId=xxx ─────────────────────────────────────────────

/**
 * PATCH /api/users?userId=xxx
 * Updates an existing user's profile or status.
 * Superadmin only.
 */
export const PATCH: RequestHandler = async (event) => {
	const { request, url } = event;

	const guard = await guardSuperadmin(event);
	if (guard instanceof Response) return guard;
	const decoded = guard;

	try {
		const userId = url.searchParams.get('userId');
		if (!userId) {
			return json({ error: 'userId query parameter is required' }, { status: 400 });
		}
		if (!ObjectId.isValid(userId)) {
			return json({ error: 'Invalid userId format' }, { status: 400 });
		}

		const body = await request.json();
		const { firstName, lastName, isActive, role, yearLevel, block } = body;

		const updateFields: Record<string, unknown> = { updatedAt: new Date() };

		if (firstName !== undefined) updateFields.firstName = sanitizeInput(firstName);
		if (lastName !== undefined) updateFields.lastName = sanitizeInput(lastName);
		if (isActive !== undefined) updateFields.isActive = Boolean(isActive);
		if (role !== undefined) {
			const validRoles = [UserRoleEnum.STUDENT, UserRoleEnum.CUSTODIAN, UserRoleEnum.INSTRUCTOR, UserRoleEnum.SUPERADMIN];
			if (!validRoles.includes(role)) {
				return json({ error: 'Invalid role' }, { status: 400 });
			}
			updateFields.role = role;
		}
		if (yearLevel !== undefined) updateFields.yearLevel = yearLevel;
		if (block !== undefined) updateFields.block = block;

		const db = await getDatabase();
		const usersCollection = db.collection<User>('users');

		const result = await usersCollection.findOneAndUpdate(
			{ _id: new ObjectId(userId) },
			{ $set: updateFields },
			{ returnDocument: 'after', projection: { password: 0 } }
		);

		if (!result) {
			return json({ error: 'User not found' }, { status: 404 });
		}

		logger.info('User updated by superadmin', {
			updatedUserId: userId,
			updatedBy: decoded.userId,
			changes: updateFields,
			ip: event.getClientAddress()
		});

		publishUserChange([USER_CHANNEL], {
			action: 'user_updated',
			userId,
			occurredAt: new Date().toISOString()
		});

		return json({
			success: true,
			message: 'User updated successfully',
			user: {
				id: result._id?.toString(),
				email: result.email,
				role: result.role,
				firstName: result.firstName,
				lastName: result.lastName,
				isActive: result.isActive,
				emailVerified: result.emailVerified
			}
		});
	} catch (error) {
		logger.error('Error updating user:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
};

// ─── DELETE /api/users?userId=xxx ────────────────────────────────────────────

/**
 * DELETE /api/users?userId=xxx
 * Permanently deletes a user account.
 * Superadmin only. Cannot delete your own account.
 */
export const DELETE: RequestHandler = async (event) => {
	const { url } = event;

	const guard = await guardSuperadmin(event);
	if (guard instanceof Response) return guard;
	const decoded = guard;

	try {
		const userId = url.searchParams.get('userId');
		if (!userId) {
			return json({ error: 'userId query parameter is required' }, { status: 400 });
		}
		if (!ObjectId.isValid(userId)) {
			return json({ error: 'Invalid userId format' }, { status: 400 });
		}
		if (userId === decoded.userId) {
			return json({ error: 'Cannot delete your own account' }, { status: 400 });
		}

		const db = await getDatabase();
		const usersCollection = db.collection<User>('users');

		const user = await usersCollection.findOne({ _id: new ObjectId(userId) });
		if (!user) {
			return json({ error: 'User not found' }, { status: 404 });
		}

		await usersCollection.deleteOne({ _id: new ObjectId(userId) });

		logger.info('User deleted by superadmin', {
			deletedUserId: userId,
			deletedUserEmail: user.email,
			deletedUserRole: user.role,
			deletedBy: decoded.userId,
			ip: event.getClientAddress()
		});

		publishUserChange([USER_CHANNEL], {
			action: 'user_deleted',
			userId,
			occurredAt: new Date().toISOString()
		});

		return json({ success: true, message: 'User deleted successfully' });
	} catch (error) {
		logger.error('Error deleting user:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
};

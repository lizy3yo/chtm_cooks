import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDatabase } from '$lib/server/db/mongodb';
import { ObjectId } from 'mongodb';
import type { User, UserRole } from '$lib/server/models/User';
import { hashPassword } from '$lib/server/utils/password';
import { validateEmail, sanitizeInput } from '$lib/server/utils/validation';
import { verifyAccessToken } from '$lib/server/utils/jwt';
import { rateLimit, RateLimitPresets } from '$lib/server/middleware/rateLimit';
import { logger } from '$lib/server/utils/logger';

/**
 * GET /api/users
 * Get all users (superadmin only)
 */
export const GET: RequestHandler = async (event) => {
	const { request, getClientAddress } = event;
	
	// Apply rate limiting
	const rateLimitResult = await rateLimit(event, RateLimitPresets.API);
	if (rateLimitResult instanceof Response) {
		return rateLimitResult;
	}

	try {
		// Verify authentication
		const authHeader = request.headers.get('Authorization');
		if (!authHeader || !authHeader.startsWith('Bearer ')) {
			return json({ error: 'Unauthorized' }, { status: 401 });
		}

		const token = authHeader.substring(7);
		const decoded = verifyAccessToken(token);
		
		if (!decoded) {
			return json({ error: 'Invalid or expired token' }, { status: 401 });
		}

		// Verify superadmin role
		if (decoded.role !== 'superadmin') {
			logger.warn('Non-superadmin attempted to access user list', {
				userId: decoded.userId,
				role: decoded.role,
				ip: getClientAddress()
			});
			return json({ error: 'Forbidden: Superadmin access required' }, { status: 403 });
		}

		// Connect to database
		const db = await getDatabase();
		const usersCollection = db.collection<User>('users');

		// Get query parameters for filtering
		const url = new URL(request.url);
		const role = url.searchParams.get('role');
		const search = url.searchParams.get('search');
		const page = parseInt(url.searchParams.get('page') || '1');
		const limit = parseInt(url.searchParams.get('limit') || '50');
		const skip = (page - 1) * limit;

		// Build filter
		const filter: any = {};
		if (role) {
			filter.role = role;
		}
		if (search) {
			filter.$or = [
				{ email: { $regex: search, $options: 'i' } },
				{ firstName: { $regex: search, $options: 'i' } },
				{ lastName: { $regex: search, $options: 'i' } }
			];
		}

		// Get users with pagination
		const [users, total] = await Promise.all([
			usersCollection
				.find(filter, {
					projection: {
						password: 0,
						emailVerificationToken: 0,
						passwordResetToken: 0
					}
				})
				.sort({ createdAt: -1 })
				.skip(skip)
				.limit(limit)
				.toArray(),
			usersCollection.countDocuments(filter)
		]);

		// Format response
		const formattedUsers = users.map(user => ({
			id: user._id?.toString(),
			email: user.email,
			role: user.role,
			firstName: user.firstName,
			lastName: user.lastName,
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

/**
 * POST /api/users
 * Create new user (superadmin only)
 */
export const POST: RequestHandler = async (event) => {
	const { request, getClientAddress } = event;
	
	// Apply rate limiting
	const rateLimitResult = await rateLimit(event, RateLimitPresets.API);
	if (rateLimitResult instanceof Response) {
		return rateLimitResult;
	}

	try {
		// Verify authentication
		const authHeader = request.headers.get('Authorization');
		if (!authHeader || !authHeader.startsWith('Bearer ')) {
			return json({ error: 'Unauthorized' }, { status: 401 });
		}

		const token = authHeader.substring(7);
		const decoded = verifyAccessToken(token);
		
		if (!decoded) {
			return json({ error: 'Invalid or expired token' }, { status: 401 });
		}

		// Verify superadmin role
		if (decoded.role !== 'superadmin') {
			logger.warn('Non-superadmin attempted to create user', {
				userId: decoded.userId,
				role: decoded.role,
				ip: getClientAddress()
			});
			return json({ error: 'Forbidden: Superadmin access required' }, { status: 403 });
		}

		const body = await request.json();
		const { email, password, role, firstName, lastName } = body;

		// Validate required fields
		if (!email || !password || !role || !firstName || !lastName) {
			return json({ error: 'All fields are required' }, { status: 400 });
		}

		// Validate email
		const sanitizedEmail = sanitizeInput(email.toLowerCase());
		if (!validateEmail(sanitizedEmail)) {
			return json({ error: 'Invalid email format' }, { status: 400 });
		}

		// Validate role
		const validRoles = ['custodian', 'instructor', 'superadmin'];
		if (!validRoles.includes(role)) {
			return json({ 
				error: 'Invalid role. Must be custodian, instructor, or superadmin' 
			}, { status: 400 });
		}

		// Validate password strength
		if (password.length < 8) {
			return json({ 
				error: 'Password must be at least 8 characters long' 
			}, { status: 400 });
		}

		// Connect to database
		const db = await getDatabase();
		const usersCollection = db.collection<User>('users');

		// Check if email already exists
		const existingUser = await usersCollection.findOne({ email: sanitizedEmail });
		if (existingUser) {
			return json({ error: 'Email already registered' }, { status: 409 });
		}

		// Hash password
		const hashedPassword = await hashPassword(password);

		// Create user object
		const newUser: User = {
			email: sanitizedEmail,
			password: hashedPassword,
			role: role as UserRole,
			firstName: sanitizeInput(firstName),
			lastName: sanitizeInput(lastName),
			isActive: true,
			emailVerified: true, // Staff users are pre-verified
			createdAt: new Date(),
			updatedAt: new Date()
		};

		// Insert user
		const result = await usersCollection.insertOne(newUser);

		logger.info('User created by superadmin', {
			newUserId: result.insertedId.toString(),
			newUserEmail: sanitizedEmail,
			newUserRole: role,
			createdBy: decoded.userId,
			ip: getClientAddress()
		});

		return json({
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
		}, { status: 201 });
	} catch (error) {
		logger.error('Error creating user:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
};

/**
 * PATCH /api/users?userId=xxx
 * Update user (superadmin only)
 */
export const PATCH: RequestHandler = async (event) => {
	const { request, url, getClientAddress } = event;
	
	// Apply rate limiting
	const rateLimitResult = await rateLimit(event, RateLimitPresets.API);
	if (rateLimitResult instanceof Response) {
		return rateLimitResult;
	}

	try {
		// Verify authentication
		const authHeader = request.headers.get('Authorization');
		if (!authHeader || !authHeader.startsWith('Bearer ')) {
			return json({ error: 'Unauthorized' }, { status: 401 });
		}

		const token = authHeader.substring(7);
		const decoded = verifyAccessToken(token);
		
		if (!decoded) {
			return json({ error: 'Invalid or expired token' }, { status: 401 });
		}

		// Verify superadmin role
		if (decoded.role !== 'superadmin') {
			return json({ error: 'Forbidden: Superadmin access required' }, { status: 403 });
		}

		// Get userId from query parameter
		const userId = url.searchParams.get('userId');
		if (!userId) {
			return json({ error: 'userId query parameter is required' }, { status: 400 });
		}

		// Validate ObjectId
		if (!ObjectId.isValid(userId)) {
			return json({ error: 'Invalid userId format' }, { status: 400 });
		}

		const body = await request.json();
		const { firstName, lastName, isActive, role } = body;

		// Build update object
		const updateFields: any = {
			updatedAt: new Date()
		};

		if (firstName !== undefined) {
			updateFields.firstName = sanitizeInput(firstName);
		}
		if (lastName !== undefined) {
			updateFields.lastName = sanitizeInput(lastName);
		}
		if (isActive !== undefined) {
			updateFields.isActive = Boolean(isActive);
		}
		if (role !== undefined) {
			const validRoles = ['custodian', 'instructor', 'superadmin'];
			if (!validRoles.includes(role)) {
				return json({ error: 'Invalid role' }, { status: 400 });
			}
			updateFields.role = role;
		}

		// Connect to database
		const db = await getDatabase();
		const usersCollection = db.collection<User>('users');

		// Update user
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
			ip: getClientAddress()
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

/**
 * DELETE /api/users?userId=xxx
 * Delete user (superadmin only)
 */
export const DELETE: RequestHandler = async (event) => {
	const { request, url, getClientAddress } = event;
	
	// Apply rate limiting
	const rateLimitResult = await rateLimit(event, RateLimitPresets.API);
	if (rateLimitResult instanceof Response) {
		return rateLimitResult;
	}

	try {
		// Verify authentication
		const authHeader = request.headers.get('Authorization');
		if (!authHeader || !authHeader.startsWith('Bearer ')) {
			return json({ error: 'Unauthorized' }, { status: 401 });
		}

		const token = authHeader.substring(7);
		const decoded = verifyAccessToken(token);
		
		if (!decoded) {
			return json({ error: 'Invalid or expired token' }, { status: 401 });
		}

		// Verify superadmin role
		if (decoded.role !== 'superadmin') {
			return json({ error: 'Forbidden: Superadmin access required' }, { status: 403 });
		}

		// Get userId from query parameter
		const userId = url.searchParams.get('userId');
		if (!userId) {
			return json({ error: 'userId query parameter is required' }, { status: 400 });
		}

		// Validate ObjectId
		if (!ObjectId.isValid(userId)) {
			return json({ error: 'Invalid userId format' }, { status: 400 });
		}

		// Prevent deleting yourself
		if (userId === decoded.userId) {
			return json({ 
				error: 'Cannot delete your own account' 
			}, { status: 400 });
		}

		// Connect to database
		const db = await getDatabase();
		const usersCollection = db.collection<User>('users');

		// Get user before deletion for logging
		const user = await usersCollection.findOne({ _id: new ObjectId(userId) });
		if (!user) {
			return json({ error: 'User not found' }, { status: 404 });
		}

		// Delete user
		await usersCollection.deleteOne({ _id: new ObjectId(userId) });

		logger.info('User deleted by superadmin', {
			deletedUserId: userId,
			deletedUserEmail: user.email,
			deletedUserRole: user.role,
			deletedBy: decoded.userId,
			ip: getClientAddress()
		});

		return json({
			success: true,
			message: 'User deleted successfully'
		});
	} catch (error) {
		logger.error('Error deleting user:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
};

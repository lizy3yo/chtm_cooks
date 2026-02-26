/**
 * Get Current User Endpoint
 * 
 * Returns the currently authenticated user's information
 * Uses httpOnly cookie for authentication
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireAuth } from '$lib/server/middleware/auth/verify';
import { getDatabase } from '$lib/server/db/mongodb';
import { ObjectId } from 'mongodb';
import type { User, UserResponse } from '$lib/server/models/User';
import { UserRole } from '$lib/server/models/User';
import { AppError } from '$lib/server/errors';

export const GET: RequestHandler = async (event) => {
	try {
		// Require authentication (throws if not authenticated)
		const authUser = requireAuth(event);

		// Get user from database
		const db = await getDatabase();
		const usersCollection = db.collection<User>('users');

		const user = await usersCollection.findOne({ _id: new ObjectId(authUser.userId) });

		if (!user) {
			return json({ error: 'User not found' }, { status: 404 });
		}

		const userResponse: UserResponse = {
			id: user._id!.toString(),
			email: user.email,
			role: user.role,
			firstName: user.firstName,
			lastName: user.lastName,
			isActive: user.isActive,
			createdAt: user.createdAt,
			// Include student-specific fields if role is STUDENT
			...(user.role === UserRole.STUDENT && {
				yearLevel: user.yearLevel,
				block: user.block,
				agreedToTerms: user.agreedToTerms
			})
		};

		return json({ user: userResponse });
	} catch (error) {
		console.error('Get user error:', error);
		
		// If it's an AppError, return its status code
		if (error instanceof AppError) {
			return json({ error: error.message }, { status: error.statusCode });
		}
		
		return json({ error: 'Internal server error' }, { status: 500 });
	}
};

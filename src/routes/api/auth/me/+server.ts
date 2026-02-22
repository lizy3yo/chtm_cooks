import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { authenticateToken } from '$lib/server/middleware/auth';
import { getDatabase } from '$lib/server/db/mongodb';
import { ObjectId } from 'mongodb';
import type { User, UserResponse } from '$lib/server/models/User';
import { UserRole } from '$lib/server/models/User';

export const GET: RequestHandler = async ({ request }) => {
	try {
		const authHeader = request.headers.get('Authorization');
		const auth = authenticateToken(authHeader);

		if (!auth.success || !auth.payload) {
			return auth.error!;
		}

		// Get user from database
		const db = await getDatabase();
		const usersCollection = db.collection<User>('users');

		const user = await usersCollection.findOne({ _id: new ObjectId(auth.payload.userId) });

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

		return json(userResponse);
	} catch (error) {
		console.error('Get user error:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
};

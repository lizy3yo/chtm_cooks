import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDatabase } from '$lib/server/db/mongodb';
import { comparePassword } from '$lib/server/utils/password';
import { generateAccessToken, generateRefreshToken } from '$lib/server/utils/jwt';
import { validateEmail, sanitizeInput } from '$lib/server/utils/validation';
import type { LoginRequest, User, AuthResponse, UserResponse } from '$lib/server/models/User';

export const POST: RequestHandler = async ({ request }) => {
	try {
		const body: LoginRequest = await request.json();

		// Validate required fields
		if (!body.email || !body.password) {
			return json({ error: 'Email and password are required' }, { status: 400 });
		}

		// Sanitize email
		const email = sanitizeInput(body.email.toLowerCase());

		// Validate email format
		if (!validateEmail(email)) {
			return json({ error: 'Invalid email format' }, { status: 400 });
		}

		// Connect to database
		const db = await getDatabase();
		const usersCollection = db.collection<User>('users');

		// Find user
		const user = await usersCollection.findOne({ email });
		if (!user) {
			return json({ error: 'Invalid credentials' }, { status: 401 });
		}

		// Check if user is active
		if (!user.isActive) {
			return json({ error: 'Account is deactivated' }, { status: 403 });
		}

		// Verify password
		const isPasswordValid = await comparePassword(body.password, user.password);
		if (!isPasswordValid) {
			return json({ error: 'Invalid credentials' }, { status: 401 });
		}

		// Update last login
		await usersCollection.updateOne({ _id: user._id }, { $set: { lastLogin: new Date() } });

		// Generate tokens
		const tokenPayload = {
			userId: user._id!.toString(),
			email: user.email,
			role: user.role
		};

		const accessToken = generateAccessToken(tokenPayload);
		const refreshToken = generateRefreshToken(tokenPayload);

		// Prepare response
		const userResponse: UserResponse = {
			id: user._id!.toString(),
			email: user.email,
			role: user.role,
			firstName: user.firstName,
			lastName: user.lastName,
			isActive: user.isActive,
			createdAt: user.createdAt
		};

		const response: AuthResponse = {
			user: userResponse,
			accessToken,
			refreshToken
		};

		return json(response, { status: 200 });
	} catch (error) {
		console.error('Login error:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
};

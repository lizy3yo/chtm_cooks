import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDatabase } from '$lib/server/db/mongodb';
import { hashPassword, validatePassword } from '$lib/server/utils/password';
import { generateAccessToken, generateRefreshToken } from '$lib/server/utils/jwt';
import { validateEmail, validateRole, sanitizeInput } from '$lib/server/utils/validation';
import type { RegisterRequest, User, AuthResponse, UserResponse } from '$lib/server/models/User';
import { UserRole } from '$lib/server/models/User';
import { rateLimit, RateLimitPresets, applyRateLimitHeaders } from '$lib/server/middleware/rateLimit';

export const POST: RequestHandler = async (event) => {
	const { request } = event;
	
	// Apply rate limiting for registration
	const rateLimitResult = await rateLimit(event, RateLimitPresets.REGISTER);
	
	// If rate limit exceeded, return the error response
	if (rateLimitResult instanceof Response) {
		return rateLimitResult;
	}
	try {
		const body: RegisterRequest = await request.json();

		// Validate required fields
		if (!body.email || !body.password || !body.role || !body.firstName || !body.lastName) {
			return json({ error: 'All fields are required' }, { status: 400 });
		}

		// Sanitize inputs
		const email = sanitizeInput(body.email.toLowerCase());
		const firstName = sanitizeInput(body.firstName);
		const lastName = sanitizeInput(body.lastName);

		// Validate email
		if (!validateEmail(email)) {
			return json({ error: 'Invalid email format' }, { status: 400 });
		}

		// Validate student email domain
		if (body.role === UserRole.STUDENT && !email.endsWith('@gordoncollege.edu.ph')) {
			return json(
				{ error: 'Students must use a @gordoncollege.edu.ph email address' },
				{ status: 400 }
			);
		}

		// Validate role
		if (!validateRole(body.role)) {
			return json(
				{ error: 'Invalid role. Must be: student, custodian, instructor, or superadmin' },
				{ status: 400 }
			);
		}

		// Validate student-specific fields
		if (body.role === UserRole.STUDENT) {
			if (!body.yearLevel || !body.block || body.agreedToTerms === undefined) {
				return json(
					{ error: 'Students must provide year level, block, and agree to terms' },
					{ status: 400 }
				);
			}
			if (!body.agreedToTerms) {
				return json(
					{ error: 'Students must agree to terms and conditions' },
					{ status: 400 }
				);
			}
		}

		// Validate password
		const passwordValidation = validatePassword(body.password);
		if (!passwordValidation.valid) {
			return json({ error: passwordValidation.message }, { status: 400 });
		}

		// Connect to database
		const db = await getDatabase();
		const usersCollection = db.collection<User>('users');

		// Check if user already exists
		const existingUser = await usersCollection.findOne({ email });
		if (existingUser) {
			return json({ error: 'User with this email already exists' }, { status: 409 });
		}

		// Hash password
		const hashedPassword = await hashPassword(body.password);

		// Create user document
		const newUser: User = {
			email,
			password: hashedPassword,
			role: body.role,
			firstName,
			lastName,
			isActive: true,
			createdAt: new Date(),
			updatedAt: new Date(),
			// Add student-specific fields if role is STUDENT
			...(body.role === UserRole.STUDENT && {
				yearLevel: sanitizeInput(body.yearLevel!),
				block: sanitizeInput(body.block!),
				agreedToTerms: body.agreedToTerms
			})
		};

		// Insert user
		const result = await usersCollection.insertOne(newUser);

		// Generate tokens
		const tokenPayload = {
			userId: result.insertedId.toString(),
			email: newUser.email,
			role: newUser.role
		};

		const accessToken = generateAccessToken(tokenPayload);
		const refreshToken = generateRefreshToken(tokenPayload);

		// Prepare response
		const userResponse: UserResponse = {
			id: result.insertedId.toString(),
			email: newUser.email,
			role: newUser.role,
			firstName: newUser.firstName,
			lastName: newUser.lastName,
			isActive: newUser.isActive,
			createdAt: newUser.createdAt,
			// Include student-specific fields if role is STUDENT
			...(newUser.role === UserRole.STUDENT && {
				yearLevel: newUser.yearLevel,
				block: newUser.block,
				agreedToTerms: newUser.agreedToTerms
			})
		};

		const response: AuthResponse = {
			user: userResponse,
			accessToken,
			refreshToken
		};

		// Add rate limit headers to successful response
		const responseHeaders = new Headers();
		applyRateLimitHeaders(responseHeaders, rateLimitResult);

		return json(response, { 
			status: 201,
			headers: responseHeaders
		});
	} catch (error) {
		console.error('Registration error:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
};

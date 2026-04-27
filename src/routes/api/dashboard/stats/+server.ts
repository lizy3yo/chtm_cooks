import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDatabase } from '$lib/server/db/mongodb';
import { verifyAccessToken } from '$lib/server/utils/jwt';
import { rateLimit, RateLimitPresets } from '$lib/server/middleware/rateLimit';

/**
 * GET /api/dashboard/stats
 * Get dashboard statistics
 */
export const GET: RequestHandler = async (event) => {
	const { request } = event;
	
	// Apply rate limiting
	const rateLimitResult = await rateLimit(event, RateLimitPresets.API);
	if (rateLimitResult instanceof Response) {
		return rateLimitResult;
	}

	try {
		// Verify authentication
		let token = request.headers.get('Authorization')?.substring(7);
		
		if (!token) {
			token = event.cookies.get('access_token');
		}

		if (!token) {
			return json({ error: 'Unauthorized' }, { status: 401 });
		}

		const decoded = verifyAccessToken(token);
		
		if (!decoded) {
			return json({ error: 'Invalid or expired token' }, { status: 401 });
		}

		// Connect to database
		const db = await getDatabase();
		const usersCollection = db.collection('users');
		const classCodesCollection = db.collection('class_codes');
		const borrowRequestsCollection = db.collection('borrow_requests');
		const inventoryCollection = db.collection('inventory_items');

		// Get stats based on role
		if (decoded.role === 'superadmin') {
			// Superadmin gets full stats
			const [
				totalUsers, 
				studentCount, 
				instructorCount, 
				custodianCount, 
				superadminCount, 
				totalClassCodes, 
				totalRequests,
				totalInventoryItems,
				recentUsers
			] = await Promise.all([
				usersCollection.countDocuments(),
				usersCollection.countDocuments({ role: 'student' }),
				usersCollection.countDocuments({ role: 'instructor' }),
				usersCollection.countDocuments({ role: 'custodian' }),
				usersCollection.countDocuments({ role: 'superadmin' }),
				classCodesCollection.countDocuments(),
				borrowRequestsCollection.countDocuments(),
				inventoryCollection.countDocuments(),
				usersCollection
					.find({}, { projection: { password: 0 } })
					.sort({ createdAt: -1 })
					.limit(5)
					.toArray()
			]);

			// Get recent activity (last 7 days)
			const sevenDaysAgo = new Date();
			sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
			
			const newUsersThisWeek = await usersCollection.countDocuments({
				createdAt: { $gte: sevenDaysAgo }
			});

			const activeUsersThisWeek = await usersCollection.countDocuments({
				lastLogin: { $gte: sevenDaysAgo }
			});

			return json({
				totalUsers,
				students: studentCount,
				instructors: instructorCount,
				custodians: custodianCount,
				superadmins: superadminCount,
				totalClassCodes,
				totalRequests,
				totalInventoryItems,
				newUsersThisWeek,
				activeUsersThisWeek,
				staffMembers: instructorCount + custodianCount,
				recentUsers: recentUsers.map(user => ({
					id: user._id.toString(),
					email: user.email,
					role: user.role,
					firstName: user.firstName,
					lastName: user.lastName,
					createdAt: user.createdAt
				}))
			});
		} else if (decoded.role === 'instructor' || decoded.role === 'custodian') {
			// Instructors and custodians get limited stats
			const studentCount = await usersCollection.countDocuments({ role: 'student' });
			
			return json({
				students: studentCount,
				role: decoded.role
			});
		} else {
			// Students get minimal stats
			return json({
				role: decoded.role,
				message: 'Welcome to your dashboard'
			});
		}
	} catch (error) {
		console.error('Error fetching dashboard stats:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
};

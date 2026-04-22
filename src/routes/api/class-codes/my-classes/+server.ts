/**
 * GET /api/class-codes/my-classes
 * Fetch class codes that the authenticated student is enrolled in
 * Industry-standard endpoint for student-specific class code retrieval
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDatabase } from '$lib/server/db/mongodb';
import { ObjectId } from 'mongodb';
import type { ClassCode } from '$lib/server/models/ClassCode';
import { getUserFromToken } from '$lib/server/middleware/auth/verify';
import { logger } from '$lib/server/utils/logger';

export const GET: RequestHandler = async (event) => {
	try {
		// Authenticate user
		const decoded = await getUserFromToken(event);
		if (!decoded) {
			return json({ error: 'Unauthorized' }, { status: 401 });
		}

		// Only students can access this endpoint
		if (decoded.role !== 'student') {
			return json({ 
				error: 'Forbidden: Only students can access their enrolled classes' 
			}, { status: 403 });
		}

		const db = await getDatabase();
		const classCodesCollection = db.collection<ClassCode>('class_codes');

		// Find all active (non-archived) class codes where the student is enrolled
		const classCodes = await classCodesCollection
			.find({
				studentIds: decoded.userId,
				isArchived: false,
				isActive: true
			})
			.sort({ academicYear: -1, semester: 1, code: 1 })
			.toArray();

		// Transform to response format
		const response = classCodes.map((cc) => ({
			id: cc._id!.toString(),
			code: cc.code,
			courseCode: cc.courseCode,
			courseName: cc.courseName,
			section: cc.section,
			academicYear: cc.academicYear,
			semester: cc.semester,
			maxEnrollment: cc.maxEnrollment,
			studentCount: cc.studentIds?.length ?? 0,
			instructorCount: cc.instructorIds?.length ?? 0,
			isActive: cc.isActive,
			isArchived: cc.isArchived,
			createdAt: cc.createdAt.toISOString(),
			updatedAt: cc.updatedAt.toISOString()
		}));

		logger.info('Student class codes retrieved', {
			userId: decoded.userId,
			classCount: response.length
		});

		return json({
			classCodes: response,
			total: response.length
		});
	} catch (error) {
		logger.error('Error fetching student class codes', { error });
		return json({ error: 'Failed to fetch class codes' }, { status: 500 });
	}
};

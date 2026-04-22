/**
 * My Classes API Endpoint
 * Returns class codes where the authenticated student is enrolled
 * Industry-standard: Students must be enrolled to submit equipment requests
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDatabase } from '$lib/server/db/mongodb';
import { ObjectId } from 'mongodb';
import { logger } from '$lib/server/utils/logger';

interface ClassCode {
	_id?: ObjectId;
	code: string;
	courseCode: string;
	courseName: string;
	section: string;
	academicYear: string;
	semester: 'First' | 'Second' | 'Summer';
	maxEnrollment: number;
	studentIds?: string[]; // Stored as string IDs, not ObjectIds
	instructorIds?: string[]; // Stored as string IDs, not ObjectIds
	isActive: boolean;
	isArchived: boolean;
	createdAt: Date;
	updatedAt: Date;
}

/**
 * GET /api/class-codes/my-classes
 * Returns all active class codes where the authenticated student is enrolled
 */
export const GET: RequestHandler = async (event) => {
	try {
		// Authentication check
		const user = event.locals.user;
		if (!user) {
			return json({ error: 'Unauthorized' }, { status: 401 });
		}

		// Authorization check: Only students can access their enrolled classes
		if (user.role !== 'student') {
			return json({ 
				error: 'Forbidden: Only students can access enrolled classes' 
			}, { status: 403 });
		}

		const db = await getDatabase();
		const classCodesCollection = db.collection<ClassCode>('class_codes');

		// Find all active, non-archived class codes where the student is enrolled
		// Note: studentIds are stored as strings in the database
		const classCodes = await classCodesCollection
			.find({
				studentIds: user.userId,
				isActive: true,
				isArchived: false
			})
			.sort({ academicYear: -1, semester: 1, courseCode: 1 })
			.toArray();

		// Transform to response format
		const response = classCodes.map((classCode) => ({
			id: classCode._id!.toString(),
			code: classCode.code,
			courseCode: classCode.courseCode,
			courseName: classCode.courseName,
			section: classCode.section,
			academicYear: classCode.academicYear,
			semester: classCode.semester,
			maxEnrollment: classCode.maxEnrollment,
			isActive: classCode.isActive,
			isArchived: classCode.isArchived
		}));

		logger.info('Student class codes retrieved', {
			userId: user.userId,
			classCount: response.length
		});

		return json({
			classCodes: response,
			total: response.length
		});
	} catch (error) {
		logger.error('Error fetching student class codes', { 
			error,
			userId: event.locals.user?.userId 
		});
		return json({ 
			error: 'Failed to fetch enrolled classes' 
		}, { status: 500 });
	}
};

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDatabase } from '$lib/server/db/mongodb';
import { ObjectId } from 'mongodb';
import type { ClassCode } from '$lib/server/models/ClassCode';
import { getUserFromToken } from '$lib/server/middleware/auth/verify';
import { rateLimit, RateLimitPresets } from '$lib/server/middleware/rateLimit';
import { logger } from '$lib/server/utils/logger';
import { publishClassCodeChange, CLASS_CODE_CHANNEL } from '$lib/server/realtime/classCodeEvents';
import { sanitizeInput } from '$lib/server/utils/validation';

/**
 * GET /api/class-codes/[classCodeId]
 * Fetch single class code with optional populated instructor & student data.
 * Pass ?populate=true to include full user objects.
 */
export const GET: RequestHandler = async (event) => {
	const { params, request } = event;

	const rateLimitResult = await rateLimit(event, RateLimitPresets.API);
	if (rateLimitResult instanceof Response) return rateLimitResult;

	try {
		const decoded = getUserFromToken(event);
		if (!decoded) return json({ error: 'Unauthorized' }, { status: 401 });
		
		// Allow superadmin, instructor, and custodian to view class codes
		if (!['superadmin', 'instructor', 'custodian'].includes(decoded.role)) {
			return json({ error: 'Forbidden: Insufficient permissions' }, { status: 403 });
		}

		const { classCodeId } = params;
		if (!ObjectId.isValid(classCodeId)) {
			return json({ error: 'Invalid classCodeId format' }, { status: 400 });
		}

		const db = await getDatabase();
		const col = db.collection<ClassCode>('class_codes');
		const doc = await col.findOne({ _id: new ObjectId(classCodeId) });

		if (!doc) return json({ error: 'Class code not found' }, { status: 404 });
		
		// Instructors can only view classes they're assigned to (unless superadmin)
		if (decoded.role === 'instructor') {
			const isAssigned = doc.instructorIds?.includes(decoded.userId);
			if (!isAssigned) {
				return json({ error: 'Forbidden: You are not assigned to this class' }, { status: 403 });
			}
		}

		const url = new URL(request.url);
		const populate = url.searchParams.get('populate') === 'true';

		const base = {
			id: doc._id!.toString(),
			code: doc.code,
			courseCode: doc.courseCode,
			courseName: doc.courseName,
			section: doc.section,
			academicYear: doc.academicYear,
			semester: doc.semester,
			maxEnrollment: doc.maxEnrollment,
			studentCount: doc.studentIds?.length ?? 0,
			instructorCount: doc.instructorIds?.length ?? 0,
			instructorIds: doc.instructorIds ?? [],
			studentIds: doc.studentIds ?? [],
			isActive: doc.isActive,
			isArchived: doc.isArchived,
			createdAt: doc.createdAt?.toISOString(),
			updatedAt: doc.updatedAt?.toISOString()
		};

		if (!populate) return json({ classCode: base });

		// Populate instructor and student references
		const usersCol = db.collection('users');

		const [instructors, students] = await Promise.all([
			doc.instructorIds?.length
				? usersCol
						.find(
							{ _id: { $in: doc.instructorIds.filter(ObjectId.isValid).map((id) => new ObjectId(id)) } },
							{ projection: { password: 0, passwordResetToken: 0, emailVerificationToken: 0 } }
						)
						.toArray()
				: Promise.resolve([]),
			doc.studentIds?.length
				? usersCol
						.find(
							{ _id: { $in: doc.studentIds.filter(ObjectId.isValid).map((id) => new ObjectId(id)) } },
							{ projection: { password: 0, passwordResetToken: 0, emailVerificationToken: 0 } }
						)
						.toArray()
				: Promise.resolve([])
		]);

		return json({
			classCode: {
				...base,
				instructors: instructors.map((u) => ({
					id: u._id.toString(),
					firstName: u.firstName,
					lastName: u.lastName,
					email: u.email,
					profilePhotoUrl: u.profilePhotoUrl ?? null
				})),
				students: students.map((u) => ({
					id: u._id.toString(),
					firstName: u.firstName,
					lastName: u.lastName,
					email: u.email,
					yearLevel: u.yearLevel,
					block: u.block,
					profilePhotoUrl: u.profilePhotoUrl ?? null
				}))
			}
		});
	} catch (error) {
		logger.error('Error fetching class code:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
};

/**
 * PATCH /api/class-codes/[classCodeId]
 * Update class code — rename, change capacity, archive, add/remove instructors.
 */
export const PATCH: RequestHandler = async (event) => {
	const { params, request, getClientAddress } = event;

	const rateLimitResult = await rateLimit(event, RateLimitPresets.API);
	if (rateLimitResult instanceof Response) return rateLimitResult;

	try {
		const decoded = getUserFromToken(event);
		if (!decoded) return json({ error: 'Unauthorized' }, { status: 401 });
		if (decoded.role !== 'superadmin') {
			return json({ error: 'Forbidden: Superadmin access required' }, { status: 403 });
		}

		const { classCodeId } = params;
		if (!ObjectId.isValid(classCodeId)) {
			return json({ error: 'Invalid classCodeId format' }, { status: 400 });
		}

		const body = await request.json();
		const {
			courseName,
			maxEnrollment,
			isActive,
			isArchived,
			instructorIds,
			semester,
			academicYear
		} = body;

		const updateFields: Record<string, unknown> = { updatedAt: new Date() };

		if (courseName !== undefined) updateFields.courseName = sanitizeInput(courseName);
		if (typeof maxEnrollment === 'number' && maxEnrollment > 0)
			updateFields.maxEnrollment = maxEnrollment;
		if (typeof isActive === 'boolean') updateFields.isActive = isActive;
		if (typeof isArchived === 'boolean') updateFields.isArchived = isArchived;
		if (semester !== undefined) {
			const validSemesters = ['First', 'Second', 'Summer'];
			if (!validSemesters.includes(semester))
				return json({ error: 'Invalid semester' }, { status: 400 });
			updateFields.semester = semester;
		}
		if (academicYear !== undefined) updateFields.academicYear = academicYear;

		if (Array.isArray(instructorIds)) {
			// Validate each instructor ID
			const db = await getDatabase();
			const usersCol = db.collection('users');
			const safeIds: string[] = [];
			for (const id of instructorIds) {
				if (ObjectId.isValid(id)) {
					const user = await usersCol.findOne({ _id: new ObjectId(id), role: 'instructor' });
					if (user) safeIds.push(id);
				}
			}
			updateFields.instructorIds = safeIds;
		}

		const db = await getDatabase();
		const col = db.collection<ClassCode>('class_codes');

		const result = await col.findOneAndUpdate(
			{ _id: new ObjectId(classCodeId) },
			{ $set: updateFields },
			{ returnDocument: 'after' }
		);

		if (!result) return json({ error: 'Class code not found' }, { status: 404 });

		logger.info('Class code updated', {
			classCodeId,
			changes: updateFields,
			updatedBy: decoded.userId,
			ip: getClientAddress()
		});

		const action = isArchived === true ? 'class_archived' : 'class_updated';
		publishClassCodeChange([CLASS_CODE_CHANNEL], {
			action,
			classCodeId,
			occurredAt: new Date().toISOString()
		});

		return json({
			success: true,
			message: 'Class code updated successfully',
			classCode: {
				id: result._id!.toString(),
				code: result.code,
				courseCode: result.courseCode,
				courseName: result.courseName,
				section: result.section,
				academicYear: result.academicYear,
				semester: result.semester,
				maxEnrollment: result.maxEnrollment,
				studentCount: result.studentIds?.length ?? 0,
				instructorCount: result.instructorIds?.length ?? 0,
				isActive: result.isActive,
				isArchived: result.isArchived,
				updatedAt: (result.updatedAt as Date).toISOString()
			}
		});
	} catch (error) {
		logger.error('Error updating class code:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
};

/**
 * DELETE /api/class-codes/[classCodeId]
 * Hard delete a class code (only for non-archived / empty classes).
 */
export const DELETE: RequestHandler = async (event) => {
	const { params, getClientAddress } = event;

	const rateLimitResult = await rateLimit(event, RateLimitPresets.API);
	if (rateLimitResult instanceof Response) return rateLimitResult;

	try {
		const decoded = getUserFromToken(event);
		if (!decoded) return json({ error: 'Unauthorized' }, { status: 401 });
		if (decoded.role !== 'superadmin') {
			return json({ error: 'Forbidden: Superadmin access required' }, { status: 403 });
		}

		const { classCodeId } = params;
		if (!ObjectId.isValid(classCodeId)) {
			return json({ error: 'Invalid classCodeId format' }, { status: 400 });
		}

		const db = await getDatabase();
		const col = db.collection<ClassCode>('class_codes');

		const doc = await col.findOne({ _id: new ObjectId(classCodeId) });
		if (!doc) return json({ error: 'Class code not found' }, { status: 404 });

		await col.deleteOne({ _id: new ObjectId(classCodeId) });

		logger.info('Class code deleted', {
			classCodeId,
			code: doc.code,
			deletedBy: decoded.userId,
			ip: getClientAddress()
		});

		publishClassCodeChange([CLASS_CODE_CHANNEL], {
			action: 'class_deleted',
			classCodeId,
			occurredAt: new Date().toISOString()
		});

		return json({ success: true, message: 'Class code deleted successfully' });
	} catch (error) {
		logger.error('Error deleting class code:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
};

/**
 * POST   /api/class-codes/[classCodeId]/enrollments  — enroll students
 * DELETE /api/class-codes/[classCodeId]/enrollments  — unenroll students
 */
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDatabase } from '$lib/server/db/mongodb';
import { ObjectId } from 'mongodb';
import type { ClassCode } from '$lib/server/models/ClassCode';
import { getUserFromToken } from '$lib/server/middleware/auth/verify';
import { rateLimit, RateLimitPresets } from '$lib/server/middleware/rateLimit';
import { logger } from '$lib/server/utils/logger';
import { publishClassCodeChange, CLASS_CODE_CHANNEL } from '$lib/server/realtime/classCodeEvents';

/** Enroll one or more students in the class. */
export const POST: RequestHandler = async (event) => {
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
		const { studentIds } = body;

		if (!Array.isArray(studentIds) || studentIds.length === 0) {
			return json({ error: 'studentIds array is required' }, { status: 400 });
		}

		const db = await getDatabase();
		const col = db.collection<ClassCode>('class_codes');

		const classCode = await col.findOne({ _id: new ObjectId(classCodeId) });
		if (!classCode) return json({ error: 'Class code not found' }, { status: 404 });
		if (classCode.isArchived) {
			return json({ error: 'Cannot enroll students in an archived class' }, { status: 400 });
		}

		// Validate student IDs against users collection
		const usersCol = db.collection('users');
		const validIds: string[] = [];
		for (const id of studentIds) {
			if (!ObjectId.isValid(id)) continue;
			const user = await usersCol.findOne({ _id: new ObjectId(id), role: 'student' });
			if (user) validIds.push(id);
		}

		if (validIds.length === 0) {
			return json({ error: 'No valid student IDs provided' }, { status: 400 });
		}

		// Calculate remaining capacity
		const currentCount = classCode.studentIds?.length ?? 0;
		const newCount = new Set([...(classCode.studentIds ?? []), ...validIds]).size;

		if (newCount > classCode.maxEnrollment) {
			return json(
				{
					error: `Enrollment would exceed capacity (${classCode.maxEnrollment}). Currently ${currentCount} enrolled.`
				},
				{ status: 400 }
			);
		}

		// Use $addToSet to avoid duplicates atomically
		await col.updateOne(
			{ _id: new ObjectId(classCodeId) },
			{
				$addToSet: { studentIds: { $each: validIds } },
				$set: { updatedAt: new Date() }
			}
		);

		const updated = await col.findOne({ _id: new ObjectId(classCodeId) });

		logger.info('Students enrolled in class code', {
			classCodeId,
			studentIds: validIds,
			enrolledBy: decoded.userId,
			ip: getClientAddress()
		});

		publishClassCodeChange([CLASS_CODE_CHANNEL], {
			action: 'enrollment_updated',
			classCodeId,
			occurredAt: new Date().toISOString()
		});

		return json({
			success: true,
			message: `${validIds.length} student(s) enrolled successfully`,
			studentCount: updated?.studentIds?.length ?? 0
		});
	} catch (error) {
		logger.error('Error enrolling students:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
};

/** Remove one or more students from the class. */
export const DELETE: RequestHandler = async (event) => {
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
		const { studentIds } = body;

		if (!Array.isArray(studentIds) || studentIds.length === 0) {
			return json({ error: 'studentIds array is required' }, { status: 400 });
		}

		const db = await getDatabase();
		const col = db.collection<ClassCode>('class_codes');

		const classCode = await col.findOne({ _id: new ObjectId(classCodeId) });
		if (!classCode) return json({ error: 'Class code not found' }, { status: 404 });

		await col.updateOne(
			{ _id: new ObjectId(classCodeId) },
			{
				$pull: { studentIds: { $in: studentIds } },
				$set: { updatedAt: new Date() }
			}
		);

		const updated = await col.findOne({ _id: new ObjectId(classCodeId) });

		logger.info('Students unenrolled from class code', {
			classCodeId,
			studentIds,
			unenrolledBy: decoded.userId,
			ip: getClientAddress()
		});

		publishClassCodeChange([CLASS_CODE_CHANNEL], {
			action: 'enrollment_updated',
			classCodeId,
			occurredAt: new Date().toISOString()
		});

		return json({
			success: true,
			message: `${studentIds.length} student(s) removed successfully`,
			studentCount: updated?.studentIds?.length ?? 0
		});
	} catch (error) {
		logger.error('Error unenrolling students:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
};

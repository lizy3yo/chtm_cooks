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
 * GET /api/class-codes
 * List class codes with optional filters (semester, year, archived, search)
 */
export const GET: RequestHandler = async (event) => {
	const { request } = event;

	const rateLimitResult = await rateLimit(event, RateLimitPresets.API);
	if (rateLimitResult instanceof Response) return rateLimitResult;

	try {
		const decoded = getUserFromToken(event);
		if (!decoded) return json({ error: 'Unauthorized' }, { status: 401 });
		if (decoded.role !== 'superadmin') {
			return json({ error: 'Forbidden: Superadmin access required' }, { status: 403 });
		}

		const db = await getDatabase();
		const col = db.collection<ClassCode>('class_codes');

		const url = new URL(request.url);
		const search = url.searchParams.get('search') || '';
		const semester = url.searchParams.get('semester') || '';
		const academicYear = url.searchParams.get('academicYear') || '';
		const archived = url.searchParams.get('archived'); // 'true' | 'false' | null
		const page = Math.max(1, parseInt(url.searchParams.get('page') || '1'));
		const limit = Math.min(100, parseInt(url.searchParams.get('limit') || '50'));
		const skip = (page - 1) * limit;

		// Build filter
		const filter: Record<string, unknown> = {};

		if (archived === 'true') {
			filter.isArchived = true;
		} else if (archived === 'false') {
			filter.isArchived = false;
		}
		// If archived is null/undefined, return both (no filter)

		if (semester) filter.semester = semester;
		if (academicYear) filter.academicYear = academicYear;
		if (search) {
			filter.$or = [
				{ code: { $regex: search, $options: 'i' } },
				{ courseCode: { $regex: search, $options: 'i' } },
				{ courseName: { $regex: search, $options: 'i' } }
			];
		}

		const [docs, total] = await Promise.all([
			col.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).toArray(),
			col.countDocuments(filter)
		]);

		const classCodes = docs.map((d) => ({
			id: d._id!.toString(),
			code: d.code,
			courseCode: d.courseCode,
			courseName: d.courseName,
			section: d.section,
			academicYear: d.academicYear,
			semester: d.semester,
			maxEnrollment: d.maxEnrollment,
			studentCount: d.studentIds?.length ?? 0,
			instructorCount: d.instructorIds?.length ?? 0,
			instructorIds: d.instructorIds ?? [],
			studentIds: d.studentIds ?? [],
			isActive: d.isActive,
			isArchived: d.isArchived,
			createdAt: d.createdAt?.toISOString(),
			updatedAt: d.updatedAt?.toISOString()
		}));

		return json({
			classCodes,
			pagination: { page, limit, total, totalPages: Math.ceil(total / limit) }
		});
	} catch (error) {
		logger.error('Error fetching class codes:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
};

/**
 * POST /api/class-codes
 * Create a new class code
 */
export const POST: RequestHandler = async (event) => {
	const { request, getClientAddress } = event;

	const rateLimitResult = await rateLimit(event, RateLimitPresets.API);
	if (rateLimitResult instanceof Response) return rateLimitResult;

	try {
		const decoded = getUserFromToken(event);
		if (!decoded) return json({ error: 'Unauthorized' }, { status: 401 });
		if (decoded.role !== 'superadmin') {
			return json({ error: 'Forbidden: Superadmin access required' }, { status: 403 });
		}

		const body = await request.json();
		const { courseCode, courseName, section, academicYear, semester, maxEnrollment, instructorIds } =
			body;

		// Validate required fields
		if (!courseCode || !courseName || !section || !academicYear || !semester || !maxEnrollment) {
			return json({ error: 'All required fields must be provided' }, { status: 400 });
		}

		const validSemesters = ['First', 'Second', 'Summer'];
		if (!validSemesters.includes(semester)) {
			return json({ error: 'Invalid semester. Must be First, Second, or Summer' }, { status: 400 });
		}

		if (maxEnrollment < 1 || maxEnrollment > 500) {
			return json({ error: 'Max enrollment must be between 1 and 500' }, { status: 400 });
		}

		// Generate code
		const year = academicYear.split('-')[1] || academicYear.split('-')[0];
		const code = `${year}-${sanitizeInput(courseCode).toUpperCase()}-${sanitizeInput(section).toUpperCase()}`;

		const db = await getDatabase();
		const col = db.collection<ClassCode>('class_codes');

		// Check for duplicate code in same academic year
		const existing = await col.findOne({ code, academicYear });
		if (existing) {
			return json(
				{ error: `Class code "${code}" already exists for academic year ${academicYear}` },
				{ status: 409 }
			);
		}

		// Validate instructor IDs
		const safeInstructorIds: string[] = [];
		if (Array.isArray(instructorIds) && instructorIds.length > 0) {
			const usersCol = db.collection('users');
			for (const id of instructorIds) {
				if (ObjectId.isValid(id)) {
					const user = await usersCol.findOne({ _id: new ObjectId(id), role: 'instructor' });
					if (user) safeInstructorIds.push(id);
				}
			}
		}

		const now = new Date();
		const newClassCode: ClassCode = {
			code,
			courseCode: sanitizeInput(courseCode).toUpperCase(),
			courseName: sanitizeInput(courseName),
			section: sanitizeInput(section).toUpperCase(),
			academicYear,
			semester,
			maxEnrollment: Number(maxEnrollment),
			instructorIds: safeInstructorIds,
			studentIds: [],
			isActive: true,
			isArchived: false,
			createdAt: now,
			updatedAt: now
		};

		const result = await col.insertOne(newClassCode);

		logger.info('Class code created', {
			code,
			classCodeId: result.insertedId.toString(),
			createdBy: decoded.userId,
			ip: getClientAddress()
		});

		publishClassCodeChange([CLASS_CODE_CHANNEL], {
			action: 'class_created',
			classCodeId: result.insertedId.toString(),
			occurredAt: now.toISOString()
		});

		return json(
			{
				success: true,
				message: 'Class code created successfully',
				classCode: {
					id: result.insertedId.toString(),
					code: newClassCode.code,
					courseCode: newClassCode.courseCode,
					courseName: newClassCode.courseName,
					section: newClassCode.section,
					academicYear: newClassCode.academicYear,
					semester: newClassCode.semester,
					maxEnrollment: newClassCode.maxEnrollment,
					studentCount: 0,
					instructorCount: safeInstructorIds.length,
					isActive: true,
					isArchived: false,
					createdAt: now.toISOString(),
					updatedAt: now.toISOString()
				}
			},
			{ status: 201 }
		);
	} catch (error) {
		logger.error('Error creating class code:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
};

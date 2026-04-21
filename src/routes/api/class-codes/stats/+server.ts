/**
 * GET /api/class-codes/stats
 * Aggregated statistics for the stats bar on the Class Code Management page.
 */
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDatabase } from '$lib/server/db/mongodb';
import type { ClassCode } from '$lib/server/models/ClassCode';
import { getUserFromToken } from '$lib/server/middleware/auth/verify';
import { rateLimit, RateLimitPresets } from '$lib/server/middleware/rateLimit';
import { logger } from '$lib/server/utils/logger';

export const GET: RequestHandler = async (event) => {
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

		// Run aggregation in parallel for performance
		const [allDocs, activeDocs, archivedCount] = await Promise.all([
			col.find({}, { projection: { studentIds: 1, instructorIds: 1, isArchived: 1, isActive: 1 } }).toArray(),
			col.find({ isArchived: false }, { projection: { studentIds: 1, instructorIds: 1 } }).toArray(),
			col.countDocuments({ isArchived: true })
		]);

		const totalClasses = allDocs.length;
		const activeClasses = activeDocs.length;

		// Unique students across active classes
		const uniqueStudents = new Set<string>();
		const uniqueInstructors = new Set<string>();
		let totalStudentSlots = 0;

		for (const doc of activeDocs) {
			for (const sid of doc.studentIds ?? []) uniqueStudents.add(sid);
			for (const iid of doc.instructorIds ?? []) uniqueInstructors.add(iid);
			totalStudentSlots += doc.studentIds?.length ?? 0;
		}

		const avgClassSize =
			activeClasses > 0 ? Math.round(totalStudentSlots / activeClasses) : 0;

		return json({
			stats: {
				totalClasses,
				activeClasses,
				archivedClasses: archivedCount,
				totalStudents: uniqueStudents.size,
				avgClassSize,
				totalInstructors: uniqueInstructors.size
			}
		});
	} catch (error) {
		logger.error('Error fetching class code stats:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
};

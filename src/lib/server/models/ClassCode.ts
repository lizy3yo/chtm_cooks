import type { ObjectId } from 'mongodb';

export type Semester = 'First' | 'Second' | 'Summer';

/**
 * ClassCode — MongoDB document stored in the `class_codes` collection.
 *
 * The `code` field is auto-generated on the server as:
 *   [YEAR]-[COURSE_CODE]-[SECTION]   e.g.  2026-CHTM101-A
 *
 * Instructors and students are stored as ObjectId references to the `users`
 * collection.  The class code is the single source of truth for membership;
 * no denormalized field is written back to User documents.
 */
export interface ClassCode {
	_id?: ObjectId;

	/** Auto-generated composite key: [year]-[courseCode]-[section] */
	code: string;

	/** e.g. "CHTM101" */
	courseCode: string;

	/** e.g. "Culinary Arts Fundamentals" */
	courseName: string;

	/** e.g. "A", "B", "C" */
	section: string;

	/** e.g. "2025-2026" */
	academicYear: string;

	semester: Semester;

	/** Maximum number of students allowed */
	maxEnrollment: number;

	/** ObjectId strings of assigned instructors */
	instructorIds: string[];

	/** ObjectId strings of enrolled students */
	studentIds: string[];

	/** Active = currently running; false = suspended */
	isActive: boolean;

	/** Archived = semester ended; data preserved for reporting */
	isArchived: boolean;

	createdAt: Date;
	updatedAt: Date;
}

/** Safe projection returned by API endpoints (no internal ObjectIds exposed raw) */
export interface ClassCodeResponse {
	id: string;
	code: string;
	courseCode: string;
	courseName: string;
	section: string;
	academicYear: string;
	semester: Semester;
	maxEnrollment: number;
	studentCount: number;
	instructorCount: number;
	isActive: boolean;
	isArchived: boolean;
	createdAt: string;
	updatedAt: string;

	/** Populated from users collection when ?populate=true */
	instructors?: InstructorRef[];
	students?: StudentRef[];
}

export interface InstructorRef {
	id: string;
	firstName: string;
	lastName: string;
	email: string;
	profilePhotoUrl?: string;
}

export interface StudentRef {
	id: string;
	firstName: string;
	lastName: string;
	email: string;
	yearLevel?: string;
	block?: string;
	profilePhotoUrl?: string;
}

export interface ClassCodeStats {
	totalClasses: number;
	activeClasses: number;
	archivedClasses: number;
	totalStudents: number;
	avgClassSize: number;
	totalInstructors: number;
}

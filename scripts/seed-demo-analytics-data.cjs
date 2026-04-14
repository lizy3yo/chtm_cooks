/*
 * Seed full presentation data across non-inventory collections.
 *
 * Scope:
 * - users (20 records, real names, numeric Gordon College emails)
 * - borrow_requests
 * - replacement_obligations
 * - donations
 * - notifications
 * - shortcut_keys
 * - remember_tokens
 *
 * Excluded by requirement:
 * - inventory_items
 * - inventory_categories
 * - inventory_history
 * - inventory_deleted
 *
 * Safety:
 * - Dry-run by default
 * - Seed-tagged records for deterministic purge
 * - Idempotent user upserts by email
 *
 * Usage:
 *   node scripts/seed-demo-analytics-data.cjs
 *   node scripts/seed-demo-analytics-data.cjs --yes
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { MongoClient, ObjectId } = require('mongodb');

const DOMAIN = '@gordoncollege.edu.ph';
const SEED_TAG = 'presentation-seed-v2';
const DEFAULT_PASSWORD = 'GcPresent2026!';

const COLLECTIONS = {
	users: 'users',
	borrowRequests: 'borrow_requests',
	replacementObligations: 'replacement_obligations',
	donations: 'donations',
	notifications: 'notifications',
	shortcutKeys: 'shortcut_keys',
	rememberTokens: 'remember_tokens'
};

function parseEnvFile(envPath) {
	if (!fs.existsSync(envPath)) return {};
	const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
	const env = {};

	for (const line of lines) {
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith('#')) continue;
		const idx = trimmed.indexOf('=');
		if (idx === -1) continue;

		const key = trimmed.slice(0, idx).trim();
		let value = trimmed.slice(idx + 1).trim();
		if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
			value = value.slice(1, -1);
		}
		env[key] = value;
	}

	return env;
}

function resolveRuntimeEnv() {
	const runtimeEnv = {};
	for (const envPath of [path.join(process.cwd(), '.env'), path.join(process.cwd(), '.env.local')]) {
		Object.assign(runtimeEnv, parseEnvFile(envPath));
	}

	return {
		...runtimeEnv,
		...process.env
	};
}

function resolveMongoUri(runtimeEnv) {
	if (runtimeEnv.MONGODB_URI) return runtimeEnv.MONGODB_URI;
	throw new Error('MONGODB_URI is not set. Add it to environment variables or .env file.');
}

function resolveDbName(uri) {
	const withoutParams = uri.split('?')[0];
	const lastSlash = withoutParams.lastIndexOf('/');
	const dbName = lastSlash >= 0 ? withoutParams.slice(lastSlash + 1) : '';
	return dbName || 'chtm-cooks';
}

function hasYesFlag() {
	return process.argv.includes('--yes');
}

function ensureNumericGordonEmail(localPart) {
	if (!/^\d+$/.test(localPart)) {
		throw new Error(`Invalid local part "${localPart}". It must be numeric only.`);
	}
	return `${localPart}${DOMAIN}`;
}

function daysAgo(days) {
	const d = new Date();
	d.setDate(d.getDate() - days);
	return d;
}

function hashToken(value) {
	return crypto.createHash('sha256').update(value).digest('hex');
}

function makeReceiptNumber(year, serialNumber) {
	const serial = String(serialNumber).padStart(6, '0');
	return `DON-${year}-${serial}`;
}

async function getNextDonationSerialStart(db, year) {
	const prefix = `DON-${year}-`;
	const latest = await db
		.collection(COLLECTIONS.donations)
		.find(
			{ receiptNumber: { $regex: `^${prefix}\\d{6}$` } },
			{ projection: { receiptNumber: 1 } }
		)
		.sort({ receiptNumber: -1 })
		.limit(1)
		.toArray();

	if (!latest.length || !latest[0].receiptNumber) return 1;

	const match = String(latest[0].receiptNumber).match(/(\d{6})$/);
	if (!match) return 1;

	const currentMax = Number(match[1]);
	if (!Number.isFinite(currentMax) || currentMax < 0) return 1;

	return currentMax + 1;
}

function buildPeople() {
	const roster = [
		{ emailLocalPart: '202311564', firstName: 'Kharl', lastName: 'De Jesus', role: 'student', yearLevel: '3rd Year', block: 'A', agreedToTerms: true },
		{ emailLocalPart: '202311565', firstName: 'Angela', lastName: 'Reyes', role: 'student', yearLevel: '2nd Year', block: 'B', agreedToTerms: true },
		{ emailLocalPart: '202311566', firstName: 'Joshua', lastName: 'Fernandez', role: 'student', yearLevel: '1st Year', block: 'C', agreedToTerms: true },
		{ emailLocalPart: '202311567', firstName: 'Patricia', lastName: 'Villanueva', role: 'student', yearLevel: '4th Year', block: 'D', agreedToTerms: true },
		{ emailLocalPart: '202311568', firstName: 'Carlo', lastName: 'Domingo', role: 'student', yearLevel: '3rd Year', block: 'E', agreedToTerms: true },
		{ emailLocalPart: '202311569', firstName: 'Bea', lastName: 'Navarro', role: 'student', yearLevel: '2nd Year', block: 'F', agreedToTerms: true },
		{ emailLocalPart: '202311570', firstName: 'Rafael', lastName: 'Mendoza', role: 'student', yearLevel: '1st Year', block: 'A', agreedToTerms: true },
		{ emailLocalPart: '202311571', firstName: 'Nicole', lastName: 'Bautista', role: 'student', yearLevel: '4th Year', block: 'B', agreedToTerms: true },
		{ emailLocalPart: '202311572', firstName: 'Adrian', lastName: 'Flores', role: 'student', yearLevel: '3rd Year', block: 'C', agreedToTerms: true },
		{ emailLocalPart: '202311573', firstName: 'Leah', lastName: 'Salazar', role: 'student', yearLevel: '2nd Year', block: 'D', agreedToTerms: true },
		{ emailLocalPart: '202311574', firstName: 'Franco', lastName: 'De Leon', role: 'student', yearLevel: '1st Year', block: 'E', agreedToTerms: true },
		{ emailLocalPart: '202311575', firstName: 'Mariel', lastName: 'Cruz', role: 'student', yearLevel: '4th Year', block: 'F', agreedToTerms: true },
		{ emailLocalPart: '202311576', firstName: 'Gabriel', lastName: 'Ramos', role: 'student', yearLevel: '3rd Year', block: 'A', agreedToTerms: true },
		{ emailLocalPart: '202311577', firstName: 'Sofia', lastName: 'Torres', role: 'student', yearLevel: '2nd Year', block: 'B', agreedToTerms: true },
		{ emailLocalPart: '202311578', firstName: 'Clarissa', lastName: 'Lopez', role: 'student', yearLevel: '1st Year', block: 'C', agreedToTerms: true },
		{ emailLocalPart: '202311579', firstName: 'Vincent', lastName: 'Garcia', role: 'student', yearLevel: '2nd Year', block: 'D', agreedToTerms: true },
		{ emailLocalPart: '202311580', firstName: 'Elena', lastName: 'Dizon', role: 'student', yearLevel: '3rd Year', block: 'E', agreedToTerms: true },
		{ emailLocalPart: '202311581', firstName: 'Marvin', lastName: 'Aguilar', role: 'student', yearLevel: '4th Year', block: 'F', agreedToTerms: true },
		{ emailLocalPart: '202311582', firstName: 'Janine', lastName: 'Mercado', role: 'student', yearLevel: '1st Year', block: 'A', agreedToTerms: true },
		{ emailLocalPart: '202311583', firstName: 'Roberto', lastName: 'Lim', role: 'student', yearLevel: '2nd Year', block: 'B', agreedToTerms: true }
	];

	return roster.map((user) => {
		const isStudent = user.role === 'student';
		return {
			email: ensureNumericGordonEmail(user.emailLocalPart),
			firstName: user.firstName,
			lastName: user.lastName,
			role: user.role,
			yearLevel: isStudent ? user.yearLevel : undefined,
			block: isStudent ? user.block : undefined,
			agreedToTerms: isStudent ? user.agreedToTerms ?? true : undefined
		};
	});
}

async function upsertUsers(db, users, passwordHash, execute) {
	let inserted = 0;
	let updated = 0;
	const out = [];

	for (const user of users) {
		const filter = { email: user.email };
		const now = new Date();
		const existing = await db.collection(COLLECTIONS.users).findOne(filter, { projection: { _id: 1 } });

		const update = {
			$set: {
				firstName: user.firstName,
				lastName: user.lastName,
				role: user.role,
				isActive: true,
				emailVerified: true,
				agreedToTerms: true,
				yearLevel: user.yearLevel,
				block: user.block,
				updatedAt: now,
				seedTag: SEED_TAG
			},
			$setOnInsert: {
				password: passwordHash,
				createdAt: now
			}
		};

		if (!execute) {
			out.push({ _id: existing?._id || new ObjectId(), ...user });
			if (existing) updated += 1;
			else inserted += 1;
			continue;
		}

		const result = await db.collection(COLLECTIONS.users).findOneAndUpdate(filter, update, {
			upsert: true,
			returnDocument: 'after'
		});

		if (!result?._id) throw new Error(`Failed to upsert user ${user.email}`);
		out.push({ _id: result._id, ...user });
		if (existing) updated += 1;
		else inserted += 1;
	}

	return { users: out, inserted, updated };
}

async function purgeExistingSeedData(db, execute) {
	const filters = { seedTag: SEED_TAG };
	const preview = await Promise.all([
		db.collection(COLLECTIONS.borrowRequests).countDocuments(filters),
		db.collection(COLLECTIONS.replacementObligations).countDocuments(filters),
		db.collection(COLLECTIONS.donations).countDocuments(filters),
		db.collection(COLLECTIONS.notifications).countDocuments(filters),
		db.collection(COLLECTIONS.shortcutKeys).countDocuments(filters),
		db.collection(COLLECTIONS.rememberTokens).countDocuments(filters)
	]);

	if (!execute) {
		return {
			deleted: {
				borrowRequests: preview[0],
				replacementObligations: preview[1],
				donations: preview[2],
				notifications: preview[3],
				shortcutKeys: preview[4],
				rememberTokens: preview[5]
			}
		};
	}

	const [borrowRequests, replacementObligations, donations, notifications, shortcutKeys, rememberTokens] = await Promise.all([
		db.collection(COLLECTIONS.borrowRequests).deleteMany(filters),
		db.collection(COLLECTIONS.replacementObligations).deleteMany(filters),
		db.collection(COLLECTIONS.donations).deleteMany(filters),
		db.collection(COLLECTIONS.notifications).deleteMany(filters),
		db.collection(COLLECTIONS.shortcutKeys).deleteMany(filters),
		db.collection(COLLECTIONS.rememberTokens).deleteMany(filters)
	]);

	return {
		deleted: {
			borrowRequests: borrowRequests.deletedCount,
			replacementObligations: replacementObligations.deletedCount,
			donations: donations.deletedCount,
			notifications: notifications.deletedCount,
			shortcutKeys: shortcutKeys.deletedCount,
			rememberTokens: rememberTokens.deletedCount
		}
	};
}

function pickRoleUsers(users, role) {
	return users.filter((u) => u.role === role);
}

function buildBorrowRequests(students) {
	const statuses = [
		'pending_instructor',
		'approved_instructor',
		'ready_for_pickup',
		'borrowed',
		'pending_return',
		'returned',
		'returned',
		'missing',
		'cancelled',
		'rejected'
	];

	const rows = [];
	let counter = 0;

	for (let i = 0; i < students.length; i += 1) {
		for (let j = 0; j < 3; j += 1) {
			counter += 1;
			const student = students[i];
			const status = statuses[(i + j) % statuses.length];
			const createdAt = daysAgo(3 + i * 2 + j);
			const borrowDate = new Date(createdAt.getTime() + 2 * 60 * 60 * 1000);
			const returnDate = new Date(borrowDate.getTime() + (3 + (i % 3)) * 24 * 60 * 60 * 1000);
			const approvedAt = ['approved_instructor', 'ready_for_pickup', 'borrowed', 'pending_return', 'returned', 'missing'].includes(status)
				? new Date(createdAt.getTime() + 6 * 60 * 60 * 1000)
				: undefined;
			const releasedAt = ['borrowed', 'pending_return', 'returned', 'missing'].includes(status)
				? new Date(createdAt.getTime() + 12 * 60 * 60 * 1000)
				: undefined;
			const returnedAt = ['returned'].includes(status)
				? new Date(returnDate.getTime() + ((i % 2 === 0 ? -1 : 1) * 6 * 60 * 60 * 1000))
				: undefined;

			rows.push({
				_id: new ObjectId(),
				studentId: student._id,
				items: [
					{
						itemId: new ObjectId(),
						name: `Food Lab Equipment ${counter}`,
						quantity: (counter % 3) + 1,
						category: counter % 2 === 0 ? 'Kitchen Tools' : 'Laboratory Devices',
						inspection:
							status === 'returned'
								? {
									status: counter % 5 === 0 ? 'damaged' : 'good',
									inspectedAt: returnedAt || new Date(),
									inspectedBy: student._id,
									notes: counter % 5 === 0 ? 'Minor crack observed on handle' : 'Passed return inspection'
								}
								: status === 'missing'
									? {
										status: 'missing',
										inspectedAt: new Date(),
										inspectedBy: student._id,
										notes: 'Item not returned at due date'
									}
									: undefined
					}
				],
				purpose: 'Laboratory class practical session',
				borrowDate,
				returnDate,
				status,
				rejectReason: status === 'rejected' ? 'Incomplete request details' : undefined,
				rejectionNotes: status === 'rejected' ? 'Missing lab section endorsement' : undefined,
				approvedAt,
				rejectedAt: status === 'rejected' ? new Date(createdAt.getTime() + 4 * 60 * 60 * 1000) : undefined,
				releasedAt,
				pickedUpAt: releasedAt ? new Date(releasedAt.getTime() + 90 * 60 * 1000) : undefined,
				missingAt: status === 'missing' ? new Date(returnDate.getTime() + 12 * 60 * 60 * 1000) : undefined,
				returnedAt,
				createdAt,
				updatedAt: new Date(),
				createdBy: student._id,
				updatedBy: student._id,
				seedTag: SEED_TAG
			});
		}
	}

	return rows;
}

function buildReplacementObligations(borrowRequests) {
	const rows = [];
	const source = borrowRequests.filter((r) => {
		const inspection = r.items?.[0]?.inspection;
		return r.status === 'missing' || inspection?.status === 'damaged';
	});

	for (let i = 0; i < Math.min(8, source.length); i += 1) {
		const req = source[i];
		const isMissing = req.status === 'missing';
		const resolved = i % 3 !== 0;
		const resolutionType = resolved ? 'replacement' : undefined;

		rows.push({
			_id: new ObjectId(),
			borrowRequestId: req._id,
			studentId: req.studentId,
			itemId: req.items[0].itemId,
			itemName: req.items[0].name,
			itemCategory: req.items[0].category,
			quantity: req.items[0].quantity,
			type: isMissing ? 'missing' : 'damaged',
			status: resolved ? 'replaced' : 'pending',
			amount: req.items[0].quantity,
			amountPaid: resolved ? req.items[0].quantity : 0,
			resolutionType,
			resolutionDate: resolved ? daysAgo(i + 1) : undefined,
			resolutionNotes: resolved ? 'Resolved during scheduled reconciliation' : undefined,
			paymentReference: resolved ? `REP-2026-${String(2000 + i)}` : undefined,
			incidentDate: daysAgo(20 + i),
			incidentNotes: isMissing ? 'Missing item incident recorded' : 'Damaged item incident recorded',
			dueDate: daysAgo(-(5 + i)),
			createdAt: daysAgo(20 + i),
			updatedAt: daysAgo(i),
			createdBy: req.studentId,
			updatedBy: req.studentId,
			seedTag: SEED_TAG
		});
	}

	return rows;
}

function buildDonations(students, year, startSerial) {
	const donorNames = students.slice(0, 6).map((student) => `${student.firstName} ${student.lastName}`);
	const createdBy = students[0]?._id;

	return donorNames.map((donorName, index) => ({
		_id: new ObjectId(),
		receiptNumber: makeReceiptNumber(year, startSerial + index),
		donorName,
		itemName: `Sponsored Lab Supply ${index + 1}`,
		quantity: 10 + index * 2,
		unit: 'pcs',
		purpose: 'Academic laboratory support',
		date: daysAgo(180 - index * 12),
		notes: 'Recorded as presentation seed data',
		inventoryAction: 'add_to_existing',
		createdAt: daysAgo(180 - index * 12),
		updatedAt: daysAgo(180 - index * 12),
		createdBy,
		seedTag: SEED_TAG
	}));
}

function buildNotifications(borrowRequests, students) {
	const rows = [];
	const limitedRequests = borrowRequests.slice(0, 30);

	for (let i = 0; i < limitedRequests.length; i += 1) {
		const req = limitedRequests[i];
		const student = students.find((s) => s._id.equals(req.studentId));
		if (!student) continue;

		rows.push({
			_id: new ObjectId(),
			userId: student._id,
			audienceRole: 'student',
			type: req.status === 'returned' ? 'borrow_request_returned' : 'borrow_request_ready_for_pickup',
			title: req.status === 'returned' ? 'Return Successfully Logged' : 'Request Progress Updated',
			message:
				req.status === 'returned'
					? `Your request ${req._id.toString().slice(-6)} has been marked as returned.`
					: `Your request ${req._id.toString().slice(-6)} has a new processing update.`,
			link: '/student/requests',
			borrowRequestId: req._id,
			metadata: { seedTag: SEED_TAG, channel: 'student' },
			isRead: i % 4 === 0,
			readAt: i % 4 === 0 ? daysAgo(1) : undefined,
			createdAt: daysAgo(i % 5),
			updatedAt: daysAgo(i % 5),
			seedTag: SEED_TAG
		});
	}

	return rows;
}

function buildShortcutKeys() {
	return [];
}

async function buildRememberTokens(users) {
	const subset = users.slice(0, 10);
	const rows = [];
	for (let i = 0; i < subset.length; i += 1) {
		const selector = crypto.randomBytes(16).toString('hex');
		const validator = crypto.randomBytes(32).toString('hex');
		const tokenHash = await bcrypt.hash(validator, 10);
		const user = subset[i];
		rows.push({
			_id: new ObjectId(),
			userId: user._id,
			tokenHash,
			selector,
			deviceFingerprint: hashToken(`ua-${user._id.toString()}`),
			deviceName: i % 2 === 0 ? 'Windows PC' : 'Mobile Device',
			ipAddress: `203.177.10.${20 + i}`,
			lastUsedIp: `203.177.10.${20 + i}`,
			expiresAt: daysAgo(-(45 + i)),
			createdAt: daysAgo(10 + i),
			lastUsedAt: daysAgo(i % 3),
			isRevoked: false,
			seedTag: SEED_TAG
		});
	}
	return rows;
}

async function insertMany(db, collectionName, rows, execute) {
	if (!rows.length) return 0;
	if (!execute) return rows.length;
	const result = await db.collection(collectionName).insertMany(rows, { ordered: false });
	return result.insertedCount;
}

async function run() {
	const runtimeEnv = resolveRuntimeEnv();
	const execute = hasYesFlag();
	const uri = resolveMongoUri(runtimeEnv);
	const dbName = resolveDbName(uri);
	const client = new MongoClient(uri);

	console.log('Connecting to MongoDB...');

	try {
		await client.connect();
		const db = client.db(dbName);

		console.log(`Connected to database: ${dbName}`);
		console.log(`Seed mode: ${execute ? 'EXECUTE' : 'DRY-RUN'}`);
		console.log(`Seed tag: ${SEED_TAG}`);

		const passwordHash = await bcrypt.hash(DEFAULT_PASSWORD, 10);
		const people = buildPeople();
		const usersResult = await upsertUsers(db, people, passwordHash, execute);

		const users = usersResult.users;
		const students = pickRoleUsers(users, 'student');

		if (!students.length) {
			throw new Error('Seed requires at least one student user.');
		}

		const purgePreview = await purgeExistingSeedData(db, execute);

		const borrowRequests = buildBorrowRequests(students);
		const obligations = buildReplacementObligations(borrowRequests);
		const donationYear = new Date().getFullYear();
		const donationSerialStart = await getNextDonationSerialStart(db, donationYear);
		const donations = buildDonations(students, donationYear, donationSerialStart);
		const notifications = buildNotifications(borrowRequests, students);
		const shortcutKeys = buildShortcutKeys();
		const rememberTokens = await buildRememberTokens(users);

		const insertedBorrowRequests = await insertMany(db, COLLECTIONS.borrowRequests, borrowRequests, execute);
		const insertedObligations = await insertMany(db, COLLECTIONS.replacementObligations, obligations, execute);
		const insertedDonations = await insertMany(db, COLLECTIONS.donations, donations, execute);
		const insertedNotifications = await insertMany(db, COLLECTIONS.notifications, notifications, execute);
		const insertedShortcutKeys = await insertMany(db, COLLECTIONS.shortcutKeys, shortcutKeys, execute);
		const insertedRememberTokens = await insertMany(db, COLLECTIONS.rememberTokens, rememberTokens, execute);

		console.log('');
		console.log('Seed summary');
		console.log('------------');
		console.log(`Users upserted: ${usersResult.inserted + usersResult.updated}`);
		console.log(`- inserted: ${usersResult.inserted}`);
		console.log(`- updated:  ${usersResult.updated}`);
		console.log(`Previous seed borrow_requests removed: ${purgePreview.deleted.borrowRequests}`);
		console.log(`Previous seed replacement_obligations removed: ${purgePreview.deleted.replacementObligations}`);
		console.log(`Previous seed donations removed: ${purgePreview.deleted.donations}`);
		console.log(`Previous seed notifications removed: ${purgePreview.deleted.notifications}`);
		console.log(`Previous seed shortcut_keys removed: ${purgePreview.deleted.shortcutKeys}`);
		console.log(`Previous seed remember_tokens removed: ${purgePreview.deleted.rememberTokens}`);
		console.log(`Borrow requests seeded: ${insertedBorrowRequests}`);
		console.log(`Replacement obligations seeded: ${insertedObligations}`);
		console.log(`Donations seeded: ${insertedDonations}`);
		console.log(`Notifications seeded: ${insertedNotifications}`);
		console.log(`Shortcut keys seeded: ${insertedShortcutKeys}`);
		console.log(`Remember tokens seeded: ${insertedRememberTokens}`);
		console.log('Inventory items seeded: 0 (intentionally excluded)');
		console.log('');
		console.log(`Default password for newly inserted users: ${DEFAULT_PASSWORD}`);
		console.log('Note: existing seeded users keep their current password hash (not overwritten).');

		if (!execute) {
			console.log('');
			console.log('Dry-run only. No records were written.');
			console.log('Run with --yes to execute:');
			console.log('  node scripts/seed-demo-analytics-data.cjs --yes');
		}
	} finally {
		await client.close();
	}
}

run().catch((error) => {
	console.error('Seed failed:', error?.message || error);
	process.exitCode = 1;
});

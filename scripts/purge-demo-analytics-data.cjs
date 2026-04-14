/*
 * Purge full presentation seed data from non-inventory collections.
 *
 * Scope:
 * - users (enabled by default)
 * - borrow_requests
 * - replacement_obligations
 * - donations
 * - notifications
 * - shortcut_keys
 * - remember_tokens
 *
 * Excluded:
 * - inventory collections are untouched
 *
 * Safety:
 * - Deletes by seedTag only
 * - Dry-run by default
 *
 * Usage:
 *   node scripts/purge-demo-analytics-data.cjs
 *   node scripts/purge-demo-analytics-data.cjs --yes
 *   node scripts/purge-demo-analytics-data.cjs --yes --keep-users
 */

const fs = require('fs');
const path = require('path');
const { MongoClient } = require('mongodb');

const SEED_TAG = 'presentation-seed-v2';

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

function shouldKeepUsers() {
	return process.argv.includes('--keep-users');
}

async function run() {
	const runtimeEnv = resolveRuntimeEnv();
	const execute = hasYesFlag();
	const keepUsers = shouldKeepUsers();
	const includeUsers = !keepUsers;
	const uri = resolveMongoUri(runtimeEnv);
	const dbName = resolveDbName(uri);
	const client = new MongoClient(uri);

	console.log('Connecting to MongoDB...');

	try {
		await client.connect();
		const db = client.db(dbName);
		console.log(`Connected to database: ${dbName}`);
		console.log(`Purge mode: ${execute ? 'EXECUTE' : 'DRY-RUN'}`);
		console.log(`Seed tag: ${SEED_TAG}`);
		console.log(`Include users: ${includeUsers ? 'yes' : 'no (keep-users mode)'}`);

		const [users, borrowRequests, obligations, donations, notifications, shortcutKeys, rememberTokens] = await Promise.all([
			includeUsers ? db.collection(COLLECTIONS.users).countDocuments({ seedTag: SEED_TAG }) : Promise.resolve(0),
			db.collection(COLLECTIONS.borrowRequests).countDocuments({ seedTag: SEED_TAG }),
			db.collection(COLLECTIONS.replacementObligations).countDocuments({ seedTag: SEED_TAG }),
			db.collection(COLLECTIONS.donations).countDocuments({ seedTag: SEED_TAG }),
			db.collection(COLLECTIONS.notifications).countDocuments({ seedTag: SEED_TAG }),
			db.collection(COLLECTIONS.shortcutKeys).countDocuments({ seedTag: SEED_TAG }),
			db.collection(COLLECTIONS.rememberTokens).countDocuments({ seedTag: SEED_TAG })
		]);

		console.log('');
		console.log('Purge preview');
		console.log('------------');
		console.log(`users: ${users}`);
		console.log(`borrow_requests: ${borrowRequests}`);
		console.log(`replacement_obligations: ${obligations}`);
		console.log(`donations: ${donations}`);
		console.log(`notifications: ${notifications}`);
		console.log(`shortcut_keys: ${shortcutKeys}`);
		console.log(`remember_tokens: ${rememberTokens}`);

		if (!execute) {
			console.log('');
			console.log('Dry-run only. No records were deleted.');
			console.log('Run with --yes to execute full purge:');
			console.log('  node scripts/purge-demo-analytics-data.cjs --yes');
			console.log('Keep users while purging other seeded collections:');
			console.log('  node scripts/purge-demo-analytics-data.cjs --yes --keep-users');
			return;
		}

		const [delUsers, delBorrowRequests, delObligations, delDonations, delNotifications, delShortcutKeys, delRememberTokens] = await Promise.all([
			includeUsers ? db.collection(COLLECTIONS.users).deleteMany({ seedTag: SEED_TAG }) : Promise.resolve({ deletedCount: 0 }),
			db.collection(COLLECTIONS.borrowRequests).deleteMany({ seedTag: SEED_TAG }),
			db.collection(COLLECTIONS.replacementObligations).deleteMany({ seedTag: SEED_TAG }),
			db.collection(COLLECTIONS.donations).deleteMany({ seedTag: SEED_TAG }),
			db.collection(COLLECTIONS.notifications).deleteMany({ seedTag: SEED_TAG }),
			db.collection(COLLECTIONS.shortcutKeys).deleteMany({ seedTag: SEED_TAG }),
			db.collection(COLLECTIONS.rememberTokens).deleteMany({ seedTag: SEED_TAG })
		]);

		console.log('');
		console.log('Purge completed');
		console.log('------------');
		console.log(`users deleted: ${delUsers.deletedCount}`);
		console.log(`borrow_requests deleted: ${delBorrowRequests.deletedCount}`);
		console.log(`replacement_obligations deleted: ${delObligations.deletedCount}`);
		console.log(`donations deleted: ${delDonations.deletedCount}`);
		console.log(`notifications deleted: ${delNotifications.deletedCount}`);
		console.log(`shortcut_keys deleted: ${delShortcutKeys.deletedCount}`);
		console.log(`remember_tokens deleted: ${delRememberTokens.deletedCount}`);
	} finally {
		await client.close();
	}
}

run().catch((error) => {
	console.error('Purge failed:', error?.message || error);
	process.exitCode = 1;
});

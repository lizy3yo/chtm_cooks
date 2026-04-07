/*
 * Purge catalog and request data from MongoDB.
 *
 * What it removes:
 * - inventory_items (all catalog items)
 * - borrow_requests (all requests)
 * - replacement_obligations (request-linked obligations)
 * - request-related notifications
 *
 * Safety:
 * - Dry-run by default (no data is deleted)
 * - Requires --yes to execute deletions
 *
 * Usage:
 *   node scripts/purge-catalog-and-requests.cjs
 *   node scripts/purge-catalog-and-requests.cjs --yes
 */

const fs = require('fs');
const path = require('path');
const { MongoClient } = require('mongodb');

const COLLECTIONS = {
	inventoryItems: 'inventory_items',
	borrowRequests: 'borrow_requests',
	replacementObligations: 'replacement_obligations',
	notifications: 'notifications'
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

function resolveMongoUri() {
	if (process.env.MONGODB_URI) return process.env.MONGODB_URI;

	const envPath = path.join(process.cwd(), '.env');
	const envVars = parseEnvFile(envPath);
	if (envVars.MONGODB_URI) return envVars.MONGODB_URI;

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

function requestNotificationFilter() {
	return {
		$or: [
			{ borrowRequestId: { $exists: true } },
			{ type: { $regex: '^borrow_request_' } }
		]
	};
}

async function countTargets(db) {
	const [inventoryItems, borrowRequests, replacementObligations, requestNotifications] = await Promise.all([
		db.collection(COLLECTIONS.inventoryItems).countDocuments({}),
		db.collection(COLLECTIONS.borrowRequests).countDocuments({}),
		db.collection(COLLECTIONS.replacementObligations).countDocuments({}),
		db.collection(COLLECTIONS.notifications).countDocuments(requestNotificationFilter())
	]);

	return { inventoryItems, borrowRequests, replacementObligations, requestNotifications };
}

async function purge(db) {
	const [inventoryItems, borrowRequests, replacementObligations, requestNotifications] = await Promise.all([
		db.collection(COLLECTIONS.inventoryItems).deleteMany({}),
		db.collection(COLLECTIONS.borrowRequests).deleteMany({}),
		db.collection(COLLECTIONS.replacementObligations).deleteMany({}),
		db.collection(COLLECTIONS.notifications).deleteMany(requestNotificationFilter())
	]);

	return {
		inventoryItems: inventoryItems.deletedCount,
		borrowRequests: borrowRequests.deletedCount,
		replacementObligations: replacementObligations.deletedCount,
		requestNotifications: requestNotifications.deletedCount
	};
}

async function run() {
	const execute = hasYesFlag();
	const uri = resolveMongoUri();
	const dbName = resolveDbName(uri);
	const client = new MongoClient(uri);

	console.log('Connecting to MongoDB...');

	try {
		await client.connect();
		const db = client.db(dbName);
		console.log(`Connected to database: ${dbName}`);

		const preview = await countTargets(db);
		console.log('');
		console.log('Purge preview:');
		console.log(`- ${COLLECTIONS.inventoryItems}: ${preview.inventoryItems}`);
		console.log(`- ${COLLECTIONS.borrowRequests}: ${preview.borrowRequests}`);
		console.log(`- ${COLLECTIONS.replacementObligations}: ${preview.replacementObligations}`);
		console.log(`- ${COLLECTIONS.notifications} (request-related): ${preview.requestNotifications}`);

		if (!execute) {
			console.log('');
			console.log('Dry-run only. No records were deleted.');
			console.log('Run with --yes to execute:');
			console.log('  node scripts/purge-catalog-and-requests.cjs --yes');
			return;
		}

		console.log('');
		console.log('Executing purge...');
		const deleted = await purge(db);

		console.log('');
		console.log('Purge completed successfully. Deleted documents:');
		console.log(`- ${COLLECTIONS.inventoryItems}: ${deleted.inventoryItems}`);
		console.log(`- ${COLLECTIONS.borrowRequests}: ${deleted.borrowRequests}`);
		console.log(`- ${COLLECTIONS.replacementObligations}: ${deleted.replacementObligations}`);
		console.log(`- ${COLLECTIONS.notifications} (request-related): ${deleted.requestNotifications}`);
	} finally {
		await client.close();
		console.log('MongoDB connection closed.');
	}
}

run().catch((error) => {
	console.error('Purge script failed:', error.message);
	process.exit(1);
});

/*
 * Purge catalog and request data from MongoDB.
 *
 * What it removes:
 * - inventory_items (all catalog items)
 * - inventory_categories (all catalog categories)
 * - inventory_deleted (soft-deleted catalog snapshots)
 * - inventory_history (catalog audit trail)
 * - borrow_requests (all requests)
 * - replacement_obligations (request-linked obligations)
 * - request-related notifications
 * - Cloudinary images referenced by catalog records
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
const { v2: cloudinary } = require('cloudinary');

const COLLECTIONS = {
	inventoryItems: 'inventory_items',
	inventoryCategories: 'inventory_categories',
	inventoryDeleted: 'inventory_deleted',
	inventoryHistory: 'inventory_history',
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

function requestNotificationFilter() {
	return {
		$or: [
			{ borrowRequestId: { $exists: true } },
			{ type: { $regex: '^borrow_request_' } }
		]
	};
}

function isCloudinaryUrl(value) {
	return typeof value === 'string' && value.includes('res.cloudinary.com') && value.includes('/upload/');
}

function toCloudinaryPublicId(value) {
	if (typeof value !== 'string' || !value.trim()) return null;

	if (!isCloudinaryUrl(value)) {
		if (value.startsWith('http://') || value.startsWith('https://') || value.startsWith('/')) {
			return null;
		}

		return value;
	}

	try {
		const url = new URL(value);
		const segments = url.pathname.split('/').filter(Boolean);
		const uploadIndex = segments.indexOf('upload');

		if (uploadIndex === -1 || uploadIndex >= segments.length - 1) {
			return null;
		}

		let publicSegments = segments.slice(uploadIndex + 1);
		const versionIndex = publicSegments.findIndex((segment) => /^v\d+$/.test(segment));
		if (versionIndex !== -1) {
			publicSegments = publicSegments.slice(versionIndex + 1);
		}

		if (!publicSegments.length) {
			return null;
		}

		const lastSegment = publicSegments[publicSegments.length - 1];
		publicSegments[publicSegments.length - 1] = lastSegment.replace(/\.[^.\/]+$/, '');

		const publicId = publicSegments.join('/').trim();
		return publicId || null;
	} catch {
		return null;
	}
}

function collectPicturesFromDocuments(documents, accessor) {
	const pictures = [];

	for (const document of documents) {
		const picture = accessor(document);
		if (picture) pictures.push(picture);
	}

	return pictures;
}

function uniquePictures(pictures) {
	return [...new Set(pictures.map((picture) => toCloudinaryPublicId(picture)).filter(Boolean))];
}

async function collectTargets(db) {
	const [
		inventoryItems,
		inventoryCategories,
		inventoryDeleted,
		inventoryHistory,
		borrowRequests,
		replacementObligations,
		requestNotifications
	] = await Promise.all([
		db.collection(COLLECTIONS.inventoryItems).countDocuments({}),
		db.collection(COLLECTIONS.inventoryCategories).countDocuments({}),
		db.collection(COLLECTIONS.inventoryDeleted).countDocuments({}),
		db.collection(COLLECTIONS.inventoryHistory).countDocuments({}),
		db.collection(COLLECTIONS.borrowRequests).countDocuments({}),
		db.collection(COLLECTIONS.replacementObligations).countDocuments({}),
		db.collection(COLLECTIONS.notifications).countDocuments(requestNotificationFilter())
	]);

	const [liveItems, liveCategories, deletedSnapshots] = await Promise.all([
		db.collection(COLLECTIONS.inventoryItems).find({}, { projection: { picture: 1 } }).toArray(),
		db.collection(COLLECTIONS.inventoryCategories).find({}, { projection: { picture: 1 } }).toArray(),
		db.collection(COLLECTIONS.inventoryDeleted).find({}, { projection: { 'itemData.picture': 1, 'categoryData.picture': 1 } }).toArray()
	]);

	const catalogPictures = uniquePictures([
		...collectPicturesFromDocuments(liveItems, (document) => document.picture),
		...collectPicturesFromDocuments(liveCategories, (document) => document.picture),
		...collectPicturesFromDocuments(deletedSnapshots, (document) => document.itemData?.picture),
		...collectPicturesFromDocuments(deletedSnapshots, (document) => document.categoryData?.picture)
	]);

	return {
		inventoryItems,
		inventoryCategories,
		inventoryDeleted,
		inventoryHistory,
		borrowRequests,
		replacementObligations,
		requestNotifications,
		catalogPictures
	};
}

async function deleteCloudinaryPictures(publicIds, runtimeEnv) {
	if (!publicIds.length) {
		return { deleted: 0, failed: [] };
	}

	if (!runtimeEnv.CLOUDINARY_CLOUD_NAME || !runtimeEnv.CLOUDINARY_API_KEY || !runtimeEnv.CLOUDINARY_API_SECRET) {
		throw new Error('Cloudinary credentials are required to delete catalog images. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET.');
	}

	cloudinary.config({
		cloud_name: runtimeEnv.CLOUDINARY_CLOUD_NAME,
		api_key: runtimeEnv.CLOUDINARY_API_KEY,
		api_secret: runtimeEnv.CLOUDINARY_API_SECRET,
		secure: true
	});

	const failed = [];
	let deleted = 0;

	for (const publicId of publicIds) {
		try {
			const result = await cloudinary.uploader.destroy(publicId, {
				resource_type: 'image',
				invalidate: true
			});

			if (result?.result === 'ok' || result?.result === 'not found') {
				deleted += 1;
			} else {
				failed.push({ publicId, result: result?.result || 'unknown' });
			}
		} catch (error) {
			failed.push({ publicId, error: error.message });
		}
	}

	return { deleted, failed };
}

async function purge(db) {
	const [inventoryItems, inventoryCategories, inventoryDeleted, inventoryHistory, borrowRequests, replacementObligations, requestNotifications] = await Promise.all([
		db.collection(COLLECTIONS.inventoryItems).deleteMany({}),
		db.collection(COLLECTIONS.inventoryCategories).deleteMany({}),
		db.collection(COLLECTIONS.inventoryDeleted).deleteMany({}),
		db.collection(COLLECTIONS.inventoryHistory).deleteMany({}),
		db.collection(COLLECTIONS.borrowRequests).deleteMany({}),
		db.collection(COLLECTIONS.replacementObligations).deleteMany({}),
		db.collection(COLLECTIONS.notifications).deleteMany(requestNotificationFilter())
	]);

	return {
		inventoryItems: inventoryItems.deletedCount,
		inventoryCategories: inventoryCategories.deletedCount,
		inventoryDeleted: inventoryDeleted.deletedCount,
		inventoryHistory: inventoryHistory.deletedCount,
		borrowRequests: borrowRequests.deletedCount,
		replacementObligations: replacementObligations.deletedCount,
		requestNotifications: requestNotifications.deletedCount
	};
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

		const preview = await collectTargets(db);
		console.log('');
		console.log('Purge preview:');
		console.log(`- ${COLLECTIONS.inventoryItems}: ${preview.inventoryItems}`);
		console.log(`- ${COLLECTIONS.inventoryCategories}: ${preview.inventoryCategories}`);
		console.log(`- ${COLLECTIONS.inventoryDeleted}: ${preview.inventoryDeleted}`);
		console.log(`- ${COLLECTIONS.inventoryHistory}: ${preview.inventoryHistory}`);
		console.log(`- ${COLLECTIONS.borrowRequests}: ${preview.borrowRequests}`);
		console.log(`- ${COLLECTIONS.replacementObligations}: ${preview.replacementObligations}`);
		console.log(`- ${COLLECTIONS.notifications} (request-related): ${preview.requestNotifications}`);
		console.log(`- Cloudinary catalog images: ${preview.catalogPictures.length}`);

		if (!execute) {
			console.log('');
			console.log('Dry-run only. No records were deleted.');
			console.log('Run with --yes to execute:');
			console.log('  node scripts/purge-catalog-and-requests.cjs --yes');
			return;
		}

		if (
			preview.catalogPictures.length &&
			(!runtimeEnv.CLOUDINARY_CLOUD_NAME || !runtimeEnv.CLOUDINARY_API_KEY || !runtimeEnv.CLOUDINARY_API_SECRET)
		) {
			throw new Error('Cloudinary credentials are missing. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET before running the purge.');
		}

		console.log('');
		console.log('Deleting Cloudinary catalog images...');
		const cloudinaryDeletion = await deleteCloudinaryPictures(preview.catalogPictures, runtimeEnv);

		console.log('Executing purge...');
		const deleted = await purge(db);

		console.log('');
		console.log('Purge completed successfully. Deleted documents:');
		console.log(`- ${COLLECTIONS.inventoryItems}: ${deleted.inventoryItems}`);
		console.log(`- ${COLLECTIONS.inventoryCategories}: ${deleted.inventoryCategories}`);
		console.log(`- ${COLLECTIONS.inventoryDeleted}: ${deleted.inventoryDeleted}`);
		console.log(`- ${COLLECTIONS.inventoryHistory}: ${deleted.inventoryHistory}`);
		console.log(`- ${COLLECTIONS.borrowRequests}: ${deleted.borrowRequests}`);
		console.log(`- ${COLLECTIONS.replacementObligations}: ${deleted.replacementObligations}`);
		console.log(`- ${COLLECTIONS.notifications} (request-related): ${deleted.requestNotifications}`);
		console.log(`- Cloudinary catalog images deleted: ${cloudinaryDeletion.deleted}`);

		if (cloudinaryDeletion.failed.length) {
			console.log('');
			console.log('Some Cloudinary deletions failed:');
			for (const failure of cloudinaryDeletion.failed) {
				console.log(`- ${failure.publicId}: ${failure.error || failure.result}`);
			}
			throw new Error('Purge completed with Cloudinary deletion failures.');
		}
	} finally {
		await client.close();
		console.log('MongoDB connection closed.');
	}
}

run().catch((error) => {
	console.error('Purge script failed:', error.message);
	process.exit(1);
});

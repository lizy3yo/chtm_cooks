import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDatabase } from '$lib/server/db/mongodb';
import { EJSON } from 'bson';

export const POST: RequestHandler = async (event) => {
	// Auth check
	if (!event.locals.user || event.locals.user.role !== 'superadmin') {
		return json({ error: 'Unauthorized' }, { status: 403 });
	}

	try {
		const data = await event.request.formData();
		const file = data.get('backup') as File;
		if (!file) {
			return json({ error: 'No backup file provided' }, { status: 400 });
		}

		const content = await file.text();
		
		// Parse using EJSON to restore ObjectIds, Dates, etc.
		const backupData = EJSON.parse(content) as Record<string, any[]>;

		const db = await getDatabase();

		// Start restoration process
		for (const [collectionName, documents] of Object.entries(backupData)) {
			// Validate collection name to prevent injection
			if (collectionName.startsWith('system.')) continue;

			const collection = db.collection(collectionName);
			
			// Drop/clear existing documents in this collection
			await collection.deleteMany({});

			// Insert documents if there are any
			if (documents.length > 0) {
				await collection.insertMany(documents);
			}
		}

		return json({
			status: 'ok',
			message: 'Database successfully restored',
			timestamp: new Date().toISOString()
		});
	} catch (error: any) {
		return json(
			{
				status: 'error',
				message: error.message || 'Failed to restore database',
				timestamp: new Date().toISOString()
			},
			{ status: 500 }
		);
	}
};

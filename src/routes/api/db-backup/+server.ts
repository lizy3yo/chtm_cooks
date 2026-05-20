import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDatabase } from '$lib/server/db/mongodb';
import { EJSON } from 'bson';

export const GET: RequestHandler = async (event) => {
	// Auth check
	if (!event.locals.user || event.locals.user.role !== 'superadmin') {
		return json({ error: 'Unauthorized' }, { status: 403 });
	}

	try {
		const db = await getDatabase();
		const collections = await db.listCollections().toArray();
		const backup: Record<string, any[]> = {};

		for (const col of collections) {
			// Skip system collections
			if (col.name.startsWith('system.')) continue;
			
			const documents = await db.collection(col.name).find({}).toArray();
			backup[col.name] = documents;
		}

		// Use EJSON to preserve types like ObjectId and Date
		const serialized = EJSON.stringify(backup, undefined, 2);

		return new Response(serialized, {
			headers: {
				'Content-Type': 'application/json',
				'Content-Disposition': `attachment; filename=chtm_cooks_db_backup_${new Date().toISOString().split('T')[0]}.json`
			}
		});
	} catch (error: any) {
		return json(
			{
				status: 'error',
				message: error.message || 'Failed to export database',
				timestamp: new Date().toISOString()
			},
			{ status: 500 }
		);
	}
};

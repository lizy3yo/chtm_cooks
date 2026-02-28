import { MongoClient, type Db } from 'mongodb';
import { MONGODB_URI } from '$env/static/private';

let client: MongoClient | null = null;
let db: Db | null = null;

export async function getDatabase(): Promise<Db> {
	if (db) {
		return db;
	}

	try {
		client = new MongoClient(MONGODB_URI);
		await client.connect();
		
		// Extract database name from URI or use default
		const dbName = MONGODB_URI.split('/').pop()?.split('?')[0] || 'chtm-cooks';
		db = client.db(dbName);
		
		console.log('MongoDB connected successfully to database:', dbName);
		return db;
	} catch (error) {
		console.error('MongoDB connection error:', error);
		throw error;
	}
}

export async function closeDatabase(): Promise<void> {
	if (client) {
		await client.close();
		client = null;
		db = null;
	}
}

import { MongoClient, type Db } from 'mongodb';
import { MONGODB_URI } from '$env/static/private';

let client: MongoClient | null = null;
let db: Db | null = null;
let connectPromise: Promise<Db> | null = null;

export async function getDatabase(): Promise<Db> {
	if (db) {
		return db;
	}

	if (connectPromise) {
		return connectPromise;
	}

	connectPromise = (async () => {
		try {
			client = new MongoClient(MONGODB_URI, {
				maxPoolSize: 30,
				minPoolSize: 5,
				connectTimeoutMS: 10000,
				serverSelectionTimeoutMS: 10000
			});
			await client.connect();

			// Extract database name from URI or use default
			const dbName = MONGODB_URI.split('/').pop()?.split('?')[0] || 'chtm-cooks';
			db = client.db(dbName);

			console.log('MongoDB connected successfully to database:', dbName);
			return db;
		} catch (error) {
			console.error('MongoDB connection error:', error);
			client = null;
			db = null;
			throw error;
		} finally {
			connectPromise = null;
		}
	})();

	return connectPromise;
}

export async function closeDatabase(): Promise<void> {
	if (client) {
		await client.close();
		client = null;
		db = null;
	}
}

/**
 * Script to rebuild the inventory_categories name index
 * This drops the old unique index and creates a new one with partial filter
 * 
 * Run with: node rebuild-category-index.js
 */

const { MongoClient } = require('mongodb');
const fs = require('fs');
const path = require('path');

// Read MONGODB_URI from .env file
let MONGODB_URI = 'mongodb://localhost:27017/chtm_cooks';
let DB_NAME = 'chtm_cooks';

try {
	const envPath = path.join(__dirname, '.env');
	if (fs.existsSync(envPath)) {
		const envContent = fs.readFileSync(envPath, 'utf8');
		const match = envContent.match(/MONGODB_URI=(.+)/);
		if (match) {
			MONGODB_URI = match[1].trim();
			
			// Extract database name from URI or default to 'chtm_cooks'
			const uriMatch = MONGODB_URI.match(/\.net\/([^?]+)/);
			if (uriMatch && uriMatch[1]) {
				DB_NAME = uriMatch[1];
			}
			
			// If no database in URI, append it for MongoDB Atlas
			if (MONGODB_URI.includes('mongodb+srv') && !MONGODB_URI.match(/\.net\/[^?]+/)) {
				MONGODB_URI = MONGODB_URI.replace(/\/$/, '') + '/chtm_cooks';
				DB_NAME = 'chtm_cooks';
			}
		}
	}
} catch (error) {
	console.log('Note: Could not read .env file, using default connection');
}

console.log(`Connecting to database: ${DB_NAME}`);

async function rebuildCategoryIndex() {
	const client = new MongoClient(MONGODB_URI);

	try {
		await client.connect();
		console.log('Connected to MongoDB');

		const db = client.db(DB_NAME);
		const collection = db.collection('inventory_categories');

		// Step 1: Check if collection exists
		const collections = await db.listCollections({ name: 'inventory_categories' }).toArray();
		const collectionExists = collections.length > 0;

		if (!collectionExists) {
			console.log('\n⚠️  Collection "inventory_categories" does not exist yet.');
			console.log('This is normal for a new database.');
			console.log('\nThe index definition has been updated in the code.');
			console.log('When you create your first category, the index will be created automatically.');
			console.log('\n✅ No action needed - the fix is ready!');
			await client.close();
			return;
		}

		// Step 1: List existing indexes
		console.log('\n1. Current indexes:');
		const indexes = await collection.indexes();
		indexes.forEach(idx => {
			console.log(`   - ${idx.name}: ${JSON.stringify(idx.key)}`);
		});

		// Step 2: Drop the old unique index if it exists
		const oldIndexName = 'idx_inventory_categories_name_unique';
		const hasOldIndex = indexes.some(idx => idx.name === oldIndexName);

		if (hasOldIndex) {
			console.log(`\n2. Dropping old index: ${oldIndexName}`);
			await collection.dropIndex(oldIndexName);
			console.log('   ✓ Old index dropped');
		} else {
			console.log(`\n2. Old index not found: ${oldIndexName}`);
		}

		// Step 3: Create new partial unique index
		console.log('\n3. Creating new partial unique index...');
		await collection.createIndex(
			{ name: 1 },
			{
				name: oldIndexName,
				unique: true,
				collation: {
					locale: 'en',
					strength: 2 // Case-insensitive
				},
				partialFilterExpression: {
					archived: false // Only enforce uniqueness for active categories
				}
			}
		);
		console.log('   ✓ New partial unique index created');

		// Step 4: Verify
		console.log('\n4. Updated indexes:');
		const updatedIndexes = await collection.indexes();
		updatedIndexes.forEach(idx => {
			if (idx.name === oldIndexName) {
				console.log(`   - ${idx.name}:`);
				console.log(`     Key: ${JSON.stringify(idx.key)}`);
				console.log(`     Unique: ${idx.unique}`);
				console.log(`     Partial Filter: ${JSON.stringify(idx.partialFilterExpression || 'none')}`);
			}
		});

		console.log('\n✅ Index rebuild completed successfully!');
		console.log('\nYou can now:');
		console.log('  1. Create a category (e.g., "Test Category")');
		console.log('  2. Delete/archive it');
		console.log('  3. Create another category with the same name - it will reuse the archived one');

	} catch (error) {
		console.error('\n❌ Error rebuilding index:', error.message);
		console.error('\nFull error:', error);
		process.exit(1);
	} finally {
		await client.close();
		console.log('\nConnection closed');
	}
}

// Run the script
rebuildCategoryIndex()
	.then(() => {
		console.log('\n✨ All done!');
		process.exit(0);
	})
	.catch(error => {
		console.error('\n💥 Fatal error:', error);
		process.exit(1);
	});

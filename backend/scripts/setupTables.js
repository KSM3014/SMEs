import sequelize from '../config/database.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function setupTables() {
  try {
    console.log('📊 Setting up database tables...\n');

    // Read SQL files
    const myApisSchema = fs.readFileSync(
      path.join(__dirname, '../database/schema_my_apis.sql'),
      'utf8'
    );

    const collectionLogsSchema = fs.readFileSync(
      path.join(__dirname, '../database/schema_collection_logs.sql'),
      'utf8'
    );

    // Execute my_apis schema
    console.log('[1/2] Creating my_apis table...');
    await sequelize.query(myApisSchema);
    console.log('✅ my_apis table created');

    // Execute collection_logs schema
    console.log('[2/2] Creating collection_logs table...');
    await sequelize.query(collectionLogsSchema);
    console.log('✅ collection_logs table created');

    // Verify tables
    const [tables] = await sequelize.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name
    `);

    console.log('\n📋 Current tables:');
    tables.forEach(t => console.log(`  - ${t.table_name}`));

    console.log('\n✅ Database setup complete!');
    process.exit(0);

  } catch (error) {
    console.error('❌ Setup failed:', error.message);
    process.exit(1);
  }
}

setupTables();

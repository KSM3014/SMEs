#!/usr/bin/env node
/**
 * Make api_key column nullable in my_apis table
 */

import sequelize from '../config/database.js';

async function main() {
  try {
    console.log('Updating my_apis table schema...');

    // Make api_key nullable
    await sequelize.query(`
      ALTER TABLE my_apis
      ALTER COLUMN api_key DROP NOT NULL
    `);

    console.log('✅ api_key column is now nullable');

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    process.exit(0);
  }
}

main();

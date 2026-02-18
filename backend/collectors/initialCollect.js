import dotenv from 'dotenv';
import { initializeDatabase } from '../config/database.js';
import sessionManager from '../services/sessionManager.js';
import authApiCollector from './authApiCollector.js';
import publicApiCollector from './publicApiCollector.js';

dotenv.config();

/**
 * Initial Collection Script
 * Run once to populate the database with all APIs
 *
 * Usage: npm run collect:init
 */

async function runInitialCollection() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  SME Investor Service - Initial API Collection');
  console.log('═══════════════════════════════════════════════════════════\n');

  const startTime = Date.now();

  try {
    // Step 1: Initialize database
    console.log('[Step 1/4] Initializing database connection...');
    await initializeDatabase();
    console.log('✅ Database ready\n');

    // Step 2: Initialize session pool
    console.log('[Step 2/4] Initializing session pool...');
    const poolStatus = await sessionManager.initializePool();
    console.log(`✅ Session pool ready: ${poolStatus.successful}/${poolStatus.total} sessions active\n`);

    // Step 3: Collect My APIs (96 authenticated APIs)
    console.log('[Step 3/4] Collecting My APIs (96 authenticated APIs)...');
    console.log('This will use the session pool to access data.go.kr My Page\n');

    const myApiResult = await authApiCollector.collectAllMyApis();

    console.log('\n✅ My APIs Collection Complete:');
    console.log(`   Total extracted: ${myApiResult.total}`);
    console.log(`   Successfully saved: ${myApiResult.inserted}`);
    console.log(`   Errors: ${myApiResult.errors.length}`);
    console.log(`   Duration: ${(myApiResult.duration / 1000).toFixed(2)}s\n`);

    // Step 4: Collect Public APIs (11,992 open APIs)
    console.log('[Step 4/4] Collecting Public APIs (11,992 open APIs)...');
    console.log('This will take approximately 20-40 minutes depending on network speed\n');

    const publicApiResult = await publicApiCollector.collectAllPublicApis();

    console.log('\n✅ Public APIs Collection Complete:');
    console.log(`   Total extracted: ${publicApiResult.total}`);
    console.log(`   Successfully saved: ${publicApiResult.inserted}`);
    console.log(`   Errors: ${publicApiResult.errors.length}`);
    console.log(`   Duration: ${(publicApiResult.duration / 1000 / 60).toFixed(2)} minutes\n`);

    // Summary
    const totalDuration = Date.now() - startTime;

    console.log('═══════════════════════════════════════════════════════════');
    console.log('  COLLECTION SUMMARY');
    console.log('═══════════════════════════════════════════════════════════');
    console.log(`Total My APIs:        ${myApiResult.inserted}`);
    console.log(`Total Public APIs:    ${publicApiResult.inserted}`);
    console.log(`Grand Total:          ${myApiResult.inserted + publicApiResult.inserted}`);
    console.log(`Total Duration:       ${(totalDuration / 1000 / 60).toFixed(2)} minutes`);
    console.log(`Session Pool Status:  ${poolStatus.successful} active sessions`);
    console.log('═══════════════════════════════════════════════════════════\n');

    // Cleanup
    console.log('[Cleanup] Shutting down session pool...');
    await sessionManager.shutdown();
    console.log('✅ Session pool shutdown complete\n');

    console.log('🎉 Initial collection completed successfully!');
    console.log('You can now start the main server with: npm start\n');

    process.exit(0);

  } catch (error) {
    console.error('\n❌ Initial collection failed:', error.message);
    console.error('Stack trace:', error.stack);

    // Cleanup on error
    try {
      await sessionManager.shutdown();
    } catch (cleanupError) {
      console.error('Cleanup error:', cleanupError.message);
    }

    process.exit(1);
  }
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runInitialCollection();
}

export default runInitialCollection;

/**
 * Batch Company Data Collection
 * Iterates a list of companies and calls apiOrchestrator → entityPersistence for each.
 *
 * Usage:
 *   node scripts/batch_collect_companies.js                         # companies 테이블에서
 *   node scripts/batch_collect_companies.js --source csv:list.csv   # CSV 파일에서
 *   node scripts/batch_collect_companies.js --limit 10              # 최대 10개
 *   node scripts/batch_collect_companies.js --resume                # 이미 처리된 건 스킵
 *   node scripts/batch_collect_companies.js --concurrency 2         # 동시 처리 수
 *   node scripts/batch_collect_companies.js --delay 3000            # 배치 간 딜레이(ms)
 *   node scripts/batch_collect_companies.js --dry-run               # 카운트만 확인
 */

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { Sequelize } from 'sequelize';
import dotenv from 'dotenv';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '../.env') });

// Dynamic imports (ESM)
const { default: apiOrchestrator } = await import('../services/apiOrchestrator.js');
const { persistCompanyResult } = await import('../services/entityPersistence.js');

// === CLI Args ===
const args = process.argv.slice(2);
const getArg = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; };
const hasFlag = (name) => args.includes(name);

const sourceArg = getArg('--source') || 'companies';
const limitArg = getArg('--limit');
const concurrency = parseInt(getArg('--concurrency') || '3', 10);
const delayMs = parseInt(getArg('--delay') || '2000', 10);
const isResume = hasFlag('--resume');
const isDryRun = hasFlag('--dry-run');

// === DB ===
const sequelize = new Sequelize(
  process.env.DB_NAME || 'sme_investor',
  process.env.DB_USER || 'postgres',
  process.env.DB_PASSWORD,
  { host: 'localhost', port: 5432, dialect: 'postgres', logging: false }
);

// === Load company list ===
async function loadCompanyList() {
  if (sourceArg.startsWith('csv:')) {
    const csvPath = resolve(process.cwd(), sourceArg.slice(4));
    const content = readFileSync(csvPath, 'utf8');
    return content.split('\n')
      .map(line => line.trim().replace(/[-\s]/g, ''))
      .filter(brno => /^\d{10}$/.test(brno));
  }

  // Default: read from companies table
  const [rows] = await sequelize.query(`
    SELECT DISTINCT business_number
    FROM companies
    WHERE business_number IS NOT NULL AND business_number != ''
    ORDER BY last_updated ASC NULLS FIRST
  `);
  return rows.map(r => r.business_number).filter(Boolean);
}

// === Get already-processed brno set (for --resume) ===
async function getProcessedBrnos() {
  const [rows] = await sequelize.query(`SELECT DISTINCT brno FROM entity_registry WHERE brno IS NOT NULL`);
  return new Set(rows.map(r => r.brno));
}

// === Batch log ===
async function createBatchLog(batchId, inputSource, totalCompanies) {
  await sequelize.query(`
    INSERT INTO batch_collection_log (batch_id, input_source, total_companies, status)
    VALUES ($1, $2, $3, 'running')
    ON CONFLICT (batch_id) DO UPDATE SET status = 'running', started_at = NOW()
  `, { bind: [batchId, inputSource, totalCompanies] });
}

async function updateBatchLog(batchId, processed, succeeded, failed, status = 'running') {
  await sequelize.query(`
    UPDATE batch_collection_log
    SET processed = $2, succeeded = $3, failed = $4, status = $5,
        completed_at = CASE WHEN $5 IN ('complete','error') THEN NOW() ELSE NULL END
    WHERE batch_id = $1
  `, { bind: [batchId, processed, succeeded, failed, status] });
}

// === Process one company ===
async function processCompany(brno, batchId) {
  const result = await apiOrchestrator.searchCompany({ brno, crno: null, companyName: null });
  const saved = await persistCompanyResult(result, { batchId });
  return {
    brno,
    entityCount: result.entities.length,
    name: result.entities[0]?.canonicalName || 'unknown',
    apiSucceeded: result.meta.apisSucceeded,
    apisAttempted: result.meta.apisAttempted,
    ...saved
  };
}

// === Main ===
async function main() {
  await sequelize.authenticate();
  console.log('[DB] Connected');

  const now = new Date();
  const batchId = `batch_${now.toISOString().replace(/[-:T]/g, '').slice(0, 14)}`;

  console.log(`\n=== Batch Company Collection ===`);
  console.log(`  Source: ${sourceArg}`);
  console.log(`  Batch ID: ${batchId}`);
  console.log(`  Concurrency: ${concurrency}`);
  console.log(`  Delay: ${delayMs}ms`);

  // Load company list
  let companies = await loadCompanyList();
  console.log(`  Total companies: ${companies.length}`);

  // Resume: skip already-processed
  if (isResume) {
    const processed = await getProcessedBrnos();
    const before = companies.length;
    companies = companies.filter(brno => !processed.has(brno));
    console.log(`  Resume: skipping ${before - companies.length} already-processed`);
  }

  // Apply limit
  if (limitArg) {
    companies = companies.slice(0, parseInt(limitArg, 10));
    console.log(`  Limit: ${companies.length}`);
  }

  if (isDryRun) {
    console.log(`\n[Dry Run] Would process ${companies.length} companies`);
    companies.slice(0, 10).forEach(b => console.log(`  - ${b}`));
    if (companies.length > 10) console.log(`  ... and ${companies.length - 10} more`);
    await sequelize.close();
    return;
  }

  if (companies.length === 0) {
    console.log('\n[Done] No companies to process');
    await sequelize.close();
    return;
  }

  await createBatchLog(batchId, sourceArg, companies.length);

  let processed = 0;
  let succeeded = 0;
  let failed = 0;
  let consecutiveErrors = 0;
  const startTime = Date.now();
  const errors = [];

  console.log(`\n[Start] Processing ${companies.length} companies...\n`);

  for (let i = 0; i < companies.length; i += concurrency) {
    const batch = companies.slice(i, i + concurrency);

    const results = await Promise.allSettled(
      batch.map(brno => processCompany(brno, batchId))
    );

    for (const result of results) {
      processed++;
      if (result.status === 'fulfilled') {
        const r = result.value;
        succeeded++;
        consecutiveErrors = 0;
        console.log(
          `  [${processed}/${companies.length}] ${r.brno} → ${r.name} ` +
          `(${r.apiSucceeded}/${r.apisAttempted} APIs, ${r.entitiesSaved} entities, ${r.sourcesSaved} sources)`
        );
      } else {
        failed++;
        consecutiveErrors++;
        const brno = batch[results.indexOf(result)] || '?';
        const errMsg = result.reason?.message || 'unknown error';
        console.error(`  [${processed}/${companies.length}] ${brno} FAILED: ${errMsg}`);
        errors.push({ brno, error: errMsg, timestamp: new Date().toISOString() });
      }
    }

    // Progress update every batch
    await updateBatchLog(batchId, processed, succeeded, failed);

    // Check consecutive errors
    if (consecutiveErrors >= 10) {
      console.error('\n[Fatal] 10 consecutive errors, stopping batch');
      await updateBatchLog(batchId, processed, succeeded, failed, 'error');
      break;
    }

    // Delay between batches
    if (i + concurrency < companies.length) {
      await new Promise(r => setTimeout(r, delayMs));
    }

    // ETA logging every 10 companies
    if (processed % 10 === 0 && processed > 0) {
      const elapsed = (Date.now() - startTime) / 1000;
      const rate = processed / elapsed;
      const remaining = (companies.length - processed) / rate;
      console.log(
        `\n  --- Progress: ${processed}/${companies.length} (${((processed/companies.length)*100).toFixed(1)}%) | ` +
        `${succeeded} OK, ${failed} FAIL | ETA: ${Math.ceil(remaining / 60)}min ---\n`
      );
    }
  }

  // Final update
  const finalStatus = consecutiveErrors >= 10 ? 'error' : 'complete';
  await updateBatchLog(batchId, processed, succeeded, failed, finalStatus);

  if (errors.length > 0) {
    await sequelize.query(`
      UPDATE batch_collection_log SET error_log = $2::jsonb WHERE batch_id = $1
    `, { bind: [batchId, JSON.stringify(errors)] });
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n=== Batch Complete ===`);
  console.log(`  Batch ID: ${batchId}`);
  console.log(`  Processed: ${processed}`);
  console.log(`  Succeeded: ${succeeded}`);
  console.log(`  Failed: ${failed}`);
  console.log(`  Duration: ${elapsed}s`);

  // Show DB counts
  const [[{ entity_count }]] = await sequelize.query('SELECT COUNT(*) as entity_count FROM entity_registry');
  const [[{ source_count }]] = await sequelize.query('SELECT COUNT(*) as source_count FROM entity_source_data');
  const [[{ conflict_count }]] = await sequelize.query('SELECT COUNT(*) as conflict_count FROM source_crosscheck WHERE is_conflict = TRUE');
  console.log(`\n  DB totals:`);
  console.log(`    entity_registry: ${entity_count} entities`);
  console.log(`    entity_source_data: ${source_count} source records`);
  console.log(`    source_crosscheck: ${conflict_count} conflicts`);

  await sequelize.close();
}

main().catch(err => {
  console.error('[Fatal]', err);
  process.exit(1);
});

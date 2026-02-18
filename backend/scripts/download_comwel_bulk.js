/**
 * 근로복지공단 고용산재보험 Bulk Download Script
 *
 * Downloads 6.3M records from getGySjBoheomBsshItem API (XML only)
 * into PostgreSQL bulk_comwel_insurance table, indexed by saeopjaDrno (BRN).
 *
 * Usage:
 *   node scripts/download_comwel_bulk.js                    # Start from page 1
 *   node scripts/download_comwel_bulk.js --resume            # Resume from last saved page
 *   node scripts/download_comwel_bulk.js --start-page 500    # Start from specific page
 *   node scripts/download_comwel_bulk.js --max-pages 100     # Limit pages to download
 *   node scripts/download_comwel_bulk.js --test              # Download 3 pages only (test mode)
 */

import axios from 'axios';
import { Sequelize } from 'sequelize';
import dotenv from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: resolve(__dirname, '../.env') });

// === Config ===
const SERVICE_KEY = process.env.DATA_GO_KR_SHARED_KEY || process.env.NTS_API_KEY;
const API_URL = 'https://apis.data.go.kr/B490001/gySjbPstateInfoService/getGySjBoheomBsshItem';
const TABLE_NAME = 'bulk_comwel_insurance';
const BATCH_SIZE = 1000;
const REQUEST_DELAY_MS = 200; // delay between API calls to avoid rate limiting
const API_TIMEOUT = 30000;

// === Parse CLI args ===
const args = process.argv.slice(2);
const getArg = (name) => {
  const idx = args.indexOf(name);
  return idx >= 0 ? args[idx + 1] : null;
};
const hasFlag = (name) => args.includes(name);

const isTest = hasFlag('--test');
const isResume = hasFlag('--resume');
const startPageArg = getArg('--start-page');
const maxPagesArg = getArg('--max-pages');

// === Database ===
const sequelize = new Sequelize(
  process.env.DB_NAME || 'sme_investor',
  process.env.DB_USER || 'postgres',
  process.env.DB_PASSWORD,
  {
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    dialect: 'postgres',
    logging: false
  }
);

const client = axios.create({ timeout: API_TIMEOUT });

// === Table setup ===
async function ensureTable() {
  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS ${TABLE_NAME} (
      id SERIAL PRIMARY KEY,
      raw_data JSONB NOT NULL,
      "saeopjaDrno" VARCHAR(20),
      "saeopjangNm" VARCHAR(200),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await sequelize.query(`
    CREATE INDEX IF NOT EXISTS idx_${TABLE_NAME}_brno ON ${TABLE_NAME} ("saeopjaDrno")
  `);
  // Progress tracking table
  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS bulk_download_progress (
      api_id VARCHAR(50) PRIMARY KEY,
      last_page INTEGER DEFAULT 0,
      total_records INTEGER DEFAULT 0,
      status VARCHAR(20) DEFAULT 'in_progress',
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  console.log(`[Setup] Table ${TABLE_NAME} ready`);
}

// === Get last downloaded page (for resume) ===
async function getLastPage() {
  const [rows] = await sequelize.query(
    `SELECT last_page FROM bulk_download_progress WHERE api_id = $1`,
    { bind: ['comwel_insurance'] }
  );
  return rows.length > 0 ? rows[0].last_page : 0;
}

async function saveProgress(page, totalRecords, status = 'in_progress') {
  await sequelize.query(`
    INSERT INTO bulk_download_progress (api_id, last_page, total_records, status, updated_at)
    VALUES ($1, $2, $3, $4, NOW())
    ON CONFLICT (api_id)
    DO UPDATE SET last_page = $2, total_records = $3, status = $4, updated_at = NOW()
  `, { bind: ['comwel_insurance', page, totalRecords, status] });
}

// === Fetch and parse one page ===
async function fetchPage(pageNo) {
  const resp = await client.get(API_URL, {
    params: {
      serviceKey: SERVICE_KEY,
      pageNo,
      numOfRows: BATCH_SIZE
    }
  });

  const body = resp.data?.response?.body;
  if (!body) return { items: [], totalCount: 0 };

  const totalCount = parseInt(body.totalCount || '0', 10);
  const items = body.items?.item;

  if (!items) return { items: [], totalCount };

  const arr = Array.isArray(items) ? items : [items];
  return { items: arr, totalCount };
}

// === Insert batch into DB ===
async function insertBatch(items) {
  if (items.length === 0) return;

  // Build parameterized query
  const valuesParts = [];
  const binds = [];
  let paramIdx = 1;

  for (const item of items) {
    const brno = item.saeopjaDrno != null ? String(item.saeopjaDrno) : null;
    const name = item.saeopjangNm || null;
    valuesParts.push(`($${paramIdx}, $${paramIdx + 1}, $${paramIdx + 2})`);
    binds.push(JSON.stringify(item), brno, name);
    paramIdx += 3;
  }

  await sequelize.query(
    `INSERT INTO ${TABLE_NAME} (raw_data, "saeopjaDrno", "saeopjangNm") VALUES ${valuesParts.join(', ')}`,
    { bind: binds }
  );
}

// === Main download loop ===
async function main() {
  console.log('=== 근로복지공단 고용산재보험 Bulk Download ===');
  console.log(`API: ${API_URL}`);
  console.log(`Batch size: ${BATCH_SIZE}`);

  await sequelize.authenticate();
  console.log('[DB] Connected');

  await ensureTable();

  // Determine start page
  let startPage = 1;
  if (isResume) {
    startPage = (await getLastPage()) + 1;
    console.log(`[Resume] Starting from page ${startPage}`);
  } else if (startPageArg) {
    startPage = parseInt(startPageArg, 10);
    console.log(`[Start] Starting from page ${startPage}`);
  }

  const maxPages = isTest ? 3 : (maxPagesArg ? parseInt(maxPagesArg, 10) : null);
  if (maxPages) {
    console.log(`[Limit] Max ${maxPages} pages`);
  }

  // First fetch to get totalCount
  console.log(`\n[Fetch] Page ${startPage}...`);
  const first = await fetchPage(startPage);
  const totalCount = first.totalCount;
  const totalPages = Math.ceil(totalCount / BATCH_SIZE);

  console.log(`[Info] Total records: ${totalCount.toLocaleString()}`);
  console.log(`[Info] Total pages: ${totalPages.toLocaleString()}`);
  console.log(`[Info] Estimated time: ~${Math.ceil((totalPages - startPage + 1) * (REQUEST_DELAY_MS + 500) / 60000)} minutes\n`);

  // Insert first page
  if (first.items.length > 0) {
    await insertBatch(first.items);
  }

  let totalLoaded = first.items.length;
  let currentPage = startPage;
  let consecutiveErrors = 0;
  const startTime = Date.now();

  // Continue from page startPage + 1
  const endPage = maxPages ? Math.min(startPage + maxPages - 1, totalPages) : totalPages;

  for (let page = startPage + 1; page <= endPage; page++) {
    try {
      // Rate limiting delay
      if (REQUEST_DELAY_MS > 0) {
        await new Promise(r => setTimeout(r, REQUEST_DELAY_MS));
      }

      const result = await fetchPage(page);

      if (!result.items || result.items.length === 0) {
        console.log(`[Done] No more items at page ${page}`);
        break;
      }

      await insertBatch(result.items);
      totalLoaded += result.items.length;
      currentPage = page;
      consecutiveErrors = 0;

      // Progress logging
      if (page % 50 === 0) {
        const elapsed = (Date.now() - startTime) / 1000;
        const pagesPerSec = (page - startPage + 1) / elapsed;
        const remaining = (endPage - page) / pagesPerSec;
        const pct = ((page / endPage) * 100).toFixed(1);

        console.log(
          `[Progress] Page ${page}/${endPage} (${pct}%) | ` +
          `${totalLoaded.toLocaleString()} records | ` +
          `${pagesPerSec.toFixed(1)} pages/s | ` +
          `ETA: ${Math.ceil(remaining / 60)}min`
        );

        // Save progress every 50 pages
        await saveProgress(page, totalLoaded);
      }

    } catch (error) {
      consecutiveErrors++;
      console.error(`[Error] Page ${page}: ${error.message} (${consecutiveErrors}/5)`);

      if (consecutiveErrors >= 5) {
        console.error('[Fatal] Too many consecutive errors, stopping');
        await saveProgress(currentPage, totalLoaded, 'error');
        break;
      }

      // Wait longer on errors
      await new Promise(r => setTimeout(r, 2000));
    }
  }

  // Final save
  await saveProgress(currentPage, totalLoaded, currentPage >= endPage ? 'complete' : 'paused');

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n=== Download Complete ===`);
  console.log(`Pages: ${startPage} → ${currentPage}`);
  console.log(`Records: ${totalLoaded.toLocaleString()}`);
  console.log(`Time: ${elapsed}s`);

  // Show sample data
  const [sample] = await sequelize.query(
    `SELECT "saeopjaDrno", "saeopjangNm" FROM ${TABLE_NAME} LIMIT 5`
  );
  console.log('\nSample records:');
  for (const row of sample) {
    console.log(`  BRN: ${row.saeopjaDrno} | ${row.saeopjangNm}`);
  }

  // Show count
  const [[{ count }]] = await sequelize.query(
    `SELECT COUNT(*) as count FROM ${TABLE_NAME}`
  );
  console.log(`\nTotal records in DB: ${parseInt(count).toLocaleString()}`);

  await sequelize.close();
}

main().catch(err => {
  console.error('[Fatal]', err);
  process.exit(1);
});

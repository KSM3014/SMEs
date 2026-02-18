#!/usr/bin/env node
/**
 * Update PostgreSQL my_apis table with data from api_details_collected.json
 * Clears old bad data and inserts clean 96 APIs with real endpoints
 */

import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const COLLECTED_PATH = path.join(__dirname, 'api_details_collected.json');
const API_LIST_PATH = path.join(__dirname, 'api_list_96.json');

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;
const DATA_GO_KR_API_KEY = process.env.DATA_GO_KR_SHARED_KEY || process.env.NTS_API_KEY;

function encryptAES256(text, key) {
  const keyHash = crypto.createHash('sha256').update(key).digest();
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', keyHash, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
}

function extractProvider(name) {
  const match = name.match(/^([^_]+)_/);
  return match ? match[1] : 'Unknown';
}

function extractCategory(name, ops) {
  // Try to extract category from name patterns
  const patterns = [
    { regex: /재무|손익|현금흐름|재무제표|재무정보/, cat: '재무정보' },
    { regex: /사업자|등록|진위/, cat: '사업자등록' },
    { regex: /국민연금|연금/, cat: '국민연금' },
    { regex: /고용|산재|보험|근로/, cat: '고용보험' },
    { regex: /특허|상표|지식재산|디자인/, cat: '지식재산권' },
    { regex: /의약품|의료기기|화장품|식품/, cat: '의약품/의료기기' },
    { regex: /부동산|매매|실거래/, cat: '부동산' },
    { regex: /조달|나라장터|낙찰|입찰|계약/, cat: '조달/입찰' },
    { regex: /대규모기업집단|공정거래/, cat: '대규모기업집단' },
    { regex: /금융|펀드|증권|주식|배당|채권/, cat: '금융정보' },
    { regex: /벤처|창업|중소/, cat: '벤처/창업' },
    { regex: /기업정보|기업 기본|기업현황/, cat: '기업정보' },
    { regex: /동물|축산/, cat: '동물/축산' },
    { regex: /영화|음반|문화/, cat: '문화' },
    { regex: /환경|폐기물|수질/, cat: '환경' },
    { regex: /판매|통신판매|방문판매|광고/, cat: '판매업' },
  ];

  for (const p of patterns) {
    if (p.regex.test(name)) return p.cat;
  }
  return '기타';
}

async function main() {
  const collected = JSON.parse(fs.readFileSync(COLLECTED_PATH, 'utf8'));
  const apiList = JSON.parse(fs.readFileSync(API_LIST_PATH, 'utf8'));

  console.log(`Loaded ${collected.total} collected APIs (${collected.completed} success, ${collected.failed} failed)`);

  const pool = new pg.Pool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    database: process.env.DB_NAME || 'sme_investor',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD,
  });

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // 1. Clear old bad data
    const { rowCount: deleted } = await client.query('DELETE FROM my_apis');
    console.log(`Deleted ${deleted} old rows from my_apis`);

    // 2. Insert clean data
    let inserted = 0;
    let skipped = 0;
    const encryptedApiKey = encryptAES256(DATA_GO_KR_API_KEY, ENCRYPTION_KEY);

    for (const api of collected.apis) {
      if (api.error) {
        skipped++;
        continue;
      }

      // Build endpoint from svc data
      let endpoint = api.svc?.['End Point'] || api.svc?.['Swagger URL'] || api.svc?.['Base URL'] || '';

      // Clean up endpoint
      if (endpoint && !endpoint.startsWith('http')) {
        endpoint = 'https://' + endpoint;
      }

      if (!endpoint) {
        console.log(`  ⚠️ No endpoint for: ${api.name}`);
        endpoint = `unknown_${api.uddiId}`;
      }

      const provider = extractProvider(api.name);
      const category = extractCategory(api.name, api.ops);
      const dataFormat = api.svc?.['데이터포맷'] || 'JSON';
      const refDoc = api.svc?.['참고문서'] || null;

      // Build operations as parameters JSON
      const parameters = {
        operations: api.ops || [],
        service_info: api.svc || {},
        basic_info: api.basic || {},
        ref_doc: refDoc,
      };

      // Generate a stable api_id from uddiId
      const apiId = 'dg_' + api.uddiId.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 45);

      try {
        await client.query(`
          INSERT INTO my_apis (api_id, name, endpoint, api_key, category, provider, description,
                               response_format, parameters, status, detail_url)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
          ON CONFLICT (api_id) DO UPDATE SET
            name = EXCLUDED.name,
            endpoint = EXCLUDED.endpoint,
            api_key = EXCLUDED.api_key,
            category = EXCLUDED.category,
            provider = EXCLUDED.provider,
            description = EXCLUDED.description,
            response_format = EXCLUDED.response_format,
            parameters = EXCLUDED.parameters,
            detail_url = EXCLUDED.detail_url,
            updated_at = CURRENT_TIMESTAMP
        `, [
          apiId,
          api.name,
          endpoint,
          encryptedApiKey,
          category,
          provider,
          `${api.name} - ${provider} 제공 (${api.ops?.length || 0}개 오퍼레이션)`,
          dataFormat.includes('JSON') ? 'JSON' : dataFormat.includes('XML') ? 'XML' : 'JSON',
          JSON.stringify(parameters),
          api.basic?.['처리상태'] === '승인' ? 'active' : 'pending',
          `https://www.data.go.kr/iim/api/selectAcountView.do?uddiId=${encodeURIComponent(api.uddiId)}`
        ]);
        inserted++;
      } catch (err) {
        // Handle unique constraint on endpoint - append uddiId suffix
        if (err.code === '23505' && err.constraint?.includes('endpoint')) {
          endpoint = endpoint + '?uddi=' + api.uddiId.substring(0, 20);
          await client.query(`
            INSERT INTO my_apis (api_id, name, endpoint, api_key, category, provider, description,
                                 response_format, parameters, status, detail_url)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
          `, [
            apiId,
            api.name,
            endpoint,
            encryptedApiKey,
            category,
            provider,
            `${api.name} - ${provider} 제공 (${api.ops?.length || 0}개 오퍼레이션)`,
            dataFormat.includes('JSON') ? 'JSON' : dataFormat.includes('XML') ? 'XML' : 'JSON',
            JSON.stringify(parameters),
            api.basic?.['처리상태'] === '승인' ? 'active' : 'pending',
            `https://www.data.go.kr/iim/api/selectAcountView.do?uddiId=${encodeURIComponent(api.uddiId)}`
          ]);
          inserted++;
        } else {
          console.error(`  ❌ Insert failed for ${api.name}: ${err.message}`);
        }
      }
    }

    await client.query('COMMIT');

    console.log(`\n========================================`);
    console.log(`DB Update Complete!`);
    console.log(`  Inserted: ${inserted}`);
    console.log(`  Skipped (errors): ${skipped}`);
    console.log(`  Total in DB: ${inserted}`);

    // 3. Verify
    const { rows } = await client.query(`
      SELECT category, COUNT(*) as cnt
      FROM my_apis
      GROUP BY category
      ORDER BY cnt DESC
    `);
    console.log(`\nAPIs by Category:`);
    for (const row of rows) {
      console.log(`  ${row.category}: ${row.cnt}`);
    }

    // Print sample
    const { rows: sample } = await client.query(`
      SELECT name, LEFT(endpoint, 70) as endpoint, provider, category
      FROM my_apis
      ORDER BY category, name
      LIMIT 10
    `);
    console.log(`\nSample (first 10):`);
    for (const row of sample) {
      console.log(`  [${row.category}] ${row.provider} | ${row.name}`);
      console.log(`    → ${row.endpoint}`);
    }

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Transaction failed:', err);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(console.error);

/**
 * Update my_apis table with collected endpoint data from V4
 */
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const V4_FILE = path.join(__dirname, 'api_endpoints_v4.json');

async function main() {
  const client = new Client({
    host: 'localhost',
    port: 5432,
    database: 'sme_investor',
    user: 'postgres',
    password: process.env.DB_PASSWORD
  });

  await client.connect();
  console.log('Connected to DB');

  const v4Data = JSON.parse(fs.readFileSync(V4_FILE, 'utf-8'));
  console.log(`Loaded ${v4Data.length} API records from V4`);

  // Check current DB state
  const { rows: currentApis } = await client.query('SELECT api_id, name, endpoint FROM my_apis ORDER BY api_id');
  console.log(`Current DB has ${currentApis.length} APIs`);

  // First, ensure we have the right columns
  try {
    await client.query(`ALTER TABLE my_apis ADD COLUMN IF NOT EXISTS data_format VARCHAR(50)`);
    await client.query(`ALTER TABLE my_apis ADD COLUMN IF NOT EXISTS service_type VARCHAR(100)`);
    await client.query(`ALTER TABLE my_apis ADD COLUMN IF NOT EXISTS reference_doc TEXT`);
    await client.query(`ALTER TABLE my_apis ADD COLUMN IF NOT EXISTS base_url TEXT`);
    await client.query(`ALTER TABLE my_apis ADD COLUMN IF NOT EXISTS swagger_url TEXT`);
    await client.query(`ALTER TABLE my_apis ADD COLUMN IF NOT EXISTS operations_count INTEGER DEFAULT 0`);
    await client.query(`ALTER TABLE my_apis ADD COLUMN IF NOT EXISTS operations_json JSONB`);
    console.log('Schema updated');
  } catch (e) {
    console.log('Schema update note:', e.message);
  }

  let updated = 0;
  let inserted = 0;
  let errors = 0;

  for (const api of v4Data) {
    const endpoint = api.endpoint || api.baseUrl || null;
    const opsCount = api.operations ? api.operations.length : 0;
    const opsJson = JSON.stringify(api.operations || []);

    try {
      // Try to update by name match first
      const { rowCount } = await client.query(
        `UPDATE my_apis SET
          endpoint = COALESCE($1, endpoint),
          base_url = $2,
          swagger_url = $3,
          data_format = $4,
          service_type = $5,
          reference_doc = $6,
          operations_count = $7,
          operations_json = $8,
          updated_at = CURRENT_TIMESTAMP
        WHERE name = $9`,
        [
          endpoint,
          api.baseUrl || null,
          api.swaggerUrl || null,
          api.dataFormat || null,
          api.serviceType || null,
          api.referenceDoc || null,
          opsCount,
          opsJson,
          api.name
        ]
      );

      if (rowCount > 0) {
        updated++;
        if (updated <= 5 || updated % 20 === 0) {
          console.log(`  Updated: ${api.name.substring(0, 40)} -> ${endpoint || '(none)'}`);
        }
      } else {
        // Try to insert if not found
        await client.query(
          `INSERT INTO my_apis (name, endpoint, base_url, swagger_url, data_format, service_type, reference_doc, operations_count, operations_json, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
           ON CONFLICT (endpoint) DO UPDATE SET
             name = EXCLUDED.name,
             base_url = EXCLUDED.base_url,
             swagger_url = EXCLUDED.swagger_url,
             data_format = EXCLUDED.data_format,
             operations_count = EXCLUDED.operations_count,
             operations_json = EXCLUDED.operations_json,
             updated_at = CURRENT_TIMESTAMP`,
          [
            api.name,
            endpoint,
            api.baseUrl || null,
            api.swaggerUrl || null,
            api.dataFormat || null,
            api.serviceType || null,
            api.referenceDoc || null,
            opsCount,
            opsJson
          ]
        );
        inserted++;
        console.log(`  Inserted: ${api.name.substring(0, 40)}`);
      }
    } catch (e) {
      errors++;
      console.log(`  ERROR: ${api.name.substring(0, 40)} - ${e.message.substring(0, 80)}`);
    }
  }

  // Final stats
  const { rows: finalApis } = await client.query('SELECT COUNT(*) as total, COUNT(endpoint) as with_ep, COUNT(operations_count) FILTER (WHERE operations_count > 0) as with_ops FROM my_apis');
  console.log(`\n=== DB UPDATE COMPLETE ===`);
  console.log(`Updated: ${updated}, Inserted: ${inserted}, Errors: ${errors}`);
  console.log(`DB total: ${finalApis[0].total}, With EP: ${finalApis[0].with_ep}, With ops: ${finalApis[0].with_ops}`);

  await client.end();
}

main().catch(err => { console.error('Fatal:', err.message); process.exit(1); });

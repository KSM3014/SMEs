#!/usr/bin/env node
import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });
const { Client } = pg;

const client = new Client({
  host: 'localhost',
  port: 5432,
  database: process.env.DB_NAME || 'sme_investor',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD
});

async function querySMEApis() {
  try {
    await client.connect();

    // Search for SME-related APIs
    const smeResult = await client.query(`
      SELECT id, name, category, description, endpoint
      FROM my_apis
      WHERE status = 'active'
      AND (
        name ILIKE '%중소%'
        OR name ILIKE '%기업%'
        OR name ILIKE '%벤처%'
        OR name ILIKE '%소상공인%'
        OR description ILIKE '%중소%'
        OR description ILIKE '%기업%'
      )
      ORDER BY name
    `);

    console.log('=== SME-Related APIs Found ===');
    console.log(`Total: ${smeResult.rows.length}\n`);

    smeResult.rows.forEach((api, idx) => {
      console.log(`${idx + 1}. ${api.name}`);
      console.log(`   Category: ${api.category || 'N/A'}`);
      console.log(`   Endpoint: ${api.endpoint}`);
      if (api.description) {
        console.log(`   Description: ${api.description.substring(0, 100)}...`);
      }
      console.log('');
    });

    // Get all API categories
    const categoryResult = await client.query(`
      SELECT category, COUNT(*) as count
      FROM my_apis
      WHERE status = 'active'
      GROUP BY category
      ORDER BY count DESC
    `);

    console.log('\n=== API Categories Available ===');
    categoryResult.rows.forEach(row => {
      console.log(`${row.category || 'Uncategorized'}: ${row.count} APIs`);
    });

    await client.end();
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

querySMEApis();

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

async function queryAllUsefulApis() {
  try {
    await client.connect();

    // Get all active APIs with their details
    const result = await client.query(`
      SELECT id, api_id, name, category, description, endpoint, provider,
             response_format, http_method
      FROM my_apis
      WHERE status = 'active'
      ORDER BY provider, name
      LIMIT 120
    `);

    console.log('=== ALL ACTIVE APIs BY PROVIDER ===');
    console.log(`Total: ${result.rows.length}\n`);

    let currentProvider = '';
    result.rows.forEach((api, idx) => {
      const provider = api.provider || 'Unknown Provider';
      if (provider !== currentProvider) {
        currentProvider = provider;
        console.log(`\n${'='.repeat(60)}`);
        console.log(`PROVIDER: ${provider}`);
        console.log('='.repeat(60));
      }

      console.log(`\n${idx + 1}. ${api.name}`);
      console.log(`   API ID: ${api.api_id}`);
      if (api.description) {
        console.log(`   Description: ${api.description.substring(0, 150)}`);
      }
      console.log(`   Endpoint: ${api.endpoint.substring(0, 80)}${api.endpoint.length > 80 ? '...' : ''}`);
      console.log(`   Format: ${api.http_method} → ${api.response_format}`);
    });

    await client.end();
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

queryAllUsefulApis();

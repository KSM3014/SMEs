import { Sequelize } from 'sequelize';
import dotenv from 'dotenv';
dotenv.config();

const s = new Sequelize(
  process.env.DB_NAME || 'sme_investor',
  process.env.DB_USER || 'postgres',
  process.env.DB_PASSWORD,
  { host: 'localhost', port: 5432, dialect: 'postgres', logging: false }
);

await s.authenticate();

const [entities] = await s.query('SELECT entity_id, brno, canonical_name, confidence, match_level, sources_count FROM entity_registry');
console.log('=== entity_registry ===');
entities.forEach(e => console.log(`  ${e.entity_id} | ${e.canonical_name} | conf=${e.confidence} | sources=${e.sources_count}`));

const [[{ sc }]] = await s.query('SELECT COUNT(*) as sc FROM entity_source_data');
const [[{ cc }]] = await s.query('SELECT COUNT(*) as cc FROM source_crosscheck');
const [[{ conflicts }]] = await s.query('SELECT COUNT(*) as conflicts FROM source_crosscheck WHERE is_conflict = TRUE');
console.log(`\nentity_source_data: ${sc} rows`);
console.log(`source_crosscheck: ${cc} rows (${conflicts} conflicts)`);

// Sample conflicts
if (parseInt(conflicts) > 0) {
  const [samples] = await s.query('SELECT entity_id, source_a, source_b, field, value_a, value_b, similarity FROM source_crosscheck WHERE is_conflict = TRUE LIMIT 5');
  console.log('\nSample conflicts:');
  samples.forEach(c => console.log(`  [${c.field}] ${c.source_a} vs ${c.source_b}: "${c.value_a}" vs "${c.value_b}" (sim=${c.similarity})`));
}

const [batch] = await s.query('SELECT batch_id, status, processed, succeeded, failed FROM batch_collection_log');
console.log('\nbatch_collection_log:', batch);

await s.close();

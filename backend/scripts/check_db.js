import { Sequelize } from 'sequelize';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const db = new Sequelize(process.env.DB_NAME || 'sme_investor', process.env.DB_USER || 'postgres', process.env.DB_PASSWORD, {
  host: 'localhost',
  port: 5432,
  dialect: 'postgres',
  logging: false
});

const [count] = await db.query('SELECT COUNT(*) as total FROM my_apis');
console.log(`\n총 수집된 API: ${count[0].total}개\n`);

const [apis] = await db.query('SELECT name FROM my_apis ORDER BY created_at DESC LIMIT 5');
console.log('최근 API:');
apis.forEach((api, i) => console.log(`${i+1}. ${api.name}`));

await db.close();

#!/usr/bin/env node
/**
 * Add parameters and detail_url columns to my_apis table
 */

import sequelize from '../config/database.js';

async function main() {
  try {
    console.log('📊 my_apis 테이블에 컬럼 추가...\n');

    // parameters 컬럼 추가 (JSON)
    try {
      await sequelize.query(`
        ALTER TABLE my_apis
        ADD COLUMN IF NOT EXISTS parameters JSONB
      `);
      console.log('✅ parameters 컬럼 추가 완료');
    } catch (e) {
      console.log('⚠️  parameters 컬럼 이미 존재');
    }

    // detail_url 컬럼 추가
    try {
      await sequelize.query(`
        ALTER TABLE my_apis
        ADD COLUMN IF NOT EXISTS detail_url TEXT
      `);
      console.log('✅ detail_url 컬럼 추가 완료');
    } catch (e) {
      console.log('⚠️  detail_url 컬럼 이미 존재');
    }

    // 테이블 구조 확인
    const [columns] = await sequelize.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'my_apis'
      ORDER BY ordinal_position
    `);

    console.log('\n📋 my_apis 테이블 구조:');
    columns.forEach(col => {
      console.log(`  - ${col.column_name}: ${col.data_type}`);
    });

    console.log('\n✅ 완료!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

main();

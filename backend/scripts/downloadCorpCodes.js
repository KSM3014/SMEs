#!/usr/bin/env node
/**
 * DART corpCode.xml 다운로드 및 DB 저장
 * 한 번만 실행하면 됨
 */

import axios from 'axios';
import xml2js from 'xml2js';
import sequelize from '../config/database.js';
import dotenv from 'dotenv';
import AdmZip from 'adm-zip';

dotenv.config();

async function downloadAndSaveCorpCodes() {
  try {
    console.log('🚀 DART corpCode.xml 다운로드 시작...\n');

    const apiKey = process.env.DART_API_KEY;
    if (!apiKey) {
      throw new Error('DART_API_KEY가 .env에 없습니다');
    }

    // 1. corpCode.xml 다운로드 (ZIP 형식)
    console.log('[1/4] corpCode.zip 다운로드 중...');
    const response = await axios.get(`https://opendart.fss.or.kr/api/corpCode.xml?crtfc_key=${apiKey}`, {
      responseType: 'arraybuffer',
      timeout: 60000,
      maxRedirects: 5
    });

    console.log(`✅ 다운로드 완료 (${(response.data.length / 1024 / 1024).toFixed(2)} MB)\n`);

    // 2. ZIP 압축 해제
    console.log('[2/4] ZIP 압축 해제 중...');
    const zip = new AdmZip(Buffer.from(response.data));
    const zipEntries = zip.getEntries();

    if (zipEntries.length === 0) {
      throw new Error('ZIP 파일이 비어있습니다');
    }

    // 첫 번째 파일 (CORPCODE.xml) 추출
    const xmlEntry = zipEntries[0];
    const xmlString = xmlEntry.getData().toString('utf-8');
    console.log(`✅ 압축 해제 완료 (${xmlEntry.name})\n`);

    // 3. XML 파싱
    console.log('[3/4] XML 파싱 중...');
    const parser = new xml2js.Parser();
    const result = await parser.parseStringPromise(xmlString);

    const companies = result.result.list || [];
    console.log(`✅ ${companies.length.toLocaleString()}개 기업 파싱 완료\n`);

    // 4. DB 테이블 생성 (없으면)
    console.log('[4/4] DB에 저장 중...');

    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS dart_corp_codes (
        corp_code VARCHAR(8) PRIMARY KEY,
        corp_name VARCHAR(255) NOT NULL,
        stock_code VARCHAR(10),
        modify_date VARCHAR(8),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 인덱스 생성
    await sequelize.query(`
      CREATE INDEX IF NOT EXISTS idx_dart_corp_name ON dart_corp_codes(corp_name);
      CREATE INDEX IF NOT EXISTS idx_dart_stock_code ON dart_corp_codes(stock_code);
    `);

    // 기존 데이터 삭제
    await sequelize.query('DELETE FROM dart_corp_codes');

    // 배치 삽입
    const batchSize = 1000;
    let inserted = 0;

    for (let i = 0; i < companies.length; i += batchSize) {
      const batch = companies.slice(i, i + batchSize);

      const values = batch.map(company =>
        `('${company.corp_code[0]}', '${company.corp_name[0].replace(/'/g, "''")}', '${company.stock_code?.[0] || ''}', '${company.modify_date?.[0] || ''}')`
      ).join(',');

      await sequelize.query(`
        INSERT INTO dart_corp_codes (corp_code, corp_name, stock_code, modify_date)
        VALUES ${values}
        ON CONFLICT (corp_code) DO NOTHING
      `);

      inserted += batch.length;
      process.stdout.write(`\r   진행: ${inserted.toLocaleString()} / ${companies.length.toLocaleString()} (${((inserted / companies.length) * 100).toFixed(1)}%)`);
    }

    console.log(`\n✅ DB 저장 완료!\n`);

    // 통계 확인
    const [stats] = await sequelize.query(`
      SELECT
        COUNT(*) as total,
        COUNT(CASE WHEN stock_code != '' THEN 1 END) as listed
      FROM dart_corp_codes
    `);

    console.log('📊 저장 결과:');
    console.log(`   전체 기업: ${parseInt(stats[0].total).toLocaleString()}개`);
    console.log(`   상장 기업: ${parseInt(stats[0].listed).toLocaleString()}개`);
    console.log(`   비상장 기업: ${(parseInt(stats[0].total) - parseInt(stats[0].listed)).toLocaleString()}개\n`);

    console.log('✅ corpCode 다운로드 및 DB 저장 완료!');

  } catch (error) {
    console.error('❌ 오류:', error.message);
    if (error.response) {
      console.error('   API 응답:', error.response.status, error.response.statusText);
    }
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

downloadAndSaveCorpCodes();

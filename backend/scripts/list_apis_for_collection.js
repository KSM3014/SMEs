#!/usr/bin/env node
/**
 * API 목록 정리 및 수집 우선순위 표시
 *
 * 엔드포인트 수집을 위한 가이드
 */

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

async function listAPIsForCollection() {
  await client.connect();

  const result = await client.query(`
    SELECT id, api_id, name, endpoint, provider, category
    FROM my_apis
    WHERE status = 'active'
    ORDER BY
      CASE
        WHEN name LIKE '%국세청%' THEN 1
        WHEN name LIKE '%금융위원회%' THEN 1
        WHEN name LIKE '%공정거래위원회%' THEN 2
        WHEN name LIKE '%국민연금%' THEN 2
        WHEN name LIKE '%근로복지공단%' THEN 2
        WHEN name LIKE '%한국예탁결제원%' THEN 2
        ELSE 3
      END,
      name
  `);

  console.log('================================================================================');
  console.log('API 엔드포인트 수집 가이드');
  console.log('================================================================================\n');

  // 우선순위별로 그룹화
  const priority1 = [];
  const priority2 = [];
  const priority3 = [];

  result.rows.forEach(api => {
    const cleanName = api.name.replace(/^\[승인\]\s*/, '');

    // 엔드포인트 상태 확인
    let endpointStatus = '❌ 없음';
    if (api.endpoint && api.endpoint.startsWith('http')) {
      if (api.endpoint.includes('api-docs') || api.endpoint.length < 30) {
        endpointStatus = '⚠️  불완전';
      } else {
        endpointStatus = '✅ 있음';
      }
    } else if (api.endpoint && api.endpoint.startsWith('unknown_')) {
      endpointStatus = '❌ 플레이스홀더';
    } else if (api.endpoint && /^\d{4}-\d{2}-\d{2}$/.test(api.endpoint)) {
      endpointStatus = '❌ 날짜(공지)';
    }

    const item = {
      id: api.id,
      apiId: api.api_id,
      name: cleanName,
      endpoint: api.endpoint,
      endpointStatus: endpointStatus,
      provider: api.provider || 'Unknown'
    };

    // 우선순위 분류
    if (cleanName.includes('국세청') || cleanName.includes('금융위원회')) {
      priority1.push(item);
    } else if (cleanName.includes('공정거래위원회') ||
               cleanName.includes('국민연금') ||
               cleanName.includes('근로복지공단') ||
               cleanName.includes('한국예탁결제원')) {
      priority2.push(item);
    } else {
      priority3.push(item);
    }
  });

  // Priority 1 출력
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🔴 Priority 1: 필수 (재무, 사업자 검증) - ' + priority1.length + '개');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  priority1.forEach((api, idx) => {
    console.log(`${idx + 1}. ${api.name}`);
    console.log(`   API ID: ${api.apiId}`);
    console.log(`   엔드포인트 상태: ${api.endpointStatus}`);
    if (api.endpointStatus !== '❌ 없음') {
      console.log(`   현재 값: ${api.endpoint.substring(0, 80)}${api.endpoint.length > 80 ? '...' : ''}`);
    }
    console.log();
  });

  // Priority 2 출력
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🟡 Priority 2: 중요 (고용, 보험, 인증) - ' + priority2.length + '개');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  priority2.slice(0, 20).forEach((api, idx) => {
    console.log(`${idx + 1}. ${api.name}`);
    console.log(`   API ID: ${api.apiId}`);
    console.log(`   엔드포인트 상태: ${api.endpointStatus}`);
    console.log();
  });

  if (priority2.length > 20) {
    console.log(`... 외 ${priority2.length - 20}개 더 있음\n`);
  }

  // Priority 3 출력 (요약만)
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🟢 Priority 3: 선택 (기타) - ' + priority3.length + '개');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const priority3Providers = {};
  priority3.forEach(api => {
    if (!priority3Providers[api.provider]) {
      priority3Providers[api.provider] = [];
    }
    priority3Providers[api.provider].push(api);
  });

  for (const [provider, apis] of Object.entries(priority3Providers)) {
    console.log(`${provider}: ${apis.length}개`);
    apis.slice(0, 3).forEach((api, idx) => {
      console.log(`  - ${api.name.substring(0, 60)}${api.name.length > 60 ? '...' : ''}`);
    });
    if (apis.length > 3) {
      console.log(`  ... 외 ${apis.length - 3}개 더`);
    }
    console.log();
  }

  // 통계 요약
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📊 엔드포인트 수집 통계');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const allAPIs = [...priority1, ...priority2, ...priority3];
  const withEndpoint = allAPIs.filter(a => a.endpointStatus === '✅ 있음').length;
  const incompleteEndpoint = allAPIs.filter(a => a.endpointStatus === '⚠️  불완전').length;
  const noEndpoint = allAPIs.filter(a => a.endpointStatus.includes('❌')).length;

  console.log(`총 API: ${allAPIs.length}개`);
  console.log(`✅ 완전한 엔드포인트: ${withEndpoint}개`);
  console.log(`⚠️  불완전한 엔드포인트: ${incompleteEndpoint}개`);
  console.log(`❌ 엔드포인트 없음: ${noEndpoint}개`);
  console.log();
  console.log(`🎯 수집 필요: ${noEndpoint + incompleteEndpoint}개 (${((noEndpoint + incompleteEndpoint) / allAPIs.length * 100).toFixed(1)}%)`);

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('💡 다음 단계');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  console.log('1. 권장: Priority 1 (필수) 먼저 수집');
  console.log(`   → ${priority1.length}개 API의 엔드포인트 수집`);
  console.log('   → https://www.data.go.kr/mypage/myapi.do 에서 각 API "상세보기" 클릭');
  console.log('   → "참고문서" 또는 "샘플코드"에서 엔드포인트 URL 복사');
  console.log('   → api_endpoint_collection_template.csv 파일에 기록\n');

  console.log('2. Priority 2 (중요) 선택적 수집');
  console.log(`   → ${priority2.length}개 중 필요한 것만 선별`);
  console.log('   → 고용/보험 정보가 필요하면 수집\n');

  console.log('3. Priority 3 (선택) 생략 가능');
  console.log(`   → ${priority3.length}개는 Phase 3 구현 후 필요시 추가\n`);

  console.log('4. CSV 완성 후 DB 업데이트 스크립트 실행');
  console.log('   → node update_endpoints_from_csv.js\n');

  await client.end();
}

listAPIsForCollection();

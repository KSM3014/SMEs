/**
 * Full-Stack Deep Dive Test — 5 Random Scenarios
 *
 * 1. LG전자 (1301116006) — 상장 대기업, DART 데이터 있음
 * 2. 에이에프디바(주) (3658803125) — 비상장 중소기업, cold start
 * 3. "현대자동차" — 회사명 검색 (name-based)
 * 4. 이마트24 (1561100013) — 소규모 프랜차이즈
 * 5. 0000000000 — 존재하지 않는 번호 (에러 핸들링)
 */
import http from 'http';

const BASE = 'http://localhost:3000';

function fetch(path) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    http.get(`${BASE}${path}`, (res) => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => {
        const elapsed = Date.now() - start;
        try { resolve({ data: JSON.parse(body), elapsed, status: res.statusCode }); }
        catch { resolve({ data: body, elapsed, status: res.statusCode }); }
      });
    }).on('error', reject);
  });
}

function sseStream(path, timeoutMs = 120000) {
  return new Promise((resolve) => {
    const events = [];
    const start = Date.now();
    const req = http.get(`${BASE}${path}`, (res) => {
      let buffer = '';
      res.on('data', (chunk) => {
        buffer += chunk.toString();
        const parts = buffer.split('\n\n');
        buffer = parts.pop();
        for (const part of parts) {
          if (!part.trim()) continue;
          const lines = part.split('\n');
          let event = 'message', data = '';
          for (const line of lines) {
            if (line.startsWith('event:')) event = line.slice(6).trim();
            else if (line.startsWith('data:')) data = line.slice(5).trim();
          }
          if (data) {
            try { data = JSON.parse(data); } catch {}
            events.push({ event, data, elapsed: Date.now() - start });
          }
        }
      });
      res.on('end', () => resolve({ events, totalMs: Date.now() - start }));
    }).on('error', (err) => {
      resolve({ events, totalMs: Date.now() - start, error: err.message });
    });
    setTimeout(() => { req.destroy(); resolve({ events, totalMs: Date.now() - start, timeout: true }); }, timeoutMs);
  });
}

const results = [];
function log(msg) { console.log(msg); }
function pass(name) { results.push({ name, pass: true }); log(`  PASS`); }
function fail(name, reason) { results.push({ name, pass: false, reason }); log(`  FAIL: ${reason}`); }

// ============================================
log('\n' + '='.repeat(60));
log('  Full-Stack Deep Dive Test — 5 Scenarios');
log('='.repeat(60));

// ── Test 1: LG전자 (상장 대기업, DB hit + DART) ──
log('\n--- Test 1: LG전자 (1301116006) — 상장 대기업, DART 있음 ---');
{
  const sse = await sseStream('/api/company/live/1301116006');
  log(`  Total: ${sse.totalMs}ms | Events: ${sse.events.length}`);

  const eventNames = sse.events.map(e => e.event);
  log(`  Events: ${eventNames.join(' → ')}`);

  const dbData = sse.events.find(e => e.event === 'db_data');
  const dartData = sse.events.find(e => e.event === 'dart_data');
  const complete = sse.events.find(e => e.event === 'complete');

  log(`  db_data: company=${dbData?.data?.company?.company_name || 'null'} (${dbData?.elapsed}ms)`);
  log(`  dart_data: available=${dartData?.data?.available ?? dartData?.data?.company_name ? 'yes' : 'no'}`);
  if (dartData?.data?.company_name) {
    log(`    company_name: ${dartData.data.company_name}`);
    log(`    revenue: ${dartData.data.revenue}`);
    log(`    officers: ${dartData.data.officers?.length || 0}`);
    log(`    shareholders: ${dartData.data.shareholders?.length || 0}`);
  }
  log(`  complete: company=${complete?.data?.company?.company_name || '?'}`);
  log(`    _hasDart: ${complete?.data?.company?._hasDart}`);
  log(`    ceo_name: ${complete?.data?.company?.ceo_name}`);
  log(`    address: ${complete?.data?.company?.address}`);
  log(`    establishment_date: ${complete?.data?.company?.establishment_date}`);

  const hasAllEvents = ['db_data', 'live_start', 'complete'].every(e => eventNames.includes(e));
  const hasDart = dartData?.data?.company_name || dartData?.data?.available === false;

  if (hasAllEvents && complete?.data?.company) pass('Test 1: LG전자');
  else fail('Test 1: LG전자', `events=${eventNames.join(',')}, complete=${!!complete?.data?.company}`);
}

// ── Test 2: 비상장 중소기업 (cold start, DART 없음) ──
log('\n--- Test 2: 에이에프디바(주) (3658803125) — 비상장, cold start ---');
{
  const sse = await sseStream('/api/company/live/3658803125');
  log(`  Total: ${sse.totalMs}ms | Events: ${sse.events.length}`);

  const eventNames = sse.events.map(e => e.event);
  log(`  Events: ${eventNames.join(' → ')}`);

  const dbData = sse.events.find(e => e.event === 'db_data');
  const dartData = sse.events.find(e => e.event === 'dart_data');
  const complete = sse.events.find(e => e.event === 'complete');

  log(`  db_data: company=${dbData?.data?.company?.company_name || dbData?.data?.message || 'null'}`);
  log(`  dart_data: available=${dartData?.data?.available}`);
  if (dartData?.data?.message) log(`    message: ${dartData.data.message}`);

  if (complete?.data?.company) {
    log(`  complete: company=${complete.data.company.company_name}`);
    log(`    _hasDart: ${complete.data.company._hasDart}`);
    log(`    business_number: ${complete.data.company.business_number}`);
    log(`    sources: ${complete.data.company._entity?.sourcesCount || 0}`);
  } else {
    log(`  complete: no company data`);
  }

  // For cold start, db_data might be null, dart might be unavailable
  const hasComplete = eventNames.includes('complete');
  if (hasComplete) pass('Test 2: 비상장 중소기업');
  else fail('Test 2: 비상장 중소기업', `events=${eventNames.join(',')}`);
}

// ── Test 3: 회사명 검색 ("현대자동차") ──
log('\n--- Test 3: "현대자동차" — 회사명 검색 ---');
{
  const r = await fetch('/api/company/search?q=%ED%98%84%EB%8C%80%EC%9E%90%EB%8F%99%EC%B0%A8');
  log(`  Status: ${r.status} | Time: ${r.elapsed}ms`);
  log(`  success: ${r.data.success}`);

  if (r.data.data) {
    const entities = r.data.data.entities || [];
    log(`  Entities found: ${entities.length}`);
    for (const e of entities.slice(0, 3)) {
      log(`    ${e.canonicalName} | brno=${e.identifiers?.brno} | conf=${e.confidence} | sources=${e.sourcesCount}`);
    }
    log(`  APIs: ${r.data.meta?.apisSucceeded}/${r.data.meta?.apisAttempted} (${r.data.meta?.durationMs}ms)`);

    if (r.data.success && entities.length > 0) pass('Test 3: 회사명 검색');
    else fail('Test 3: 회사명 검색', `entities=${entities.length}`);
  } else {
    log(`  error: ${r.data.error}`);
    fail('Test 3: 회사명 검색', r.data.error);
  }
}

// ── Test 4: 소규모 프랜차이즈 (이마트24) ──
log('\n--- Test 4: 이마트24 (1561100013) — 소규모 프랜차이즈 ---');
{
  const sse = await sseStream('/api/company/live/1561100013');
  log(`  Total: ${sse.totalMs}ms | Events: ${sse.events.length}`);

  const eventNames = sse.events.map(e => e.event);
  log(`  Events: ${eventNames.join(' → ')}`);

  const dbData = sse.events.find(e => e.event === 'db_data');
  const dartData = sse.events.find(e => e.event === 'dart_data');
  const liveDiff = sse.events.find(e => e.event === 'live_diff');
  const complete = sse.events.find(e => e.event === 'complete');

  log(`  db_data: company=${dbData?.data?.company?.company_name || dbData?.data?.message || 'null'}`);
  log(`  dart_data: available=${dartData?.data?.available}`);

  if (liveDiff?.data?.meta) {
    log(`  live_diff: APIs=${liveDiff.data.meta.apisSucceeded}/${liveDiff.data.meta.apisAttempted}`);
    if (liveDiff.data.diff) {
      log(`    changes: +${liveDiff.data.diff.added?.length || 0} ~${liveDiff.data.diff.updated?.length || 0} -${liveDiff.data.diff.removed?.length || 0}`);
    }
  }

  if (complete?.data?.company) {
    log(`  complete: company=${complete.data.company.company_name}`);
    log(`    _hasDart: ${complete.data.company._hasDart}`);
    log(`    business_number: ${complete.data.company.business_number}`);
    log(`    sources: ${complete.data.company._entity?.sourcesCount || 0}`);
  }

  const hasComplete = eventNames.includes('complete');
  if (hasComplete) pass('Test 4: 소규모 프랜차이즈');
  else fail('Test 4: 소규모 프랜차이즈', `events=${eventNames.join(',')}`);
}

// ── Test 5: 존재하지 않는 번호 (에러 핸들링) ──
log('\n--- Test 5: 0000000000 — 존재하지 않는 번호 ---');
{
  // 5a: /quick
  const quick = await fetch('/api/company/quick/0000000000');
  log(`  /quick: status=${quick.status} success=${quick.data.success} fromDb=${quick.data.fromDb} data=${quick.data.data ? 'present' : 'null'} (${quick.elapsed}ms)`);

  // 5b: /search
  const search = await fetch('/api/company/search?q=0000000000');
  log(`  /search: status=${search.status} entities=${search.data.data?.entities?.length || 0} (${search.elapsed}ms)`);

  // 5c: /live SSE
  const sse = await sseStream('/api/company/live/0000000000', 60000);
  log(`  /live: events=${sse.events.length} time=${sse.totalMs}ms`);
  const eventNames = sse.events.map(e => e.event);
  log(`  Events: ${eventNames.join(' → ')}`);

  const complete = sse.events.find(e => e.event === 'complete');
  const errEvt = sse.events.find(e => e.event === 'error');

  if (complete) {
    log(`  complete: company=${complete.data?.company?.company_name || 'null'}`);
  }
  if (errEvt) {
    log(`  error: ${errEvt.data?.message}`);
  }

  // 서버가 크래시하지 않고 정상적으로 complete or error 이벤트를 보내면 PASS
  const noServerCrash = sse.events.length > 0;
  const graceful = eventNames.includes('complete') || eventNames.includes('error');

  if (noServerCrash && graceful) pass('Test 5: 존재하지 않는 번호');
  else fail('Test 5: 존재하지 않는 번호', `events=${eventNames.join(',')}, graceful=${graceful}`);
}

// ── Summary ──
log('\n' + '='.repeat(60));
log('  Test Summary');
log('='.repeat(60));
for (const r of results) {
  log(`  ${r.pass ? 'PASS' : 'FAIL'} | ${r.name}${r.reason ? ` (${r.reason})` : ''}`);
}
const passCount = results.filter(r => r.pass).length;
log(`\n  Result: ${passCount}/${results.length} passed`);
log('='.repeat(60) + '\n');

process.exit(passCount === results.length ? 0 : 1);

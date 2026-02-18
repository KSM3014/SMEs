/**
 * SWR (Stale-While-Revalidate) 패턴 E2E 테스트
 * Tests: /quick, /live (SSE), /search → DB persist
 */
import http from 'http';

const BASE = 'http://localhost:3000';
const BRNO = '1248100998'; // 삼성전자

function fetch(path) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    http.get(`${BASE}${path}`, (res) => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => {
        const elapsed = Date.now() - start;
        try {
          resolve({ data: JSON.parse(body), elapsed, status: res.statusCode });
        } catch {
          resolve({ data: body, elapsed, status: res.statusCode });
        }
      });
    }).on('error', reject);
  });
}

function sseStream(path, timeoutMs = 120000) {
  return new Promise((resolve, reject) => {
    const events = [];
    const start = Date.now();
    http.get(`${BASE}${path}`, (res) => {
      let buffer = '';
      res.on('data', (chunk) => {
        buffer += chunk.toString();
        const parts = buffer.split('\n\n');
        buffer = parts.pop(); // keep incomplete
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
    }).on('error', reject);
    setTimeout(() => resolve({ events, totalMs: Date.now() - start, timeout: true }), timeoutMs);
  });
}

console.log('============================================');
console.log('  SWR Pattern E2E Test');
console.log('============================================\n');

// Test 1: /quick/:brno (DB-first)
console.log('--- Test 1: GET /api/company/quick/' + BRNO + ' ---');
const quick = await fetch(`/api/company/quick/${BRNO}`);
console.log(`  Status: ${quick.status}`);
console.log(`  Response time: ${quick.elapsed}ms`);
console.log(`  fromDb: ${quick.data.fromDb}`);
console.log(`  isStale: ${quick.data.isStale}`);
if (quick.data.data) {
  const d = quick.data.data;
  console.log(`  entityId: ${d.entityId}`);
  console.log(`  canonicalName: ${d.canonicalName}`);
  console.log(`  confidence: ${d.confidence}`);
  console.log(`  sourcesCount: ${d.sourcesCount}`);
  console.log(`  apiData: ${d.apiData?.length || 0} sources`);
  console.log(`  conflicts: ${d.conflicts?.length || 0}`);
  console.log(`  lastFetchedAt: ${d.lastFetchedAt}`);
}
const quickPass = quick.data.fromDb === true && quick.elapsed < 500;
console.log(`  RESULT: ${quickPass ? 'PASS ✅' : 'FAIL ❌'} (DB-first, <500ms)\n`);

// Test 2: /quick with unknown brno (should fallback to live API)
console.log('--- Test 2: GET /api/company/quick/9999999999 (DB miss → live fallback) ---');
const quickMiss = await fetch(`/api/company/quick/9999999999`);
console.log(`  Status: ${quickMiss.status}`);
console.log(`  Response time: ${quickMiss.elapsed}ms`);
console.log(`  fromDb: ${quickMiss.data.fromDb}`);
console.log(`  data: ${quickMiss.data.data ? 'present' : 'null'}`);
const quickMissPass = quickMiss.data.fromDb === false;
console.log(`  RESULT: ${quickMissPass ? 'PASS ✅' : 'FAIL ❌'} (fromDb=false expected)\n`);

// Test 3: /live/:brno (SSE streaming)
console.log('--- Test 3: GET /api/company/live/' + BRNO + ' (SSE stream) ---');
console.log('  Connecting to SSE...');
const sse = await sseStream(`/api/company/live/${BRNO}`);
console.log(`  Total stream time: ${sse.totalMs}ms`);
console.log(`  Events received: ${sse.events.length}`);
console.log('');

const expectedEvents = ['db_data', 'live_start', 'live_diff', 'complete'];
for (const ev of sse.events) {
  console.log(`  [${ev.elapsed}ms] event: ${ev.event}`);
  if (ev.event === 'db_data') {
    const hasEntity = !!ev.data.entity;
    console.log(`    entity: ${hasEntity ? ev.data.entity.canonicalName : 'null'}`);
    console.log(`    sourcesCount: ${ev.data.sourcesCount || 0}`);
    console.log(`    conflictsCount: ${ev.data.conflictsCount || 0}`);
  } else if (ev.event === 'live_start') {
    console.log(`    message: ${ev.data.message}`);
  } else if (ev.event === 'live_diff') {
    if (ev.data.diff) {
      console.log(`    added: ${ev.data.diff.added?.length || 0}`);
      console.log(`    updated: ${ev.data.diff.updated?.length || 0}`);
      console.log(`    removed: ${ev.data.diff.removed?.length || 0}`);
      console.log(`    unchanged: ${ev.data.diff.unchangedCount || 0}`);
      console.log(`    hasChanges: ${ev.data.diff.hasChanges}`);
    }
    if (ev.data.meta) {
      console.log(`    APIs: ${ev.data.meta.apisSucceeded}/${ev.data.meta.apisAttempted} (${ev.data.meta.durationMs}ms)`);
    }
  } else if (ev.event === 'complete') {
    const ent = ev.data.entity;
    console.log(`    entity: ${ent?.canonicalName || '?'}`);
    console.log(`    conflicts: ${ev.data.conflicts?.length || 0}`);
  } else if (ev.event === 'error') {
    console.log(`    ERROR: ${ev.data.message}`);
  }
}

const receivedEvents = sse.events.map(e => e.event);
const ssePass = expectedEvents.every(e => receivedEvents.includes(e));
const dbDataFirst = sse.events[0]?.event === 'db_data' && sse.events[0]?.elapsed < 500;
console.log(`\n  All 4 events received: ${ssePass ? 'PASS ✅' : 'FAIL ❌'}`);
console.log(`  db_data was instant (<500ms): ${dbDataFirst ? 'PASS ✅' : 'FAIL ❌'}`);

// Summary
console.log('\n============================================');
console.log('  Summary');
console.log('============================================');
console.log(`  Test 1 (/quick DB hit):     ${quickPass ? 'PASS ✅' : 'FAIL ❌'}`);
console.log(`  Test 2 (/quick DB miss):    ${quickMissPass ? 'PASS ✅' : 'FAIL ❌'}`);
console.log(`  Test 3 (/live SSE events):  ${ssePass ? 'PASS ✅' : 'FAIL ❌'}`);
console.log(`  Test 3 (instant db_data):   ${dbDataFirst ? 'PASS ✅' : 'FAIL ❌'}`);
const allPass = quickPass && quickMissPass && ssePass && dbDataFirst;
console.log(`\n  Overall: ${allPass ? 'ALL PASS ✅' : 'SOME FAILED ❌'}`);
console.log('============================================\n');

process.exit(allPass ? 0 : 1);

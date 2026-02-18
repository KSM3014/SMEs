/**
 * Test all 96 APIs and generate DROP/KEEP report
 * Tests the first operation of each API with the shared service key
 */
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const V4_FILE = path.join(__dirname, 'api_endpoints_v4.json');
const REPORT_FILE = path.join(__dirname, 'api_test_report.json');
const SERVICE_KEY = process.env.DATA_GO_KR_SHARED_KEY || process.env.NTS_API_KEY;

function httpRequest(url, method = 'GET', timeout = 10000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error('TIMEOUT'));
    }, timeout);

    const urlObj = new URL(url);
    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80),
      path: urlObj.pathname + urlObj.search,
      method: method,
      headers: {
        'Accept': 'application/json, application/xml, text/xml, */*',
        'User-Agent': 'SME-Investor-Test/1.0'
      },
      rejectUnauthorized: false // Some government APIs have cert issues
    };

    const mod = urlObj.protocol === 'https:' ? https : http;
    const req = mod.request(options, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        clearTimeout(timer);
        resolve({
          status: res.statusCode,
          headers: res.headers,
          body: data.substring(0, 2000), // Truncate
          contentType: res.headers['content-type'] || ''
        });
      });
    });

    req.on('error', err => {
      clearTimeout(timer);
      reject(err);
    });

    req.end();
  });
}

function extractOperationPath(operations) {
  if (!operations || operations.length === 0) return null;

  const op = operations[0];
  // Try to find path in name field
  const nameMatch = op.name.match(/(\/\w[\w/.-]*)/);
  if (nameMatch) return nameMatch[1];

  // Try to find path in description field
  const descMatch = op.description.match(/(\/\w[\w/.-]*)/);
  if (descMatch) return descMatch[1];

  return null;
}

function buildTestUrl(api) {
  const ep = api.endpoint || api.baseUrl;
  if (!ep) return null;

  // Normalize endpoint
  let baseUrl = ep;
  if (!baseUrl.startsWith('http')) {
    baseUrl = 'https://' + baseUrl;
  }

  // Get operation path
  const opPath = extractOperationPath(api.operations);

  // Build URL with service key
  let testUrl;
  if (opPath) {
    // Remove trailing slash from base, add operation path
    testUrl = baseUrl.replace(/\/$/, '') + opPath;
  } else {
    testUrl = baseUrl;
  }

  // Add service key
  const sep = testUrl.includes('?') ? '&' : '?';
  testUrl += `${sep}serviceKey=${encodeURIComponent(SERVICE_KEY)}`;

  // Add minimal required params for pagination
  testUrl += '&pageNo=1&numOfRows=1';

  return testUrl;
}

function categorizeResult(api, testResult) {
  const result = {
    name: api.name,
    endpoint: api.endpoint || api.baseUrl || '(NONE)',
    operationsCount: api.operations ? api.operations.length : 0,
    dataFormat: api.dataFormat,
    testUrl: testResult.url,
    httpStatus: testResult.status,
    responseType: testResult.contentType,
    responsePreview: '',
    verdict: 'UNKNOWN',
    reason: '',
    category: '',
    priority: 0
  };

  if (testResult.error) {
    result.verdict = 'ERROR';
    result.reason = testResult.error;
    return result;
  }

  result.responsePreview = testResult.body.substring(0, 300);

  // Check response
  if (testResult.status === 200) {
    // Check if response contains actual data
    const body = testResult.body;
    if (body.includes('SERVICE_KEY_IS_NOT_REGISTERED_ERROR') || body.includes('SERVICE KEY IS NOT REGISTERED')) {
      result.verdict = 'KEY_ERROR';
      result.reason = 'Service key not registered for this API';
    } else if (body.includes('LIMITED_NUMBER_OF_SERVICE_REQUESTS_EXCEEDS_ERROR')) {
      result.verdict = 'KEEP';
      result.reason = 'Rate limited but API works (key registered)';
    } else if (body.includes('APPLICATION_ERROR') || body.includes('DB_ERROR')) {
      result.verdict = 'CHECK';
      result.reason = 'Server error - might need different params';
    } else if (body.includes('NODATA_ERROR') || body.includes('NO_DATA')) {
      result.verdict = 'KEEP';
      result.reason = 'No data for test params but API works';
    } else if (body.includes('resultCode') || body.includes('totalCount') || body.includes('header') || body.includes('items') || body.includes('response')) {
      result.verdict = 'KEEP';
      result.reason = 'API responds with data structure';
    } else if (body.includes('<?xml') || body.includes('<response>')) {
      result.verdict = 'KEEP';
      result.reason = 'API responds with XML data';
    } else if (body.startsWith('{') || body.startsWith('[')) {
      result.verdict = 'KEEP';
      result.reason = 'API responds with JSON data';
    } else {
      result.verdict = 'CHECK';
      result.reason = 'Unknown response format';
    }
  } else if (testResult.status === 404) {
    result.verdict = 'CHECK';
    result.reason = '404 - endpoint may need different path';
  } else if (testResult.status === 401 || testResult.status === 403) {
    result.verdict = 'KEY_ERROR';
    result.reason = `${testResult.status} - authentication issue`;
  } else if (testResult.status === 500 || testResult.status === 502 || testResult.status === 503) {
    result.verdict = 'CHECK';
    result.reason = `Server error ${testResult.status}`;
  } else {
    result.verdict = 'CHECK';
    result.reason = `HTTP ${testResult.status}`;
  }

  return result;
}

function assignCategory(api) {
  const name = api.name;
  if (name.includes('국세청')) return { cat: '사업자 등록/인증', pri: 1 };
  if (name.includes('금융위원회') && (name.includes('재무') || name.includes('기본정보'))) return { cat: '금융/재무', pri: 1 };
  if (name.includes('금융위원회')) return { cat: '금융/재무', pri: 2 };
  if (name.includes('한국예탁결제원')) return { cat: '금융/재무', pri: 2 };
  if (name.includes('국민연금')) return { cat: '고용/복지', pri: 1 };
  if (name.includes('근로복지공단')) return { cat: '고용/복지', pri: 1 };
  if (name.includes('공정거래위원회') && name.includes('대규모기업집단')) return { cat: '기업집단', pri: 2 };
  if (name.includes('공정거래위원회')) return { cat: '사업자 등록/인증', pri: 2 };
  if (name.includes('조달청')) return { cat: '정부조달', pri: 2 };
  if (name.includes('국토교통부')) return { cat: '부동산', pri: 3 };
  if (name.includes('식품의약품안전처')) return { cat: '식약처', pri: 3 };
  if (name.includes('지식재산처')) return { cat: '지식재산', pri: 2 };
  if (name.includes('한국산업인력공단')) return { cat: '고용/복지', pri: 2 };
  if (name.includes('창업진흥원')) return { cat: '창업/벤처', pri: 2 };
  if (name.includes('중소벤처기업')) return { cat: '창업/벤처', pri: 2 };
  if (name.includes('행정안전부')) return { cat: '인허가(행안부)', pri: 3 };
  return { cat: '기타', pri: 4 };
}

async function main() {
  const apis = JSON.parse(fs.readFileSync(V4_FILE, 'utf-8'));
  console.log(`Testing ${apis.length} APIs...\n`);

  const results = [];
  let keepCount = 0, errorCount = 0, checkCount = 0, keyErrorCount = 0;

  for (let i = 0; i < apis.length; i++) {
    const api = apis[i];
    const testUrl = buildTestUrl(api);
    process.stdout.write(`[${i + 1}/${apis.length}] ${api.name.substring(0, 45)}... `);

    let testResult = { url: testUrl, status: 0, body: '', contentType: '', error: null };

    if (!testUrl) {
      testResult.error = 'No endpoint URL';
    } else {
      try {
        const resp = await httpRequest(testUrl, 'GET', 12000);
        testResult.status = resp.status;
        testResult.body = resp.body;
        testResult.contentType = resp.contentType;
      } catch (err) {
        testResult.error = err.message;
      }
    }

    const result = categorizeResult(api, testResult);
    const { cat, pri } = assignCategory(api);
    result.category = cat;
    result.priority = pri;
    results.push(result);

    // Print result
    const icon = result.verdict === 'KEEP' ? '✓' : result.verdict === 'KEY_ERROR' ? '✗' : result.verdict === 'ERROR' ? '!' : '?';
    console.log(`${icon} ${result.verdict} - ${result.reason.substring(0, 60)}`);

    if (result.verdict === 'KEEP') keepCount++;
    else if (result.verdict === 'KEY_ERROR') keyErrorCount++;
    else if (result.verdict === 'ERROR') errorCount++;
    else checkCount++;

    // Small delay to be nice to the APIs
    await new Promise(r => setTimeout(r, 300));
  }

  // Save full report
  fs.writeFileSync(REPORT_FILE, JSON.stringify(results, null, 2), 'utf-8');

  // Print summary
  console.log('\n' + '='.repeat(70));
  console.log('=== API TEST REPORT ===');
  console.log('='.repeat(70));
  console.log(`KEEP: ${keepCount} | KEY_ERROR: ${keyErrorCount} | CHECK: ${checkCount} | ERROR: ${errorCount}`);
  console.log('');

  // Group by category
  const categories = {};
  results.forEach(r => {
    if (!categories[r.category]) categories[r.category] = [];
    categories[r.category].push(r);
  });

  for (const [cat, items] of Object.entries(categories).sort((a, b) => a[1][0].priority - b[1][0].priority)) {
    const keep = items.filter(i => i.verdict === 'KEEP').length;
    const total = items.length;
    console.log(`\n[${cat}] ${keep}/${total} working`);
    items.forEach(i => {
      const icon = i.verdict === 'KEEP' ? '  ✓' : i.verdict === 'KEY_ERROR' ? '  ✗' : '  ?';
      console.log(`${icon} ${i.name.substring(0, 50)} | ${i.verdict} | ${i.reason.substring(0, 50)}`);
    });
  }

  console.log('\n' + '='.repeat(70));
  console.log(`Total: ${results.length} APIs | KEEP: ${keepCount} | KEY_ERROR: ${keyErrorCount} | CHECK: ${checkCount} | ERROR: ${errorCount}`);
  console.log(`Report saved to: ${REPORT_FILE}`);
}

main().catch(err => { console.error('Fatal:', err.message); process.exit(1); });

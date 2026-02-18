/**
 * Deep re-validation of all 96 APIs
 * - Fixes CHECK/ERROR APIs with targeted strategies
 * - Validates KEEP APIs have actual data structures
 * - Generates final DROP/KEEP report
 */
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const V4_FILE = path.join(__dirname, 'api_endpoints_v4.json');
const REPORT_FILE = path.join(__dirname, 'api_final_report.json');
const SERVICE_KEY = process.env.DATA_GO_KR_SHARED_KEY || process.env.NTS_API_KEY;

function httpRequest(url, options = {}) {
  const method = options.method || 'GET';
  const timeout = options.timeout || 15000;
  const body = options.body || null;

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('TIMEOUT')), timeout);
    const urlObj = new URL(url);
    const reqOptions = {
      hostname: urlObj.hostname,
      port: urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80),
      path: urlObj.pathname + urlObj.search,
      method,
      headers: {
        'Accept': 'application/json, application/xml, text/xml, */*',
        'User-Agent': 'SME-Investor-Test/1.0',
        'Content-Type': body ? 'application/json' : undefined,
      },
      rejectUnauthorized: false,
    };
    // Remove undefined headers
    Object.keys(reqOptions.headers).forEach(k => {
      if (reqOptions.headers[k] === undefined) delete reqOptions.headers[k];
    });

    const mod = urlObj.protocol === 'https:' ? https : http;
    const req = mod.request(reqOptions, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        clearTimeout(timer);
        resolve({ status: res.statusCode, body: data.substring(0, 3000), contentType: res.headers['content-type'] || '' });
      });
    });
    req.on('error', err => { clearTimeout(timer); reject(err); });
    if (body) req.write(body);
    req.end();
  });
}

function extractOpPath(operations) {
  if (!operations || operations.length === 0) return null;
  const op = operations[0];
  const nameMatch = op.name.match(/(\/\w[\w/.-]*)/);
  if (nameMatch) return nameMatch[1];
  const descMatch = op.description.match(/(\/\w[\w/.-]*)/);
  if (descMatch) return descMatch[1];
  return null;
}

function analyzeResponse(body, status) {
  if (!body) return { hasData: false, format: 'empty', sampleFields: [] };

  const isXml = body.includes('<?xml') || body.includes('<response>') || body.includes('<OpenAPI_ServiceResponse');
  const isJson = body.trim().startsWith('{') || body.trim().startsWith('[');
  const isHtml = body.includes('<!doctype') || body.includes('<html');

  let format = 'unknown';
  if (isXml) format = 'xml';
  else if (isJson) format = 'json';
  else if (isHtml) format = 'html';

  // Check for error messages
  const hasError = body.includes('SERVICE_KEY_IS_NOT_REGISTERED') ||
    body.includes('APPLICATION_ERROR') ||
    body.includes('DB_ERROR') ||
    body.includes('SERVICE ERROR');

  const hasNoData = body.includes('NODATA_ERROR') || body.includes('NO_DATA');

  const hasData = status === 200 && !isHtml && !hasError &&
    (body.includes('resultCode') || body.includes('totalCount') ||
     body.includes('items') || body.includes('item') ||
     body.includes('response') || body.includes('data') ||
     body.includes('result') || body.includes('currentCount') ||
     isJson || (isXml && !hasError));

  // Extract sample field names
  const sampleFields = [];
  if (isXml) {
    const tags = body.match(/<([a-zA-Z_]\w*)[^>]*>/g);
    if (tags) {
      const unique = [...new Set(tags.map(t => t.match(/<(\w+)/)?.[1]).filter(Boolean))];
      sampleFields.push(...unique.slice(0, 15));
    }
  } else if (isJson) {
    try {
      const obj = JSON.parse(body);
      const keys = Object.keys(obj);
      sampleFields.push(...keys.slice(0, 10));
      // Go deeper
      for (const k of keys) {
        if (typeof obj[k] === 'object' && obj[k] !== null) {
          sampleFields.push(...Object.keys(obj[k]).slice(0, 5).map(sk => `${k}.${sk}`));
        }
      }
    } catch (e) {}
  }

  return { hasData: hasData || hasNoData, format, sampleFields, hasError, hasNoData };
}

// ---- Specific fix strategies ----

async function test조달청(api) {
  // 조달청 APIs return 404 with the extracted path. Try variations.
  const ep = api.endpoint;
  const opPath = extractOpPath(api.operations);
  if (!opPath) return null;

  const variations = [
    // Original: endpoint + opPath
    `${ep}${opPath}`,
    // Without middle segment (ao/as/ad): /1230000/ServiceName/opPath
    ep.replace(/\/(ao|as|ad)\//, '/') + opPath,
    // Just endpoint without opPath
    ep,
    // Try /getList appended
    `${ep}/getList`,
  ];

  for (const url of variations) {
    const fullUrl = `${url}?serviceKey=${encodeURIComponent(SERVICE_KEY)}&pageNo=1&numOfRows=1`;
    try {
      const resp = await httpRequest(fullUrl, { timeout: 15000 });
      if (resp.status === 200 && !resp.body.includes('<!doctype')) {
        return { url: fullUrl, resp, variation: url };
      }
    } catch (e) {}
  }
  return null;
}

async function test국세청(api) {
  // POST-only API on api.odcloud.kr
  const urls = [
    'https://api.odcloud.kr/api/nts-businessman/v1/status',
    'https://api.odcloud.kr/api/nts-businessman/v1/validate',
  ];

  for (const url of urls) {
    const fullUrl = `${url}?serviceKey=${encodeURIComponent(SERVICE_KEY)}`;
    // Try POST with sample data
    try {
      const resp = await httpRequest(fullUrl, {
        method: 'POST',
        body: JSON.stringify({ b_no: ['1234567890'] }),
        timeout: 15000
      });
      if (resp.status === 200) {
        return { url: fullUrl, resp, method: 'POST' };
      }
    } catch (e) {}

    // Try GET
    try {
      const resp = await httpRequest(fullUrl, { timeout: 10000 });
      if (resp.status === 200) {
        return { url: fullUrl, resp, method: 'GET' };
      }
    } catch (e) {}
  }
  return null;
}

async function test한국예탁결제원(api) {
  // No endpoint, but has Swagger. Try known KSD API patterns
  const urls = [
    'https://seibro.or.kr/OpenPlatform/callOpenAPI.jsp',
    'https://apis.data.go.kr/B190001',
    'https://seibro.or.kr/websquare/engine/proworks/callServletService.jsp',
  ];

  for (const url of urls) {
    const fullUrl = url.includes('?') ? `${url}&serviceKey=${encodeURIComponent(SERVICE_KEY)}`
      : `${url}?serviceKey=${encodeURIComponent(SERVICE_KEY)}&numOfRows=1&pageNo=1`;
    try {
      const resp = await httpRequest(fullUrl, { timeout: 15000 });
      if (resp.status === 200 && resp.body.length > 50) {
        return { url: fullUrl, resp };
      }
    } catch (e) {}
  }
  return null;
}

async function testGenericRetry(api, timeoutMs = 30000) {
  // Retry with longer timeout for TIMEOUT/502 errors
  const ep = api.endpoint || api.baseUrl;
  if (!ep) return null;

  let baseUrl = ep.startsWith('http') ? ep : 'https://' + ep;
  const opPath = extractOpPath(api.operations);
  const url = opPath ? `${baseUrl.replace(/\/$/, '')}${opPath}` : baseUrl;
  const fullUrl = `${url}?serviceKey=${encodeURIComponent(SERVICE_KEY)}&pageNo=1&numOfRows=1`;

  try {
    const resp = await httpRequest(fullUrl, { timeout: timeoutMs });
    return { url: fullUrl, resp };
  } catch (e) {
    return { url: fullUrl, error: e.message };
  }
}

async function main() {
  const apis = JSON.parse(fs.readFileSync(V4_FILE, 'utf-8'));
  console.log(`Re-validating all ${apis.length} APIs...\n`);

  const results = [];
  const stats = { KEEP: 0, DROP: 0, PARTIAL: 0 };

  for (let i = 0; i < apis.length; i++) {
    const api = apis[i];
    const ep = api.endpoint || api.baseUrl || '';
    const opPath = extractOpPath(api.operations);
    let baseUrl = ep.startsWith('http') ? ep : (ep ? 'https://' + ep : '');
    let testUrl = opPath && baseUrl ? `${baseUrl.replace(/\/$/, '')}${opPath}` : baseUrl;
    if (testUrl) testUrl += `?serviceKey=${encodeURIComponent(SERVICE_KEY)}&pageNo=1&numOfRows=1`;

    process.stdout.write(`[${i + 1}/${apis.length}] ${api.name.substring(0, 50)}... `);

    let resp = null;
    let verdict = 'UNKNOWN';
    let reason = '';
    let method = 'GET';
    let finalUrl = testUrl;
    let sampleFields = [];
    let dataFormat = '';

    try {
      // Special handling for known problem APIs
      if (api.name.includes('국세청_사업자등록정보')) {
        const r = await test국세청(api);
        if (r && r.resp) {
          resp = r.resp;
          finalUrl = r.url;
          method = r.method || 'POST';
        }
      } else if (api.name.includes('한국예탁결제원')) {
        const r = await test한국예탁결제원(api);
        if (r && r.resp) { resp = r.resp; finalUrl = r.url; }
      } else if (api.name.includes('조달청') && !ep.includes('PubDataOpnStd')) {
        // 조달청 APIs (except the one that works)
        const r = await test조달청(api);
        if (r && r.resp) { resp = r.resp; finalUrl = r.variation; }
        // If still null, try standard
        if (!resp && testUrl) {
          resp = (await httpRequest(testUrl, { timeout: 15000 }).catch(() => null));
        }
      } else {
        // Standard test
        if (testUrl) {
          resp = await httpRequest(testUrl, { timeout: 15000 });
        }
      }
    } catch (err) {
      // Retry with longer timeout
      try {
        if (testUrl) resp = await httpRequest(testUrl, { timeout: 30000 });
      } catch (e2) {
        reason = e2.message;
      }
    }

    if (!resp && !reason) {
      reason = 'No endpoint or all attempts failed';
    }

    if (resp) {
      const analysis = analyzeResponse(resp.body, resp.status);
      sampleFields = analysis.sampleFields;
      dataFormat = analysis.format;

      if (resp.status === 200 && analysis.hasData) {
        verdict = 'KEEP';
        reason = analysis.hasNoData ? 'API works (no data for test params)' :
                 `${analysis.format.toUpperCase()} response with ${analysis.sampleFields.length} fields`;
      } else if (resp.status === 200 && analysis.format === 'html') {
        verdict = 'DROP';
        reason = 'Returns HTML page, not API data';
      } else if (resp.status === 200 && analysis.hasError) {
        if (resp.body.includes('SERVICE_KEY_IS_NOT_REGISTERED')) {
          verdict = 'DROP';
          reason = 'Service key not registered';
        } else {
          verdict = 'PARTIAL';
          reason = `API error: ${resp.body.substring(0, 100)}`;
        }
      } else if (resp.status === 404) {
        verdict = 'DROP';
        reason = '404 - endpoint not found after all attempts';
      } else if (resp.status === 502 || resp.status === 503) {
        verdict = 'PARTIAL';
        reason = `Server error ${resp.status} - may be temporary`;
      } else if (resp.status === 200) {
        // 200 but unusual format - check more carefully
        if (resp.body.includes('<results>') || resp.body.includes('<col ')) {
          verdict = 'KEEP';
          reason = 'Custom XML format with data';
        } else if (resp.body.trim().length > 20) {
          verdict = 'KEEP';
          reason = 'Returns data (non-standard format)';
        } else {
          verdict = 'PARTIAL';
          reason = 'Empty or minimal response';
        }
      } else {
        verdict = 'PARTIAL';
        reason = `HTTP ${resp.status}`;
      }
    } else {
      if (reason === 'TIMEOUT') {
        verdict = 'PARTIAL';
        reason = 'Server timeout (30s) - may be temporary';
      } else if (reason.includes('ECONNREFUSED')) {
        verdict = 'DROP';
        reason = 'Server down - connection refused';
      } else if (!ep) {
        verdict = 'PARTIAL';
        reason = 'No direct endpoint (Swagger-only API)';
      } else {
        verdict = 'DROP';
        reason = reason || 'Connection failed';
      }
    }

    const icon = verdict === 'KEEP' ? '✓' : verdict === 'DROP' ? '✗' : '△';
    console.log(`${icon} ${verdict} | ${reason.substring(0, 60)}`);

    stats[verdict] = (stats[verdict] || 0) + 1;

    results.push({
      index: i + 1,
      name: api.name,
      endpoint: ep,
      testedUrl: finalUrl,
      method,
      httpStatus: resp ? resp.status : 0,
      verdict,
      reason,
      category: assignCategory(api.name),
      operationsCount: api.operations ? api.operations.length : 0,
      dataFormat: api.dataFormat,
      responseFormat: dataFormat,
      sampleFields: sampleFields.slice(0, 10),
      responsePreview: resp ? resp.body.substring(0, 500) : ''
    });

    await new Promise(r => setTimeout(r, 400));
  }

  // Save report
  fs.writeFileSync(REPORT_FILE, JSON.stringify(results, null, 2), 'utf-8');

  // Print final summary
  console.log('\n' + '='.repeat(70));
  console.log('=== FINAL VALIDATION REPORT ===');
  console.log('='.repeat(70));
  console.log(`KEEP: ${stats.KEEP || 0} | PARTIAL: ${stats.PARTIAL || 0} | DROP: ${stats.DROP || 0}`);
  console.log('');

  // By category
  const cats = {};
  results.forEach(r => {
    if (!cats[r.category]) cats[r.category] = { keep: 0, partial: 0, drop: 0, items: [] };
    cats[r.category][r.verdict.toLowerCase()] = (cats[r.category][r.verdict.toLowerCase()] || 0) + 1;
    cats[r.category].items.push(r);
  });

  for (const [cat, data] of Object.entries(cats).sort((a, b) => {
    const order = { '사업자 등록/인증': 0, '금융/재무': 1, '고용/복지': 2, '기업집단': 3, '정부조달': 4, '인허가(행안부)': 5, '식약처': 6, '부동산': 7, '지식재산': 8, '창업/벤처': 9, '기타': 10 };
    return (order[a[0]] ?? 99) - (order[b[0]] ?? 99);
  })) {
    const total = data.items.length;
    console.log(`\n[${cat}] KEEP:${data.keep || 0} PARTIAL:${data.partial || 0} DROP:${data.drop || 0} (Total:${total})`);
    for (const item of data.items) {
      const icon = item.verdict === 'KEEP' ? '  ✓' : item.verdict === 'DROP' ? '  ✗' : '  △';
      const fields = item.sampleFields.length > 0 ? ` [${item.sampleFields.slice(0, 5).join(', ')}]` : '';
      console.log(`${icon} ${item.name.substring(0, 55)} | ${item.verdict} | ops:${item.operationsCount}${fields}`);
    }
  }

  console.log('\n' + '='.repeat(70));
  console.log(`FINAL: ${results.length} APIs | KEEP: ${stats.KEEP || 0} | PARTIAL: ${stats.PARTIAL || 0} | DROP: ${stats.DROP || 0}`);
  console.log(`Report: ${REPORT_FILE}`);
}

function assignCategory(name) {
  if (name.includes('국세청')) return '사업자 등록/인증';
  if (name.includes('금융위원회') && (name.includes('재무') || name.includes('기본정보') || name.includes('기업기본'))) return '금융/재무';
  if (name.includes('금융위원회')) return '금융/재무';
  if (name.includes('한국예탁결제원')) return '금융/재무';
  if (name.includes('국민연금')) return '고용/복지';
  if (name.includes('근로복지공단')) return '고용/복지';
  if (name.includes('한국산업인력공단')) return '고용/복지';
  if (name.includes('공정거래위원회') && name.includes('대규모기업집단')) return '기업집단';
  if (name.includes('공정거래위원회')) return '사업자 등록/인증';
  if (name.includes('조달청')) return '정부조달';
  if (name.includes('국토교통부')) return '부동산';
  if (name.includes('식품의약품안전처')) return '식약처';
  if (name.includes('지식재산처')) return '지식재산';
  if (name.includes('창업진흥원') || name.includes('중소벤처기업')) return '창업/벤처';
  if (name.includes('행정안전부')) return '인허가(행안부)';
  return '기타';
}

main().catch(err => { console.error('Fatal:', err.message); process.exit(1); });

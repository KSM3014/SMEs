/**
 * V3: Collect End Points and Operations for all 96 APIs from data.go.kr
 * Fixed: Uses new page per API to avoid "Requesting main frame too early"
 */
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const API_LIST_FILE = path.join(__dirname, 'api_list_96.json');
const OUTPUT_FILE = path.join(__dirname, 'api_endpoints_96.json');
const LIST_URL = 'https://www.data.go.kr/iim/api/selectAcountList.do';
const DETAIL_URL = 'https://www.data.go.kr/iim/api/selectAPIAcountView.do';
const CHROME_PROFILE = 'C:\\Users\\Administrator\\puppeteer_data_go_kr';

async function extractDetailPage(page) {
  return await page.evaluate(() => {
    const r = {
      endpoint: '',
      baseUrl: '',
      swaggerUrl: '',
      dataFormat: '',
      serviceType: '',
      referenceDoc: '',
      operations: []
    };

    const allThs = document.querySelectorAll('th');
    for (const th of allThs) {
      const label = th.textContent.trim();
      const td = th.nextElementSibling;
      if (!td) continue;
      const value = td.textContent.trim();

      if (label === 'End Point' || label === 'End point' || label === 'EndPoint') r.endpoint = value;
      if (label === 'Base URL' || label === 'Base Url' || label === 'baseUrl') r.baseUrl = value;
      if (label.includes('Swagger URL') || label.includes('Swagger Url')) r.swaggerUrl = value;
      if (label.includes('데이터포맷') || label.includes('데이터 포맷')) r.dataFormat = value;
      if (label.includes('서비스유형') || label.includes('서비스 유형')) r.serviceType = value;
      if (label.includes('참고문서')) {
        const link = td.querySelector('a');
        r.referenceDoc = link ? link.textContent.trim() : value;
      }
    }

    const tables = document.querySelectorAll('table');
    for (const table of tables) {
      const headers = table.querySelectorAll('th');
      const hTexts = Array.from(headers).map(h => h.textContent.trim());
      if (hTexts.some(h => h.includes('상세기능')) || hTexts.some(h => h.includes('기능명'))) {
        const rows = table.querySelectorAll('tbody tr');
        for (const row of rows) {
          const cells = row.querySelectorAll('td');
          if (cells.length >= 2) {
            r.operations.push({
              name: cells[1] ? cells[1].textContent.trim().replace(/\s+/g, ' ') : '',
              description: cells[2] ? cells[2].textContent.trim().replace(/\s+/g, ' ') : '',
              dailyTraffic: cells[3] ? cells[3].textContent.trim() : ''
            });
          }
        }
      }
    }

    const opblocks = document.querySelectorAll('.opblock');
    for (const block of opblocks) {
      const method = block.querySelector('.opblock-summary-method');
      const pathEl = block.querySelector('.opblock-summary-path, .opblock-summary-path__deprecated');
      if (method && pathEl) {
        r.operations.push({ name: pathEl.textContent.trim(), description: method.textContent.trim(), dailyTraffic: '' });
      }
    }

    return r;
  });
}

async function navigateToDetail(browser, api) {
  // Create a new page, go to list, click detail, extract, close page
  const page = await browser.newPage();
  page.setDefaultNavigationTimeout(25000);
  page.setDefaultTimeout(15000);

  try {
    // Go to list page first
    await page.goto(LIST_URL, { waitUntil: 'networkidle2' });
    await new Promise(r => setTimeout(r, 1500));

    // Use Promise.all to navigate to detail
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 20000 }),
      page.evaluate(({ uddiId, reqId, param3, param4 }) => {
        fn_detail(uddiId, reqId, param3, param4);
      }, api)
    ]);

    await new Promise(r => setTimeout(r, 3000));

    // Verify we're on the detail page
    const url = page.url();
    if (!url.includes('selectAPIAcountView')) {
      throw new Error('Not on detail page: ' + url);
    }

    const data = await extractDetailPage(page);
    await page.close();
    return data;
  } catch (err) {
    await page.close().catch(() => {});
    throw err;
  }
}

async function main() {
  const apiData = JSON.parse(fs.readFileSync(API_LIST_FILE, 'utf-8'));
  const apis = apiData.apis;
  console.log(`Loaded ${apis.length} APIs`);

  // Load existing results for resume
  let results = [];
  const completedUddis = new Set();
  if (fs.existsSync(OUTPUT_FILE)) {
    try {
      const existing = JSON.parse(fs.readFileSync(OUTPUT_FILE, 'utf-8'));
      // Only keep successful results (no errors)
      results = existing.filter(r => !r.error);
      results.forEach(r => completedUddis.add(r.uddiId));
      console.log(`Resuming: ${completedUddis.size} APIs already collected successfully`);
    } catch (e) {
      console.log('Starting fresh');
    }
  }

  const browser = await puppeteer.launch({
    headless: false,
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    userDataDir: CHROME_PROFILE,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-features=IsolateOrigins,site-per-process'],
    defaultViewport: { width: 1280, height: 900 }
  });

  // Check login status
  const testPage = await browser.newPage();
  await testPage.goto(LIST_URL, { waitUntil: 'networkidle2' });
  const content = await testPage.content();
  await testPage.close();

  if (content.includes('로그인') && !content.includes('로그아웃')) {
    console.log('Not logged in! Please log in and run again.');
    await browser.close();
    process.exit(1);
  }
  console.log('Confirmed: Logged in');

  // Close initial about:blank tab
  const pages = await browser.pages();
  if (pages.length > 0 && pages[0].url() === 'about:blank') {
    await pages[0].close();
  }

  let successCount = 0;
  let errorCount = 0;

  for (let i = 0; i < apis.length; i++) {
    const api = apis[i];

    if (completedUddis.has(api.uddiId)) {
      console.log(`[${i + 1}/${apis.length}] SKIP: ${api.name}`);
      continue;
    }

    console.log(`[${i + 1}/${apis.length}] ${api.name}`);

    try {
      const data = await navigateToDetail(browser, api);

      results.push({
        index: i + 1,
        name: api.name,
        uddiId: api.uddiId,
        reqId: api.reqId,
        ...data,
        error: null,
        collectedAt: new Date().toISOString()
      });
      completedUddis.add(api.uddiId);
      successCount++;

      const url = data.endpoint || data.baseUrl || '(none)';
      console.log(`  OK: ${url} | ops:${data.operations.length}`);

      fs.writeFileSync(OUTPUT_FILE, JSON.stringify(results, null, 2), 'utf-8');

    } catch (err) {
      errorCount++;
      console.log(`  ERR: ${err.message.substring(0, 120)}`);
    }

    // Small delay between APIs
    await new Promise(r => setTimeout(r, 500));
  }

  console.log(`\n=== DONE === Success:${successCount} Errors:${errorCount} Total:${results.length}`);
  const withEp = results.filter(r => r.endpoint || r.baseUrl).length;
  const withOps = results.filter(r => r.operations?.length > 0).length;
  console.log(`Endpoints:${withEp}/${results.length} Operations:${withOps}/${results.length}`);

  await browser.close();
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });

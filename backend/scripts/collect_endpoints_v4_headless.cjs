/**
 * V4: Headless Puppeteer - Collect End Points for all 96 APIs
 *
 * Features:
 * - Runs headless (no Chrome window conflicts)
 * - Auto-login via SSO with 2Captcha captcha solving
 * - Single page approach
 * - Resume capability from output file
 * - Automatic retry for failed APIs
 */
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const API_LIST_FILE = path.join(__dirname, 'api_list_96.json');
const OUTPUT_FILE = path.join(__dirname, 'api_endpoints_v4.json');
const LIST_URL = 'https://www.data.go.kr/iim/api/selectAcountList.do';
const SSO_LOGIN_URL = 'https://auth.data.go.kr/sso/common-login?client_id=hagwng3yzgpdmbpr2rxn&redirect_url=https://data.go.kr/sso/profile.do';
const PROFILE_DIR = path.join('C:\\Users\\Administrator', 'puppeteer_v4_profile');

// Credentials
const EMAIL = 'hye4103';
const PASSWORD = process.env.DATA_GO_KR_PASSWORD || process.env.DATAGOER_PASSWORD;
const CAPTCHA_API_KEY = process.env.CAPTCHA_API_KEY;

// ---- 2Captcha Helper ----
function httpGet(url) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http;
    mod.get(url, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

function httpPost(url, formData) {
  return new Promise((resolve, reject) => {
    const boundary = '----FormBoundary' + Math.random().toString(36).substring(2);
    let body = '';
    for (const [key, value] of Object.entries(formData)) {
      body += `--${boundary}\r\nContent-Disposition: form-data; name="${key}"\r\n\r\n${value}\r\n`;
    }
    body += `--${boundary}--\r\n`;

    const urlObj = new URL(url);
    const options = {
      hostname: urlObj.hostname,
      path: urlObj.pathname,
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': Buffer.byteLength(body)
      }
    };

    const mod = url.startsWith('https') ? https : http;
    const req = mod.request(options, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function solveCaptchaWith2Captcha(base64Image) {
  console.log('  Sending captcha to 2Captcha...');

  // Submit captcha
  const submitResult = await httpPost('https://2captcha.com/in.php', {
    key: CAPTCHA_API_KEY,
    method: 'base64',
    body: base64Image,
    json: '1'
  });

  let submitData;
  try {
    submitData = JSON.parse(submitResult);
  } catch (e) {
    throw new Error('2Captcha submit parse error: ' + submitResult);
  }

  if (submitData.status !== 1) {
    throw new Error('2Captcha submit error: ' + submitData.request);
  }

  const captchaId = submitData.request;
  console.log('  Captcha submitted, ID:', captchaId);

  // Poll for result
  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 3000));
    const result = await httpGet(`https://2captcha.com/res.php?key=${CAPTCHA_API_KEY}&action=get&id=${captchaId}&json=1`);
    let resultData;
    try {
      resultData = JSON.parse(result);
    } catch (e) {
      continue;
    }

    if (resultData.status === 1) {
      console.log('  Captcha solved:', resultData.request);
      return resultData.request;
    }

    if (resultData.request !== 'CAPCHA_NOT_READY') {
      throw new Error('2Captcha error: ' + resultData.request);
    }
    process.stdout.write('.');
  }

  throw new Error('2Captcha timeout');
}

async function doLogin(page) {
  console.log('Attempting SSO auto-login...');
  await page.goto(SSO_LOGIN_URL, { waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 3000));

  // Fill username
  await page.click('#inputUsername', { clickCount: 3 });
  await page.type('#inputUsername', EMAIL, { delay: 30 });

  // Fill password
  await page.click('#inputPassword', { clickCount: 3 });
  await page.type('#inputPassword', PASSWORD, { delay: 30 });

  // Solve captcha
  // Get captcha image - find the img element inside the captcha area
  const captchaImgSrc = await page.evaluate(() => {
    // Look for captcha image
    const imgs = document.querySelectorAll('img');
    for (const img of imgs) {
      if (img.src && (img.src.includes('captcha') || img.alt?.includes('captcha') || img.alt?.includes('보안'))) {
        return img.src;
      }
    }
    // Try to find by proximity to captcha input
    const captchaInput = document.querySelector('#captcha');
    if (captchaInput) {
      const parent = captchaInput.closest('div') || captchaInput.parentElement;
      const parentParent = parent?.parentElement;
      if (parentParent) {
        const img = parentParent.querySelector('img');
        if (img) return img.src;
      }
    }
    // Fallback: return all img srcs
    return Array.from(imgs).map(i => i.src).join('|');
  });

  console.log('  Captcha img src:', captchaImgSrc?.substring(0, 100));

  let captchaAnswer;

  if (captchaImgSrc && captchaImgSrc.includes('data:image')) {
    // Base64 encoded image
    const base64 = captchaImgSrc.split(',')[1];
    captchaAnswer = await solveCaptchaWith2Captcha(base64);
  } else if (captchaImgSrc && !captchaImgSrc.includes('|')) {
    // URL image - download and convert to base64
    const imgUrl = captchaImgSrc.startsWith('//') ? 'https:' + captchaImgSrc : captchaImgSrc;

    // Take screenshot of captcha element instead
    const captchaEl = await page.$('img[src*="captcha"]') ||
      await page.evaluateHandle(() => {
        const captchaInput = document.querySelector('#captcha');
        const parent = captchaInput?.closest('div')?.parentElement;
        return parent?.querySelector('img');
      });

    if (captchaEl && captchaEl.asElement()) {
      const box = await captchaEl.asElement().boundingBox();
      if (box) {
        const screenshot = await page.screenshot({
          clip: { x: box.x, y: box.y, width: box.width, height: box.height },
          encoding: 'base64'
        });
        captchaAnswer = await solveCaptchaWith2Captcha(screenshot);
      }
    }

    if (!captchaAnswer) {
      // Last resort: screenshot the captcha area
      const captchaContainer = await page.$('.captcha-wrap, .captcha-box, .captcha_box');
      if (captchaContainer) {
        const screenshot = await captchaContainer.screenshot({ encoding: 'base64' });
        captchaAnswer = await solveCaptchaWith2Captcha(screenshot);
      }
    }
  }

  if (!captchaAnswer) {
    // Fallback: screenshot the whole captcha region by coordinates
    console.log('  Using coordinate-based captcha capture...');
    // The captcha image appears to be around the middle of the form
    const captchaImgEl = await page.evaluateHandle(() => {
      // Find all images in the form area
      const container = document.querySelector('.login-form, form, .card-body, main');
      if (container) {
        const imgs = container.querySelectorAll('img');
        for (const img of imgs) {
          if (img.width > 50 && img.height > 20) return img; // Captcha images are usually small-medium
        }
      }
      return null;
    });

    if (captchaImgEl.asElement()) {
      const screenshot = await captchaImgEl.asElement().screenshot({ encoding: 'base64' });
      captchaAnswer = await solveCaptchaWith2Captcha(screenshot);
    }
  }

  if (!captchaAnswer) {
    throw new Error('Could not capture/solve captcha');
  }

  // Fill captcha answer
  await page.click('#captcha', { clickCount: 3 });
  await page.type('#captcha', captchaAnswer, { delay: 30 });

  // Click login button
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 }).catch(() => {}),
    page.click('#login-btn')
  ]);

  await new Promise(r => setTimeout(r, 3000));

  // Check login result
  const afterUrl = page.url();
  console.log('  After login URL:', afterUrl);

  // Navigate to list page to confirm
  await page.goto(LIST_URL, { waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 2000));
  const content = await page.content();

  if (content.includes('로그아웃')) {
    console.log('Login successful!');
    return true;
  }

  // Check if still on SSO page (captcha might have failed)
  console.log('Login may have failed. Current URL:', page.url());
  return false;
}

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
        r.operations.push({
          name: pathEl.textContent.trim(),
          description: method.textContent.trim(),
          dailyTraffic: ''
        });
      }
    }

    return r;
  });
}

async function collectAPI(page, api) {
  const currentUrl = page.url();
  if (!currentUrl.includes('selectAcountList')) {
    await page.goto(LIST_URL, { waitUntil: 'networkidle2' });
    await new Promise(r => setTimeout(r, 1500));
  }

  // Navigate to detail page via fn_detail()
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 20000 }),
    page.evaluate(({ uddiId, reqId, param3, param4 }) => {
      fn_detail(uddiId, reqId, param3, param4);
    }, api)
  ]);

  await new Promise(r => setTimeout(r, 2500));

  const url = page.url();
  if (!url.includes('selectAPIAcountView')) {
    throw new Error('Not on detail page: ' + url);
  }

  const data = await extractDetailPage(page);

  // Navigate back to list page
  await page.goto(LIST_URL, { waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 1000));

  return data;
}

async function main() {
  const apiData = JSON.parse(fs.readFileSync(API_LIST_FILE, 'utf-8'));
  const apis = apiData.apis;
  console.log(`Loaded ${apis.length} APIs`);

  let results = [];
  const completedUddis = new Set();
  if (fs.existsSync(OUTPUT_FILE)) {
    try {
      const existing = JSON.parse(fs.readFileSync(OUTPUT_FILE, 'utf-8'));
      results = existing.filter(r => !r.error);
      results.forEach(r => completedUddis.add(r.uddiId));
      console.log(`Resuming: ${completedUddis.size} APIs already collected successfully`);
    } catch (e) {
      console.log('Starting fresh');
    }
  }

  if (!fs.existsSync(PROFILE_DIR)) {
    fs.mkdirSync(PROFILE_DIR, { recursive: true });
  }

  const browser = await puppeteer.launch({
    headless: 'new',
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    userDataDir: PROFILE_DIR,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-gpu',
      '--disable-dev-shm-usage',
      '--disable-features=IsolateOrigins,site-per-process',
      '--disable-blink-features=AutomationControlled'
    ],
    defaultViewport: { width: 1280, height: 900 }
  });

  const page = await browser.newPage();
  page.setDefaultNavigationTimeout(30000);
  page.setDefaultTimeout(15000);
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36');

  // Check login status
  console.log('Navigating to list page...');
  await page.goto(LIST_URL, { waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 2000));

  const currentUrl = page.url();
  if (currentUrl.includes('auth.data.go.kr') || currentUrl.includes('login')) {
    console.log('Redirected to login. Attempting auto-login with 2Captcha...');
    const loginOk = await doLogin(page);
    if (!loginOk) {
      console.log('Login failed after captcha solve. Retrying once...');
      const loginOk2 = await doLogin(page);
      if (!loginOk2) {
        console.log('LOGIN FAILED. Exiting.');
        await browser.close();
        process.exit(1);
      }
    }
  }

  const content = await page.content();
  if (content.includes('로그인') && !content.includes('로그아웃')) {
    console.log('Still not logged in after attempts. Exiting.');
    await browser.close();
    process.exit(1);
  }
  console.log('Confirmed: Logged in');

  let successCount = 0;
  let errorCount = 0;
  let retryQueue = [];

  for (let i = 0; i < apis.length; i++) {
    const api = apis[i];

    if (completedUddis.has(api.uddiId)) {
      console.log(`[${i + 1}/${apis.length}] SKIP: ${api.name}`);
      continue;
    }

    console.log(`[${i + 1}/${apis.length}] ${api.name}`);

    try {
      const data = await collectAPI(page, api);

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

      const ep = data.endpoint || data.baseUrl || '(none)';
      console.log(`  OK: ${ep} | ops:${data.operations.length}`);

      fs.writeFileSync(OUTPUT_FILE, JSON.stringify(results, null, 2), 'utf-8');

    } catch (err) {
      errorCount++;
      console.log(`  ERR: ${err.message.substring(0, 120)}`);
      retryQueue.push({ index: i, api });

      try {
        await page.goto(LIST_URL, { waitUntil: 'networkidle2' });
        await new Promise(r => setTimeout(r, 2000));
      } catch (navErr) {
        console.log(`  RECOVER-ERR: ${navErr.message.substring(0, 60)}`);
      }
    }

    await new Promise(r => setTimeout(r, 800));
  }

  // Retry failed ones
  if (retryQueue.length > 0) {
    console.log(`\n=== RETRY PHASE: ${retryQueue.length} failed APIs ===`);
    for (const { index: i, api } of retryQueue) {
      if (completedUddis.has(api.uddiId)) continue;

      console.log(`[RETRY ${i + 1}] ${api.name}`);
      try {
        const data = await collectAPI(page, api);
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
        errorCount--;
        console.log(`  RETRY-OK: ${data.endpoint || data.baseUrl || '(none)'} | ops:${data.operations.length}`);
        fs.writeFileSync(OUTPUT_FILE, JSON.stringify(results, null, 2), 'utf-8');
      } catch (err) {
        console.log(`  RETRY-ERR: ${err.message.substring(0, 100)}`);
        try { await page.goto(LIST_URL, { waitUntil: 'networkidle2' }); } catch (e) {}
      }
    }
  }

  console.log(`\n=== DONE === Success:${successCount} Errors:${errorCount} Total:${results.length}`);
  const withEp = results.filter(r => r.endpoint || r.baseUrl).length;
  const withOps = results.filter(r => r.operations && r.operations.length > 0).length;
  console.log(`Endpoints:${withEp}/${results.length} Operations:${withOps}/${results.length}`);

  await browser.close();
}

main().catch(err => { console.error('Fatal:', err.message); process.exit(1); });

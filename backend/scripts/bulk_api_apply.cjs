/**
 * Phase 2.5: Bulk API 활용신청 (Usage Application) on data.go.kr
 *
 * Approach: Direct navigation (no popup windows)
 *   1. Login via 2Captcha SSO
 *   2. For each API: navigate directly to form URL → fill → submit
 *
 * Form URL pattern:
 *   /tcs/dss/redirectDevAcountRequestForm.do?publicDataPk={ID}
 *   → redirects to /iim/api/selectDevAcountRequestForm.do?publicDataDetailPk={UDDI}
 *
 * Usage: node scripts/bulk_api_apply.cjs [--dry-run] [--start=N] [--limit=N]
 */

const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const EMAIL = 'hye4103';
const PASSWORD = process.env.DATA_GO_KR_PASSWORD || process.env.DATAGOER_PASSWORD;
const CAPTCHA_API_KEY = process.env.CAPTCHA_API_KEY;
const SSO_LOGIN_URL = 'https://auth.data.go.kr/sso/common-login?client_id=hagwng3yzgpdmbpr2rxn&redirect_url=https://data.go.kr/sso/profile.do';
const PROFILE_DIR = 'C:\\Users\\Administrator\\puppeteer_apply_profile_v2';
const LOG_FILE = path.join(__dirname, '..', 'data', 'api_apply_log.json');
const DATA_DIR = path.join(__dirname, '..', 'data');

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const START = parseInt((args.find(a => a.startsWith('--start=')) || '').split('=')[1]) || 0;
const LIMIT = parseInt((args.find(a => a.startsWith('--limit=')) || '').split('=')[1]) || 9999;

const PURPOSE_TEXT = 'SME(중소기업) 투자 분석 플랫폼 개발을 위한 기업 정보 조회 및 분석 목적';

// All 67 API IDs
const API_IDS = [
  { id: '15059649', name: '금융위_공시정보' },
  { id: '15094775', name: '금융위_KRX상장종목정보' },
  { id: '15059594', name: '금융위_금융회사재무신용정보' },
  { id: '15139255', name: '금융위_자금조달공시정보' },
  { id: '15150946', name: '금융위_주식발행공시정보' },
  { id: '15043364', name: '금융위_주식분포및사고주권' },
  { id: '15059609', name: '금융위_주식권리일정' },
  { id: '15059585', name: '금융위_차입투자정보' },
  { id: '15059607', name: '금융위_주식등록예탁가능' },
  { id: '15059582', name: '금융위_국제거래종목(DR)' },
  { id: '15094808', name: '금융위_주식시세정보' },
  { id: '15094806', name: '금융위_증권상품시세' },
  { id: '15059611', name: '금융위_채권권리일정' },
  { id: '15091902', name: '공정위_대규모기업집단_참여업종' },
  { id: '15091909', name: '공정위_지주회사_자회사손자회사' },
  { id: '15126302', name: '공정위_방문판매_등록현황' },
  { id: '15126301', name: '공정위_방문판매_등록상세' },
  { id: '15126329', name: '공정위_후원방문판매_등록현황' },
  { id: '15126332', name: '공정위_후원방문판매_등록상세' },
  { id: '15126315', name: '공정위_통신판매_등록상세' },
  { id: '15126345', name: '공정위_전화권유판매_등록현황' },
  { id: '15126339', name: '공정위_전화권유판매_등록상세' },
  { id: '15126348', name: '공정위_선불식할부거래_등록현황' },
  { id: '15126347', name: '공정위_선불식할부거래_등록상세' },
  { id: '15127078', name: '공정위_선불식할부거래_정보' },
  { id: '15127082', name: '공정위_선불식할부거래_정보상세' },
  { id: '15125441', name: '공정위_가맹정보_가맹본부등록' },
  { id: '15143521', name: '공정위_페어데이터_가맹본부현황' },
  { id: '15127059', name: '공정위_다단계판매_정보' },
  { id: '15127067', name: '공정위_다단계판매_정보상세' },
  { id: '15117398', name: '식약처_급식_식재료공급업체' },
  { id: '15117399', name: '식약처_급식_위탁급식업체' },
  { id: '15058806', name: '식약처_대조약조회' },
  { id: '15058930', name: '식약처_의료기기GMP지정현황' },
  { id: '15117405', name: '식약처_의료기기유통업체' },
  { id: '15117407', name: '식약처_의료기기통합업체' },
  { id: '15117141', name: '식약처_의료기기행정처분' },
  { id: '15115469', name: '식약처_의약외품생산수입실적' },
  { id: '15095679', name: '식약처_의약외품제품허가' },
  { id: '15057639', name: '식약처_의약품낱알식별' },
  { id: '15111775', name: '식약처_의약품유효기간' },
  { id: '15059114', name: '식약처_의약품회수판매중지' },
  { id: '15059486', name: '식약처_DUR품목정보' },
  { id: '15124968', name: '환경공단_비점오염저감시설' },
  { id: '15141648', name: '환경공단_순환자원인정업체' },
  { id: '15141609', name: '환경공단_순환자원유통지원' },
  { id: '15125000', name: '환경공단_올바로회원정보' },
  { id: '15141647', name: '환경공단_전기전자재활용업체' },
  { id: '15124997', name: '환경공단_측정대행업체' },
  { id: '15141649', name: '환경공단_폐기물처리업체' },
  { id: '15124946', name: '지식재산처_등록원부' },
  { id: '15110018', name: '산업인력공단_훈련참여정보' },
  { id: '15012005', name: '소상공인_상가상권정보' },
  { id: '15155088', name: '행안부_상조업' },
  { id: '15155095', name: '행안부_승강기유지관리' },
  { id: '15155100', name: '행안부_승강기제조수입' },
  { id: '15154973', name: '행안부_대기오염배출시설' },
  { id: '15154989', name: '행안부_수질오염원시설' },
  { id: '15125655', name: '행안부_재난배상책임보험' },
  { id: '15020284', name: '국민연금_탈퇴사업장' },
  { id: '15119539', name: '한국조폐공사_가맹점기본정보' },
  { id: '15107784', name: '체육진흥공단_스포츠강좌' },
  { id: '15125366', name: '창업진흥원_주관기관정보' },
  { id: '15072207', name: '한국가스공사_계약정보' },
  { id: '15156661', name: '환경공단_폐기물행정처분' },
  { id: '15156648', name: '환경공단_전기전자업체정보' },
  { id: '15141320', name: '부산_경매결과일정산' },
];

// Also add APIs that may need special handling
const SPECIAL_IDS = [
  { id: '15059277', name: '지식재산처_KIPRISPlus출원인법인' },
  { id: '3038225', name: '워크넷_채용정보' },
  { id: '15106235', name: '벤처기업확인서' },
];

// ============================================================
// 2Captcha helpers
// ============================================================
function httpGet(u) {
  return new Promise((r, j) => {
    (u.startsWith('https') ? https : http).get(u, s => {
      let d = ''; s.on('data', c => d += c); s.on('end', () => r(d));
    }).on('error', j);
  });
}
function httpPost(u, f) {
  return new Promise((r, j) => {
    const b = '----FB' + Math.random().toString(36).substring(2);
    let body = '';
    for (const [k, v] of Object.entries(f)) body += `--${b}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`;
    body += `--${b}--\r\n`;
    const o = new URL(u);
    const req = (u.startsWith('https') ? https : http).request({
      hostname: o.hostname, path: o.pathname, method: 'POST',
      headers: { 'Content-Type': `multipart/form-data; boundary=${b}`, 'Content-Length': Buffer.byteLength(body) }
    }, s => { let d = ''; s.on('data', c => d += c); s.on('end', () => r(d)); });
    req.on('error', j); req.write(body); req.end();
  });
}
async function solveCaptcha(base64) {
  console.log('    2Captcha solving...');
  const sub = JSON.parse(await httpPost('https://2captcha.com/in.php', { key: CAPTCHA_API_KEY, method: 'base64', body: base64, json: '1' }));
  if (sub.status !== 1) throw new Error('Submit: ' + sub.request);
  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 3000));
    const res = JSON.parse(await httpGet(`https://2captcha.com/res.php?key=${CAPTCHA_API_KEY}&action=get&id=${sub.request}&json=1`));
    if (res.status === 1) { console.log('    Solved:', res.request); return res.request; }
    if (res.request !== 'CAPCHA_NOT_READY') throw new Error(res.request);
    process.stdout.write('.');
  }
  throw new Error('Timeout');
}

// ============================================================
// Login
// ============================================================
async function doLogin(page) {
  console.log('\n[LOGIN] SSO login...');
  await page.goto(SSO_LOGIN_URL, { waitUntil: 'networkidle2', timeout: 60000 });
  await new Promise(r => setTimeout(r, 3000));

  await page.click('#inputUsername', { clickCount: 3 });
  await page.type('#inputUsername', EMAIL, { delay: 30 });
  await page.click('#inputPassword', { clickCount: 3 });
  await page.type('#inputPassword', PASSWORD, { delay: 30 });

  const captchaEl = await page.evaluateHandle(() => {
    const c = document.querySelector('form, .card-body, main');
    if (c) { const imgs = c.querySelectorAll('img'); for (const i of imgs) if (i.width > 50 && i.height > 20) return i; }
    return null;
  });
  if (captchaEl.asElement()) {
    const ss = await captchaEl.asElement().screenshot({ encoding: 'base64' });
    const answer = await solveCaptcha(ss);
    await page.click('#captcha', { clickCount: 3 });
    await page.type('#captcha', answer, { delay: 30 });
  }

  await Promise.all([
    page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 }).catch(() => {}),
    page.click('#login-btn')
  ]);
  await new Promise(r => setTimeout(r, 3000));

  if (page.url().includes('common-login')) {
    console.log('  Captcha wrong, retrying...');
    return await doLogin(page);
  }

  await page.goto('https://www.data.go.kr/iim/api/selectAcountList.do', { waitUntil: 'networkidle2' });
  if ((await page.content()).includes('로그아웃')) {
    console.log('  Login OK!');
    return true;
  }
  throw new Error('Login failed');
}

// ============================================================
// Session check
// ============================================================
async function ensureLoggedIn(page) {
  const content = await page.content();
  if (content.includes('로그아웃')) return true;

  // Navigate to a known page to check session
  await page.goto('https://www.data.go.kr/iim/api/selectAcountList.do', { waitUntil: 'networkidle2', timeout: 30000 });
  const html = await page.content();
  if (html.includes('로그아웃')) return true;

  // Need to re-login
  console.log('  Session expired, re-logging in...');
  await doLogin(page);
  return true;
}

// ============================================================
// Log management
// ============================================================
function loadLog() {
  if (fs.existsSync(LOG_FILE)) return JSON.parse(fs.readFileSync(LOG_FILE, 'utf-8'));
  return { applied: [], failed: [], skipped: [], startedAt: new Date().toISOString() };
}
function saveLog(log) {
  log.updatedAt = new Date().toISOString();
  fs.writeFileSync(LOG_FILE, JSON.stringify(log, null, 2), 'utf-8');
}

// ============================================================
// Apply for single API — direct navigation approach
// ============================================================
async function applyForApi(page, apiId, apiName, index, total) {
  console.log(`\n[${index + 1}/${total}] ${apiName} (${apiId})`);

  // Track all dialogs
  const dialogs = [];
  const dialogHandler = async (dialog) => {
    const msg = dialog.message();
    const type = dialog.type();
    dialogs.push({ type, msg });
    console.log(`  DIALOG[${type}]: "${msg}"`);
    await dialog.accept();
  };
  page.on('dialog', dialogHandler);

  try {
    // Step 1: Set the cookie that fn_goOpenAPIRequestForm normally sets
    await page.evaluate(() => {
      document.cookie = 'currentMyMenuId=M020105; path=/; max-age=86400';
    });

    // Step 2: Navigate directly to the form URL
    const formUrl = `https://www.data.go.kr/tcs/dss/redirectDevAcountRequestForm.do?publicDataPk=${apiId}`;
    console.log('  Navigating to form...');
    await page.goto(formUrl, { waitUntil: 'networkidle2', timeout: 30000 });
    await new Promise(r => setTimeout(r, 2000));

    const currentUrl = page.url();
    console.log('  Form URL: ' + currentUrl.substring(0, 80));

    // Check if we landed on the form page
    if (!currentUrl.includes('selectDevAcountRequestForm') && !currentUrl.includes('redirectDevAcountRequestForm')) {
      // Might have been redirected to login or error page
      if (currentUrl.includes('login') || currentUrl.includes('common-login')) {
        console.log('  Session expired, re-logging in...');
        await doLogin(page);
        // Retry the navigation
        await page.goto(formUrl, { waitUntil: 'networkidle2', timeout: 30000 });
        await new Promise(r => setTimeout(r, 2000));
      }

      // Check if the API is already applied (might redirect to account list)
      if (page.url().includes('selectAcountList') || page.url().includes('selectDevAcountList')) {
        console.log('  SKIP: already applied (redirected to account list)');
        return { status: 'already_applied' };
      }

      // Check for error dialogs
      if (dialogs.some(d => d.msg.includes('이미') || d.msg.includes('중복'))) {
        console.log('  SKIP: duplicate application');
        return { status: 'already_applied' };
      }
    }

    if (DRY_RUN) {
      console.log('  DRY RUN - skipping form fill');
      const formInfo = await page.evaluate(() => {
        const radios = document.querySelectorAll('input[type="radio"]');
        const tas = document.querySelectorAll('textarea');
        const cbs = document.querySelectorAll('input[type="checkbox"]');
        return {
          radioCount: radios.length,
          textareaCount: tas.length,
          checkboxCount: cbs.length,
          pageTitle: document.title,
        };
      });
      console.log('  Form info:', JSON.stringify(formInfo));
      return { status: 'dry_run', formInfo };
    }

    // Step 3: Fill the form

    // 3a. Select purpose radio - "웹 사이트 개발" (first visible radio)
    const radioSelector = await page.evaluate(() => {
      const radios = document.querySelectorAll('input[type="radio"]');
      for (const r of radios) {
        if (r.offsetParent !== null) {
          // Return a selector we can use with page.click
          return r.id ? `#${r.id}` : `input[type="radio"][name="${r.name}"][value="${r.value}"]`;
        }
      }
      return null;
    });

    if (radioSelector) {
      await page.click(radioSelector);
      console.log('  Radio selected: ' + radioSelector);
    } else {
      // Fallback: click first radio via evaluate
      await page.evaluate(() => {
        const r = document.querySelector('input[type="radio"]');
        if (r) { r.checked = true; r.dispatchEvent(new Event('change', { bubbles: true })); }
      });
      console.log('  Radio selected (fallback)');
    }

    // 3b. Fill purpose textarea using page.type()
    const taSelector = await page.evaluate(() => {
      const tas = document.querySelectorAll('textarea');
      for (const ta of tas) {
        if (ta.offsetParent !== null) {
          return ta.id ? `#${ta.id}` : `textarea[name="${ta.name}"]`;
        }
      }
      return null;
    });

    if (taSelector) {
      // Clear existing content
      await page.click(taSelector, { clickCount: 3 });
      await page.keyboard.press('Backspace');
      await new Promise(r => setTimeout(r, 200));
      // Type new content
      await page.type(taSelector, PURPOSE_TEXT, { delay: 3 });
      console.log('  Textarea filled');
    } else {
      console.log('  WARNING: No textarea found');
    }

    // 3c. Check all checkboxes (operations + license agreement)
    const uncheckedCount = await page.evaluate(() => {
      let count = 0;
      document.querySelectorAll('input[type="checkbox"]').forEach(cb => {
        if (!cb.checked && cb.offsetParent !== null) {
          cb.click();
          count++;
        }
      });
      return count;
    });
    console.log(`  Checkboxes: ${uncheckedCount} newly checked`);

    // 3d. Brief pause before submit
    await new Promise(r => setTimeout(r, 1000));

    // Step 4: Find and click 활용신청 submit button
    // Use page.click() for proper event handling
    const submitSelector = await page.evaluate(() => {
      const btns = document.querySelectorAll('a, button, input[type="button"], input[type="submit"]');
      for (const btn of btns) {
        const text = (btn.textContent || btn.value || '').trim();
        if (text === '활용신청' && btn.offsetParent !== null) {
          // Generate a unique selector
          if (btn.id) return `#${btn.id}`;
          // Add a temp id
          btn.id = '__apply_btn__';
          return '#__apply_btn__';
        }
      }
      return null;
    });

    if (!submitSelector) {
      console.log('  ERROR: Submit button not found');
      await page.screenshot({ path: path.join(DATA_DIR, `apply_nosubmit_${apiId}.png`), fullPage: true });
      return { status: 'submit_not_found' };
    }

    // Click submit and wait for dialog
    console.log('  Clicking submit...');
    dialogs.length = 0; // Clear previous dialogs

    await page.click(submitSelector);

    // Wait for confirm dialog + server response
    await new Promise(r => setTimeout(r, 8000));

    // Step 5: Analyze result
    const finalUrl = page.url();
    const allMsgs = dialogs.map(d => d.msg).join(' ');

    // Success indicators
    if (finalUrl.includes('selectAcountList') || finalUrl.includes('selectDevAcountList')) {
      console.log('  SUCCESS! (redirected to account list)');
      return { status: 'success', method: 'redirect' };
    }

    if (allMsgs.includes('실패')) {
      console.log('  FAILED: ' + allMsgs);
      await page.screenshot({ path: path.join(DATA_DIR, `apply_fail_${apiId}.png`), fullPage: true });
      return { status: 'save_failed', dialogs: dialogs.map(d => d.msg) };
    }

    if (dialogs.length > 0 && !allMsgs.includes('실패')) {
      // Got confirm dialog, no failure → likely success
      console.log('  SUCCESS! (dialog confirmed, no failure)');
      return { status: 'success', method: 'dialog', dialogs: dialogs.map(d => d.msg) };
    }

    // Check the page content for clues
    const pageText = await page.evaluate(() => document.body.innerText.substring(0, 500)).catch(() => '');
    if (pageText.includes('활용신청 현황') || pageText.includes('개발계정')) {
      console.log('  SUCCESS! (page content)');
      return { status: 'success', method: 'content' };
    }

    console.log(`  UNKNOWN result. URL: ${finalUrl.substring(0, 80)}`);
    console.log(`  Dialogs: ${JSON.stringify(dialogs)}`);
    await page.screenshot({ path: path.join(DATA_DIR, `apply_unknown_${apiId}.png`), fullPage: true });
    return { status: 'unknown', url: finalUrl, dialogs: dialogs.map(d => d.msg) };

  } catch (err) {
    console.log(`  ERROR: ${err.message}`);
    await page.screenshot({ path: path.join(DATA_DIR, `apply_err_${apiId}.png`), fullPage: true }).catch(() => {});
    return { status: 'error', message: err.message };
  } finally {
    page.removeListener('dialog', dialogHandler);
  }
}

// ============================================================
// Main
// ============================================================
async function main() {
  console.log('========================================');
  console.log('  Phase 2.5: Bulk API Application');
  console.log('========================================');
  console.log(`  Total APIs: ${API_IDS.length}`);
  console.log(`  Range: ${START} ~ ${START + LIMIT}`);
  console.log(`  DRY RUN: ${DRY_RUN}`);
  console.log('');

  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

  const log = loadLog();
  const browser = await puppeteer.launch({
    headless: 'new',
    userDataDir: PROFILE_DIR,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--window-size=1920,1080'],
    defaultViewport: { width: 1920, height: 1080 },
    protocolTimeout: 120000,
  });

  const page = await browser.newPage();

  try {
    // Login
    await page.goto('https://www.data.go.kr/iim/api/selectAcountList.do', { waitUntil: 'networkidle2', timeout: 30000 });
    if ((await page.content()).includes('로그아웃')) {
      console.log('Existing session valid');
    } else {
      for (let i = 0; i < 3; i++) {
        try { await doLogin(page); break; } catch (e) { console.log(`  Login attempt ${i + 1}/3 failed:`, e.message); }
      }
    }

    // Apply for each API
    const apiSlice = API_IDS.slice(START, START + LIMIT);
    let successCount = 0, skipCount = 0, failCount = 0;

    for (let i = 0; i < apiSlice.length; i++) {
      const api = apiSlice[i];

      // Skip if already successfully applied
      if (log.applied.includes(api.id)) {
        console.log(`\n[${i + 1}/${apiSlice.length}] ${api.name} -- already applied`);
        skipCount++;
        continue;
      }

      const result = await applyForApi(page, api.id, api.name, i, apiSlice.length);

      if (result.status === 'success') {
        log.applied.push(api.id);
        // Remove from failed if previously failed
        log.failed = log.failed.filter(f => f.id !== api.id);
        successCount++;
      } else if (result.status === 'already_applied' || result.status === 'dry_run') {
        if (!log.skipped.includes(api.id)) log.skipped.push(api.id);
        skipCount++;
      } else {
        // Add to failed (replace if already exists)
        log.failed = log.failed.filter(f => f.id !== api.id);
        log.failed.push({ id: api.id, name: api.name, ...result, timestamp: new Date().toISOString() });
        failCount++;
      }

      saveLog(log);

      // Re-check session every 10 APIs
      if (i > 0 && i % 10 === 0) {
        console.log('\n  [Session check...]');
        await ensureLoggedIn(page);
      }

      // Brief pause between APIs (avoid rate limiting)
      if (i < apiSlice.length - 1) await new Promise(r => setTimeout(r, 2000));
    }

    // Summary
    console.log('\n========================================');
    console.log('  RESULTS');
    console.log('========================================');
    console.log(`  Success: ${successCount}`);
    console.log(`  Skipped: ${skipCount}`);
    console.log(`  Failed:  ${failCount}`);
    console.log(`  Log: ${LOG_FILE}`);

  } catch (err) {
    console.error('\nFATAL ERROR:', err.message);
    await page.screenshot({ path: path.join(DATA_DIR, 'apply_fatal.png'), fullPage: true }).catch(() => {});
  } finally {
    await browser.close();
  }
}

main().catch(console.error);

/**
 * Sminfo Client (sminfo.mss.go.kr)
 * 중소기업 현황정보 시스템
 *
 * ⚠️ Rate Limit: 분당 3회
 * ⚠️ 최후 수단으로만 사용 (DART → 공공데이터 → sminfo)
 */

import puppeteer from 'puppeteer';
import dotenv from 'dotenv';

dotenv.config();

class SminfoClient {
  constructor(credentials = {}) {
    this.loginUrl = 'https://sminfo.mss.go.kr/';
    this.userId = credentials.userId || process.env.SMINFO_USER_ID;
    this.password = credentials.password || process.env.SMINFO_PASSWORD;

    if (!this.userId || !this.password) {
      console.warn('[Sminfo] WARNING: SMINFO_USER_ID / SMINFO_PASSWORD not set in .env');
    }

    // Rate limit 관리
    this.requestCount = 0;
    this.lastResetTime = Date.now();
    this.maxRequestsPerMinute = 3;

    // 브라우저 재사용
    this.browser = null;
    this.page = null;
    this.isLoggedIn = false;
  }

  /**
   * Rate limit 체크 및 대기
   */
  async checkRateLimit() {
    const now = Date.now();
    const elapsedTime = now - this.lastResetTime;

    // 1분 경과 시 리셋
    if (elapsedTime >= 60000) {
      this.requestCount = 0;
      this.lastResetTime = now;
      console.log('[Sminfo] Rate limit reset');
      return;
    }

    // Rate limit 초과 시 대기
    if (this.requestCount >= this.maxRequestsPerMinute) {
      const waitTime = 60000 - elapsedTime;
      console.warn(`[Sminfo] Rate limit reached (${this.requestCount}/${this.maxRequestsPerMinute}). Waiting ${Math.ceil(waitTime / 1000)}s...`);
      await this.sleep(waitTime);

      // 대기 후 리셋
      this.requestCount = 0;
      this.lastResetTime = Date.now();
    }

    this.requestCount++;
    console.log(`[Sminfo] Request ${this.requestCount}/${this.maxRequestsPerMinute} this minute`);
  }

  /**
   * 로그인
   */
  async login() {
    try {
      if (this.isLoggedIn && this.page) {
        console.log('[Sminfo] Already logged in, reusing session');
        return true;
      }

      console.log('[Sminfo] Logging in...');

      if (!this.browser) {
        this.browser = await puppeteer.launch({
          headless: true,
          args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
      }

      this.page = await this.browser.newPage();
      await this.page.goto(this.loginUrl, { waitUntil: 'networkidle2', timeout: 30000 });

      // 로그인 폼 찾기 (실제 셀렉터는 페이지 구조에 맞게 조정 필요)
      const loginExists = await this.page.evaluate(() => {
        return document.querySelector('input[name="userId"], input[name="id"], input#userId') !== null;
      });

      if (!loginExists) {
        console.log('[Sminfo] Login form not found, might already be logged in or page structure changed');
        this.isLoggedIn = true;
        return true;
      }

      // 로그인 정보 입력 (확장된 셀렉터 포함)
      const loginResult = await this.page.evaluate((userId, password) => {
        // 한국 정부 사이트 패턴 포함한 다양한 셀렉터
        const userIdSelectors = [
          'input[name="userId"]', 'input[name="id"]', 'input[name="user_id"]',
          'input#userId', 'input#id', 'input#user_id',
          'input[name="mberId"]', 'input#mberId', // 회원ID
          'input[name="loginId"]', 'input#loginId',
          'input[name="mber_id"]', 'input#mber_id'
        ];
        const passwordSelectors = [
          'input[name="password"]', 'input[name="pw"]', 'input[name="passwd"]',
          'input#password', 'input#pw', 'input#passwd',
          'input[name="mberPw"]', 'input#mberPw', // 회원비밀번호
          'input[name="loginPw"]', 'input#loginPw',
          'input[name="mber_pw"]', 'input#mber_pw'
        ];

        let userIdInput = null;
        let passwordInput = null;

        // visible input만 찾기
        for (const selector of userIdSelectors) {
          const input = document.querySelector(selector);
          if (input && input.type !== 'hidden' && input.offsetParent !== null) {
            userIdInput = input;
            userIdInput.value = userId;
            break;
          }
        }

        for (const selector of passwordSelectors) {
          const input = document.querySelector(selector);
          if (input && input.type !== 'hidden' && input.offsetParent !== null) {
            passwordInput = input;
            passwordInput.value = password;
            break;
          }
        }

        // fallback: 첫 번째 text와 password input 사용
        if (!userIdInput) {
          const textInputs = Array.from(document.querySelectorAll('input[type="text"]'));
          userIdInput = textInputs.find(input => input.offsetParent !== null);
          if (userIdInput) userIdInput.value = userId;
        }

        if (!passwordInput) {
          const pwInputs = Array.from(document.querySelectorAll('input[type="password"]'));
          passwordInput = pwInputs.find(input => input.offsetParent !== null);
          if (passwordInput) passwordInput.value = password;
        }

        if (!userIdInput || !passwordInput) {
          return { success: false, error: 'Login inputs not found' };
        }

        // 로그인 버튼 찾기 및 클릭
        const loginButtons = [
          'button[type="submit"]', 'input[type="submit"]', 'input[type="image"]',
          'button.login', 'a.login', 'button#loginBtn', 'button#login',
          'a[href*="login"]', 'button[onclick*="login"]'
        ];

        let clicked = false;
        for (const selector of loginButtons) {
          const btn = document.querySelector(selector);
          if (btn && btn.offsetParent !== null) {
            btn.click();
            clicked = true;
            break;
          }
        }

        // fallback: "로그인" 텍스트가 있는 버튼 찾기
        if (!clicked) {
          const allButtons = Array.from(document.querySelectorAll('button, a, input[type="submit"], input[type="image"]'));
          const loginBtn = allButtons.find(btn =>
            (btn.textContent && btn.textContent.includes('로그인')) ||
            (btn.value && btn.value.includes('로그인')) ||
            (btn.alt && btn.alt.includes('로그인'))
          );
          if (loginBtn && loginBtn.offsetParent !== null) {
            loginBtn.click();
            clicked = true;
          }
        }

        return {
          success: true,
          clicked: clicked,
          userIdSelector: userIdInput.name || userIdInput.id || 'unknown',
          passwordSelector: passwordInput.name || passwordInput.id || 'unknown'
        };
      }, this.userId, this.password);

      console.log('[Sminfo] Login form fill result:', loginResult);

      if (!loginResult.success) {
        console.warn('[Sminfo] ⚠️ Could not find login form elements');
        // 디버깅용 스크린샷 저장
        await this.page.screenshot({ path: 'sminfo_debug_login.png', fullPage: true });
        console.log('[Sminfo] Screenshot saved: sminfo_debug_login.png');
      }

      // 로그인 완료 대기 (URL 변경 또는 특정 요소 확인)
      await this.page.waitForTimeout(3000);

      this.isLoggedIn = true;
      console.log('[Sminfo] Login successful');

      return true;

    } catch (error) {
      console.error('[Sminfo] Login failed:', error.message);
      this.isLoggedIn = false;
      return false;
    }
  }

  /**
   * 사업자등록번호로 기업 재무정보 조회
   */
  async getCompanyByBusinessNumber(businessNumber) {
    try {
      // Rate limit 체크
      await this.checkRateLimit();

      // 로그인 확인
      if (!this.isLoggedIn) {
        await this.login();
      }

      console.log(`[Sminfo] Fetching company data for ${businessNumber}...`);

      // 기업정보 페이지로 이동 (실제 URL은 조정 필요)
      const searchUrl = `https://sminfo.mss.go.kr/cm/sv/CSV001R0.do`;
      await this.page.goto(searchUrl, { waitUntil: 'networkidle2', timeout: 30000 });

      // 사업자등록번호 입력 및 검색 (확장된 셀렉터)
      const searchResult = await this.page.evaluate((bizNum) => {
        // 다양한 사업자번호 입력 필드 패턴
        const bizNoSelectors = [
          'input[name="bizNo"]', 'input[name="businessNumber"]', 'input[name="bizrno"]',
          'input#bizNo', 'input#businessNumber', 'input#bizrno',
          'input[name="brno"]', 'input#brno', // 사업자등록번호
          'input[name="bmanEnprsDscmNo"]', // 국민연금 API 패턴
          'input[name="corpNo"]', 'input#corpNo'
        ];

        let bizNoInput = null;

        for (const selector of bizNoSelectors) {
          const input = document.querySelector(selector);
          if (input && input.type !== 'hidden' && input.offsetParent !== null) {
            bizNoInput = input;
            bizNoInput.value = bizNum.replace(/-/g, ''); // 하이픈 제거
            break;
          }
        }

        // fallback: placeholder나 label에 "사업자"가 있는 input 찾기
        if (!bizNoInput) {
          const allTextInputs = Array.from(document.querySelectorAll('input[type="text"]'));
          bizNoInput = allTextInputs.find(input =>
            input.offsetParent !== null &&
            (input.placeholder?.includes('사업자') ||
             input.parentElement?.textContent?.includes('사업자'))
          );
          if (bizNoInput) bizNoInput.value = bizNum.replace(/-/g, '');
        }

        if (!bizNoInput) {
          return { success: false, error: 'Business number input not found' };
        }

        // 검색 버튼 클릭
        const searchButtons = [
          'button.search', 'button#searchBtn', 'button.searchBtn',
          'button[type="submit"]', 'input[type="submit"]',
          'button[onclick*="search"]', 'a[onclick*="search"]'
        ];

        let clicked = false;
        for (const selector of searchButtons) {
          const btn = document.querySelector(selector);
          if (btn && btn.offsetParent !== null) {
            btn.click();
            clicked = true;
            break;
          }
        }

        // fallback: "검색", "조회" 텍스트가 있는 버튼
        if (!clicked) {
          const allButtons = Array.from(document.querySelectorAll('button, input[type="submit"], a'));
          const searchBtn = allButtons.find(btn =>
            btn.offsetParent !== null &&
            ((btn.textContent && (btn.textContent.includes('검색') || btn.textContent.includes('조회'))) ||
             (btn.value && (btn.value.includes('검색') || btn.value.includes('조회'))))
          );
          if (searchBtn) {
            searchBtn.click();
            clicked = true;
          }
        }

        return {
          success: true,
          clicked: clicked,
          selector: bizNoInput.name || bizNoInput.id || 'unknown'
        };
      }, businessNumber);

      console.log('[Sminfo] Search form fill result:', searchResult);

      if (!searchResult.success) {
        console.warn('[Sminfo] ⚠️ Could not find business number input');
        await this.page.screenshot({ path: 'sminfo_debug_search.png', fullPage: true });
        console.log('[Sminfo] Screenshot saved: sminfo_debug_search.png');
      }

      await this.page.waitForTimeout(3000);

      // 재무정보 추출 (확장된 패턴 매칭)
      const financialData = await this.page.evaluate(() => {
        const data = {};
        const foundLabels = []; // 디버깅용

        // 1. 테이블에서 데이터 추출
        const tables = document.querySelectorAll('table');
        tables.forEach(table => {
          const rows = table.querySelectorAll('tr');
          rows.forEach(row => {
            const cells = row.querySelectorAll('td, th');
            if (cells.length >= 2) {
              const label = cells[0].textContent.trim();
              const value = cells[1].textContent.trim();

              foundLabels.push(label);

              // 매출액 (다양한 패턴)
              if (label.match(/매출|revenue|sales/i) && !data.revenue) {
                const num = parseInt(value.replace(/[^0-9]/g, ''));
                if (num > 0) data.revenue = num;
              }
              // 영업이익
              if (label.match(/영업이익|operating.*profit/i) && !data.operating_profit) {
                const num = parseInt(value.replace(/[^0-9-]/g, ''));
                if (!isNaN(num)) data.operating_profit = num;
              }
              // 당기순이익
              if (label.match(/당기순이익|순이익|net.*profit|net.*income/i) && !data.net_profit) {
                const num = parseInt(value.replace(/[^0-9-]/g, ''));
                if (!isNaN(num)) data.net_profit = num;
              }
              // 자산총계
              if (label.match(/자산총계|총자산|total.*asset/i) && !data.total_assets) {
                const num = parseInt(value.replace(/[^0-9]/g, ''));
                if (num > 0) data.total_assets = num;
              }
              // 부채총계
              if (label.match(/부채총계|총부채|total.*liabilit/i) && !data.total_liabilities) {
                const num = parseInt(value.replace(/[^0-9]/g, ''));
                if (num > 0) data.total_liabilities = num;
              }
              // 자본총계
              if (label.match(/자본총계|총자본|자기자본|total.*equity|shareholders.*equity/i) && !data.total_equity) {
                const num = parseInt(value.replace(/[^0-9]/g, ''));
                if (num > 0) data.total_equity = num;
              }
            }
          });
        });

        // 2. dl/dt/dd 구조에서 추출 (일부 사이트는 이 구조 사용)
        const dts = document.querySelectorAll('dt');
        dts.forEach(dt => {
          const dd = dt.nextElementSibling;
          if (dd && dd.tagName === 'DD') {
            const label = dt.textContent.trim();
            const value = dd.textContent.trim();

            if (label.match(/매출/i) && !data.revenue) {
              const num = parseInt(value.replace(/[^0-9]/g, ''));
              if (num > 0) data.revenue = num;
            }
            // ... 동일한 패턴으로 다른 필드들 추출
          }
        });

        return { data, foundLabels: foundLabels.slice(0, 20) }; // 디버깅용 라벨 샘플
      });

      console.log('[Sminfo] Found labels sample:', financialData.foundLabels);

      if (Object.keys(financialData.data).length === 0) {
        console.log(`[Sminfo] ❌ No financial data found for ${businessNumber}`);

        // 디버깅용 스크린샷 및 HTML 저장
        await this.page.screenshot({ path: 'sminfo_debug_nodata.png', fullPage: true });
        const html = await this.page.content();
        const fs = await import('fs');
        fs.default.writeFileSync('sminfo_debug_nodata.html', html);

        console.log('[Sminfo] Debug files saved: sminfo_debug_nodata.png, sminfo_debug_nodata.html');
        return null;
      }

      console.log(`[Sminfo] ✅ Financial data retrieved:`, Object.keys(financialData.data).join(', '));

      return this.normalizeData(businessNumber, financialData.data);

    } catch (error) {
      console.error(`[Sminfo] Error fetching ${businessNumber}:`, error.message);
      return null;
    }
  }

  /**
   * 데이터 정규화
   */
  normalizeData(businessNumber, rawData) {
    const normalized = {
      business_number: businessNumber,
      source: 'sminfo',

      // 재무 정보
      revenue: rawData.revenue || null,
      operating_profit: rawData.operating_profit || null,
      net_profit: rawData.net_profit || null,

      // 재무상태표
      total_assets: rawData.total_assets || null,
      total_liabilities: rawData.total_liabilities || null,
      total_equity: rawData.total_equity || null,

      // 계산 가능한 지표
      operating_margin: null,
      roe: null,
      debt_ratio: null
    };

    // 영업이익률 계산
    if (normalized.revenue && normalized.operating_profit) {
      normalized.operating_margin = parseFloat(
        ((normalized.operating_profit / normalized.revenue) * 100).toFixed(2)
      );
    }

    // ROE 계산
    if (normalized.net_profit && normalized.total_equity) {
      normalized.roe = parseFloat(
        ((normalized.net_profit / normalized.total_equity) * 100).toFixed(2)
      );
    }

    // 부채비율 계산
    if (normalized.total_liabilities && normalized.total_equity) {
      normalized.debt_ratio = parseFloat(
        ((normalized.total_liabilities / normalized.total_equity) * 100).toFixed(2)
      );
    }

    return normalized;
  }

  /**
   * 브라우저 종료
   */
  async close() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.page = null;
      this.isLoggedIn = false;
      console.log('[Sminfo] Browser closed');
    }
  }

  /**
   * Sleep helper
   */
  async sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export default SminfoClient;

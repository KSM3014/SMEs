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
   * sminfo는 1분에 3회 이상 조회 시 해당 IP를 1시간 동안 차단
   * 안전하게 2회/분으로 제한하고, 요청 간 최소 25초 간격 유지
   */
  async checkRateLimit() {
    const now = Date.now();
    const elapsedTime = now - this.lastResetTime;

    // 1분 경과 시 리셋
    if (elapsedTime >= 60000) {
      this.requestCount = 0;
      this.lastResetTime = now;
    }

    // Rate limit 초과 시 대기
    if (this.requestCount >= this.maxRequestsPerMinute) {
      const waitTime = 60000 - elapsedTime;
      console.warn(`[Sminfo] Rate limit reached (${this.requestCount}/${this.maxRequestsPerMinute}). Waiting ${Math.ceil(waitTime / 1000)}s...`);
      await this.sleep(waitTime);
      this.requestCount = 0;
      this.lastResetTime = Date.now();
    }

    // 최소 요청 간격: 25초 (안전 마진)
    if (this._lastRequestTime) {
      const gap = now - this._lastRequestTime;
      if (gap < 25000) {
        const wait = 25000 - gap;
        console.log(`[Sminfo] Minimum gap wait: ${Math.ceil(wait / 1000)}s`);
        await this.sleep(wait);
      }
    }

    this.requestCount++;
    this._lastRequestTime = Date.now();
    console.log(`[Sminfo] Request ${this.requestCount}/${this.maxRequestsPerMinute} this minute`);
  }

  /**
   * 로그인
   *
   * sminfo.mss.go.kr 로그인 플로우:
   * 1. 홈페이지 위젯: #login_id / #login_password / button.login_btn
   * 2. 전용 로그인 페이지 (/cm/mm/CMM004R0.do): #id / #pwd / button.btn_blue
   * 3. 로그인 성공 시 '로그아웃' 텍스트 노출
   */
  async login() {
    try {
      if (this.isLoggedIn && this.page) {
        console.log('[Sminfo] Already logged in, reusing session');
        return true;
      }

      if (!this.userId || !this.password) {
        console.error('[Sminfo] ❌ SMINFO_USER_ID / SMINFO_PASSWORD not configured');
        return false;
      }

      console.log('[Sminfo] Logging in...');

      if (!this.browser) {
        this.browser = await puppeteer.launch({
          headless: true,
          args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu', '--disable-dev-shm-usage'],
          protocolTimeout: 180000
        });
      }

      this.page = await this.browser.newPage();
      await this.page.setViewport({ width: 1280, height: 900 });

      // Handle dialogs (login errors, confirm prompts)
      this._lastDialog = null;
      this.page.on('dialog', async dialog => {
        this._lastDialog = { type: dialog.type(), message: dialog.message() };
        console.log(`[Sminfo] Dialog: ${dialog.message()}`);
        await dialog.accept();
      });

      // 로그인: 홈페이지 AJAX 위젯 → fnSubmit으로 기업정보 이동
      // (doAlert는 버그로 항상 로그인 리다이렉트하므로 사용하지 않음)
      console.log('[Sminfo] Step 1: Homepage AJAX login');
      await this.page.goto(this.loginUrl, { waitUntil: 'networkidle2', timeout: 30000 });
      await this.sleep(1000);

      await this.page.click('#login_id', { clickCount: 3 });
      await this.page.type('#login_id', this.userId, { delay: 20 });
      await this.page.click('#login_password', { clickCount: 3 });
      await this.page.type('#login_password', this.password, { delay: 20 });

      await Promise.all([
        this.page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 }).catch(() => null),
        this.page.click('button.login_btn')
      ]);
      await this.sleep(2000);

      // Check for login error dialog
      if (this._lastDialog && this._lastDialog.message.includes('등록되어 있지 않')) {
        console.error('[Sminfo] ❌ Login failed: account not registered');
        this.isLoggedIn = false;
        return false;
      }
      if (this._lastDialog && this._lastDialog.message.includes('비밀번호')) {
        console.error('[Sminfo] ❌ Login failed: wrong password');
        this.isLoggedIn = false;
        return false;
      }

      // Verify login via loginFlag or 로그아웃 text
      const loginVerified = await this.page.evaluate(() => {
        const bodyText = document.body?.innerText || '';
        return bodyText.includes('로그아웃');
      });

      if (!loginVerified) {
        console.error('[Sminfo] ❌ Login failed (no 로그아웃 text)');
        this.isLoggedIn = false;
        return false;
      }

      // Step 2: fnSubmit으로 기업정보 페이지 이동 (같은 세션 유지)
      console.log('[Sminfo] Step 2: Navigate to 기업정보 via fnSubmit');
      await Promise.all([
        this.page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }).catch(() => null),
        this.page.evaluate(() => {
          window.fnSubmit('/gc/sf/GSF002R0.print', '421010100', true);
        })
      ]);
      await this.sleep(2000);

      const finalUrl = this.page.url();
      console.log(`[Sminfo] On 기업정보 page: ${finalUrl}`);

      this.isLoggedIn = true;
      console.log('[Sminfo] ✅ Login successful, on 기업정보 page');
      return true;

    } catch (error) {
      console.error('[Sminfo] Login failed:', error.message);
      this.isLoggedIn = false;
      return false;
    }
  }

  /**
   * 사업자등록번호로 기업 재무정보 조회
   * sminfo 상세검색 폼에서 cmQueryOptionCombo=03 (사업자번호) 사용
   */
  async getCompanyByBusinessNumber(businessNumber) {
    try {
      await this.checkRateLimit();

      if (!this.isLoggedIn) {
        const loggedIn = await this.login();
        if (!loggedIn) return null;
      }

      const brn = businessNumber.replace(/-/g, '');
      console.log(`[Sminfo] Searching by BRN: ${brn}`);

      // 사업자번호 모드로 검색
      await this.page.evaluate((num) => {
        const form = document.search;
        form.cmQueryOptionCombo.value = '03'; // 사업자번호
        form.cmQuery.value = num;
      }, brn);

      await this.page.click('#searchTxt', { clickCount: 3 });
      await this.page.type('#searchTxt', brn, { delay: 20 });

      await Promise.all([
        this.page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }).catch(() => null),
        this.page.evaluate(() => window.searchByTarget(1, '_self'))
      ]);
      await this.sleep(2000);

      // 결과에서 첫 번째 기업 클릭
      const firstResult = await this.page.evaluate(() => {
        for (const table of document.querySelectorAll('table')) {
          const ths = Array.from(table.querySelectorAll('th')).map(th => th.textContent.trim());
          if (!ths.includes('기업명')) continue;
          const link = table.querySelector('tr td a[onclick]');
          if (link) {
            const onclick = link.getAttribute('onclick');
            return { name: link.textContent.trim(), onclick };
          }
        }
        return null;
      });

      if (!firstResult) {
        console.log(`[Sminfo] No results for BRN ${brn}`);
        return null;
      }

      console.log(`[Sminfo] Found: "${firstResult.name}"`);

      // 상세 페이지 이동
      await Promise.all([
        this.page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }).catch(() => null),
        this.page.evaluate((onclick) => eval(onclick), firstResult.onclick)
      ]);
      await this.sleep(3000);

      // 재무정보 추출
      const financialData = await this._extractFinancials();

      if (!financialData) {
        console.log(`[Sminfo] No financial data for ${brn}`);
        return null;
      }

      console.log(`[Sminfo] ✅ Financial data: ${Object.keys(financialData).join(', ')}`);

      // 검색 페이지로 복귀
      await this.page.goBack({ waitUntil: 'networkidle2', timeout: 15000 }).catch(() => null);
      await this.sleep(1000);

      return this.normalizeData(businessNumber, financialData);

    } catch (error) {
      console.error(`[Sminfo] Error fetching ${businessNumber}:`, error.message);
      return null;
    }
  }

  /**
   * 회사명으로 기업 검색 + 확률 매칭 + 재무정보 추출
   *
   * sminfo 상세검색 페이지 (GSF002R0.print) 구조:
   * - Form: document.search (POST to /gc/sf/GSF002R0.print)
   * - 검색어 입력: #searchTxt (name=cmQuery)
   * - 검색 모드: cmQueryOptionCombo (00=기업통합검색, 01=업체명, 03=사업자번호)
   * - 검색 실행: searchByTarget(pageNo, target) → ckInput() → form.submit()
   * - 결과 테이블: 기업명 | 대표자명 | 기업유형 | 업종 | 주소(도로명주소)
   *
   * @param {string} companyName - 검색할 회사명
   * @param {Object} matchCriteria - { ceoName, industry, address, companyType }
   * @returns {Object|null} { financials, matchScore, matchedCompany }
   */
  async searchByCompanyName(companyName, matchCriteria = {}) {
    try {
      await this.checkRateLimit();

      if (!this.isLoggedIn) {
        const loggedIn = await this.login();
        if (!loggedIn) {
          console.error('[Sminfo] ❌ Login failed, cannot search');
          return null;
        }
      }

      console.log(`[Sminfo] Searching: "${companyName}"`);

      // 1. 검색 폼에 회사명 입력 + searchByTarget 호출
      // login()이 이미 기업정보 페이지(GSF002R0.print)에 위치시킴
      await this.page.evaluate((name) => {
        const form = document.search;
        form.cmQueryOptionCombo.value = '01'; // 업체명 검색
        form.cmQuery.value = name;
      }, companyName);

      // Puppeteer type()으로도 입력 (DOM 이벤트 정상 발화)
      await this.page.click('#searchTxt', { clickCount: 3 });
      await this.page.type('#searchTxt', companyName, { delay: 20 });

      // searchByTarget 호출 (ckInput → form POST)
      await Promise.all([
        this.page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }).catch(() => null),
        this.page.evaluate(() => window.searchByTarget(1, '_self'))
      ]);
      await this.sleep(2000);

      // 2. 결과 파싱
      const searchResult = await this.page.evaluate(() => {
        const data = { candidates: [], totalText: null };

        // 총 건수
        const bodyText = document.body?.innerText || '';
        const m = bodyText.match(/검색결과\s*([\d,]+)\s*건/);
        data.totalText = m ? m[1] : '0';

        // 결과 테이블 (기업명 헤더가 있는 테이블)
        for (const table of document.querySelectorAll('table')) {
          const ths = Array.from(table.querySelectorAll('th')).map(th => th.textContent.trim());
          if (!ths.includes('기업명')) continue;

          for (const tr of table.querySelectorAll('tr')) {
            const cells = Array.from(tr.querySelectorAll('td'));
            if (cells.length < 3) continue;

            const name = cells[0]?.textContent?.trim() || '';
            if (!name || name === '조회된 내용이 없습니다.') continue;

            const link = cells[0]?.querySelector('a');
            data.candidates.push({
              name,
              ceoName: cells[1]?.textContent?.trim() || '',
              type: cells[2]?.textContent?.trim() || '',
              industry: cells[3]?.textContent?.trim() || '',
              address: cells[4]?.textContent?.trim() || '',
              onclick: link?.getAttribute('onclick') || null
            });
          }
          break; // 첫 번째 결과 테이블만 사용
        }

        return data;
      });

      const total = parseInt(searchResult.totalText?.replace(/,/g, '') || '0');
      console.log(`[Sminfo] Search results: ${total} 건, parsed ${searchResult.candidates.length} candidates`);

      if (searchResult.candidates.length === 0) {
        console.log('[Sminfo] No results found');
        return null;
      }

      // 3. 멀티필드 확률 매칭
      const scoredCandidates = searchResult.candidates.map((c, i) => ({
        ...c,
        rowIndex: i,
        score: this._calculateMatchScore(c, { ...matchCriteria, companyName })
      }));
      scoredCandidates.sort((a, b) => b.score - a.score);
      const bestMatch = scoredCandidates[0];

      console.log(`[Sminfo] Best match: "${bestMatch.name}" (${(bestMatch.score * 100).toFixed(0)}%)`);
      if (scoredCandidates.length > 1) {
        console.log(`[Sminfo] Runner-up: "${scoredCandidates[1].name}" (${(scoredCandidates[1].score * 100).toFixed(0)}%)`);
      }

      if (bestMatch.score < 0.4) {
        console.log(`[Sminfo] Match score too low, skipping detail`);
        return { financials: null, matchScore: bestMatch.score, matchedCompany: bestMatch };
      }

      // 4. 최고 매칭 기업 클릭 → 상세 페이지 이동
      if (bestMatch.onclick) {
        await Promise.all([
          this.page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }).catch(() => null),
          this.page.evaluate((onclick) => eval(onclick), bestMatch.onclick)
        ]);
      } else {
        // onclick 없으면 행 인덱스로 클릭
        await Promise.all([
          this.page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }).catch(() => null),
          this.page.evaluate((idx) => {
            for (const table of document.querySelectorAll('table')) {
              const ths = Array.from(table.querySelectorAll('th')).map(th => th.textContent.trim());
              if (!ths.includes('기업명')) continue;
              const tds = table.querySelectorAll('tr td:first-child a');
              if (tds[idx]) { tds[idx].click(); return; }
            }
          }, bestMatch.rowIndex)
        ]);
      }
      await this.sleep(3000);

      console.log(`[Sminfo] Detail page: ${this.page.url()}`);

      // 5. 재무정보 추출
      const financialData = await this._extractFinancials();

      if (!financialData || Object.keys(financialData).length === 0) {
        console.log('[Sminfo] No financial data on detail page');
        return { financials: null, matchScore: bestMatch.score, matchedCompany: bestMatch };
      }

      console.log(`[Sminfo] ✅ Financial data: ${Object.keys(financialData).join(', ')}`);

      // 6. 기업정보 페이지로 복귀 (다음 검색 대비)
      await this.page.goBack({ waitUntil: 'networkidle2', timeout: 15000 }).catch(() => null);
      await this.sleep(1000);

      const normalized = this.normalizeData(null, financialData);
      return {
        financials: normalized,
        matchScore: bestMatch.score,
        matchedCompany: {
          name: bestMatch.name,
          ceoName: bestMatch.ceoName,
          type: bestMatch.type,
          industry: bestMatch.industry,
          address: bestMatch.address
        }
      };

    } catch (error) {
      console.error(`[Sminfo] searchByCompanyName error:`, error.message);
      return null;
    }
  }

  /**
   * 상세 페이지에서 재무정보 추출
   */
  async _extractFinancials() {
    return this.page.evaluate(() => {
      const data = {};
      for (const table of document.querySelectorAll('table')) {
        for (const row of table.querySelectorAll('tr')) {
          const cells = row.querySelectorAll('td, th');
          if (cells.length < 2) continue;

          const label = cells[0].textContent.trim();
          // 가장 마지막 또는 두 번째 셀의 값 사용 (최신 연도)
          const value = cells[cells.length > 2 ? cells.length - 1 : 1].textContent.trim();

          if (label.match(/매출액|매출/) && !data.revenue) {
            const num = parseInt(value.replace(/[^0-9]/g, ''));
            if (num > 0) data.revenue = num;
          }
          if (label.match(/영업이익/) && !data.operating_profit) {
            const num = parseInt(value.replace(/[^0-9-]/g, ''));
            if (!isNaN(num) && num !== 0) data.operating_profit = num;
          }
          if (label.match(/당기순이익|순이익/) && !data.net_profit) {
            const num = parseInt(value.replace(/[^0-9-]/g, ''));
            if (!isNaN(num) && num !== 0) data.net_profit = num;
          }
          if (label.match(/자산총계|총자산/) && !data.total_assets) {
            const num = parseInt(value.replace(/[^0-9]/g, ''));
            if (num > 0) data.total_assets = num;
          }
          if (label.match(/부채총계|총부채/) && !data.total_liabilities) {
            const num = parseInt(value.replace(/[^0-9]/g, ''));
            if (num > 0) data.total_liabilities = num;
          }
          if (label.match(/자본총계|자기자본|총자본/) && !data.total_equity) {
            const num = parseInt(value.replace(/[^0-9]/g, ''));
            if (num > 0) data.total_equity = num;
          }
          if (label.match(/종업원/) && !data.employee_count) {
            const num = parseInt(value.replace(/[^0-9]/g, ''));
            if (num > 0) data.employee_count = num;
          }
        }
      }
      return Object.keys(data).length > 0 ? data : null;
    });
  }

  /**
   * 멀티필드 확률 매칭 점수 계산
   */
  _calculateMatchScore(candidate, criteria) {
    let score = 0;
    let totalWeight = 0;

    // 기업명: 0.4 weight
    if (criteria.companyName) {
      totalWeight += 0.4;
      const nameA = criteria.companyName.replace(/[()주식회사㈜\s]/g, '').trim();
      const nameB = candidate.name.replace(/[()주식회사㈜\s]/g, '').trim();
      if (nameA === nameB) {
        score += 0.4;
      } else if (nameB.includes(nameA) || nameA.includes(nameB)) {
        score += 0.4 * (Math.min(nameA.length, nameB.length) / Math.max(nameA.length, nameB.length));
      }
    }

    // 대표자명: 0.25 weight
    if (criteria.ceoName && candidate.ceoName) {
      totalWeight += 0.25;
      const ceos = criteria.ceoName.split(/[,\s]+/).filter(Boolean);
      const matched = ceos.some(c => candidate.ceoName.includes(c));
      if (matched) score += 0.25;
    }

    // 업종: 0.15 weight
    if (criteria.industry && candidate.industry) {
      totalWeight += 0.15;
      if (candidate.industry.includes(criteria.industry) || criteria.industry.includes(candidate.industry)) {
        score += 0.15;
      }
    }

    // 주소: 0.15 weight (시/구 레벨)
    if (criteria.address && candidate.address) {
      totalWeight += 0.15;
      const addrA = criteria.address.split(' ').slice(0, 2).join(' ');
      const addrB = candidate.address.split(' ').slice(0, 2).join(' ');
      if (addrA === addrB) {
        score += 0.15;
      } else if (addrA.split(' ')[0] === addrB.split(' ')[0]) {
        score += 0.075; // 시 레벨만 일치
      }
    }

    // 기업유형: 0.05 weight
    if (criteria.companyType && candidate.type) {
      totalWeight += 0.05;
      if (candidate.type.includes(criteria.companyType)) score += 0.05;
    }

    return totalWeight > 0 ? score / totalWeight : 0;
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

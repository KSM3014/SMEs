/**
 * DART (전자공시시스템) API Client
 * https://opendart.fss.or.kr/
 */

import axios from 'axios';

const DART_API_BASE = 'https://opendart.fss.or.kr/api';

class DartClient {
  constructor(apiKey) {
    this.apiKey = apiKey;
    this.client = axios.create({
      baseURL: DART_API_BASE,
      timeout: 30000
    });
  }

  /**
   * 사업자등록번호로 법인 정보 조회
   * @param {String} businessNumber - 사업자등록번호
   * @returns {Object} 기업 정보
   */
  async getCompanyByBusinessNumber(businessNumber) {
    try {
      // 먼저 회사 고유번호(corp_code) 찾기
      const corpCode = await this.findCorpCode(businessNumber);

      if (!corpCode) {
        console.log(`[DART] No corp_code found for ${businessNumber}`);
        return null;
      }

      // 회사 기본정보, 재무정보 병렬 조회
      const [basicInfo, financialInfo] = await Promise.all([
        this.getCompanyInfo(corpCode),
        this.getFinancialStatements(corpCode)
      ]);

      return this.normalizeData({
        ...basicInfo,
        ...financialInfo,
        business_number: businessNumber,
        corp_code: corpCode
      });

    } catch (error) {
      console.error(`[DART] Error fetching company ${businessNumber}:`, error.message);
      return null;
    }
  }

  /**
   * 회사명으로 DART corp_code 찾기 (DB 조회)
   * @param {String} companyName - 회사명
   * @returns {String} corp_code
   */
  async findCorpCodeByName(companyName) {
    if (!companyName) {
      console.log('[DART] No company name provided for corp_code lookup');
      return null;
    }

    try {
      const { default: sequelize } = await import('../config/database.js');

      // 1. 정확한 매치 시도
      let [results] = await sequelize.query(
        'SELECT corp_code, corp_name, stock_code FROM dart_corp_codes WHERE corp_name = $1 LIMIT 1',
        { bind: [companyName] }
      );

      if (results.length > 0) {
        console.log(`[DART] ✅ Exact match: ${results[0].corp_name} (${results[0].corp_code})`);
        return results[0].corp_code;
      }

      // 2. 유사 매치 시도 (LIKE 검색, 가장 짧은 이름 우선)
      [results] = await sequelize.query(
        'SELECT corp_code, corp_name, stock_code FROM dart_corp_codes WHERE corp_name LIKE $1 ORDER BY LENGTH(corp_name) LIMIT 1',
        { bind: [`%${companyName}%`] }
      );

      if (results.length > 0) {
        console.log(`[DART] 📝 Similar match: ${results[0].corp_name} (${results[0].corp_code})`);
        return results[0].corp_code;
      }

      // 3. 공백/특수문자 제거 후 재시도
      const cleanName = companyName.replace(/\s+|주식회사|\(주\)|\(유\)/g, '');
      if (cleanName !== companyName) {
        [results] = await sequelize.query(
          'SELECT corp_code, corp_name, stock_code FROM dart_corp_codes WHERE REPLACE(REPLACE(REPLACE(corp_name, \' \', \'\'), \'주식회사\', \'\'), \'(주)\', \'\') LIKE $1 ORDER BY LENGTH(corp_name) LIMIT 1',
          { bind: [`%${cleanName}%`] }
        );

        if (results.length > 0) {
          console.log(`[DART] 🔍 Fuzzy match: ${results[0].corp_name} (${results[0].corp_code})`);
          return results[0].corp_code;
        }
      }

      console.log(`[DART] ❌ No corp_code found for company: ${companyName}`);
      return null;

    } catch (error) {
      console.error(`[DART] Error finding corp_code for ${companyName}:`, error.message);
      return null;
    }
  }

  /**
   * 사업자등록번호로 고유번호 찾기
   * ⚠️ DART는 사업자번호 → corp_code 직접 매핑을 제공하지 않음
   * → 회사명으로 찾는 findCorpCodeByName() 사용 권장
   * @param {String} businessNumber
   * @returns {String} corp_code
   */
  async findCorpCode(businessNumber) {
    console.log(`[DART] ⚠️ Direct business_number lookup not supported - use findCorpCodeByName() instead`);
    return null;
  }

  /**
   * 회사 기본 정보 조회
   * @param {String} corpCode
   * @returns {Object}
   */
  async getCompanyInfo(corpCode) {
    try {
      const response = await this.client.get('/company.json', {
        params: {
          crtfc_key: this.apiKey,
          corp_code: corpCode
        }
      });

      if (response.data.status !== '000') {
        throw new Error(`DART API Error: ${response.data.message}`);
      }

      return response.data;

    } catch (error) {
      console.error('[DART] getCompanyInfo error:', error.message);
      return {};
    }
  }

  /**
   * 재무제표 조회
   * @param {String} corpCode
   * @returns {Object}
   */
  async getFinancialStatements(corpCode) {
    try {
      const currentYear = new Date().getFullYear();
      const lastYear = currentYear - 1;

      const response = await this.client.get('/fnlttSinglAcnt.json', {
        params: {
          crtfc_key: this.apiKey,
          corp_code: corpCode,
          bsns_year: lastYear,
          reprt_code: '11011' // 사업보고서
        }
      });

      if (response.data.status !== '000') {
        console.log(`[DART] Financial data not available: ${response.data.message}`);
        return {};
      }

      return this.parseFinancialData(response.data.list);

    } catch (error) {
      console.error('[DART] getFinancialStatements error:', error.message);
      return {};
    }
  }

  /**
   * 재무 데이터 파싱
   * @param {Array} financialList
   * @returns {Object}
   */
  parseFinancialData(financialList) {
    if (!financialList || !Array.isArray(financialList)) {
      return {};
    }

    const financial = {};

    // 주요 재무 항목 추출
    const keyMetrics = {
      '매출액': 'revenue',
      '영업이익': 'operating_profit',
      '당기순이익': 'net_profit',
      '자산총계': 'total_assets',
      '부채총계': 'total_liabilities',
      '자본총계': 'total_equity'
    };

    financialList.forEach(item => {
      const accountName = item.account_nm;
      const amount = parseInt(item.thstrm_amount) || 0;

      if (keyMetrics[accountName]) {
        financial[keyMetrics[accountName]] = amount * 1000000; // 백만원 → 원
      }
    });

    // 재무비율 계산
    if (financial.operating_profit && financial.revenue) {
      financial.operating_margin = (financial.operating_profit / financial.revenue) * 100;
    }

    if (financial.net_profit && financial.total_equity) {
      financial.roe = (financial.net_profit / financial.total_equity) * 100;
    }

    if (financial.total_liabilities && financial.total_equity) {
      financial.debt_ratio = (financial.total_liabilities / financial.total_equity) * 100;
    }

    return financial;
  }

  /**
   * DART 데이터를 표준 형식으로 변환
   * @param {Object} dartData
   * @returns {Object}
   */
  normalizeData(dartData) {
    return {
      company_name: dartData.corp_name || dartData.company_name,
      ceo_name: dartData.ceo_nm || dartData.ceo_name,
      address: dartData.adres || dartData.address,
      establishment_date: dartData.est_dt || dartData.establishment_date,
      phone: dartData.phn_no || dartData.phone,
      website: dartData.hm_url || dartData.website,
      stock_code: dartData.stock_code,
      corp_code: dartData.corp_code,
      listed: dartData.corp_cls === 'Y', // 상장법인 여부
      revenue: dartData.revenue,
      operating_profit: dartData.operating_profit,
      net_profit: dartData.net_profit,
      operating_margin: dartData.operating_margin,
      roe: dartData.roe,
      debt_ratio: dartData.debt_ratio,
      total_assets: dartData.total_assets,
      total_liabilities: dartData.total_liabilities,
      total_equity: dartData.total_equity
    };
  }

  /**
   * 주요 공시 조회
   * @param {String} corpCode
   * @param {Number} limit
   * @returns {Array}
   */
  async getRecentDisclosures(corpCode, limit = 10) {
    try {
      const response = await this.client.get('/list.json', {
        params: {
          crtfc_key: this.apiKey,
          corp_code: corpCode,
          page_count: limit
        }
      });

      if (response.data.status !== '000') {
        return [];
      }

      return response.data.list || [];

    } catch (error) {
      console.error('[DART] getRecentDisclosures error:', error.message);
      return [];
    }
  }
}

export default DartClient;

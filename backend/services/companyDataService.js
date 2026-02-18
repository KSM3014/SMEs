/**
 * Company Data Service
 * DART와 공공데이터를 통합하여 기업 정보 제공
 */

import DartClient from './dartClient.js';
import PublicDataClient from './publicDataClient.js';
import SminfoClient from './sminfoClient.js';
import { mergeCompanyData, detectConflicts, generateSourceInfo } from './dataMerger.js';
import sequelize from '../config/database.js';

class CompanyDataService {
  constructor() {
    // API 클라이언트 초기화
    this.dartClient = new DartClient(process.env.DART_API_KEY);
    this.publicClient = new PublicDataClient({
      nts_business_status: process.env.NTS_API_KEY,
      sme_financial: process.env.SME_FINANCIAL_API_KEY,
      venture_cert: process.env.VENTURE_CERT_API_KEY,
      innobiz_cert: process.env.INNOBIZ_CERT_API_KEY
    });
    this.sminfoClient = new SminfoClient(); // ⚠️ 최후 수단 (rate limit: 분당 3회)

    // 캐시 (메모리 캐시, 1시간)
    this.cache = new Map();
    this.cacheTimeout = 60 * 60 * 1000; // 1시간
  }

  /**
   * 사업자등록번호로 기업 정보 조회 (통합)
   * @param {String} businessNumber
   * @param {Object} options - { forceRefresh, includeConflicts }
   * @returns {Object}
   */
  async getCompany(businessNumber, options = {}) {
    const { forceRefresh = false, includeConflicts = false } = options;

    // 캐시 확인
    if (!forceRefresh && this.cache.has(businessNumber)) {
      const cached = this.cache.get(businessNumber);
      if (Date.now() - cached.timestamp < this.cacheTimeout) {
        console.log(`[CompanyData] Cache hit for ${businessNumber}`);
        return cached.data;
      }
    }

    try {
      console.log(`[CompanyData] Fetching data for ${businessNumber}`);

      // 1. 먼저 공공데이터 조회 (회사명 확보)
      const publicData = await this.publicClient.getCompanyByBusinessNumber(businessNumber);

      const sources = {
        dart: null,
        public: publicData,
        other: null
      };

      // 2. 회사명이 있으면 DART 조회 시도
      if (publicData?.company_name) {
        console.log(`[CompanyData] Found company name: ${publicData.company_name}, searching DART...`);

        // 회사명으로 corp_code 찾기
        const corpCode = await this.dartClient.findCorpCodeByName(publicData.company_name);

        if (corpCode) {
          // corp_code로 DART 재무정보 조회
          const [basicInfo, financialInfo] = await Promise.all([
            this.dartClient.getCompanyInfo(corpCode),
            this.dartClient.getFinancialStatements(corpCode)
          ]);

          sources.dart = this.dartClient.normalizeData({
            ...basicInfo,
            ...financialInfo,
            business_number: businessNumber,
            corp_code: corpCode
          });

          console.log(`[CompanyData] ✅ DART data retrieved via corp_code: ${corpCode}`);
        } else {
          console.log(`[CompanyData] No DART corp_code found for ${publicData.company_name}`);
        }
      } else {
        console.log(`[CompanyData] No company name from Public API - skipping DART`);
      }

      // 2. 데이터 병합
      let merged = mergeCompanyData(sources, businessNumber);

      // 3. 재무정보 부족 시 sminfo 최후 수단 사용
      const hasFinancialData = merged.revenue || merged.total_assets || merged.operating_profit;
      if (!hasFinancialData) {
        console.log(`[CompanyData] No financial data from DART/Public, trying sminfo as fallback...`);
        try {
          const sminfoData = await this.sminfoClient.getCompanyByBusinessNumber(businessNumber);
          if (sminfoData) {
            sources.other = sminfoData;
            // 재병합 (sminfo 데이터 포함)
            merged = mergeCompanyData(sources, businessNumber);
            console.log(`[CompanyData] ✅ Financial data retrieved from sminfo`);
          }
        } catch (sminfoError) {
          console.warn(`[CompanyData] Sminfo fallback failed: ${sminfoError.message}`);
        }
      }

      // 4. 충돌 감지 (옵션)
      if (includeConflicts) {
        merged.conflicts = detectConflicts(sources);
      }

      // 5. 소스 정보 추가
      merged.source_info = generateSourceInfo(merged);

      // 6. 타임스탬프 추가
      merged.fetched_at = new Date().toISOString();

      // 7. DB에 저장 (비동기)
      this.saveToDatabase(businessNumber, merged).catch(err =>
        console.error('[CompanyData] DB save error:', err.message)
      );

      // 8. 캐시 저장
      this.cache.set(businessNumber, {
        data: merged,
        timestamp: Date.now()
      });

      return merged;

    } catch (error) {
      console.error(`[CompanyData] Error fetching ${businessNumber}:`, error.message);

      // DB에서 마지막 저장된 데이터 조회 시도
      const dbData = await this.getFromDatabase(businessNumber);
      if (dbData) {
        console.log(`[CompanyData] Returning cached DB data for ${businessNumber}`);
        dbData.is_stale = true;
        return dbData;
      }

      throw error;
    }
  }

  /**
   * DB에 저장
   * @param {String} businessNumber
   * @param {Object} data
   */
  async saveToDatabase(businessNumber, data) {
    try {
      await sequelize.query(
        `
        INSERT INTO companies (
          business_number, company_name, ceo_name, address, phone,
          establishment_date, employee_count, industry_name, industry_code,
          revenue, operating_profit, net_profit, operating_margin, roe, debt_ratio,
          total_assets, total_liabilities, total_equity,
          venture_certification, innovation_certification, main_biz_certification,
          listed, stock_code, corp_code,
          dart_data, public_data, other_data, merged_data,
          primary_source, data_quality_score,
          last_updated, fetched_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
          $11, $12, $13, $14, $15, $16, $17, $18, $19, $20,
          $21, $22, $23, $24, $25, $26, $27, $28, $29, $30,
          $31, $32
        )
        ON CONFLICT (business_number)
        DO UPDATE SET
          company_name = EXCLUDED.company_name,
          ceo_name = EXCLUDED.ceo_name,
          address = EXCLUDED.address,
          phone = EXCLUDED.phone,
          establishment_date = EXCLUDED.establishment_date,
          employee_count = EXCLUDED.employee_count,
          industry_name = EXCLUDED.industry_name,
          industry_code = EXCLUDED.industry_code,
          revenue = EXCLUDED.revenue,
          operating_profit = EXCLUDED.operating_profit,
          net_profit = EXCLUDED.net_profit,
          operating_margin = EXCLUDED.operating_margin,
          roe = EXCLUDED.roe,
          debt_ratio = EXCLUDED.debt_ratio,
          total_assets = EXCLUDED.total_assets,
          total_liabilities = EXCLUDED.total_liabilities,
          total_equity = EXCLUDED.total_equity,
          venture_certification = EXCLUDED.venture_certification,
          innovation_certification = EXCLUDED.innovation_certification,
          main_biz_certification = EXCLUDED.main_biz_certification,
          listed = EXCLUDED.listed,
          stock_code = EXCLUDED.stock_code,
          corp_code = EXCLUDED.corp_code,
          dart_data = EXCLUDED.dart_data,
          public_data = EXCLUDED.public_data,
          other_data = EXCLUDED.other_data,
          merged_data = EXCLUDED.merged_data,
          primary_source = EXCLUDED.primary_source,
          data_quality_score = EXCLUDED.data_quality_score,
          last_updated = EXCLUDED.last_updated,
          fetched_at = EXCLUDED.fetched_at
        `,
        {
          bind: [
            businessNumber,
            data.company_name || `미확인-${businessNumber}`,
            data.ceo_name || null,
            data.address || null,
            data.phone || null,
            data.establishment_date || null,
            data.employee_count || null,
            data.industry_name || null,
            data.industry_code || null,
            data.revenue || null,
            data.operating_profit || null,
            data.net_profit || null,
            data.operating_margin || null,
            data.roe || null,
            data.debt_ratio || null,
            data.total_assets || null,
            data.total_liabilities || null,
            data.total_equity || null,
            data.venture_certification || false,
            data.innovation_certification || false,
            data.main_biz_certification || false,
            data.listed || false,
            data.stock_code || null,
            data.corp_code || null,
            JSON.stringify(data.data_sources?.dart || null),
            JSON.stringify(data.data_sources?.public || null),
            JSON.stringify(data.data_sources?.other || null),
            JSON.stringify(data),
            data.primary_source || null,
            data.data_quality_score || 0,
            data.last_updated || null,
            data.fetched_at || new Date().toISOString()
          ]
        }
      );

      console.log(`[CompanyData] Saved ${businessNumber} to DB`);

    } catch (error) {
      console.error('[CompanyData] DB save error:', error.message);
      throw error;
    }
  }

  /**
   * DB에서 조회
   * @param {String} businessNumber
   * @returns {Object}
   */
  async getFromDatabase(businessNumber) {
    try {
      const [results] = await sequelize.query(
        'SELECT * FROM companies WHERE business_number = $1',
        { bind: [businessNumber] }
      );

      if (results.length === 0) return null;

      const row = results[0];

      return {
        ...row,
        data_sources: {
          dart: row.dart_data,
          public: row.public_data
        }
      };

    } catch (error) {
      console.error('[CompanyData] DB read error:', error.message);
      return null;
    }
  }

  /**
   * 검색 (사업자등록번호 또는 회사명)
   * @param {String} query
   * @param {Object} options
   * @returns {Array}
   */
  async search(query, options = {}) {
    const { page = 1, limit = 20 } = options;
    const offset = (page - 1) * limit;

    try {
      // DB에서 검색
      const [results] = await sequelize.query(
        `
        SELECT business_number, company_name, ceo_name, industry_name,
               revenue, operating_margin, roe, employee_count,
               venture_certification, innovation_certification,
               primary_source, data_quality_score, last_updated
        FROM companies
        WHERE business_number LIKE $1
           OR company_name LIKE $2
        ORDER BY
          CASE WHEN business_number = $3 THEN 0
               WHEN company_name = $4 THEN 1
               ELSE 2
          END,
          data_quality_score DESC,
          last_updated DESC
        LIMIT $5 OFFSET $6
        `,
        {
          bind: [
            `%${query}%`,
            `%${query}%`,
            query,
            query,
            limit,
            offset
          ]
        }
      );

      const [countResult] = await sequelize.query(
        `
        SELECT COUNT(*) as total
        FROM companies
        WHERE business_number LIKE $1
           OR company_name LIKE $2
        `,
        { bind: [`%${query}%`, `%${query}%`] }
      );

      return {
        data: results,
        total: parseInt(countResult[0]?.total || 0),
        page,
        limit
      };

    } catch (error) {
      console.error('[CompanyData] Search error:', error.message);
      return { data: [], total: 0, page, limit };
    }
  }

  /**
   * 캐시 클리어
   */
  clearCache(businessNumber = null) {
    if (businessNumber) {
      this.cache.delete(businessNumber);
    } else {
      this.cache.clear();
    }
  }
}

// Singleton
const companyDataService = new CompanyDataService();

export default companyDataService;

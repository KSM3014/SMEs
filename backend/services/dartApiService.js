import axios from 'axios';
import sequelize from '../config/database.js';
import dotenv from 'dotenv';

dotenv.config();

/**
 * DART (Data Analysis, Retrieval and Transfer System) API Service
 * 금융감독원 전자공시시스템 - 상장/코스닥 기업 재무제표 및 공시정보
 *
 * API 신청: https://opendart.fss.or.kr/
 */

class DartApiService {
  constructor() {
    this.baseUrl = 'https://opendart.fss.or.kr/api';
    this.apiKey = process.env.DART_API_KEY;

    if (!this.apiKey) {
      console.warn('[DART] API Key not configured. Set DART_API_KEY in .env');
    }
  }

  /**
   * 기업 기본정보 조회
   */
  async getCompanyInfo(corpCode) {
    try {
      const response = await axios.get(`${this.baseUrl}/company.json`, {
        params: {
          crtfc_key: this.apiKey,
          corp_code: corpCode
        },
        timeout: 10000
      });

      if (response.data.status !== '000') {
        throw new Error(`DART API Error: ${response.data.message}`);
      }

      const data = response.data;

      return {
        corp_code: data.corp_code,
        corp_name: data.corp_name,
        corp_name_eng: data.corp_name_eng,
        stock_name: data.stock_name,
        stock_code: data.stock_code,
        ceo_name: data.ceo_nm,
        corp_cls: data.corp_cls,
        jurir_no: data.jurir_no,
        business_number: data.bizr_no,
        address: data.adres,
        homepage: data.hm_url,
        phone: data.phn_no,
        fax: data.fax_no,
        industry_code: data.induty_code,
        establishment_date: data.est_dt,
        accounting_month: data.acc_mt
      };
    } catch (error) {
      console.error('[DART] Company info fetch error:', error.message);
      throw error;
    }
  }

  /**
   * 사업자등록번호로 고유번호(corp_code) 조회
   */
  async getCorpCodeByBusinessNumber(businessNumber) {
    try {
      // DART corp_code 목록 조회
      const response = await axios.get(`${this.baseUrl}/corpCode.xml`, {
        params: {
          crtfc_key: this.apiKey
        },
        timeout: 30000,
        responseType: 'text'
      });

      // XML 파싱하여 사업자번호로 검색
      // 간단한 정규식 매칭 (실제로는 xml2js 같은 라이브러리 사용 권장)
      const regex = new RegExp(`<corp_code>([^<]+)</corp_code>\\s*<corp_name>([^<]+)</corp_name>\\s*<stock_code>([^<]*)</stock_code>\\s*<modify_date>([^<]+)</modify_date>`);

      // 더 나은 방법: 전체 목록을 파싱하여 캐싱 (추후 구현)
      // 현재는 간단하게 회사명으로 검색

      console.warn('[DART] Business number search requires corp_code list parsing');
      return null;
    } catch (error) {
      console.error('[DART] Corp code search error:', error.message);
      return null;
    }
  }

  /**
   * 단일회사 전체 재무제표 조회
   */
  async getFinancialStatement(corpCode, year, reportCode = '11011') {
    try {
      // reportCode: 11011=사업보고서, 11012=반기보고서, 11013=1분기보고서, 11014=3분기보고서
      const response = await axios.get(`${this.baseUrl}/fnlttSinglAcntAll.json`, {
        params: {
          crtfc_key: this.apiKey,
          corp_code: corpCode,
          bsns_year: year,
          reprt_code: reportCode,
          fs_div: 'CFS' // CFS=연결재무제표, OFS=개별재무제표
        },
        timeout: 15000
      });

      if (response.data.status !== '000') {
        throw new Error(`DART API Error: ${response.data.message}`);
      }

      return this.parseFinancialStatement(response.data.list);
    } catch (error) {
      console.error('[DART] Financial statement fetch error:', error.message);
      throw error;
    }
  }

  /**
   * 재무제표 데이터 파싱
   * DART account_nm에는 "(손실)", "(이익)" 등 괄호 접미사가 붙을 수 있음
   */
  parseFinancialStatement(rawData) {
    if (!rawData || rawData.length === 0) {
      return null;
    }

    const financial = {
      bs: {}, // 대차대조표 (Balance Sheet)
      is: {}, // 손익계산서 (Income Statement)
      cf: {}  // 현금흐름표 (Cash Flow)
    };

    // 계정과목별로 분류 — 키는 괄호 제거 후 매칭됨
    const accountMapping = {
      // 대차대조표
      '자산총계': 'total_assets',
      '유동자산': 'current_assets',
      '비유동자산': 'non_current_assets',
      '부채총계': 'total_liabilities',
      '유동부채': 'current_liabilities',
      '비유동부채': 'non_current_liabilities',
      '자본총계': 'total_equity',
      '자본금': 'capital_stock',
      '이익잉여금': 'retained_earnings',

      // 손익계산서 — 괄호 변형도 매칭 (strip 후)
      '매출액': 'revenue',
      '수익': 'revenue',            // 일부 기업은 "수익(매출액)" 사용
      '매출원가': 'cost_of_sales',
      '매출총이익': 'gross_profit',
      '판매비와관리비': 'operating_expenses',
      '영업이익': 'operating_profit', // DART: "영업이익(손실)"
      '영업외수익': 'non_operating_income',
      '영업외비용': 'non_operating_expenses',
      '기타수익': 'non_operating_income',
      '기타비용': 'non_operating_expenses',
      '금융수익': 'finance_income',
      '금융비용': 'finance_cost',
      '법인세비용차감전순이익': 'income_before_tax',
      '법인세비용': 'income_tax_expense',
      '당기순이익': 'net_income',     // DART: "당기순이익(손실)"
      '지배기업소유주지분순손익': 'net_income_controlling',

      // 현금흐름표
      '영업활동으로인한현금흐름': 'operating_cash_flow',
      '영업활동현금흐름': 'operating_cash_flow',
      '투자활동으로인한현금흐름': 'investing_cash_flow',
      '투자활동현금흐름': 'investing_cash_flow',
      '재무활동으로인한현금흐름': 'financing_cash_flow',
      '재무활동현금흐름': 'financing_cash_flow',
      '현금의증가': 'cash_increase',
      '현금및현금성자산의순증가': 'cash_increase'
    };

    for (const item of rawData) {
      const rawName = item.account_nm;
      const value = this.parseAmount(item.thstrm_amount); // 당기금액
      const category = item.sj_div; // BS, IS, CF

      // Strip parenthetical suffixes: "영업이익(손실)" → "영업이익"
      const cleanName = rawName.replace(/\([^)]*\)$/, '').trim();
      const fieldName = accountMapping[cleanName] || accountMapping[rawName];

      if (fieldName && value !== null) {
        if (category === 'BS') {
          financial.bs[fieldName] = value;
        } else if (category === 'IS') {
          // For duplicate keys (기타수익/영업외수익), keep first non-null
          if (financial.is[fieldName] == null) {
            financial.is[fieldName] = value;
          }
        } else if (category === 'CF') {
          financial.cf[fieldName] = value;
        }
      }
    }

    // Derive revenue if not directly available: 매출원가 + 매출총이익
    if (financial.is.revenue == null && financial.is.cost_of_sales != null && financial.is.gross_profit != null) {
      financial.is.revenue = financial.is.cost_of_sales + financial.is.gross_profit;
    }

    // Use controlling interest net income if total not available
    if (financial.is.net_income == null && financial.is.net_income_controlling != null) {
      financial.is.net_income = financial.is.net_income_controlling;
    }

    return financial;
  }

  /**
   * 금액 문자열 파싱 (쉼표 제거, 숫자 변환)
   */
  parseAmount(amountStr) {
    if (!amountStr) return null;

    const cleaned = amountStr.replace(/,/g, '').trim();
    const amount = parseFloat(cleaned);

    return isNaN(amount) ? null : amount;
  }

  /**
   * 임원 현황 조회
   */
  async getOfficers(corpCode, year) {
    try {
      const response = await axios.get(`${this.baseUrl}/exctvSttus.json`, {
        params: {
          crtfc_key: this.apiKey,
          corp_code: corpCode,
          bsns_year: year,
          reprt_code: '11011' // 사업보고서
        },
        timeout: 10000
      });

      if (response.data.status !== '000') {
        throw new Error(`DART API Error: ${response.data.message}`);
      }

      const officers = response.data.list.map(item => ({
        name: item.nm,
        gender: item.sexdstn,
        position: item.rgist_exctv_at || item.chrg_job || '-', // 등기임원여부/담당업무
        position_type: this.normalizePositionType(item.rgist_exctv_at || item.chrg_job),
        is_registered: item.rgist_exctv_at, // 등기임원여부
        is_fulltime: item.fte_at, // 상근여부
        responsibility: item.chrg_job, // 담당업무
        career: item.main_career, // 주요약력
        max_shareholder_relation: item.mxmm_shrholdr_relate,
        tenure_end: item.hffc_pd, // 임기만료일
        is_current: true
      }));

      return officers;
    } catch (error) {
      console.error('[DART] Officers fetch error:', error.message);
      return [];
    }
  }

  /**
   * 직위 타입 정규화
   */
  normalizePositionType(position) {
    if (!position) return 'OTHER';

    const pos = position.toLowerCase();

    if (pos.includes('대표') || pos.includes('ceo')) return 'CEO';
    if (pos.includes('부사장') || pos.includes('부회장')) return 'VP';
    if (pos.includes('전무')) return 'EXECUTIVE_MD';
    if (pos.includes('상무')) return 'MD';
    if (pos.includes('이사') && !pos.includes('감사')) return 'DIRECTOR';
    if (pos.includes('감사')) return 'AUDITOR';
    if (pos.includes('cfo')) return 'CFO';
    if (pos.includes('cto')) return 'CTO';
    if (pos.includes('coo')) return 'COO';

    return 'OTHER';
  }

  /**
   * 지분 현황 조회
   */
  async getStockOwnership(corpCode, year) {
    try {
      const response = await axios.get(`${this.baseUrl}/hyslrSttus.json`, {
        params: {
          crtfc_key: this.apiKey,
          corp_code: corpCode,
          bsns_year: year,
          reprt_code: '11011' // 사업보고서
        },
        timeout: 10000
      });

      if (response.data.status !== '000') {
        throw new Error(`DART API Error: ${response.data.message}`);
      }

      const ownership = response.data.list.map(item => ({
        name: item.nm,
        relation: item.relate || '-',
        stock_kind: item.stock_knd,
        shares_begin: this.parseAmount(item.bsis_posesn_stock_co),
        shares_end: this.parseAmount(item.trmend_posesn_stock_co),
        percentage_begin: parseFloat(item.bsis_posesn_stock_qota_rt) || 0,
        percentage_end: parseFloat(item.trmend_posesn_stock_qota_rt) || 0,
        shares: this.parseAmount(item.trmend_posesn_stock_co) || this.parseAmount(item.bsis_posesn_stock_co),
        ownership_percentage: parseFloat(item.trmend_posesn_stock_qota_rt) || parseFloat(item.bsis_posesn_stock_qota_rt) || 0
      }));

      return ownership;
    } catch (error) {
      console.error('[DART] Stock ownership fetch error:', error.message);
      return [];
    }
  }

  /**
   * 종합: 회사 전체 데이터 수집
   */
  async collectCompanyData(corpCode, year = new Date().getFullYear()) {
    try {
      console.log(`[DART] Collecting data for corp_code: ${corpCode}, year: ${year}`);

      const [companyInfo, financials, officers, ownership] = await Promise.allSettled([
        this.getCompanyInfo(corpCode),
        this.getFinancialStatement(corpCode, year),
        this.getOfficers(corpCode, year),
        this.getStockOwnership(corpCode, year)
      ]);

      return {
        company_info: companyInfo.status === 'fulfilled' ? companyInfo.value : null,
        financials: financials.status === 'fulfilled' ? financials.value : null,
        officers: officers.status === 'fulfilled' ? officers.value : [],
        ownership: ownership.status === 'fulfilled' ? ownership.value : [],
        source: 'DART',
        collected_at: new Date()
      };
    } catch (error) {
      console.error('[DART] Collect company data error:', error.message);
      throw error;
    }
  }

  /**
   * SME 데이터베이스에 저장
   */
  async saveToDatabase(dartData, corpCode) {
    try {
      const { company_info, financials, officers, ownership } = dartData;

      // 1. 기업 기본정보 저장
      if (company_info) {
        const [companyResult] = await sequelize.query(`
          INSERT INTO sme_companies (
            business_number, company_name, company_name_en, ceo_name,
            establishment_date, industry_code, address, phone, fax,
            website, status, api_sources
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
          ON CONFLICT (business_number) DO UPDATE SET
            company_name = EXCLUDED.company_name,
            ceo_name = EXCLUDED.ceo_name,
            address = EXCLUDED.address,
            phone = EXCLUDED.phone,
            website = EXCLUDED.website,
            api_sources = EXCLUDED.api_sources,
            last_updated = CURRENT_TIMESTAMP
          RETURNING id
        `, {
          bind: [
            company_info.business_number,
            company_info.corp_name,
            company_info.corp_name_eng,
            company_info.ceo_name,
            company_info.establishment_date,
            company_info.industry_code,
            company_info.address,
            company_info.phone,
            company_info.fax,
            company_info.homepage,
            'active',
            JSON.stringify({ dart_corp_code: corpCode, sources: ['DART'] })
          ]
        });

        const companyId = companyResult[0]?.id;

        // 2. 재무제표 저장
        if (financials && companyId) {
          await this.saveFinancials(companyId, financials, new Date().getFullYear());
        }

        // 3. 임원정보 저장
        if (officers && officers.length > 0 && companyId) {
          await this.saveOfficers(companyId, officers, ownership);
        }

        console.log(`✅ [DART] Data saved for company_id: ${companyId}`);
        return companyId;
      }

      return null;
    } catch (error) {
      console.error('[DART] Database save error:', error.message);
      throw error;
    }
  }

  /**
   * 재무제표 저장
   */
  async saveFinancials(companyId, financials, year) {
    const { bs, is: income, cf } = financials;

    await sequelize.query(`
      INSERT INTO sme_financial_statements (
        company_id, fiscal_year, quarter, statement_type,
        total_assets, current_assets, non_current_assets,
        total_liabilities, current_liabilities, non_current_liabilities,
        total_equity, capital_stock, retained_earnings,
        revenue, cost_of_sales, gross_profit, operating_expenses,
        operating_profit, non_operating_income, non_operating_expenses,
        income_before_tax, income_tax_expense, net_income,
        operating_cash_flow, investing_cash_flow, financing_cash_flow,
        cash_increase, api_source, data_quality_score
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13,
              $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29)
      ON CONFLICT (company_id, fiscal_year, quarter, statement_type) DO UPDATE SET
        total_assets = EXCLUDED.total_assets,
        revenue = EXCLUDED.revenue,
        net_income = EXCLUDED.net_income,
        last_updated = CURRENT_TIMESTAMP
    `, {
      bind: [
        companyId, year, 'YR', 'ALL',
        bs.total_assets, bs.current_assets, bs.non_current_assets,
        bs.total_liabilities, bs.current_liabilities, bs.non_current_liabilities,
        bs.total_equity, bs.capital_stock, bs.retained_earnings,
        income.revenue, income.cost_of_sales, income.gross_profit, income.operating_expenses,
        income.operating_profit, income.non_operating_income, income.non_operating_expenses,
        income.income_before_tax, income.income_tax_expense, income.net_income,
        cf.operating_cash_flow, cf.investing_cash_flow, cf.financing_cash_flow,
        cf.cash_increase, 'DART', 9
      ]
    });
  }

  /**
   * 임원정보 저장
   */
  async saveOfficers(companyId, officers, ownership) {
    for (const officer of officers) {
      // 지분정보 매칭
      const ownershipInfo = ownership.find(o => o.name === officer.name);

      await sequelize.query(`
        INSERT INTO sme_officers (
          company_id, name, position, position_type, is_current,
          ownership_shares, ownership_percentage, career, api_source
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        ON CONFLICT (company_id, name, position) DO UPDATE SET
          is_current = EXCLUDED.is_current,
          ownership_shares = EXCLUDED.ownership_shares,
          ownership_percentage = EXCLUDED.ownership_percentage,
          last_updated = CURRENT_TIMESTAMP
      `, {
        bind: [
          companyId,
          officer.name,
          officer.position,
          officer.position_type,
          officer.is_current,
          ownershipInfo?.shares || null,
          ownershipInfo?.ownership_percentage || null,
          officer.responsibility,
          'DART'
        ]
      });
    }
  }
}

export default new DartApiService();

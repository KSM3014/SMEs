import axios from 'axios';
import sequelize from '../config/database.js';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Hometax (국세청 홈택스) API Service
 * 사업자등록정보, 부가세 신고 매출 데이터
 *
 * Note: 국세청 API는 공식적으로 제한적으로 공개되어 있습니다.
 * 실제 연동 시에는 국세청 승인이 필요할 수 있습니다.
 *
 * 대안:
 * 1. 사업자등록번호 진위확인 API (공개)
 * 2. 공공데이터포털의 국세청 제공 데이터
 */

class HometaxApiService {
  constructor() {
    // 사업자등록번호 진위확인 서비스 (누구나 사용 가능)
    this.validationUrl = 'https://api.odcloud.kr/api/nts-businessman/v1';
    this.apiKey = process.env.HOMETAX_API_KEY || process.env.DATA_GO_KR_SERVICE_KEY;

    if (!this.apiKey) {
      console.warn('[Hometax] API Key not configured. Set HOMETAX_API_KEY in .env');
    }
  }

  /**
   * 사업자등록번호 진위확인 및 기본정보 조회
   */
  async validateBusinessNumber(businessNumber) {
    try {
      // 하이픈 제거
      const cleanNumber = businessNumber.replace(/-/g, '');

      const response = await axios.post(
        `${this.validationUrl}/validate`,
        {
          businesses: [
            {
              b_no: cleanNumber,
              start_dt: '', // 개업일자 (선택)
              p_nm: '',     // 대표자명 (선택)
              p_nm2: '',    // 대표자명2 (선택)
              b_nm: '',     // 상호 (선택)
              corp_no: '',  // 법인번호 (선택)
              b_sector: '', // 주업태 (선택)
              b_type: ''    // 주종목 (선택)
            }
          ]
        },
        {
          params: {
            serviceKey: this.apiKey
          },
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          timeout: 10000
        }
      );

      if (response.data && response.data.data && response.data.data.length > 0) {
        const result = response.data.data[0];

        return {
          business_number: cleanNumber,
          valid: result.valid === '01', // 01=유효, 02=무효
          status: result.valid_msg || result.status_code,
          company_name: result.b_nm || null,
          ceo_name: result.p_nm || null,
          establishment_date: result.start_dt || null,
          tax_type: result.tax_type || null,
          tax_type_name: result.tax_type_nm || null,
          business_status: result.b_stt || null,
          business_status_name: result.b_stt_nm || null,
          invoice_apply_date: result.invoice_apply_dt || null,
          source: 'HOMETAX_VALIDATION'
        };
      }

      return null;
    } catch (error) {
      console.error('[Hometax] Validation error:', error.message);

      // API 오류 시에도 기본 응답 반환
      return {
        business_number: businessNumber,
        valid: null,
        error: error.message,
        source: 'HOMETAX_VALIDATION'
      };
    }
  }

  /**
   * 사업자 상태 조회 (휴폐업 여부)
   */
  async getBusinessStatus(businessNumber) {
    try {
      const cleanNumber = businessNumber.replace(/-/g, '');

      const response = await axios.post(
        `${this.validationUrl}/status`,
        {
          b_no: [cleanNumber]
        },
        {
          params: {
            serviceKey: this.apiKey
          },
          headers: {
            'Content-Type': 'application/json'
          },
          timeout: 10000
        }
      );

      if (response.data && response.data.data && response.data.data.length > 0) {
        const status = response.data.data[0];

        return {
          business_number: cleanNumber,
          tax_type: status.tax_type,
          tax_type_name: status.tax_type_cd_nm,
          end_date: status.end_dt, // 폐업일
          business_status: this.parseBusinessStatus(status.tax_type_cd),
          invoice_apply_date: status.invoice_apply_dt,
          utcc_yn: status.utcc_yn, // 단위과세전환사업자여부
          source: 'HOMETAX_STATUS'
        };
      }

      return null;
    } catch (error) {
      console.error('[Hometax] Status check error:', error.message);
      return null;
    }
  }

  /**
   * 사업자 상태 파싱
   */
  parseBusinessStatus(statusCode) {
    if (!statusCode) return 'unknown';

    // 01=계속사업자, 02=휴업자, 03=폐업자
    const statusMap = {
      '01': 'active',
      '02': 'suspended',
      '03': 'closed'
    };

    return statusMap[statusCode] || 'unknown';
  }

  /**
   * 종합: 사업자등록번호로 기본정보 수집
   */
  async collectBusinessInfo(businessNumber) {
    try {
      console.log(`[Hometax] Collecting info for business number: ${businessNumber}`);

      const [validation, status] = await Promise.allSettled([
        this.validateBusinessNumber(businessNumber),
        this.getBusinessStatus(businessNumber)
      ]);

      const validationData = validation.status === 'fulfilled' ? validation.value : null;
      const statusData = status.status === 'fulfilled' ? status.value : null;

      // 데이터 병합
      const merged = {
        business_number: businessNumber,
        valid: validationData?.valid,
        company_name: validationData?.company_name,
        ceo_name: validationData?.ceo_name,
        establishment_date: validationData?.establishment_date,
        business_status: statusData?.business_status || validationData?.business_status,
        tax_type: statusData?.tax_type || validationData?.tax_type,
        end_date: statusData?.end_date,
        source: 'HOMETAX',
        collected_at: new Date()
      };

      return merged;
    } catch (error) {
      console.error('[Hometax] Collect business info error:', error.message);
      throw error;
    }
  }

  /**
   * SME 데이터베이스에 저장
   */
  async saveToDatabase(hometaxData) {
    try {
      if (!hometaxData || !hometaxData.business_number) {
        throw new Error('Invalid hometax data');
      }

      // 기업 기본정보 저장/업데이트
      const [result] = await sequelize.query(`
        INSERT INTO sme_companies (
          business_number, company_name, ceo_name, establishment_date,
          status, api_sources, metadata
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (business_number) DO UPDATE SET
          company_name = COALESCE(EXCLUDED.company_name, sme_companies.company_name),
          ceo_name = COALESCE(EXCLUDED.ceo_name, sme_companies.ceo_name),
          establishment_date = COALESCE(EXCLUDED.establishment_date, sme_companies.establishment_date),
          status = EXCLUDED.status,
          api_sources = jsonb_set(
            COALESCE(sme_companies.api_sources, '{}'::jsonb),
            '{sources}',
            COALESCE(sme_companies.api_sources->'sources', '[]'::jsonb) || '["HOMETAX"]'::jsonb
          ),
          metadata = COALESCE(EXCLUDED.metadata, sme_companies.metadata),
          last_updated = CURRENT_TIMESTAMP
        RETURNING id
      `, {
        bind: [
          hometaxData.business_number,
          hometaxData.company_name,
          hometaxData.ceo_name,
          hometaxData.establishment_date,
          hometaxData.business_status || 'active',
          JSON.stringify({ sources: ['HOMETAX'] }),
          JSON.stringify({
            hometax_valid: hometaxData.valid,
            tax_type: hometaxData.tax_type,
            end_date: hometaxData.end_date
          })
        ]
      });

      const companyId = result[0]?.id;

      console.log(`✅ [Hometax] Data saved for company_id: ${companyId}`);
      return companyId;
    } catch (error) {
      console.error('[Hometax] Database save error:', error.message);
      throw error;
    }
  }

  /**
   * 부가세 매출 데이터 조회 (향후 확장)
   * Note: 실제 API는 사업자 본인 인증 필요
   */
  async getVatSalesData(businessNumber, year, quarter) {
    console.warn('[Hometax] VAT sales data API not yet implemented');
    console.warn('Requires business owner authentication via Hometax');

    // 향후 구현:
    // - 홈택스 로그인 (공동인증서 또는 간편인증)
    // - 부가가치세 신고자료 조회
    // - 매출액 데이터 추출

    return null;
  }

  /**
   * 일괄 검증 (여러 사업자번호 동시 조회)
   */
  async batchValidate(businessNumbers) {
    try {
      const cleanNumbers = businessNumbers.map(bn => bn.replace(/-/g, ''));

      const businesses = cleanNumbers.map(bn => ({
        b_no: bn,
        start_dt: '',
        p_nm: '',
        p_nm2: '',
        b_nm: '',
        corp_no: '',
        b_sector: '',
        b_type: ''
      }));

      const response = await axios.post(
        `${this.validationUrl}/validate`,
        { businesses },
        {
          params: {
            serviceKey: this.apiKey
          },
          headers: {
            'Content-Type': 'application/json'
          },
          timeout: 30000
        }
      );

      if (response.data && response.data.data) {
        return response.data.data.map(item => ({
          business_number: item.b_no,
          valid: item.valid === '01',
          company_name: item.b_nm,
          status: item.valid_msg
        }));
      }

      return [];
    } catch (error) {
      console.error('[Hometax] Batch validation error:', error.message);
      return [];
    }
  }
}

export default new HometaxApiService();

/**
 * 공공데이터 (data.go.kr) API Client
 * 여러 공공 API를 통합
 */

import axios from 'axios';

class PublicDataClient {
  constructor(apiKeys) {
    this.apiKeys = apiKeys || {};
    this.client = axios.create({
      timeout: 30000
    });
  }

  /**
   * 사업자등록번호로 기업 정보 조회
   * @param {String} businessNumber
   * @returns {Object}
   */
  async getCompanyByBusinessNumber(businessNumber) {
    try {
      // 여러 공공 API를 병렬로 조회
      const [basicInfo, employeeInfo, certInfo] = await Promise.all([
        this.getBasicInfo(businessNumber),
        this.getEmployeeInfo(businessNumber),
        this.getCertificationInfo(businessNumber)
      ]);

      return this.normalizeData({
        ...basicInfo,
        ...employeeInfo,
        ...certInfo,
        business_number: businessNumber
      });

    } catch (error) {
      console.error(`[PUBLIC] Error fetching company ${businessNumber}:`, error.message);
      return null;
    }
  }

  /**
   * 국세청 사업자 등록 상태 조회
   * @param {String} businessNumber
   * @returns {Object}
   */
  async getBasicInfo(businessNumber) {
    try {
      const apiKey = this.apiKeys.nts_business_status;
      if (!apiKey) {
        console.log('[PUBLIC] NTS API key not configured');
        return {};
      }

      // 국세청 사업자등록상태 조회 API
      const response = await this.client.post(
        'https://api.odcloud.kr/api/nts-businessman/v1/status',
        {
          b_no: [businessNumber.replace(/-/g, '')] // 하이픈 제거
        },
        {
          headers: {
            'Authorization': apiKey,
            'Content-Type': 'application/json'
          }
        }
      );

      const data = response.data?.data?.[0];
      if (!data) return {};

      return {
        company_name: data.tax_type_nm || data.company_nm,
        business_status: data.b_stt, // 사업자상태
        business_type: data.b_type, // 사업자구분
        tax_type: data.tax_type, // 과세유형
        establishment_date: data.start_dt,
        is_active: data.b_stt === '계속사업자'
      };

    } catch (error) {
      console.error('[PUBLIC] getBasicInfo error:', error.message);
      return {};
    }
  }

  /**
   * 국민연금 가입 사업장 정보 조회 (기업 기본정보 보강)
   * ⚠️ 재무정보는 제공하지 않음 - 기업명, 대표자, 주소, 종업원, 업종만
   * @param {String} businessNumber
   * @returns {Object}
   */
  async getEmployeeInfo(businessNumber) {
    try {
      const apiKey = this.apiKeys.sme_financial;
      if (!apiKey) {
        console.log('[PUBLIC] Employee info API key not configured');
        return {};
      }

      // 국민연금 사업장 정보 조회 (기본정보만 제공)
      const response = await this.client.get(
        'http://apis.data.go.kr/B552015/NpsBplcInfoInqireService/getBassInfoSearch',
        {
          params: {
            serviceKey: apiKey,
            bizrno: businessNumber.replace(/-/g, ''),
            numOfRows: 1,
            pageNo: 1,
            _type: 'json'
          }
        }
      );

      const item = response.data?.response?.body?.items?.item;
      if (!item) return {};

      return {
        company_name: item.corpNm,
        ceo_name: item.rprsntvNm,
        address: `${item.roadNmAdr || ''} ${item.lotnoAdr || ''}`.trim(),
        employee_count: parseInt(item.bmanEnprsCnt) || 0,
        industry_name: item.indutyNm,
        industry_code: item.indutyCode
      };

    } catch (error) {
      console.error('[PUBLIC] getEmployeeInfo error:', error.message);
      return {};
    }
  }

  /**
   * 기업 인증정보 조회 (벤처, 이노비즈 등)
   * @param {String} businessNumber
   * @returns {Object}
   */
  async getCertificationInfo(businessNumber) {
    try {
      const certifications = await Promise.all([
        this.checkVentureCertification(businessNumber),
        this.checkInnobizCertification(businessNumber),
        this.checkMainBizCertification(businessNumber)
      ]);

      return {
        venture_certification: certifications[0],
        innovation_certification: certifications[1],
        main_biz_certification: certifications[2]
      };

    } catch (error) {
      console.error('[PUBLIC] getCertificationInfo error:', error.message);
      return {};
    }
  }

  /**
   * 벤처기업 확인
   * @param {String} businessNumber
   * @returns {Boolean}
   */
  async checkVentureCertification(businessNumber) {
    try {
      const apiKey = this.apiKeys.venture_cert;
      if (!apiKey) return false;

      const response = await this.client.get(
        'http://apis.data.go.kr/1160100/service/GetVentureInfoService/getVentureCmpnyLst',
        {
          params: {
            serviceKey: apiKey,
            brno: businessNumber.replace(/-/g, ''),
            numOfRows: 1,
            pageNo: 1,
            _type: 'json'
          }
        }
      );

      const items = response.data?.response?.body?.items?.item;
      return !!items && items.length > 0;

    } catch (error) {
      return false;
    }
  }

  /**
   * 이노비즈 인증 확인
   * @param {String} businessNumber
   * @returns {Boolean}
   */
  async checkInnobizCertification(businessNumber) {
    try {
      const apiKey = this.apiKeys.innobiz_cert;
      if (!apiKey) return false;

      const response = await this.client.get(
        'http://apis.data.go.kr/B552015/InnovationEnterpriseInfo/getInnoEntpList',
        {
          params: {
            serviceKey: apiKey,
            bizrno: businessNumber.replace(/-/g, ''),
            numOfRows: 1,
            pageNo: 1,
            _type: 'json'
          }
        }
      );

      const items = response.data?.response?.body?.items?.item;
      return !!items && items.length > 0;

    } catch (error) {
      return false;
    }
  }

  /**
   * 주력산업 인증 확인
   * @param {String} businessNumber
   * @returns {Boolean}
   */
  async checkMainBizCertification(businessNumber) {
    // 주력산업 API 구현 (API 키 필요 시)
    return false;
  }

  /**
   * 공공데이터를 표준 형식으로 변환
   * @param {Object} publicData
   * @returns {Object}
   */
  normalizeData(publicData) {
    return {
      business_number: publicData.business_number,
      company_name: publicData.company_name,
      ceo_name: publicData.ceo_name,
      address: publicData.address,
      phone: publicData.phone,
      establishment_date: publicData.establishment_date,
      employee_count: publicData.employee_count,
      industry_name: publicData.industry_name,
      industry_code: publicData.industry_code,
      business_status: publicData.business_status,
      business_type: publicData.business_type,
      is_active: publicData.is_active,
      venture_certification: publicData.venture_certification || false,
      innovation_certification: publicData.innovation_certification || false,
      main_biz_certification: publicData.main_biz_certification || false
    };
  }

  /**
   * 다중 기업 조회 (배치)
   * @param {Array} businessNumbers
   * @returns {Array}
   */
  async batchGetCompanies(businessNumbers) {
    const results = await Promise.allSettled(
      businessNumbers.map(bn => this.getCompanyByBusinessNumber(bn))
    );

    return results
      .filter(r => r.status === 'fulfilled' && r.value)
      .map(r => r.value);
  }
}

export default PublicDataClient;

import dartApiService from './dartApiService.js';
import hometaxApiService from './hometaxApiService.js';
import smeApiAnalyzer from './smeApiAnalyzer.js';
import sequelize from '../config/database.js';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Data Integration Service
 * 여러 API 소스의 데이터를 통합하고 충돌 해결
 *
 * 우선순위 (사용자 요구사항):
 * 1. 최신 데이터 우선
 * 2. 공신력 우선순위: 금감원(DART) > 국세청(Hometax) > data.go.kr
 */

class DataIntegrationService {
  constructor() {
    // 데이터 소스별 공신력 점수
    this.credibilityScores = {
      'DART': 10,           // 금융감독원 (가장 높음)
      'HOMETAX': 9,         // 국세청
      'DATA_GO_KR': 7,      // 공공데이터포털
      'COMPANY_WEBSITE': 5, // 회사 홈페이지
      'USER_INPUT': 3       // 사용자 입력
    };
  }

  /**
   * 사업자등록번호로 모든 소스에서 데이터 수집
   */
  async collectAllSources(businessNumber, options = {}) {
    try {
      console.log(`\n[Integration] Collecting data for ${businessNumber} from all sources...`);

      const results = {
        business_number: businessNumber,
        sources: {},
        integrated: null,
        conflicts: [],
        metadata: {
          collected_at: new Date(),
          sources_attempted: [],
          sources_succeeded: []
        }
      };

      // 1. Hometax (사업자등록번호 기본)
      try {
        console.log('[Integration] Fetching from Hometax...');
        results.metadata.sources_attempted.push('HOMETAX');

        const hometaxData = await hometaxApiService.collectBusinessInfo(businessNumber);

        if (hometaxData && hometaxData.valid) {
          results.sources.HOMETAX = hometaxData;
          results.metadata.sources_succeeded.push('HOMETAX');
          console.log('  ✅ Hometax data collected');
        } else {
          console.log('  ⚠️  Hometax: Invalid or no data');
        }
      } catch (error) {
        console.log(`  ❌ Hometax failed: ${error.message}`);
      }

      // 2. DART (상장기업인 경우)
      if (options.corpCode) {
        try {
          console.log('[Integration] Fetching from DART...');
          results.metadata.sources_attempted.push('DART');

          const dartData = await dartApiService.collectCompanyData(
            options.corpCode,
            options.year || new Date().getFullYear()
          );

          if (dartData && dartData.company_info) {
            results.sources.DART = dartData;
            results.metadata.sources_succeeded.push('DART');
            console.log('  ✅ DART data collected');
          }
        } catch (error) {
          console.log(`  ❌ DART failed: ${error.message}`);
        }
      }

      // 3. data.go.kr APIs
      try {
        console.log('[Integration] Fetching from data.go.kr APIs...');
        results.metadata.sources_attempted.push('DATA_GO_KR');

        // SME 관련 API 호출 (향후 구현)
        // const dataGoKrData = await smeApiAnalyzer.collectForBusinessNumber(businessNumber);
        // results.sources.DATA_GO_KR = dataGoKrData;

        console.log('  ⏭️  data.go.kr APIs (to be implemented)');
      } catch (error) {
        console.log(`  ❌ data.go.kr failed: ${error.message}`);
      }

      // 4. 데이터 통합 (충돌 해결)
      results.integrated = this.mergeData(results.sources);
      results.conflicts = this.detectConflicts(results.sources);

      console.log(`\n✅ [Integration] Collection complete:`);
      console.log(`   Sources succeeded: ${results.metadata.sources_succeeded.join(', ')}`);
      console.log(`   Conflicts detected: ${results.conflicts.length}`);

      return results;
    } catch (error) {
      console.error('[Integration] Collection error:', error.message);
      throw error;
    }
  }

  /**
   * 여러 소스의 데이터를 통합 (충돌 해결)
   */
  mergeData(sources) {
    const merged = {
      company_info: {},
      financials: {},
      officers: [],
      metadata: {
        sources_used: [],
        field_sources: {} // 각 필드가 어느 소스에서 왔는지 추적
      }
    };

    // 기업 기본정보 병합
    merged.company_info = this.mergeCompanyInfo(sources);
    merged.metadata.sources_used.push(...Object.keys(sources));

    // 재무정보 병합 (DART 우선)
    if (sources.DART?.financials) {
      merged.financials = sources.DART.financials;
      merged.metadata.field_sources.financials = 'DART';
    }

    // 임원정보 병합 (DART 우선, 없으면 다른 소스)
    if (sources.DART?.officers) {
      merged.officers = sources.DART.officers;
      merged.metadata.field_sources.officers = 'DART';
    }

    return merged;
  }

  /**
   * 기업 기본정보 병합 (필드별 최적 소스 선택)
   */
  mergeCompanyInfo(sources) {
    const fields = [
      'business_number',
      'company_name',
      'company_name_en',
      'ceo_name',
      'establishment_date',
      'address',
      'phone',
      'fax',
      'website',
      'industry_code',
      'industry_name',
      'status'
    ];

    const merged = {};

    for (const field of fields) {
      const candidates = [];

      // 각 소스에서 해당 필드 수집
      for (const [sourceName, sourceData] of Object.entries(sources)) {
        let value = null;
        let timestamp = null;

        // DART
        if (sourceName === 'DART' && sourceData.company_info) {
          value = sourceData.company_info[field];
          timestamp = sourceData.collected_at;
        }
        // HOMETAX
        else if (sourceName === 'HOMETAX') {
          value = sourceData[field];
          timestamp = sourceData.collected_at;
        }
        // data.go.kr
        else if (sourceName === 'DATA_GO_KR' && sourceData.company_info) {
          value = sourceData.company_info[field];
          timestamp = sourceData.collected_at;
        }

        if (value !== null && value !== undefined && value !== '') {
          candidates.push({
            source: sourceName,
            value,
            timestamp,
            credibility: this.credibilityScores[sourceName] || 0
          });
        }
      }

      // 최적 값 선택 (최신 데이터 우선 → 공신력 우선)
      if (candidates.length > 0) {
        merged[field] = this.selectBestValue(candidates);
      }
    }

    return merged;
  }

  /**
   * 최적 값 선택 (충돌 해결 로직)
   */
  selectBestValue(candidates) {
    if (candidates.length === 1) {
      return {
        value: candidates[0].value,
        source: candidates[0].source
      };
    }

    // 1차: 최신 데이터 필터링 (최근 30일 이내)
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    let recentCandidates = candidates.filter(c =>
      c.timestamp && new Date(c.timestamp) >= thirtyDaysAgo
    );

    // 최신 데이터가 없으면 전체 후보 사용
    if (recentCandidates.length === 0) {
      recentCandidates = candidates;
    }

    // 2차: 최신 데이터 중 가장 최근 것들만 선택 (같은 날짜)
    const latestTimestamp = recentCandidates.reduce((latest, c) => {
      const ts = c.timestamp ? new Date(c.timestamp) : new Date(0);
      return ts > latest ? ts : latest;
    }, new Date(0));

    const latestCandidates = recentCandidates.filter(c => {
      if (!c.timestamp) return false;
      const ts = new Date(c.timestamp);
      return Math.abs(ts - latestTimestamp) < 24 * 60 * 60 * 1000; // 같은 날
    });

    // 3차: 공신력 높은 순으로 정렬
    const sorted = (latestCandidates.length > 0 ? latestCandidates : candidates)
      .sort((a, b) => b.credibility - a.credibility);

    return {
      value: sorted[0].value,
      source: sorted[0].source,
      alternatives: sorted.slice(1).map(c => ({
        value: c.value,
        source: c.source
      }))
    };
  }

  /**
   * 데이터 충돌 감지
   */
  detectConflicts(sources) {
    const conflicts = [];
    const criticalFields = ['company_name', 'ceo_name', 'business_number', 'status'];

    for (const field of criticalFields) {
      const values = new Map();

      for (const [sourceName, sourceData] of Object.entries(sources)) {
        let value = null;

        if (sourceName === 'DART' && sourceData.company_info) {
          value = sourceData.company_info[field];
        } else if (sourceName === 'HOMETAX') {
          value = sourceData[field];
        }

        if (value) {
          const key = String(value).trim().toLowerCase();
          if (!values.has(key)) {
            values.set(key, []);
          }
          values.get(key).push({ source: sourceName, value });
        }
      }

      // 값이 2개 이상이면 충돌
      if (values.size > 1) {
        conflicts.push({
          field,
          values: Array.from(values.values()),
          severity: this.getConflictSeverity(field)
        });
      }
    }

    return conflicts;
  }

  /**
   * 충돌 심각도 판단
   */
  getConflictSeverity(field) {
    const criticalFields = ['business_number', 'company_name'];
    const importantFields = ['ceo_name', 'status'];

    if (criticalFields.includes(field)) return 'critical';
    if (importantFields.includes(field)) return 'high';
    return 'low';
  }

  /**
   * 통합 데이터를 데이터베이스에 저장
   */
  async saveIntegratedData(integrationResult) {
    try {
      const { integrated, business_number, conflicts } = integrationResult;

      if (!integrated || !integrated.company_info) {
        throw new Error('No integrated data to save');
      }

      // 1. 기업 기본정보 저장
      const companyId = await this.saveCompanyInfo(integrated.company_info, business_number);

      // 2. 재무정보 저장
      if (integrated.financials && companyId) {
        await this.saveFinancials(companyId, integrated.financials);
      }

      // 3. 임원정보 저장
      if (integrated.officers && integrated.officers.length > 0 && companyId) {
        await this.saveOfficers(companyId, integrated.officers);
      }

      // 4. 데이터 충돌 로그 저장
      if (conflicts && conflicts.length > 0) {
        await this.saveConflicts(companyId, conflicts);
      }

      console.log(`✅ [Integration] Integrated data saved for company_id: ${companyId}`);

      return companyId;
    } catch (error) {
      console.error('[Integration] Save error:', error.message);
      throw error;
    }
  }

  /**
   * 기업 기본정보 저장
   */
  async saveCompanyInfo(companyInfo, businessNumber) {
    const [result] = await sequelize.query(`
      INSERT INTO sme_companies (
        business_number, company_name, company_name_en, ceo_name,
        establishment_date, address, phone, fax, website,
        industry_code, status, api_sources, metadata
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      ON CONFLICT (business_number) DO UPDATE SET
        company_name = EXCLUDED.company_name,
        ceo_name = EXCLUDED.ceo_name,
        address = EXCLUDED.address,
        phone = EXCLUDED.phone,
        website = EXCLUDED.website,
        last_updated = CURRENT_TIMESTAMP
      RETURNING id
    `, {
      bind: [
        businessNumber,
        companyInfo.company_name?.value || null,
        companyInfo.company_name_en?.value || null,
        companyInfo.ceo_name?.value || null,
        companyInfo.establishment_date?.value || null,
        companyInfo.address?.value || null,
        companyInfo.phone?.value || null,
        companyInfo.fax?.value || null,
        companyInfo.website?.value || null,
        companyInfo.industry_code?.value || null,
        companyInfo.status?.value || 'active',
        JSON.stringify({ sources: ['INTEGRATED'] }),
        JSON.stringify({ field_sources: this.extractFieldSources(companyInfo) })
      ]
    });

    return result[0]?.id;
  }

  /**
   * 필드별 소스 추출
   */
  extractFieldSources(companyInfo) {
    const fieldSources = {};

    for (const [field, data] of Object.entries(companyInfo)) {
      if (data && data.source) {
        fieldSources[field] = data.source;
      }
    }

    return fieldSources;
  }

  /**
   * 재무정보 저장 (간략 버전)
   */
  async saveFinancials(companyId, financials) {
    // DART 서비스의 saveFinancials 재사용
    if (financials.bs && financials.is) {
      await dartApiService.saveFinancials(companyId, financials, new Date().getFullYear());
    }
  }

  /**
   * 임원정보 저장 (간략 버전)
   */
  async saveOfficers(companyId, officers) {
    // DART 서비스의 saveOfficers 재사용
    await dartApiService.saveOfficers(companyId, officers, []);
  }

  /**
   * 데이터 충돌 로그 저장
   */
  async saveConflicts(companyId, conflicts) {
    for (const conflict of conflicts) {
      await sequelize.query(`
        INSERT INTO collection_logs (
          log_type, status, message, metadata
        )
        VALUES ($1, $2, $3, $4)
      `, {
        bind: [
          'data_conflict',
          'warning',
          `Data conflict detected in field: ${conflict.field}`,
          JSON.stringify({
            company_id: companyId,
            field: conflict.field,
            severity: conflict.severity,
            values: conflict.values
          })
        ]
      });
    }
  }
}

export default new DataIntegrationService();

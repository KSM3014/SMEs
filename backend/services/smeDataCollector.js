import dataIntegrationService from './dataIntegrationService.js';
import dartApiService from './dartApiService.js';
import hometaxApiService from './hometaxApiService.js';
import smeApiAnalyzer from './smeApiAnalyzer.js';
import sequelize from '../config/database.js';
import dotenv from 'dotenv';

dotenv.config();

/**
 * SME Data Collection Orchestrator
 * 모든 데이터 소스를 통합하여 SME 기업 정보를 수집하고 저장하는 오케스트레이터
 */

class SMEDataCollector {
  constructor() {
    this.sources = ['HOMETAX', 'DART', 'DATA_GO_KR'];
    this.collectionStats = {
      total: 0,
      successful: 0,
      failed: 0,
      duration: 0
    };
  }

  /**
   * 단일 기업 데이터 수집 (모든 소스 통합)
   */
  async collectCompany(businessNumber, options = {}) {
    const startTime = Date.now();

    try {
      console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
      console.log(`  SME 데이터 수집: ${businessNumber}`);
      console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

      // 1단계: 사업자등록번호 검증 (Hometax)
      console.log('[1/4] 사업자등록번호 검증 중...');
      const hometaxData = await hometaxApiService.collectBusinessInfo(businessNumber);

      if (!hometaxData || hometaxData.valid === false) {
        throw new Error('유효하지 않은 사업자등록번호입니다');
      }

      console.log(`  ✅ 검증 완료: ${hometaxData.company_name || '회사명 확인 필요'}`);

      // 2단계: 기존 DB 데이터 확인
      console.log('\n[2/4] 기존 데이터 확인 중...');
      const existing = await this.getExistingCompany(businessNumber);

      if (existing && !options.forceRefresh) {
        const lastUpdate = new Date(existing.last_updated);
        const daysSinceUpdate = (Date.now() - lastUpdate) / (1000 * 60 * 60 * 24);

        if (daysSinceUpdate < 1) {
          console.log(`  ℹ️  최근 업데이트됨 (${Math.round(daysSinceUpdate * 24)}시간 전)`);
          console.log(`  💾 캐시된 데이터 반환 (강제 새로고침: forceRefresh=true)`);
          return existing;
        }
      }

      // 3단계: 다중 소스 데이터 수집
      console.log('\n[3/4] 다중 소스 데이터 수집 중...');

      const integrationOptions = {
        corpCode: options.corpCode || (existing?.metadata?.dart_corp_code),
        year: options.year || new Date().getFullYear()
      };

      const integratedData = await dataIntegrationService.collectAllSources(
        businessNumber,
        integrationOptions
      );

      // 4단계: 데이터 저장
      console.log('\n[4/4] 데이터베이스 저장 중...');
      const companyId = await dataIntegrationService.saveIntegratedData(integratedData);

      const duration = Date.now() - startTime;

      console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
      console.log(`  ✅ 수집 완료!`);
      console.log(`  Company ID: ${companyId}`);
      console.log(`  소요 시간: ${(duration / 1000).toFixed(2)}초`);
      console.log(`  데이터 소스: ${integratedData.metadata.sources_succeeded.join(', ')}`);
      console.log(`  충돌 발견: ${integratedData.conflicts.length}건`);
      console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

      return {
        company_id: companyId,
        business_number: businessNumber,
        data: integratedData.integrated,
        sources: integratedData.metadata.sources_succeeded,
        conflicts: integratedData.conflicts,
        duration
      };

    } catch (error) {
      const duration = Date.now() - startTime;
      console.error(`\n❌ 수집 실패 (${businessNumber}):`, error.message);

      await this.logError(businessNumber, error);

      throw error;
    }
  }

  /**
   * 여러 기업 일괄 수집
   */
  async collectMultipleCompanies(businessNumbers, options = {}) {
    console.log(`\n╔════════════════════════════════════════════════════╗`);
    console.log(`║  SME 일괄 데이터 수집: ${businessNumbers.length}개 기업              ║`);
    console.log(`╚════════════════════════════════════════════════════╝\n`);

    const results = [];
    const startTime = Date.now();

    this.collectionStats = {
      total: businessNumbers.length,
      successful: 0,
      failed: 0,
      duration: 0
    };

    for (let i = 0; i < businessNumbers.length; i++) {
      const businessNumber = businessNumbers[i];

      try {
        console.log(`\n[${i + 1}/${businessNumbers.length}] ${businessNumber}`);

        const result = await this.collectCompany(businessNumber, options);

        results.push({
          success: true,
          business_number: businessNumber,
          company_id: result.company_id,
          data: result.data
        });

        this.collectionStats.successful++;

        // Rate limiting: 데이터 소스 보호
        if (i < businessNumbers.length - 1) {
          const delay = options.delay || 3000;
          console.log(`  ⏳ 대기 중 (${delay / 1000}초)...\n`);
          await this.sleep(delay);
        }

      } catch (error) {
        results.push({
          success: false,
          business_number: businessNumber,
          error: error.message
        });

        this.collectionStats.failed++;

        // 에러 후에도 계속 진행
        if (!options.stopOnError) {
          console.log(`  ⏭️  다음 기업으로 계속...\n`);
          await this.sleep(2000);
        } else {
          break;
        }
      }
    }

    this.collectionStats.duration = Date.now() - startTime;

    // 최종 요약
    this.printSummary();

    return {
      results,
      stats: this.collectionStats
    };
  }

  /**
   * DART corp_code로 기업 찾기 및 수집
   */
  async collectByCorpCode(corpCode, year) {
    try {
      console.log(`[DART] Corp Code로 수집: ${corpCode}`);

      // DART에서 먼저 기업 정보 가져오기
      const dartData = await dartApiService.collectCompanyData(corpCode, year);

      if (!dartData || !dartData.company_info) {
        throw new Error('DART에서 기업 정보를 찾을 수 없습니다');
      }

      const businessNumber = dartData.company_info.business_number;

      if (!businessNumber) {
        throw new Error('사업자등록번호를 찾을 수 없습니다');
      }

      // 사업자등록번호로 전체 수집
      return await this.collectCompany(businessNumber, { corpCode, year });

    } catch (error) {
      console.error('[DART] 수집 실패:', error.message);
      throw error;
    }
  }

  /**
   * 업종별 기업 수집 (data.go.kr API 활용)
   */
  async collectByIndustry(industryCode, limit = 100) {
    console.log(`\n[산업별 수집] 업종코드: ${industryCode}, 최대: ${limit}개`);

    try {
      // SME API에서 해당 업종 기업 목록 가져오기
      const companies = await this.getCompaniesByIndustry(industryCode, limit);

      console.log(`  발견된 기업: ${companies.length}개`);

      if (companies.length === 0) {
        return { results: [], stats: this.collectionStats };
      }

      const businessNumbers = companies.map(c => c.business_number);

      return await this.collectMultipleCompanies(businessNumbers, {
        delay: 5000 // 산업별 대량 수집은 더 긴 delay
      });

    } catch (error) {
      console.error('[산업별 수집] 실패:', error.message);
      throw error;
    }
  }

  /**
   * 기존 기업 데이터 조회
   */
  async getExistingCompany(businessNumber) {
    try {
      const [companies] = await sequelize.query(`
        SELECT * FROM sme_companies
        WHERE business_number = $1
        LIMIT 1
      `, {
        bind: [businessNumber]
      });

      return companies.length > 0 ? companies[0] : null;
    } catch (error) {
      console.error('기존 데이터 조회 실패:', error.message);
      return null;
    }
  }

  /**
   * 업종별 기업 목록 조회 (미구현 - 향후 확장)
   */
  async getCompaniesByIndustry(industryCode, limit) {
    // TODO: data.go.kr API에서 업종별 기업 목록 가져오기
    console.warn('[TODO] 업종별 기업 목록 API 구현 필요');
    return [];
  }

  /**
   * 에러 로깅
   */
  async logError(businessNumber, error) {
    try {
      await sequelize.query(`
        INSERT INTO collection_logs (log_type, status, message, metadata)
        VALUES ($1, $2, $3, $4)
      `, {
        bind: [
          'sme_collection_error',
          'failed',
          error.message,
          JSON.stringify({
            business_number: businessNumber,
            error_stack: error.stack,
            timestamp: new Date()
          })
        ]
      });
    } catch (logError) {
      console.error('에러 로깅 실패:', logError.message);
    }
  }

  /**
   * 수집 요약 출력
   */
  printSummary() {
    console.log(`\n\n╔════════════════════════════════════════════════════╗`);
    console.log(`║              📊 수집 완료 요약                     ║`);
    console.log(`╠════════════════════════════════════════════════════╣`);
    console.log(`║  전체 기업:     ${this.collectionStats.total.toString().padEnd(35)}║`);
    console.log(`║  성공:          ${this.collectionStats.successful.toString().padEnd(35)}║`);
    console.log(`║  실패:          ${this.collectionStats.failed.toString().padEnd(35)}║`);
    console.log(`║  성공률:        ${((this.collectionStats.successful / this.collectionStats.total * 100).toFixed(1) + '%').padEnd(35)}║`);
    console.log(`║  총 소요 시간:  ${((this.collectionStats.duration / 1000 / 60).toFixed(1) + '분').padEnd(35)}║`);
    console.log(`╚════════════════════════════════════════════════════╝\n`);
  }

  /**
   * Sleep helper
   */
  async sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export default new SMEDataCollector();

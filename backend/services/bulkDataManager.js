/**
 * Bulk Data Manager
 * Pattern D API의 전체 데이터 다운로드 + 로컬 인덱싱
 *
 * 소규모 (18K~33K): 메모리 Map<brno, data[]> 캐싱
 * 대규모 (6.3M 근로복지): DB 테이블 저장 + brno 인덱스
 */

import axios from 'axios';
import sequelize from '../config/database.js';
import { BULK_FILTER_APIS } from './apiAdapters/apiRegistry.js';

const API_TIMEOUT = 30000;
const BATCH_SIZE = 1000;

class BulkDataManager {
  constructor() {
    this.client = axios.create({ timeout: API_TIMEOUT });
    // 소규모 API 메모리 캐시: apiId → Map<brno, data[]>
    this.memoryCache = new Map();
    this.cacheLoadedAt = new Map(); // apiId → timestamp
    this.cacheTTL = 24 * 60 * 60 * 1000; // 24시간
    this.loading = new Map(); // apiId → Promise (중복 로딩 방지)
  }

  /**
   * brno로 모든 Bulk API에서 검색
   * @param {string} brno
   * @returns {Array} 표준화된 응답 배열
   */
  async searchByBrno(brno) {
    if (!brno) return [];

    const normalizedBrno = String(brno).replace(/[-\s]/g, '');
    const results = [];

    for (const api of BULK_FILTER_APIS) {
      try {
        let items;
        if (api.strategy === 'memory') {
          items = await this.searchMemoryCache(api, normalizedBrno);
        } else if (api.strategy === 'db') {
          items = await this.searchDatabase(api, normalizedBrno);
        }

        if (items && items.length > 0) {
          results.push({
            source: api.name,
            companyName: items[0][api.nameField] || null,
            brno: normalizedBrno,
            crno: null,
            address: null,
            representative: null,
            industryCode: null,
            rawData: items
          });
        }
      } catch (error) {
        console.warn(`[BulkData] ${api.name} search failed: ${error.message}`);
      }
    }

    return results;
  }

  /**
   * 메모리 캐시에서 검색 (소규모 API)
   */
  async searchMemoryCache(api, brno) {
    // 캐시가 없거나 만료된 경우 로드
    if (!this.isCacheValid(api.id)) {
      await this.loadToMemory(api);
    }

    const index = this.memoryCache.get(api.id);
    if (!index) return [];

    return index.get(brno) || [];
  }

  /**
   * DB에서 검색 (대규모 API)
   */
  async searchDatabase(api, brno) {
    try {
      const tableName = `bulk_${api.id}`;
      const [results] = await sequelize.query(
        `SELECT raw_data, "${api.nameField}" FROM ${tableName} WHERE "${api.brnoField}" = $1 LIMIT 100`,
        { bind: [brno] }
      );
      return results.map(r => typeof r.raw_data === 'string' ? JSON.parse(r.raw_data) : r.raw_data);
    } catch (error) {
      if (error.message.includes('does not exist') || error.message.includes('relation')) {
        console.log(`[BulkData] Table bulk_${api.id} not found - run download_comwel_bulk.js first`);
        return [];
      }
      throw error;
    }
  }

  /**
   * 소규모 API 데이터를 메모리에 로드
   */
  async loadToMemory(api) {
    // 중복 로딩 방지
    if (this.loading.has(api.id)) {
      return this.loading.get(api.id);
    }

    const loadPromise = this._doLoadToMemory(api);
    this.loading.set(api.id, loadPromise);

    try {
      await loadPromise;
    } finally {
      this.loading.delete(api.id);
    }
  }

  async _doLoadToMemory(api) {
    console.log(`[BulkData] Loading ${api.name} to memory...`);
    const index = new Map();
    let pageNo = 1;
    let totalLoaded = 0;
    let hasMore = true;

    while (hasMore) {
      try {
        const req = api.buildPageRequest(pageNo, BATCH_SIZE);
        const resp = await this.client.get(req.url, { params: req.params });
        const items = api.extractItems(resp.data);

        if (!items || items.length === 0) {
          hasMore = false;
          break;
        }

        for (const item of items) {
          const brno = api.extractBrno(item);
          if (!brno) continue;

          const normalizedBrno = String(brno).replace(/[-\s]/g, '');
          if (!index.has(normalizedBrno)) {
            index.set(normalizedBrno, []);
          }
          index.get(normalizedBrno).push(item);
        }

        totalLoaded += items.length;

        // 진행 상황 로깅 (10페이지마다)
        if (pageNo % 10 === 0) {
          console.log(`  [BulkData] ${api.name}: ${totalLoaded} records loaded (page ${pageNo})`);
        }

        // 마지막 페이지 감지
        if (items.length < BATCH_SIZE) {
          hasMore = false;
        }

        pageNo++;

        // 안전장치: 최대 페이지 제한
        if (pageNo > 200) {
          console.warn(`  [BulkData] ${api.name}: max page limit reached at ${pageNo}`);
          hasMore = false;
        }
      } catch (error) {
        console.error(`  [BulkData] ${api.name} page ${pageNo} failed: ${error.message}`);
        hasMore = false;
      }
    }

    this.memoryCache.set(api.id, index);
    this.cacheLoadedAt.set(api.id, Date.now());
    console.log(`[BulkData] ${api.name}: ${totalLoaded} records loaded, ${index.size} unique BRNOs`);
  }

  /**
   * 대규모 API 데이터를 DB에 저장 (배치 작업)
   */
  async loadToDatabase(api, { startPage = 1, maxPages = null, resume = false } = {}) {
    console.log(`[BulkData] Loading ${api.name} to database...`);
    const tableName = `bulk_${api.id}`;

    // 테이블 생성 (없는 경우)
    await this.ensureBulkTable(tableName, api.brnoField, api.nameField);

    let pageNo = startPage;
    let totalLoaded = 0;
    let consecutiveErrors = 0;
    const maxConsecutiveErrors = 5;
    let hasMore = true;

    while (hasMore) {
      try {
        const req = api.buildPageRequest(pageNo, BATCH_SIZE);
        const resp = await this.client.get(req.url, { params: req.params });
        const items = api.extractItems(resp.data);

        if (!items || items.length === 0) {
          hasMore = false;
          break;
        }

        const flatItems = items;

        // 배치 INSERT
        await this.batchInsertToDb(tableName, flatItems, api.brnoField);
        totalLoaded += flatItems.length;
        consecutiveErrors = 0;

        if (pageNo % 100 === 0) {
          console.log(`  [BulkData] ${api.name}: ${totalLoaded} records saved (page ${pageNo})`);
        }

        if (items.length < BATCH_SIZE) hasMore = false;
        if (maxPages && (pageNo - startPage + 1) >= maxPages) hasMore = false;
        pageNo++;

      } catch (error) {
        consecutiveErrors++;
        console.error(`  [BulkData] ${api.name} page ${pageNo} failed (${consecutiveErrors}/${maxConsecutiveErrors}): ${error.message}`);
        if (consecutiveErrors >= maxConsecutiveErrors) {
          console.error(`  [BulkData] Too many consecutive errors, stopping at page ${pageNo}`);
          hasMore = false;
        } else {
          pageNo++;
        }
        if (pageNo > 10000) hasMore = false;
      }
    }

    console.log(`[BulkData] ${api.name}: Total ${totalLoaded} records saved to ${tableName} (pages ${startPage}-${pageNo - 1})`);
    return { totalLoaded, lastPage: pageNo - 1 };
  }


  /**
   * Bulk 테이블 생성
   */
  async ensureBulkTable(tableName, brnoField, nameField = null) {
    const nameCol = nameField ? `"${nameField}" VARCHAR(200),` : '';
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS ${tableName} (
        id SERIAL PRIMARY KEY,
        raw_data JSONB NOT NULL,
        "${brnoField}" VARCHAR(20),
        ${nameCol}
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await sequelize.query(`
      CREATE INDEX IF NOT EXISTS idx_${tableName}_brno ON ${tableName} ("${brnoField}")
    `);
  }

  /**
   * 배치 INSERT
   */
  async batchInsertToDb(tableName, items, brnoFieldName = null) {
    if (items.length === 0) return;

    // brno 필드 이름 결정
    if (!brnoFieldName) {
      const firstItem = items[0];
      brnoFieldName = Object.keys(firstItem).find(k =>
        k.toLowerCase().includes('drno') || k.toLowerCase().includes('brno') || k.toLowerCase().includes('bizrno')
      ) || 'brno';
    }

    const values = items.map((item, i) =>
      `($${i * 2 + 1}, $${i * 2 + 2})`
    ).join(', ');

    const binds = items.flatMap(item => {
      const brnoValue = item[brnoFieldName] || null;
      return [JSON.stringify(item), brnoValue];
    });

    await sequelize.query(
      `INSERT INTO ${tableName} (raw_data, ${brnoFieldName}) VALUES ${values} ON CONFLICT DO NOTHING`,
      { bind: binds }
    );
  }

  /**
   * 캐시 유효성 확인
   */
  isCacheValid(apiId) {
    if (!this.memoryCache.has(apiId)) return false;
    const loadedAt = this.cacheLoadedAt.get(apiId);
    if (!loadedAt) return false;
    return (Date.now() - loadedAt) < this.cacheTTL;
  }

  /**
   * 전체 Bulk 데이터 초기 로드 (서버 시작 시 호출)
   */
  async initializeAll() {
    console.log('[BulkData] Initializing all bulk data...');

    for (const api of BULK_FILTER_APIS) {
      try {
        if (api.strategy === 'memory') {
          await this.loadToMemory(api);
        }
        // DB 전략은 별도의 cron/배치로 실행
      } catch (error) {
        console.error(`[BulkData] ${api.name} init failed: ${error.message}`);
      }
    }

    console.log('[BulkData] Initialization complete');
  }

  /**
   * 캐시 클리어
   */
  clearCache(apiId = null) {
    if (apiId) {
      this.memoryCache.delete(apiId);
      this.cacheLoadedAt.delete(apiId);
    } else {
      this.memoryCache.clear();
      this.cacheLoadedAt.clear();
    }
  }
}

const bulkDataManager = new BulkDataManager();
export default bulkDataManager;

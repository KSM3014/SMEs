/**
 * API Orchestrator
 * 26개 KEEP API를 4가지 패턴으로 병렬 호출 + Entity Resolution
 *
 * Pattern A: Direct Query (11개) - brno/crno로 즉시 조회
 * Pattern B: 2-step Query (2개) - 회사명 검색 → 후보 매칭
 * Pattern C: Reverse Match (7개) - 그룹명 검색 → 응답에서 crno 추출
 * Pattern D: Bulk + Filter (4개) - bulkDataManager 위임
 */

import axios from 'axios';
import {
  DIRECT_QUERY_APIS,
  TWO_STEP_APIS,
  REVERSE_MATCH_APIS,
  BULK_FILTER_APIS,
  NPS_API
} from './apiAdapters/apiRegistry.js';
import { EXPANDED_API_REGISTRY } from './apiAdapters/apiRegistryExpanded.js';
import { MISC_API_REGISTRY } from './apiAdapters/apiRegistryMisc.js';
import {
  resolveEntities,
  normalizeCompanyName,
  calculateNameSimilarity,
  normalizeBrno,
  normalizeCrno,
  MATCH_THRESHOLD
} from './entityResolver.js';
import dotenv from 'dotenv';

dotenv.config();

const API_TIMEOUT = 15000; // 15초
const MAX_CONCURRENT = 5;  // 동시 호출 제한
const SHARED_SERVICE_KEY = process.env.DATA_GO_KR_SHARED_KEY || process.env.NTS_API_KEY;

if (!SHARED_SERVICE_KEY) {
  console.error('[Orchestrator] WARNING: DATA_GO_KR_SHARED_KEY not set in .env');
}

class ApiOrchestrator {
  constructor() {
    this.client = axios.create({ timeout: API_TIMEOUT });
    this.bulkDataManager = null; // lazy init
    this.cache = new Map();
    this.cacheTTL = 30 * 60 * 1000; // 30분
  }

  /**
   * 기업 검색 + Entity Resolution 통합
   * @param {Object} query - { brno, crno, companyName }
   * @returns {Object} { entities, unmatched, meta }
   */
  async searchCompany(query) {
    const startTime = Date.now();
    const { brno, crno, companyName } = query;

    // 캐시 확인
    const cacheKey = `${brno || ''}_${crno || ''}_${companyName || ''}`;
    if (this.cache.has(cacheKey)) {
      const cached = this.cache.get(cacheKey);
      if (Date.now() - cached.timestamp < this.cacheTTL) {
        return { ...cached.data, fromCache: true };
      }
    }

    let resolvedBrno = brno;
    let resolvedCrno = crno;
    let resolvedName = companyName;

    console.log(`\n[Orchestrator] Starting search: brno=${brno || '-'}, crno=${crno || '-'}, name=${companyName || '-'}`);

    const allResponses = [];
    const meta = {
      apisAttempted: 0,
      apisSucceeded: 0,
      apisFailed: 0,
      errors: [],
      timing: {}
    };

    // === Step 0: Identity Discovery (brno → crno+name, or name → brno+crno) ===
    if (resolvedBrno && !resolvedCrno) {
      const discovery = await this.discoverIdentity({ brno: resolvedBrno }, meta);
      if (discovery) {
        if (discovery.crno) resolvedCrno = discovery.crno;
        if (discovery.companyName) resolvedName = resolvedName || discovery.companyName;
        if (discovery.response) allResponses.push(discovery.response);
        console.log(`  [Discovery] brno→crno: ${resolvedCrno || '-'}, name: ${resolvedName || '-'}`);
      } else {
        // FSC discovery failed → try 근로복지공단 bulk DB as fallback
        const fallback = await this.discoverFromBulkDb(resolvedBrno, meta);
        if (fallback) {
          if (fallback.companyName) resolvedName = resolvedName || fallback.companyName;
          if (fallback.response) allResponses.push(fallback.response);
          console.log(`  [Fallback] Bulk DB: name=${resolvedName || '-'} (no crno - likely sole proprietor)`);
        }
      }
    } else if (!resolvedBrno && resolvedName) {
      const discovery = await this.discoverIdentity({ companyName: resolvedName }, meta);
      if (discovery) {
        if (discovery.brno) resolvedBrno = discovery.brno;
        if (discovery.crno) resolvedCrno = discovery.crno;
        if (discovery.response) allResponses.push(discovery.response);
        console.log(`  [Discovery] name→brno: ${resolvedBrno || '-'}, crno: ${resolvedCrno || '-'}`);
      }
    }

    // === Pattern A: Direct Query (brno/crno 기반) ===
    const directResults = await this.executeDirectQueries(resolvedBrno, resolvedCrno, meta);
    allResponses.push(...directResults);

    // === Pattern B: 2-step Query (회사명 기반) ===
    if (!resolvedName) resolvedName = this.extractBestName(directResults);
    if (resolvedName) {
      const twoStepResults = await this.executeTwoStepQueries(resolvedName, resolvedBrno, resolvedCrno, meta);
      allResponses.push(...twoStepResults);
    }

    // === Pattern C: Reverse Match (대규모기업집단) ===
    // Note: 공정위 APIs currently return 404 with shared key.
    // These will be enabled when individual API keys are registered.
    if (resolvedName) {
      const reverseResults = await this.executeReverseMatchQueries(resolvedName, resolvedCrno, meta);
      allResponses.push(...reverseResults);
    }

    // === Pattern D: Bulk + Filter ===
    if (resolvedBrno) {
      const bulkResults = await this.executeBulkFilterQueries(resolvedBrno, meta);
      allResponses.push(...bulkResults);
    }

    // === Pattern E: NPS (국민연금 2-step with phonetic matching) ===
    if (resolvedName) {
      const npsResults = await this.executeNpsQuery(resolvedName, resolvedBrno, meta);
      allResponses.push(...npsResults);
    }

    // === Expanded: Reverse Match (공정위 참여업종/지주회사) ===
    if (resolvedName) {
      const expandedReverseResults = await this.executeExpandedReverseMatch(resolvedName, resolvedCrno, meta);
      allResponses.push(...expandedReverseResults);
    }

    // === Entity Resolution ===
    console.log(`[Orchestrator] Total API responses: ${allResponses.length}, running Entity Resolution...`);
    const resolved = resolveEntities(allResponses);

    meta.timing.totalMs = Date.now() - startTime;
    meta.totalResponses = allResponses.length;

    const result = {
      query: { brno: resolvedBrno, crno: resolvedCrno, companyName: resolvedName },
      entities: resolved.entities,
      unmatched: resolved.unmatched,
      meta
    };

    // 캐시 저장
    this.cache.set(cacheKey, { data: result, timestamp: Date.now() });

    console.log(`[Orchestrator] Done: ${resolved.entities.length} entities, ${resolved.unmatched.length} unmatched (${meta.timing.totalMs}ms)`);
    return result;
  }

  /**
   * Step 0: Identity Discovery
   * brno → crno+회사명 또는 회사명 → brno+crno 검색
   * FSC 기업기본정보 API가 bzno, corpNm 파라미터 모두 지원
   */
  async discoverIdentity(query, meta) {
    try {
      meta.apisAttempted++;
      const params = {
        serviceKey: SHARED_SERVICE_KEY,
        resultType: 'json',
        pageNo: 1,
        numOfRows: 5
      };

      if (query.brno) {
        params.bzno = query.brno;
      } else if (query.companyName) {
        params.corpNm = query.companyName;
      } else {
        return null;
      }

      const data = await this.httpGet(
        'https://apis.data.go.kr/1160100/service/GetCorpBasicInfoService_V2/getCorpOutline_V2',
        params
      );

      const items = data?.response?.body?.items?.item;
      if (!items) return null;

      const arr = Array.isArray(items) ? items : [items];
      if (arr.length === 0) return null;

      // 최적 후보 선택 (brno 검색이면 첫 번째, 이름 검색이면 fuzzy match)
      let best = arr[0];
      if (query.companyName && arr.length > 1) {
        let bestSim = 0;
        for (const item of arr) {
          const sim = calculateNameSimilarity(query.companyName, item.corpNm || '');
          if (sim > bestSim) {
            bestSim = sim;
            best = item;
          }
        }
      }

      meta.apisSucceeded++;

      return {
        brno: normalizeBrno(best.bzno),
        crno: normalizeCrno(best.crno),
        companyName: best.enpPbanCmpyNm || best.corpNm || null,
        response: {
          source: '금융위_기업기본정보(Discovery)',
          companyName: best.corpNm || null,
          brno: best.bzno || null,
          crno: best.crno || null,
          address: best.enpBsadr || null,
          representative: best.enpRprFnm || null,
          industryCode: null,
          rawData: best
        }
      };
    } catch (error) {
      meta.apisFailed++;
      meta.errors.push({ api: 'discovery', error: error.message });
      return null;
    }
  }

  /**
   * Fallback Discovery: 근로복지공단 bulk DB에서 brno로 회사명 검색
   * FSC 기업정보에 없는 회사 (개인사업자 등)도 고용보험 가입 데이터로 확인 가능
   */
  async discoverFromBulkDb(brno, meta) {
    if (!this.bulkDataManager) {
      try {
        const { default: BulkDataManager } = await import('./bulkDataManager.js');
        this.bulkDataManager = BulkDataManager;
      } catch {
        return null;
      }
    }

    try {
      const results = await this.bulkDataManager.searchByBrno(brno);
      if (results.length > 0 && results[0].companyName) {
        return {
          companyName: results[0].companyName,
          response: results[0] // already in standard format from bulkDataManager
        };
      }
    } catch {
      // DB not loaded yet, skip
    }
    return null;
  }

  /**
   * Pattern A: Direct Query 실행 (기존 + Expanded + Misc)
   */
  async executeDirectQueries(brno, crno, meta) {
    const results = [];
    const tasks = [];

    // Collect all direct-query APIs from all registries
    const allDirectApis = [
      ...DIRECT_QUERY_APIS,
      ...EXPANDED_API_REGISTRY.directQuery,
      ...MISC_API_REGISTRY.all.filter(a => a.queryKeyType === 'brno')
    ];

    for (const api of allDirectApis) {
      // Skip fsc_basic - already covered by discovery step
      if (api.id === 'fsc_basic') continue;
      // Skip APIs that need non-standard query types
      if (api.queryKeyType === 'date' || api.queryKeyType === 'patentNo' ||
          api.queryKeyType === 'area' || api.queryKeyType === 'none' ||
          api.queryKeyType === 'companyName' || api.queryKeyType === 'year') continue;

      const queryValue = api.queryKeyType === 'crno' ? crno : brno;
      if (!queryValue) continue;

      tasks.push({
        api,
        fn: () => this.callApi(api, queryValue)
      });
    }

    meta.timing.directStart = Date.now();
    const responses = await this.executeWithConcurrencyLimit(tasks, MAX_CONCURRENT, meta);
    meta.timing.directMs = Date.now() - meta.timing.directStart;

    for (const resp of responses) {
      if (resp) results.push(resp);
    }

    console.log(`  [Direct] ${results.length}/${tasks.length} APIs returned data (${meta.timing.directMs}ms)`);
    return results;
  }

  /**
   * Pattern B: 2-step Query 실행 (병렬)
   */
  async executeTwoStepQueries(companyName, brno, crno, meta) {
    const results = [];
    const filteredApis = TWO_STEP_APIS.filter(api => api.id !== 'ksd_corp');

    meta.timing.twoStepStart = Date.now();

    const tasks = filteredApis.map(api => ({
      api,
      fn: async () => {
        meta.apisAttempted++;
        const req = api.buildSearchRequest(companyName);
        const data = await this.httpGet(req.url, req.params);
        const candidates = api.extractCandidates(data);

        if (!candidates || candidates.length === 0) return null;

        const bestMatch = this.selectBestCandidate(candidates, { brno, crno, companyName });
        if (bestMatch) {
          meta.apisSucceeded++;
          return { source: api.name, ...bestMatch };
        }
        return null;
      }
    }));

    const responses = await this.executeWithConcurrencyLimit(tasks, 3, meta, true);
    for (const resp of responses) {
      if (resp) results.push(resp);
    }

    meta.timing.twoStepMs = Date.now() - meta.timing.twoStepStart;
    console.log(`  [2-step] ${results.length}/${filteredApis.length} APIs matched (${meta.timing.twoStepMs}ms)`);
    return results;
  }

  /**
   * Pattern C: Reverse Match 실행
   * 대규모기업집단 API들 - 그룹명으로 검색 → 응답에서 crno 매칭
   */
  async executeReverseMatchQueries(companyName, targetCrno, meta) {
    const results = [];

    // 대규모기업집단은 그룹명으로 검색
    // "삼성전자" → "삼성" 으로 그룹명 추출
    const groupName = this.extractGroupName(companyName);
    if (!groupName) return results;

    meta.timing.reverseStart = Date.now();

    const tasks = [];
    for (const api of REVERSE_MATCH_APIS) {
      tasks.push({
        api,
        fn: async () => {
          try {
            meta.apisAttempted++;
            const req = api.buildRequest(groupName);
            const data = await this.httpGet(req.url, req.params);
            const affiliates = api.extractResponse(data);

            if (!affiliates || affiliates.length === 0) return null;

            // 대상 기업과 매칭되는 항목 필터링
            const matched = affiliates.filter(aff => {
              if (targetCrno && normalizeCrno(aff.crno) === normalizeCrno(targetCrno)) return true;
              if (aff.companyName && calculateNameSimilarity(companyName, aff.companyName) >= MATCH_THRESHOLD) return true;
              return false;
            });

            if (matched.length > 0) {
              meta.apisSucceeded++;
              return matched.map(m => ({
                source: api.name,
                ...m
              }));
            }
            return null;
          } catch (error) {
            meta.apisFailed++;
            meta.errors.push({ api: api.id, error: error.message });
            return null;
          }
        }
      });
    }

    const responses = await this.executeWithConcurrencyLimit(tasks, MAX_CONCURRENT, meta, true);
    for (const resp of responses) {
      if (resp) {
        if (Array.isArray(resp)) results.push(...resp);
        else results.push(resp);
      }
    }

    meta.timing.reverseMs = Date.now() - meta.timing.reverseStart;
    console.log(`  [Reverse] ${results.length} matches from ${REVERSE_MATCH_APIS.length} APIs (${meta.timing.reverseMs}ms)`);
    return results;
  }

  /**
   * Pattern D: Bulk + Filter 실행
   * bulkDataManager에 위임
   */
  async executeBulkFilterQueries(brno, meta) {
    const results = [];

    meta.timing.bulkStart = Date.now();

    if (!this.bulkDataManager) {
      try {
        const { default: BulkDataManager } = await import('./bulkDataManager.js');
        this.bulkDataManager = BulkDataManager;
      } catch {
        console.log('  [Bulk] bulkDataManager not available, skipping');
        meta.timing.bulkMs = 0;
        return results;
      }
    }

    try {
      const bulkResults = await this.bulkDataManager.searchByBrno(brno);
      for (const item of bulkResults) {
        results.push(item);
      }
      meta.apisSucceeded += results.length > 0 ? 1 : 0;
    } catch (error) {
      meta.errors.push({ api: 'bulk_filter', error: error.message });
    }

    meta.timing.bulkMs = Date.now() - meta.timing.bulkStart;
    console.log(`  [Bulk] ${results.length} matches (${meta.timing.bulkMs}ms)`);
    return results;
  }

  /**
   * 단일 API 호출 + 응답 추출
   */
  async callApi(api, queryValue) {
    try {
      const req = api.buildRequest(queryValue);

      let data;
      if (req.method === 'POST') {
        data = await this.httpPost(req.url, req.params, req.body);
      } else {
        data = await this.httpGet(req.url, req.params);
      }

      const extracted = api.extractResponse(data);
      if (!extracted) return null;

      return {
        source: api.name,
        ...extracted
      };
    } catch {
      return null;
    }
  }

  /**
   * HTTP GET 요청
   */
  async httpGet(url, params) {
    const resp = await this.client.get(url, { params });
    return resp.data;
  }

  /**
   * HTTP POST 요청
   */
  async httpPost(url, params, body) {
    const resp = await this.client.post(url, body, { params });
    return resp.data;
  }

  /**
   * 동시성 제한이 있는 병렬 실행
   */
  async executeWithConcurrencyLimit(tasks, limit, meta, rawReturn = false) {
    const results = [];

    for (let i = 0; i < tasks.length; i += limit) {
      const batch = tasks.slice(i, i + limit);
      const batchResults = await Promise.allSettled(
        batch.map(async (task) => {
          if (!rawReturn) meta.apisAttempted++;
          try {
            const result = task.fn ? await task.fn() : null;
            if (result && !rawReturn) meta.apisSucceeded++;
            return result;
          } catch (error) {
            if (!rawReturn) {
              meta.apisFailed++;
              meta.errors.push({ api: task.api?.id, error: error.message });
            }
            return null;
          }
        })
      );

      for (const r of batchResults) {
        if (r.status === 'fulfilled' && r.value !== null) {
          results.push(r.value);
        }
      }
    }

    return results;
  }

  /**
   * API 응답에서 최적 회사명 추출
   */
  extractBestName(responses) {
    for (const resp of responses) {
      if (resp?.companyName) return resp.companyName;
    }
    return null;
  }

  /**
   * 2-step 후보 중 최적 매칭 선택
   */
  selectBestCandidate(candidates, query) {
    let bestCandidate = null;
    let bestScore = 0;

    for (const candidate of candidates) {
      let score = 0;

      // brno exact match → 최고 점수
      if (query.brno && normalizeBrno(candidate.brno) === normalizeBrno(query.brno)) {
        score += 0.5;
      }
      // crno exact match
      if (query.crno && normalizeCrno(candidate.crno) === normalizeCrno(query.crno)) {
        score += 0.5;
      }
      // 회사명 유사도
      if (query.companyName && candidate.companyName) {
        const nameSim = calculateNameSimilarity(query.companyName, candidate.companyName);
        score += nameSim * 0.3;
      }

      if (score > bestScore) {
        bestScore = score;
        bestCandidate = candidate;
      }
    }

    // 최소 임계값 충족 시만 반환
    if (bestScore >= 0.3) return bestCandidate;
    return null;
  }

  /**
   * 회사명에서 그룹명 추출
   * "삼성전자" → "삼성", "현대자동차" → "현대"
   */
  extractGroupName(companyName) {
    if (!companyName) return null;
    const norm = normalizeCompanyName(companyName);
    if (!norm) return null;

    // 대기업 그룹명 매핑
    const GROUP_MAP = {
      '삼성': ['삼성전자', '삼성물산', '삼성SDI', '삼성SDS', '삼성생명', '삼성화재', '삼성중공업', '삼성엔지니어링', '삼성바이오로직스'],
      '현대': ['현대자동차', '현대모비스', '현대건설', '현대제철', '현대글로비스', '현대위아', '현대오일뱅크'],
      '현대중공업': ['현대중공업', 'HD현대', 'HD한국조선해양'],
      'SK': ['SK하이닉스', 'SK이노베이션', 'SK텔레콤', 'SK네트웍스', 'SK케미칼', 'SKC'],
      'LG': ['LG전자', 'LG화학', 'LG디스플레이', 'LG유플러스', 'LG에너지솔루션', 'LG이노텍'],
      '롯데': ['롯데케미칼', '롯데쇼핑', '롯데칠성', '롯데제과', '롯데건설'],
      '포스코': ['포스코', 'POSCO', '포스코인터내셔널', '포스코케미칼', '포스코퓨처엠'],
      '한화': ['한화에어로스페이스', '한화솔루션', '한화시스템', '한화오션', '한화생명'],
      'GS': ['GS칼텍스', 'GS리테일', 'GS건설', 'GS에너지'],
      '두산': ['두산에너빌리티', '두산밥캣', '두산로보틱스'],
      'CJ': ['CJ제일제당', 'CJ대한통운', 'CJ ENM', 'CJ올리브네트웍스'],
      '신세계': ['신세계', '이마트', 'SSG닷컴', '스타벅스코리아']
    };

    for (const [groupName, companies] of Object.entries(GROUP_MAP)) {
      for (const company of companies) {
        if (calculateNameSimilarity(norm, normalizeCompanyName(company)) >= MATCH_THRESHOLD) {
          return groupName;
        }
      }
    }

    // 매핑 없으면 첫 2-3글자를 그룹명으로 추정 (한글만)
    const koreanMatch = norm.match(/^[가-힣]{2,3}/);
    if (koreanMatch) return koreanMatch[0];

    return null;
  }

  /**
   * Pattern E: NPS (국민연금) 2-step query with phonetic name matching
   */
  async executeNpsQuery(companyName, knownBrno, meta) {
    const results = [];
    if (!NPS_API) return results;

    meta.timing.npsStart = Date.now();

    try {
      const variants = NPS_API.getNameVariants(companyName);
      let bestCandidate = null;

      for (const variant of variants) {
        meta.apisAttempted++;
        const req = NPS_API.buildSearchRequest(variant);
        const data = await this.httpGet(req.url, req.params).catch(() => null);
        if (!data) continue;

        const xmlStr = typeof data === 'string' ? data : JSON.stringify(data);
        const candidates = NPS_API.extractCandidates(xmlStr, knownBrno, variant);
        if (candidates.length > 0) {
          bestCandidate = candidates[0];
          meta.apisSucceeded++;
          break;
        }
      }

      if (bestCandidate && bestCandidate.seq) {
        // Get detail
        const detailReq = NPS_API.buildDetailRequest(bestCandidate.seq);
        const detailData = await this.httpGet(detailReq.url, detailReq.params).catch(() => null);
        const detail = detailData ? NPS_API.extractDetail(
          typeof detailData === 'string' ? detailData : JSON.stringify(detailData)
        ) : null;

        // Get period status
        const periodReq = NPS_API.buildPeriodRequest(bestCandidate.seq);
        const periodData = await this.httpGet(periodReq.url, periodReq.params).catch(() => null);
        const period = periodData ? NPS_API.extractPeriodStatus(
          typeof periodData === 'string' ? periodData : JSON.stringify(periodData)
        ) : null;

        results.push({
          source: NPS_API.name,
          companyName: detail?.companyName || bestCandidate.companyName,
          brno: detail?.brno || bestCandidate.brno,
          crno: null,
          address: detail?.address || null,
          representative: null,
          industryCode: detail?.industryCode || null,
          rawData: { detail, period, candidate: bestCandidate }
        });
      }
    } catch (error) {
      meta.apisFailed++;
      meta.errors.push({ api: 'nps_workplace', error: error.message });
    }

    meta.timing.npsMs = Date.now() - meta.timing.npsStart;
    console.log(`  [NPS] ${results.length} match (${meta.timing.npsMs}ms)`);
    return results;
  }

  /**
   * Expanded Reverse Match (공정위 참여업종/지주회사 등)
   */
  async executeExpandedReverseMatch(companyName, targetCrno, meta) {
    const results = [];
    const reverseApis = EXPANDED_API_REGISTRY.reverseMatch || [];
    if (reverseApis.length === 0) return results;

    meta.timing.expandedReverseStart = Date.now();

    for (const api of reverseApis) {
      try {
        meta.apisAttempted++;
        const req = api.buildRequest();
        const data = await this.httpGet(req.url, req.params);
        const items = api.extractResponse(data);
        if (!items || items.length === 0) continue;

        // Filter for matching company
        const matched = items.filter(item => {
          if (targetCrno && item.crno && normalizeCrno(item.crno) === normalizeCrno(targetCrno)) return true;
          if (item.companyName && companyName) {
            return calculateNameSimilarity(companyName, item.companyName) >= MATCH_THRESHOLD;
          }
          return false;
        });

        if (matched.length > 0) {
          meta.apisSucceeded++;
          matched.forEach(m => results.push({ source: api.name, ...m }));
        }
      } catch (error) {
        meta.apisFailed++;
        meta.errors.push({ api: api.id, error: error.message });
      }
    }

    meta.timing.expandedReverseMs = Date.now() - meta.timing.expandedReverseStart;
    console.log(`  [ExpandedReverse] ${results.length} matches (${meta.timing.expandedReverseMs}ms)`);
    return results;
  }

  /**
   * 캐시 초기화
   */
  clearCache() {
    this.cache.clear();
  }
}

const apiOrchestrator = new ApiOrchestrator();
export default apiOrchestrator;

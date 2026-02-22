/**
 * Company Routes
 * 기업 검색 + Entity Resolution 기반 통합 데이터 API
 */

import { Router } from 'express';
import apiOrchestrator from '../services/apiOrchestrator.js';
import { normalizeBrno, normalizeCrno } from '../services/entityResolver.js';
import {
  DIRECT_QUERY_APIS,
  TWO_STEP_APIS,
  REVERSE_MATCH_APIS,
  BULK_FILTER_APIS,
  NPS_API
} from '../services/apiAdapters/apiRegistry.js';
import { EXPANDED_API_REGISTRY } from '../services/apiAdapters/apiRegistryExpanded.js';
import { MISC_API_REGISTRY } from '../services/apiAdapters/apiRegistryMisc.js';
import { persistCompanyResult, loadEntityFromDb, computeDiff } from '../services/entityPersistence.js';
import { mapEntityToCompanyDetail, fetchDartData, mapSminfoToFinancials } from '../services/entityDataMapper.js';
import sequelize from '../config/database.js';
import adminAuth from '../middleware/adminAuth.js';
import { safeErrorMessage } from '../middleware/safeError.js';

const router = Router();

/**
 * GET /api/company/suggest
 * DB 기반 경량 검색 — 드롭다운 후보 목록용 (즉시 응답)
 * entity_registry + dart_corp_codes에서 검색
 */
router.get('/suggest', async (req, res) => {
  try {
    const { q } = req.query;
    if (!q || q.trim().length < 2) {
      return res.json({ success: true, data: [] });
    }

    const query = q.trim();
    const isNumber = /^\d+$/.test(query.replace(/-/g, ''));
    const candidates = [];
    console.log(`[Suggest] q="${query}" isNumber=${isNumber}`);

    // 가비지 BRN — 여러 무관한 사업체가 공유하는 더미 번호, dedup에 사용 불가
    const GARBAGE_BRNS = new Set(['0000000000', '5555555555', '1111111111', '9999999999']);
    const isValidBrn = (brn) => brn && brn.length === 10 && !GARBAGE_BRNS.has(brn);

    // BRN 기준 중복 병합 헬퍼 (짧은 이름 우선, 메타데이터 병합)
    const mergeCandidate = (existing, newData) => {
      if (newData.company_name && newData.company_name.length < existing.company_name.length) {
        existing.company_name = newData.company_name;
      }
      existing.business_number = existing.business_number || newData.business_number;
      existing.corp_number = existing.corp_number || newData.corp_number;
      existing.stock_code = existing.stock_code || newData.stock_code;
      existing.id = existing.business_number || existing.id;
      if (newData.sourcesCount > existing.sourcesCount) existing.sourcesCount = newData.sourcesCount;
      if (newData.confidence > existing.confidence) existing.confidence = newData.confidence;
    };

    const findExisting = (brno, name) => {
      return candidates.find(c =>
        (isValidBrn(brno) && c.business_number === brno) ||
        c.company_name === name
      );
    };

    if (isNumber) {
      // 사업자등록번호 또는 법인등록번호로 검색 — company_search + entity_registry
      const normalized = query.replace(/-/g, '');

      const [csResults] = await sequelize.query(`
        SELECT company_name, brno, corp_code, stock_code
        FROM company_search
        WHERE brno LIKE $1
        ORDER BY is_listed DESC, LENGTH(company_name)
        LIMIT 10
      `, { bind: [`${normalized}%`] });

      for (const r of csResults) {
        const dup = isValidBrn(r.brno) && candidates.find(c => c.business_number === r.brno);
        if (dup) {
          mergeCandidate(dup, { company_name: r.company_name, stock_code: r.stock_code });
          continue;
        }
        candidates.push({
          id: r.brno || r.corp_code,
          business_number: r.brno || null,
          corp_number: null,
          company_name: r.company_name,
          stock_code: r.stock_code || null,
          confidence: 1,
          sourcesCount: 0,
          source: r.corp_code ? 'dart' : 'comwel'
        });
      }

      // entity_registry 보강
      const [entities] = await sequelize.query(`
        SELECT canonical_name, brno, crno, sources_count, confidence
        FROM entity_registry
        WHERE brno = $1 OR crno = $1 OR brno LIKE $2
        ORDER BY sources_count DESC LIMIT 10
      `, { bind: [normalized, `${normalized}%`] });

      for (const e of entities) {
        const existing = findExisting(e.brno, e.canonical_name);
        if (existing) {
          mergeCandidate(existing, {
            company_name: e.canonical_name,
            business_number: e.brno,
            corp_number: e.crno,
            sourcesCount: parseInt(e.sources_count) || 0,
            confidence: parseFloat(e.confidence) || 1
          });
        } else {
          candidates.push({
            id: e.brno,
            business_number: e.brno,
            corp_number: e.crno,
            company_name: e.canonical_name,
            confidence: parseFloat(e.confidence) || 1,
            sourcesCount: parseInt(e.sources_count) || 0,
            source: 'db'
          });
        }
      }
    } else {
      // 회사명으로 검색 — company_search 통합 테이블 (dart + comwel + api, 235만건)
      // prefix + contains 매칭 (주식회사/㈜ 접두사 뒤에 있는 이름도 검색)

      const [csResults] = await sequelize.query(`
        (SELECT company_name, brno, corp_code, stock_code, is_listed
         FROM company_search
         WHERE company_name LIKE $1
         ORDER BY is_listed DESC, LENGTH(company_name)
         LIMIT 15)
        UNION
        (SELECT company_name, brno, corp_code, stock_code, is_listed
         FROM company_search
         WHERE company_name LIKE $2
         ORDER BY is_listed DESC, LENGTH(company_name)
         LIMIT 15)
        LIMIT 20
      `, { bind: [`${query}%`, `%${query}%`] });

      for (const r of csResults) {
        const dup = isValidBrn(r.brno) && candidates.find(c => c.business_number === r.brno);
        if (dup) {
          mergeCandidate(dup, { company_name: r.company_name, stock_code: r.stock_code });
          continue;
        }
        candidates.push({
          id: r.brno || r.corp_code,
          business_number: r.brno || null,
          corp_number: null,
          company_name: r.company_name,
          stock_code: r.stock_code || null,
          confidence: 1,
          sourcesCount: 0,
          source: r.corp_code ? 'dart' : 'comwel'
        });
      }

      // entity_registry 보강 (BRN + 소스수 정보)
      const [entities] = await sequelize.query(`
        SELECT canonical_name, brno, crno, sources_count, confidence
        FROM entity_registry
        WHERE canonical_name ILIKE $1
        ORDER BY sources_count DESC LIMIT 10
      `, { bind: [`%${query}%`] });

      for (const e of entities) {
        const existing = findExisting(e.brno, e.canonical_name);
        if (existing) {
          mergeCandidate(existing, {
            company_name: e.canonical_name,
            business_number: e.brno,
            corp_number: e.crno,
            sourcesCount: parseInt(e.sources_count) || 0,
            confidence: parseFloat(e.confidence) || 1
          });
        } else {
          candidates.push({
            id: e.brno || e.entity_id,
            business_number: e.brno,
            corp_number: e.crno,
            company_name: e.canonical_name,
            confidence: parseFloat(e.confidence) || 1,
            sourcesCount: parseInt(e.sources_count) || 0,
            source: 'db'
          });
        }
      }
    }

    res.json({ success: true, data: candidates.slice(0, 15) });
  } catch (error) {
    console.error('[Company] Suggest error:', error.message, error.stack);
    res.status(500).json({ success: false, error: safeErrorMessage(error), data: [] });
  }
});

/**
 * GET /api/company/search
 * 기업 검색 (사업자번호, 법인번호, 회사명) — 전체 86 API 호출
 */
router.get('/search', async (req, res) => {
  try {
    const { q, brno, crno, name } = req.query;

    if (!q && !brno && !crno && !name) {
      return res.status(400).json({
        success: false,
        error: 'Search query required. Use q, brno, crno, or name parameter.'
      });
    }

    let searchQuery = { brno: null, crno: null, companyName: null };

    if (brno || crno || name) {
      searchQuery = {
        brno: brno ? normalizeBrno(brno) : null,
        crno: crno ? normalizeCrno(crno) : null,
        companyName: name || null
      };
    } else if (q) {
      searchQuery = parseSearchQuery(q);
    }

    console.log(`[Company] Search request:`, searchQuery);

    const result = await apiOrchestrator.searchCompany(searchQuery);

    // Fire-and-forget: persist to entity DB
    persistCompanyResult(result, { batchId: 'realtime' }).catch(err =>
      console.error('[Company] Persist error:', err.message)
    );

    res.json({
      success: true,
      data: {
        query: result.query,
        entities: result.entities.map(formatEntity),
        unmatchedCount: result.unmatched.length,
        fromCache: result.fromCache || false
      },
      meta: {
        apisAttempted: result.meta.apisAttempted,
        apisSucceeded: result.meta.apisSucceeded,
        totalResponses: result.meta.totalResponses,
        durationMs: result.meta.timing?.totalMs
      }
    });
  } catch (error) {
    console.error('[Company] Search error:', error.message);
    res.status(500).json({
      success: false,
      error: safeErrorMessage(error)
    });
  }
});

/**
 * GET /api/company/analyze/:brno
 * 사업자번호 기반 상세 분석 (모든 API 데이터 포함)
 */
router.get('/analyze/:brno', async (req, res) => {
  try {
    const brno = normalizeBrno(req.params.brno);
    if (!brno) {
      return res.status(400).json({
        success: false,
        error: 'Invalid business registration number'
      });
    }

    const result = await apiOrchestrator.searchCompany({
      brno,
      crno: null,
      companyName: null
    });

    // Fire-and-forget: persist
    persistCompanyResult(result, { batchId: 'realtime' }).catch(err =>
      console.error('[Company] Persist error:', err.message)
    );

    if (result.entities.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'No data found for this business number'
      });
    }

    const primaryEntity = result.entities
      .sort((a, b) => b.confidence - a.confidence)[0];

    res.json({
      success: true,
      data: {
        entity: formatEntityDetailed(primaryEntity),
        otherEntities: result.entities.slice(1).map(formatEntity),
        unmatchedCount: result.unmatched.length
      },
      meta: {
        apisAttempted: result.meta.apisAttempted,
        apisSucceeded: result.meta.apisSucceeded,
        totalResponses: result.meta.totalResponses,
        durationMs: result.meta.timing?.totalMs,
        errors: result.meta.errors
      }
    });
  } catch (error) {
    console.error('[Company] Analyze error:', error.message);
    res.status(500).json({
      success: false,
      error: safeErrorMessage(error)
    });
  }
});

/**
 * GET /api/company/quick/:brno
 * DB-first 빠른 조회 → entity_registry에서 즉시 반환 (mapped format)
 * DB에 없으면 실시간 API 호출 후 저장
 */
router.get('/quick/:brno', async (req, res) => {
  try {
    const brno = normalizeBrno(req.params.brno);
    if (!brno) {
      return res.status(400).json({
        success: false,
        error: 'Invalid business registration number'
      });
    }

    // 1. entity_registry DB 우선 조회
    const dbEntity = await loadEntityFromDb({ brno }, { allowStale: true });
    if (dbEntity) {
      const mapped = mapEntityToCompanyDetail(dbEntity, null);
      return res.json({
        success: true,
        data: mapped,
        fromDb: true,
        isStale: dbEntity.isStale
      });
    }

    // 2. DB에 없으면 실시간 API 호출
    const result = await apiOrchestrator.searchCompany({
      brno, crno: null, companyName: null
    });

    // 3. 결과 DB 저장 (fire-and-forget)
    persistCompanyResult(result, { batchId: 'realtime' }).catch(err =>
      console.error('[Company] Persist error:', err.message)
    );

    const entity = result.entities[0] || null;

    res.json({
      success: true,
      data: entity ? formatEntity(entity) : null,
      fromDb: false,
      meta: { durationMs: result.meta.timing?.totalMs }
    });
  } catch (error) {
    console.error('[Company] Quick lookup error:', error.message);
    res.status(500).json({
      success: false,
      error: safeErrorMessage(error)
    });
  }
});

/**
 * GET /api/company/live/:brno
 * SSE (Server-Sent Events) — Stale-While-Revalidate + DART 통합
 *
 * 5-Event Stream:
 * 1. db_data    — DB 캐시 즉시 반환 (mapped format)
 * 2. dart_data  — DART 재무/임원/주주 데이터 (~3s)
 * 3. live_start — 86 API 호출 시작 알림
 * 4. live_diff  — DB vs Live 차이 비교
 * 5. complete   — 최종 데이터 + cross-check conflicts
 */
router.get('/live/:identifier', async (req, res) => {
  const raw = req.params.identifier;

  // Resolve identifier type: BRN (10 digits), CRNO (13 digits), or corp_code (8 digits, DART)
  const cleaned = raw.replace(/-/g, '');
  const isBrno = /^\d{10}$/.test(cleaned);
  const isCrno = /^\d{13}$/.test(cleaned);
  const isCorpCode = /^\d{8}$/.test(cleaned);
  const brno = isBrno ? cleaned : null;
  const crno = isCrno ? cleaned : null;
  const corpCode = isCorpCode ? cleaned : null;

  if (!brno && !crno && !corpCode) {
    return res.status(400).json({ success: false, error: 'Invalid identifier. Provide BRN (10 digits), CRNO (13 digits), or DART corp_code (8 digits).' });
  }

  console.log(`[SSE] /live/${raw} → brno=${brno}, crno=${crno}, corpCode=${corpCode}`);

  // SSE 헤더 설정
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no'
  });

  const send = (event, data) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  let dartDataResult = null;
  // For corp_code only lookups, resolve company name from dart_corp_codes
  let resolvedCompanyName = null;
  let resolvedBrno = brno;

  try {
    // If we only have corpCode, resolve company info from DART DB + DART API
    if (corpCode && !brno) {
      const [dartRows] = await sequelize.query(
        'SELECT corp_code, corp_name, stock_code FROM dart_corp_codes WHERE corp_code = $1 LIMIT 1',
        { bind: [corpCode] }
      );
      if (dartRows.length > 0) {
        resolvedCompanyName = dartRows[0].corp_name;
        console.log(`[SSE] Resolved corp_code ${corpCode} → ${resolvedCompanyName}`);

        // 1차: entity_registry에서 BRN 찾기
        const [entityRows] = await sequelize.query(
          'SELECT brno, crno FROM entity_registry WHERE canonical_name = $1 AND brno IS NOT NULL LIMIT 1',
          { bind: [resolvedCompanyName] }
        );
        if (entityRows.length > 0 && entityRows[0].brno) {
          resolvedBrno = entityRows[0].brno;
          console.log(`[SSE] Resolved from entity_registry → brno=${resolvedBrno}`);
        }

        // 2차: DART company.json API에서 BRN 가져오기 (entity_registry에 없을 때)
        if (!resolvedBrno) {
          try {
            const dartApiService = (await import('../services/dartApiService.js')).default;
            const dartCompanyInfo = await dartApiService.getCompanyInfo(corpCode);
            if (dartCompanyInfo?.business_number) {
              const dartBrno = dartCompanyInfo.business_number.replace(/-/g, '');
              if (/^\d{10}$/.test(dartBrno)) {
                resolvedBrno = dartBrno;
                console.log(`[SSE] Resolved from DART API → brno=${resolvedBrno}`);
              }
            }
          } catch (dartErr) {
            console.warn(`[SSE] DART company info lookup failed: ${dartErr.message}`);
          }
        }
      }
    }

    // 1. DB 데이터 즉시 전송 (mapped format)
    const dbQuery = resolvedBrno ? { brno: resolvedBrno } : crno ? { crno } : null;
    const dbEntity = dbQuery ? await loadEntityFromDb(dbQuery, { allowStale: true }) : null;
    const mappedDb = dbEntity ? mapEntityToCompanyDetail(dbEntity, null) : null;

    if (mappedDb) {
      send('db_data', {
        company: mappedDb,
        lastFetchedAt: dbEntity.lastFetchedAt,
        sourcesCount: dbEntity.apiData.length,
        conflictsCount: dbEntity.conflicts.length
      });
    } else {
      // Even without DB data, send minimal company info if we resolved from DART
      if (resolvedCompanyName) {
        send('db_data', {
          company: {
            business_number: resolvedBrno,
            company_name: resolvedCompanyName,
            corp_code: corpCode,
            _source: 'dart_corp_codes'
          },
          message: 'DB 캐시 없음 — DART 기본정보만 표시'
        });
      } else {
        send('db_data', { company: null, message: 'No cached data' });
      }
    }

    // 1.5 벤처기업인증 조회 (DB 로컬 — 즉시)
    let ventureInfo = null;
    try {
      const companyName = mappedDb?.company_name || resolvedCompanyName || '';
      if (companyName) {
        const normalized = companyName
          .replace(/주식회사\s*/g, '').replace(/㈜\s*/g, '').replace(/\(주\)\s*/g, '')
          .replace(/유한회사\s*/g, '').replace(/유한책임회사\s*/g, '').replace(/\s+/g, '').trim();
        const [ventureRows] = await sequelize.query(`
          SELECT company_name, venture_type, region, industry_name, main_products,
                 valid_from, valid_to, certifier, is_new
          FROM venture_certifications
          WHERE company_name_normalized = $1
          ORDER BY valid_to DESC
        `, { bind: [normalized] });
        if (ventureRows.length > 0) {
          ventureInfo = ventureRows; // all certifications (array)
          console.log(`[SSE] Venture match: "${companyName}" → ${ventureRows.length} certifications, latest: ${ventureRows[0].venture_type} (${ventureRows[0].valid_from}~${ventureRows[0].valid_to})`);
        }
      }
    } catch (ventureErr) {
      console.warn('[SSE] Venture lookup error:', ventureErr.message);
    }

    // 1.6 강소기업 조회 (Work24 — DB 로컬, brno 매칭 — 즉시)
    let strongSmeInfo = null;
    if (resolvedBrno) {
      try {
        const [smeRows] = await sequelize.query(`
          SELECT company_name, brand_name, brand_code, selection_year,
                 super_industry_name, industry_name, region_name, address,
                 employee_count, main_products, strengths, homepage,
                 is_youth_friendly
          FROM work24_strong_smes
          WHERE brno = $1
          ORDER BY selection_year DESC LIMIT 1
        `, { bind: [resolvedBrno] });
        if (smeRows.length > 0) {
          strongSmeInfo = smeRows[0];
          console.log(`[SSE] Strong SME match: "${resolvedBrno}" → ${strongSmeInfo.brand_name} (${strongSmeInfo.selection_year})`);
        }
      } catch (smeErr) {
        console.warn('[SSE] Strong SME lookup error:', smeErr.message);
      }
    }

    // 1.7 KIPRIS 특허 정보 조회 (비동기 — DART/API와 병렬)
    const patentPromise = (async () => {
      try {
        const companyName = mappedDb?.company_name || resolvedCompanyName || '';
        if (!companyName) return null;
        const { fetchPatentData } = await import('../services/apiAdapters/kiprisAdapter.js');
        const result = await fetchPatentData(companyName);
        if (result && (result.patents.total > 0 || result.trademarks.total > 0)) {
          send('patent_data', { available: true, ...result });
        } else {
          send('patent_data', { available: false, message: '특허/상표 정보 없음' });
        }
        return result;
      } catch (err) {
        console.error('[SSE] KIPRIS patent lookup error:', err.message);
        send('patent_data', { available: false, message: err.message });
        return null;
      }
    })();

    // 1.8 조달청 나라장터 계약/낙찰 조회 (비동기 — DART/API/KIPRIS와 병렬)
    const procurementPromise = (async () => {
      try {
        const companyName = mappedDb?.company_name || resolvedCompanyName || '';
        if (!companyName && !resolvedBrno) return null;
        const { fetchProcurementData } = await import('../services/apiAdapters/procurementAdapter.js');
        const result = await fetchProcurementData({ companyName, brno: resolvedBrno });
        if (result && result.contractCount > 0) {
          send('procurement_data', { available: true, ...result });
        } else {
          send('procurement_data', { available: false, message: '조달청 계약이력 없음 (최근 2개월 샘플 기준)' });
        }
        return result;
      } catch (err) {
        console.error('[SSE] Procurement lookup error:', err.message);
        send('procurement_data', { available: false, message: err.message });
        return null;
      }
    })();

    // 2. DART + 86 APIs + KIPRIS + 조달청 병렬 실행
    send('live_start', { message: 'Fetching DART + 86 APIs + KIPRIS + 조달청...', timestamp: new Date().toISOString() });

    // DART: fetch and send as soon as ready
    const dartPromise = (async () => {
      try {
        const canonicalName = dbEntity?.canonicalName || resolvedCompanyName || resolvedBrno || raw;
        const entityForDart = dbEntity || { canonicalName, brno: resolvedBrno };
        console.log(`[SSE] DART lookup: canonicalName=${entityForDart.canonicalName}, brno=${entityForDart.brno}, corpCode=${corpCode}`);

        // DART 데이터 수집: collectCompanyDataFull = 최신보고서 탐색 + 다년도 이력
        let dartData = null;
        if (corpCode) {
          const dartApiService = (await import('../services/dartApiService.js')).default;
          dartData = await dartApiService.collectCompanyDataFull(corpCode);
        } else {
          dartData = await fetchDartData(entityForDart);
        }

        let dartMapped = null;
        let isListed = false;

        if (dartData && dartData.company_info) {
          dartMapped = mapEntityToCompanyDetail(
            dbEntity || { brno: resolvedBrno, entityId: `ent_${resolvedBrno || corpCode}`, apiData: [], conflicts: [], sources: [] },
            dartData
          );
          isListed = dartMapped.listed || !!dartMapped.stock_code;
          send('dart_data', {
            available: true,
            financial_statements: dartMapped.financial_statements,
            financial_history: dartMapped.financial_history,
            officers: dartMapped.officers,
            shareholders: dartMapped.shareholders,
            three_year_average: dartMapped.three_year_average,
            red_flags: dartMapped.red_flags,
            report_period: dartMapped.report_period,
            report_year: dartMapped.report_year,
            company_name: dartMapped.company_name,
            ceo_name: dartMapped.ceo_name,
            address: dartMapped.address,
            phone: dartMapped.phone,
            website: dartMapped.website,
            corp_registration_no: dartMapped.corp_registration_no,
            corp_cls: dartMapped.corp_cls,
            listed: dartMapped.listed,
            stock_code: dartMapped.stock_code,
            revenue: dartMapped.revenue,
            operating_margin: dartMapped.operating_margin,
            roe: dartMapped.roe,
            debt_ratio: dartMapped.debt_ratio,
            latest_annual: dartMapped.latest_annual,
            employee_status: dartMapped.employee_status,
            directors_compensation: dartMapped.directors_compensation,
            dividend_details: dartMapped.dividend_details,
            financial_indicators: dartMapped.financial_indicators
          });
        } else {
          send('dart_data', { available: false, message: 'DART 전자공시에 등록되지 않은 기업입니다.' });
        }

        // Sminfo: 비상장 회사 전부 대상 (DART 유무와 무관)
        // 상장기업(유가증권/코스닥)은 DART에 충분한 재무데이터가 있으므로 스킵
        if (!isListed) {
          try {
            const SminfoClient = (await import('../services/sminfoClient.js')).default;
            const sminfo = new SminfoClient();

            // Try full legal name first (주식회사 X), then canonical name
            const canonName = entityForDart.canonicalName || mappedDb?.company_name || canonicalName;
            // Find full company name from API raw data (e.g., "주식회사 고퀄" vs "고퀄")
            const fullCorpName = (() => {
              if (!dbEntity?.apiData) return null;
              for (const src of dbEntity.apiData) {
                const d = src.data;
                if (d?.corpNm && d.corpNm !== canonName) return d.corpNm; // FSC Discovery
                if (d?.detail?.companyName && d.detail.companyName !== canonName) return d.detail.companyName; // NPS
              }
              return null;
            })();
            const searchName = fullCorpName || canonName;
            const sminfoMatchCriteria = {
              companyName: searchName,
              ceoName: dartMapped?.ceo_name || mappedDb?.ceo_name || null,
              industry: dartMapped?.industry_name || mappedDb?.industry_name || null,
              address: dartMapped?.address || mappedDb?.address || null,
              companyType: null
            };

            console.log(`[SSE] Sminfo lookup for non-listed: "${searchName}" (canonical: "${canonName}")`);
            let sminfoResult = await sminfo.searchByCompanyName(searchName, sminfoMatchCriteria);

            // Retry with canonical name if full name returned no results
            if (!sminfoResult && searchName !== canonName) {
              console.log(`[SSE] Sminfo retry with canonical name: "${canonName}"`);
              sminfoResult = await sminfo.searchByCompanyName(canonName, sminfoMatchCriteria);
            }

            if (sminfoResult && sminfoResult.financials && sminfoResult.matchScore >= 0.6) {
              const sminfoFinancials = mapSminfoToFinancials(sminfoResult.financials);
              send('sminfo_data', {
                available: true,
                source: 'sminfo',
                matchScore: sminfoResult.matchScore,
                matchedCompany: sminfoResult.matchedCompany,
                financial_statements: sminfoFinancials,
                revenue: sminfoResult.financials.revenue,
                operating_margin: sminfoResult.financials.operating_margin,
                roe: sminfoResult.financials.roe,
                debt_ratio: sminfoResult.financials.debt_ratio,
                total_assets: sminfoResult.financials.total_assets,
                net_profit: sminfoResult.financials.net_profit
              });
            } else {
              send('sminfo_data', {
                available: false,
                message: sminfoResult
                  ? `매칭 확률 부족 (${(sminfoResult.matchScore * 100).toFixed(0)}%)`
                  : 'sminfo 검색 결과 없음'
              });
            }

            await sminfo.close();
          } catch (sminfoErr) {
            console.error('[Company] Sminfo fallback error:', sminfoErr.message);
            send('sminfo_data', { available: false, message: `sminfo 조회 실패: ${sminfoErr.message}` });
          }
        }

        return dartData;
      } catch (err) {
        send('dart_data', { available: false, message: `DART 조회 실패: ${err.message}` });
        return null;
      }
    })();

    // 86 APIs — only run if we have a BRN (APIs require BRN)
    const livePromise = resolvedBrno
      ? apiOrchestrator.searchCompany({ brno: resolvedBrno, crno: crno || null, companyName: null })
      : Promise.resolve(null);

    const [dartSettled, liveSettled, patentSettled, procurementSettled] = await Promise.allSettled([dartPromise, livePromise, patentPromise, procurementPromise]);
    dartDataResult = dartSettled.status === 'fulfilled' ? dartSettled.value : null;
    const liveResult = liveSettled.status === 'fulfilled' ? liveSettled.value : null;
    const patentResult = patentSettled.status === 'fulfilled' ? patentSettled.value : null;
    const procurementResult = procurementSettled.status === 'fulfilled' ? procurementSettled.value : null;

    // 3. Diff 계산 및 전송
    if (liveResult) {
      const diff = computeDiff(dbEntity, liveResult);
      const liveEntity = liveResult.entities[0] || null;

      send('live_diff', {
        entity: liveEntity ? formatEntity(liveEntity) : null,
        diff: diff ? {
          added: diff.added.map(d => d.source),
          updated: diff.updated.map(d => d.source),
          removed: diff.removed.map(d => d.source),
          unchangedCount: diff.unchanged.length,
          hasChanges: diff.added.length > 0 || diff.updated.length > 0 || diff.removed.length > 0
        } : null,
        meta: {
          apisAttempted: liveResult.meta.apisAttempted,
          apisSucceeded: liveResult.meta.apisSucceeded,
          durationMs: liveResult.meta.timing?.totalMs
        }
      });

      // 4. DB 업데이트
      await persistCompanyResult(liveResult, { batchId: 'live' });
    } else if (!resolvedBrno) {
      // No BRN → skip 86 APIs, send empty diff
      send('live_diff', {
        entity: null,
        diff: null,
        meta: { apisAttempted: 0, apisSucceeded: 0, durationMs: 0 },
        message: '사업자등록번호 없음 — 공공데이터 API 조회 생략'
      });
    }

    // 5. Complete — 최종 매핑된 데이터 전송
    const updatedEntity = resolvedBrno ? await loadEntityFromDb({ brno: resolvedBrno }) : null;
    const sourceEntity = updatedEntity || dbEntity;
    const finalCompany = sourceEntity
      ? mapEntityToCompanyDetail(sourceEntity, dartDataResult)
      : null;
    // Inject venture certification into final company data (all certifications)
    if (finalCompany && ventureInfo && ventureInfo.length > 0) {
      const latest = ventureInfo[0]; // sorted by valid_to DESC
      const isExpired = new Date(latest.valid_to) < new Date();
      // Primary certification (latest) for badge display
      finalCompany.venture_certification = {
        certified: true,
        expired: isExpired,
        type: latest.venture_type,
        valid_from: latest.valid_from,
        valid_to: latest.valid_to,
        certifier: latest.certifier,
        industry: latest.industry_name,
        main_products: latest.main_products,
        is_new: latest.is_new,
      };
      // All certifications for detail display
      finalCompany.venture_certifications = ventureInfo.map(v => ({
        certified: true,
        expired: new Date(v.valid_to) < new Date(),
        type: v.venture_type,
        valid_from: v.valid_from,
        valid_to: v.valid_to,
        certifier: v.certifier,
        industry: v.industry_name,
        main_products: v.main_products,
        is_new: v.is_new,
      }));
    }

    // Inject 강소기업 certification into final company data
    if (finalCompany && strongSmeInfo) {
      finalCompany.strong_sme = {
        certified: true,
        brand_name: strongSmeInfo.brand_name,
        brand_code: strongSmeInfo.brand_code,
        selection_year: strongSmeInfo.selection_year,
        industry: strongSmeInfo.industry_name,
        super_industry: strongSmeInfo.super_industry_name,
        region: strongSmeInfo.region_name,
        employee_count: strongSmeInfo.employee_count,
        main_products: strongSmeInfo.main_products,
        strengths: strongSmeInfo.strengths,
        homepage: strongSmeInfo.homepage,
        is_youth_friendly: strongSmeInfo.is_youth_friendly,
      };
    }

    // Inject KIPRIS patent data into final company data
    if (finalCompany && patentResult && patentResult.patents.total > 0) {
      finalCompany.patent_data = patentResult;
    }

    // Inject procurement data into final company data
    if (finalCompany && procurementResult && procurementResult.isGovernmentVendor) {
      finalCompany.procurement = {
        isGovernmentVendor: true,
        contractCount: procurementResult.contractCount,
        awardCount: procurementResult.awardCount,
        totalValue: procurementResult.totalValue,
        latestContract: procurementResult.latestContract,
        latestAward: procurementResult.latestAward,
        contracts: procurementResult.contracts,
        awards: procurementResult.awards,
        searchPeriod: procurementResult.searchPeriod,
      };
    }

    send('complete', {
      company: finalCompany,
      conflicts: updatedEntity?.conflicts || [],
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    send('error', { message: safeErrorMessage(error) });
  }

  res.end();
});

/**
 * GET /api/company/sources
 * 사용 가능한 API 소스 목록
 */
router.get('/sources', (req, res) => {
  const expandedDirect = EXPANDED_API_REGISTRY.directQuery || [];
  const expandedReverse = EXPANDED_API_REGISTRY.reverseMatch || [];
  const miscApis = MISC_API_REGISTRY.all || [];

  const allDirect = [
    ...DIRECT_QUERY_APIS,
    ...expandedDirect,
    ...miscApis.filter(a => a.queryKeyType === 'brno')
  ];

  res.json({
    success: true,
    data: {
      directQuery: allDirect.map(a => ({ id: a.id, name: a.name, queryType: a.queryKeyType })),
      twoStep: TWO_STEP_APIS.map(a => ({ id: a.id, name: a.name })),
      reverseMatch: [
        ...REVERSE_MATCH_APIS,
        ...expandedReverse
      ].map(a => ({ id: a.id, name: a.name })),
      bulkFilter: BULK_FILTER_APIS.map(a => ({ id: a.id, name: a.name, strategy: a.strategy })),
      nps: NPS_API ? [{ id: NPS_API.id, name: NPS_API.name }] : [],
      miscOther: miscApis.filter(a => a.queryKeyType !== 'brno')
        .map(a => ({ id: a.id, name: a.name, queryType: a.queryKeyType })),
      summary: {
        original: DIRECT_QUERY_APIS.length + TWO_STEP_APIS.length +
                  REVERSE_MATCH_APIS.length + BULK_FILTER_APIS.length,
        expanded: expandedDirect.length + expandedReverse.length,
        misc: miscApis.length,
        nps: NPS_API ? 1 : 0,
        total: allDirect.length + TWO_STEP_APIS.length +
               REVERSE_MATCH_APIS.length + expandedReverse.length +
               BULK_FILTER_APIS.length + (NPS_API ? 1 : 0) +
               miscApis.filter(a => a.queryKeyType !== 'brno').length
      }
    }
  });
});

/**
 * POST /api/company/cache/clear
 * 캐시 초기화
 */
router.post('/cache/clear', adminAuth, (req, res) => {
  apiOrchestrator.clearCache();
  res.json({ success: true, message: 'Cache cleared' });
});

// === Helper Functions ===

function parseSearchQuery(q) {
  const cleaned = q.replace(/[-\s]/g, '');

  if (/^\d{10}$/.test(cleaned)) {
    return { brno: cleaned, crno: null, companyName: null };
  }
  if (/^\d{13}$/.test(cleaned)) {
    return { brno: null, crno: cleaned, companyName: null };
  }
  if (/^\d{3}-?\d{2}-?\d{5}$/.test(q.trim())) {
    return { brno: cleaned, crno: null, companyName: null };
  }

  return { brno: null, crno: null, companyName: q.trim() };
}

function formatEntity(entity) {
  return {
    entityId: entity.entityId,
    canonicalName: entity.canonicalName,
    identifiers: entity.identifiers,
    confidence: entity.confidence,
    matchLevel: entity.matchLevel,
    nameVariants: entity.nameVariants,
    sourcesCount: entity.sources.length,
    sources: entity.sources
  };
}

function formatEntityDetailed(entity) {
  return {
    entityId: entity.entityId,
    canonicalName: entity.canonicalName,
    identifiers: entity.identifiers,
    confidence: entity.confidence,
    matchLevel: entity.matchLevel,
    nameVariants: entity.nameVariants,
    sources: entity.sources,
    apiData: entity.data.map(d => ({
      source: d.source,
      data: d.rawData
    }))
  };
}

export default router;

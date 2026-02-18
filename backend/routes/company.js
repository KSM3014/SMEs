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

    if (isNumber) {
      // 사업자등록번호 또는 법인등록번호로 검색
      const normalized = query.replace(/-/g, '');
      const [entities] = await sequelize.query(`
        SELECT entity_id, canonical_name, brno, crno, sources_count, confidence
        FROM entity_registry
        WHERE brno = $1 OR crno = $1 OR brno LIKE $2
        ORDER BY sources_count DESC
        LIMIT 10
      `, { bind: [normalized, `${normalized}%`] });

      for (const e of entities) {
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
    } else {
      // 회사명으로 검색 — entity_registry
      const [entities] = await sequelize.query(`
        SELECT entity_id, canonical_name, brno, crno, sources_count, confidence
        FROM entity_registry
        WHERE canonical_name ILIKE $1
        ORDER BY sources_count DESC
        LIMIT 10
      `, { bind: [`%${query}%`] });

      for (const e of entities) {
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

      // dart_corp_codes에서도 검색 (entity_registry에 없는 것만)
      const existingNames = new Set(candidates.map(c => c.company_name));
      const [dartCodes] = await sequelize.query(`
        SELECT corp_code, corp_name, stock_code
        FROM dart_corp_codes
        WHERE corp_name ILIKE $1
        ORDER BY LENGTH(corp_name)
        LIMIT 10
      `, { bind: [`%${query}%`] });

      for (const d of dartCodes) {
        if (!existingNames.has(d.corp_name)) {
          candidates.push({
            id: d.corp_code,
            business_number: null,
            corp_number: null,
            company_name: d.corp_name,
            stock_code: d.stock_code?.trim() || null,
            confidence: 1,
            sourcesCount: 0,
            source: 'dart'
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
    // If we only have corpCode, resolve company info from DART DB
    if (corpCode && !brno) {
      const [dartRows] = await sequelize.query(
        'SELECT corp_code, corp_name, stock_code FROM dart_corp_codes WHERE corp_code = $1 LIMIT 1',
        { bind: [corpCode] }
      );
      if (dartRows.length > 0) {
        resolvedCompanyName = dartRows[0].corp_name;
        console.log(`[SSE] Resolved corp_code ${corpCode} → ${resolvedCompanyName}`);
        // Try to find BRN from entity_registry by company name
        const [entityRows] = await sequelize.query(
          'SELECT brno, crno FROM entity_registry WHERE canonical_name = $1 AND brno IS NOT NULL LIMIT 1',
          { bind: [resolvedCompanyName] }
        );
        if (entityRows.length > 0 && entityRows[0].brno) {
          resolvedBrno = entityRows[0].brno;
          console.log(`[SSE] Resolved company name → brno=${resolvedBrno}`);
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

    // 2. DART + 86 APIs 병렬 실행
    send('live_start', { message: 'Fetching DART + 86 APIs...', timestamp: new Date().toISOString() });

    // DART: fetch and send as soon as ready
    const dartPromise = (async () => {
      try {
        const canonicalName = dbEntity?.canonicalName || resolvedCompanyName || resolvedBrno || raw;
        const entityForDart = dbEntity || { canonicalName, brno: resolvedBrno };
        console.log(`[SSE] DART lookup: canonicalName=${entityForDart.canonicalName}, brno=${entityForDart.brno}, corpCode=${corpCode}`);

        // If we have corpCode directly, use it to bypass name lookup
        let dartData = null;
        if (corpCode) {
          const dartApiService = (await import('../services/dartApiService.js')).default;
          const currentYear = new Date().getFullYear();
          for (let y = currentYear; y >= currentYear - 2; y--) {
            dartData = await dartApiService.collectCompanyData(corpCode, y);
            if (dartData?.financials || dartData?.officers?.length > 0) {
              dartData._fiscalYear = y;
              break;
            }
          }
          if (!dartData || (!dartData.financials && (!dartData.officers || dartData.officers.length === 0))) {
            dartData = await dartApiService.collectCompanyData(corpCode, currentYear - 1);
            if (dartData) dartData._fiscalYear = currentYear - 1;
          }
        } else {
          dartData = await fetchDartData(entityForDart);
        }

        if (dartData && dartData.company_info) {
          const dartMapped = mapEntityToCompanyDetail(
            dbEntity || { brno: resolvedBrno, entityId: `ent_${resolvedBrno || corpCode}`, apiData: [], conflicts: [], sources: [] },
            dartData
          );
          send('dart_data', {
            available: true,
            financial_statements: dartMapped.financial_statements,
            financial_history: dartMapped.financial_history,
            officers: dartMapped.officers,
            shareholders: dartMapped.shareholders,
            three_year_average: dartMapped.three_year_average,
            red_flags: dartMapped.red_flags,
            company_name: dartMapped.company_name,
            ceo_name: dartMapped.ceo_name,
            address: dartMapped.address,
            listed: dartMapped.listed,
            stock_code: dartMapped.stock_code,
            revenue: dartMapped.revenue,
            operating_margin: dartMapped.operating_margin,
            roe: dartMapped.roe,
            debt_ratio: dartMapped.debt_ratio
          });
        } else {
          send('dart_data', { available: false, message: 'DART 전자공시에 등록되지 않은 기업입니다.' });

          // Sminfo fallback for non-listed companies
          try {
            const SminfoClient = (await import('../services/sminfoClient.js')).default;
            const sminfo = new SminfoClient();

            const sminfoMatchCriteria = {
              companyName: entityForDart.canonicalName,
              ceoName: mappedDb?.ceo_name || null,
              industry: mappedDb?.industry_name || null,
              address: mappedDb?.address || null,
              companyType: null
            };

            const sminfoResult = await sminfo.searchByCompanyName(
              entityForDart.canonicalName, sminfoMatchCriteria
            );

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

    const [dartSettled, liveSettled] = await Promise.allSettled([dartPromise, livePromise]);
    dartDataResult = dartSettled.status === 'fulfilled' ? dartSettled.value : null;
    const liveResult = liveSettled.status === 'fulfilled' ? liveSettled.value : null;

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

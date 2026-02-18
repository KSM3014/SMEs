/**
 * Entity Persistence Service
 * Persists apiOrchestrator results to entity_registry + entity_source_data + source_crosscheck.
 * Reusable by: batch script, real-time routes, refresh scheduler.
 */

import sequelize from '../config/database.js';
import { calculateNameSimilarity } from './entityResolver.js';

const REFRESH_INTERVAL_HOURS = parseInt(process.env.ENTITY_REFRESH_INTERVAL_HOURS || '24', 10);
const CROSS_CHECK_FIELDS = ['company_name', 'address', 'representative', 'industry_code'];

/**
 * Persist orchestrator result to DB.
 * @param {Object} orchestratorResult - return of apiOrchestrator.searchCompany()
 * @param {Object} opts - { batchId }
 * @returns {{ entitiesSaved: number, sourcesSaved: number, crosschecksSaved: number }}
 */
export async function persistCompanyResult(orchestratorResult, opts = {}) {
  const { entities, unmatched } = orchestratorResult;
  const batchId = opts.batchId || null;
  const now = new Date();
  const refreshDueAt = new Date(now.getTime() + REFRESH_INTERVAL_HOURS * 3600000);

  let entitiesSaved = 0;
  let sourcesSaved = 0;
  let crosschecksSaved = 0;

  for (const entity of entities) {
    const { entityId, confidence, matchLevel, identifiers, canonicalName,
            nameVariants, sources, data } = entity;

    if (!identifiers.brno && !identifiers.crno) continue;

    // 1. Upsert entity_registry
    await sequelize.query(`
      INSERT INTO entity_registry
        (entity_id, brno, crno, canonical_name, name_variants,
         confidence, match_level, sources_count, sources,
         last_fetched_at, refresh_due_at, is_stale, batch_id)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,FALSE,$12)
      ON CONFLICT (entity_id) DO UPDATE SET
        brno            = COALESCE(EXCLUDED.brno, entity_registry.brno),
        crno            = COALESCE(EXCLUDED.crno, entity_registry.crno),
        canonical_name  = EXCLUDED.canonical_name,
        name_variants   = EXCLUDED.name_variants,
        confidence      = EXCLUDED.confidence,
        match_level     = EXCLUDED.match_level,
        sources_count   = EXCLUDED.sources_count,
        sources         = EXCLUDED.sources,
        last_fetched_at = EXCLUDED.last_fetched_at,
        refresh_due_at  = EXCLUDED.refresh_due_at,
        is_stale        = FALSE,
        batch_id        = COALESCE(EXCLUDED.batch_id, entity_registry.batch_id)
    `, {
      bind: [
        entityId, identifiers.brno || null, identifiers.crno || null,
        canonicalName, nameVariants || [],
        confidence, matchLevel, sources.length, sources || [],
        now, refreshDueAt, batchId
      ]
    });
    entitiesSaved++;

    // 2. Upsert entity_source_data (one per source)
    // We need the flat fields from the original allResponses, but entity.data only has { source, rawData }.
    // The unmatched array has the full flat fields. For matched data, we use entity-level identifiers.
    const sourceRows = [];
    for (const item of data) {
      // Find matching flat response in unmatched to get per-source fields
      // Fallback: use entity-level identifiers
      const matchedUnmatched = (unmatched || []).find(u => u.source === item.source);

      sourceRows.push({
        entity_id: entityId,
        source_name: item.source,
        raw_data: JSON.stringify(item.rawData || {}),
        brno: matchedUnmatched?.brno || identifiers.brno || null,
        crno: matchedUnmatched?.crno || identifiers.crno || null,
        company_name: matchedUnmatched?.companyName || canonicalName || null,
        address: matchedUnmatched?.address || null,
        representative: matchedUnmatched?.representative || null,
        industry_code: matchedUnmatched?.industryCode || null,
      });
    }

    for (const row of sourceRows) {
      await sequelize.query(`
        INSERT INTO entity_source_data
          (entity_id, source_name, raw_data, brno, crno,
           company_name, address, representative, industry_code, fetched_at, is_current)
        VALUES ($1,$2,$3::jsonb,$4,$5,$6,$7,$8,$9,NOW(),TRUE)
        ON CONFLICT (entity_id, source_name) DO UPDATE SET
          raw_data        = EXCLUDED.raw_data,
          brno            = EXCLUDED.brno,
          crno            = EXCLUDED.crno,
          company_name    = EXCLUDED.company_name,
          address         = EXCLUDED.address,
          representative  = EXCLUDED.representative,
          industry_code   = EXCLUDED.industry_code,
          fetched_at      = NOW(),
          is_current      = TRUE
      `, {
        bind: [
          row.entity_id, row.source_name, row.raw_data,
          row.brno, row.crno, row.company_name,
          row.address, row.representative, row.industry_code
        ]
      });
      sourcesSaved++;
    }

    // 3. Build and upsert cross-check rows
    const ccRows = buildCrossCheckRows(entityId, sourceRows);
    for (const cc of ccRows) {
      await sequelize.query(`
        INSERT INTO source_crosscheck
          (entity_id, source_a, source_b, field, value_a, value_b,
           is_conflict, similarity, checked_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW())
        ON CONFLICT (entity_id, source_a, source_b, field) DO UPDATE SET
          value_a     = EXCLUDED.value_a,
          value_b     = EXCLUDED.value_b,
          is_conflict = EXCLUDED.is_conflict,
          similarity  = EXCLUDED.similarity,
          checked_at  = NOW()
      `, {
        bind: [
          cc.entity_id, cc.source_a, cc.source_b, cc.field,
          cc.value_a, cc.value_b, cc.is_conflict, cc.similarity
        ]
      });
      crosschecksSaved++;
    }
  }

  return { entitiesSaved, sourcesSaved, crosschecksSaved };
}

/**
 * Load entity from DB by brno or crno.
 * Returns null if not found or stale.
 * @param {{ brno?: string, crno?: string }} query
 * @param {{ allowStale?: boolean }} opts
 */
export async function loadEntityFromDb(query, opts = {}) {
  const { brno, crno } = query;
  if (!brno && !crno) return null;

  const where = brno ? 'brno = $1' : 'crno = $1';
  const val = brno || crno;

  const [entities] = await sequelize.query(`
    SELECT * FROM entity_registry
    WHERE ${where}
    ${opts.allowStale ? '' : 'AND is_stale = FALSE'}
    ORDER BY last_fetched_at DESC
    LIMIT 1
  `, { bind: [val] });

  if (entities.length === 0) return null;

  const entity = entities[0];

  // Load source data
  const [sources] = await sequelize.query(`
    SELECT source_name, raw_data, company_name, address, representative, industry_code, fetched_at
    FROM entity_source_data
    WHERE entity_id = $1 AND is_current = TRUE
    ORDER BY fetched_at DESC
  `, { bind: [entity.entity_id] });

  // Load cross-check conflicts
  const [conflicts] = await sequelize.query(`
    SELECT source_a, source_b, field, value_a, value_b, similarity
    FROM source_crosscheck
    WHERE entity_id = $1 AND is_conflict = TRUE
    ORDER BY checked_at DESC
  `, { bind: [entity.entity_id] });

  return {
    entityId: entity.entity_id,
    brno: entity.brno,
    crno: entity.crno,
    canonicalName: entity.canonical_name,
    nameVariants: entity.name_variants,
    confidence: parseFloat(entity.confidence),
    matchLevel: entity.match_level,
    sourcesCount: entity.sources_count,
    sources: entity.sources,
    lastFetchedAt: entity.last_fetched_at,
    refreshDueAt: entity.refresh_due_at,
    isStale: entity.is_stale,
    apiData: sources.map(s => ({
      source: s.source_name,
      data: s.raw_data,
      companyName: s.company_name,
      address: s.address,
      representative: s.representative,
      industryCode: s.industry_code,
      fetchedAt: s.fetched_at
    })),
    conflicts: conflicts.map(c => ({
      sourceA: c.source_a,
      sourceB: c.source_b,
      field: c.field,
      valueA: c.value_a,
      valueB: c.value_b,
      similarity: parseFloat(c.similarity)
    }))
  };
}

/**
 * Compare live result with DB-stored data and return diff.
 * @param {Object} dbEntity - from loadEntityFromDb()
 * @param {Object} liveResult - from apiOrchestrator.searchCompany()
 * @returns {{ updated: [], added: [], removed: [], unchanged: [] }}
 */
export function computeDiff(dbEntity, liveResult) {
  if (!dbEntity || !liveResult?.entities?.[0]) return null;

  const liveEntity = liveResult.entities[0];
  const dbSources = new Map(dbEntity.apiData.map(s => [s.source, s]));
  const liveSources = new Map(liveEntity.data.map(d => [d.source, d]));

  const updated = [];
  const added = [];
  const removed = [];
  const unchanged = [];

  // Check live vs DB
  for (const [source, liveData] of liveSources) {
    const dbData = dbSources.get(source);
    if (!dbData) {
      added.push({ source, data: liveData.rawData });
    } else {
      const liveStr = JSON.stringify(liveData.rawData);
      const dbStr = JSON.stringify(dbData.data);
      if (liveStr !== dbStr) {
        updated.push({ source, oldData: dbData.data, newData: liveData.rawData });
      } else {
        unchanged.push({ source });
      }
    }
  }

  // Check DB sources not in live (removed/unavailable)
  for (const [source] of dbSources) {
    if (!liveSources.has(source)) {
      removed.push({ source });
    }
  }

  return { updated, added, removed, unchanged };
}

// === Internal helpers ===

function buildCrossCheckRows(entityId, sourceRows) {
  const rows = [];
  // Only compare sources that have meaningful data
  const comparableSources = sourceRows.filter(s =>
    s.company_name || s.address || s.representative || s.industry_code
  );

  for (let i = 0; i < comparableSources.length; i++) {
    for (let j = i + 1; j < comparableSources.length; j++) {
      const a = comparableSources[i];
      const b = comparableSources[j];

      for (const field of CROSS_CHECK_FIELDS) {
        const va = a[field] || null;
        const vb = b[field] || null;
        if (!va && !vb) continue; // both null, skip
        if (!va || !vb) {
          // One null: not a conflict, just missing data
          continue;
        }

        let sim;
        if (field === 'company_name') {
          sim = calculateNameSimilarity(va, vb);
        } else if (field === 'address') {
          // Addresses: normalize whitespace, check prefix overlap
          const na = va.replace(/\s+/g, ' ').trim();
          const nb = vb.replace(/\s+/g, ' ').trim();
          sim = na === nb ? 1.0 : (na.startsWith(nb) || nb.startsWith(na)) ? 0.9 : 0.3;
        } else {
          sim = va === vb ? 1.0 : 0.0;
        }

        rows.push({
          entity_id: entityId,
          source_a: a.source_name,
          source_b: b.source_name,
          field,
          value_a: va,
          value_b: vb,
          is_conflict: sim < 0.8,
          similarity: Math.round(sim * 10000) / 10000
        });
      }
    }
  }
  return rows;
}

export default {
  persistCompanyResult,
  loadEntityFromDb,
  computeDiff
};

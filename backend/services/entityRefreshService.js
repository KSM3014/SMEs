/**
 * Entity Refresh Service
 * Finds stale entities in entity_registry and re-fetches them via apiOrchestrator.
 * Called by the scheduler (apiRefresh.js) daily.
 */

import sequelize from '../config/database.js';
import apiOrchestrator from './apiOrchestrator.js';
import { persistCompanyResult } from './entityPersistence.js';

const REFRESH_BATCH_SIZE = parseInt(process.env.ENTITY_REFRESH_BATCH_SIZE || '50', 10);
const REFRESH_CONCURRENCY = parseInt(process.env.ENTITY_REFRESH_CONCURRENCY || '2', 10);
const REFRESH_DELAY_MS = parseInt(process.env.ENTITY_REFRESH_DELAY_MS || '3000', 10);

/**
 * Refresh stale entities.
 * @returns {{ refreshed: number, failed: number, skipped: number }}
 */
export async function refreshStaleEntities() {
  // Find entities due for refresh
  const [staleEntities] = await sequelize.query(`
    SELECT entity_id, brno, crno, canonical_name
    FROM entity_registry
    WHERE is_stale = TRUE
       OR refresh_due_at < NOW()
    ORDER BY refresh_due_at ASC NULLS FIRST
    LIMIT $1
  `, { bind: [REFRESH_BATCH_SIZE] });

  if (staleEntities.length === 0) {
    return { refreshed: 0, failed: 0, skipped: 0 };
  }

  console.log(`[Refresh] ${staleEntities.length} stale entities found`);

  let refreshed = 0;
  let failed = 0;

  for (let i = 0; i < staleEntities.length; i += REFRESH_CONCURRENCY) {
    const batch = staleEntities.slice(i, i + REFRESH_CONCURRENCY);

    const results = await Promise.allSettled(
      batch.map(async (entity) => {
        const query = {
          brno: entity.brno || null,
          crno: entity.crno || null,
          companyName: entity.canonical_name || null
        };

        const result = await apiOrchestrator.searchCompany(query);
        await persistCompanyResult(result, { batchId: 'scheduler_refresh' });
        return entity.entity_id;
      })
    );

    for (const result of results) {
      if (result.status === 'fulfilled') {
        refreshed++;
        console.log(`  [Refresh] ${result.value} OK`);
      } else {
        failed++;
        const entityId = batch[results.indexOf(result)]?.entity_id || '?';
        console.error(`  [Refresh] ${entityId} FAILED: ${result.reason?.message}`);

        // Mark as stale for retry
        await sequelize.query(
          `UPDATE entity_registry SET is_stale = TRUE WHERE entity_id = $1`,
          { bind: [entityId] }
        ).catch(() => {});
      }
    }

    // Delay between batches
    if (i + REFRESH_CONCURRENCY < staleEntities.length) {
      await new Promise(r => setTimeout(r, REFRESH_DELAY_MS));
    }
  }

  return { refreshed, failed, skipped: 0 };
}

/**
 * Run cross-check audit — count conflicts and log summary.
 * @returns {{ entitiesWithConflicts: number, totalConflicts: number }}
 */
export async function runCrossCheckAudit() {
  const [conflicts] = await sequelize.query(`
    SELECT entity_id, COUNT(*) as conflict_count,
           array_agg(DISTINCT field) as conflicted_fields
    FROM source_crosscheck
    WHERE is_conflict = TRUE
      AND checked_at > NOW() - INTERVAL '25 hours'
    GROUP BY entity_id
    HAVING COUNT(*) > 0
    ORDER BY conflict_count DESC
    LIMIT 100
  `);

  if (conflicts.length > 0) {
    console.log(`[CrossCheck] ${conflicts.length} entities with conflicts:`);
    for (const c of conflicts.slice(0, 10)) {
      console.log(`  entity=${c.entity_id} conflicts=${c.conflict_count} fields=${c.conflicted_fields}`);
    }

    // Write to collection_logs
    await sequelize.query(`
      INSERT INTO collection_logs (log_type, status, message, metadata, timestamp)
      VALUES ('crosscheck_audit', 'warning', $1, $2, NOW())
    `, {
      bind: [
        `${conflicts.length} entities with field conflicts detected`,
        JSON.stringify({ conflictSummary: conflicts.slice(0, 50) })
      ]
    }).catch(err => console.error('[CrossCheck] Log write error:', err.message));
  } else {
    console.log('[CrossCheck] No conflicts found');
  }

  const totalConflicts = conflicts.reduce((sum, c) => sum + parseInt(c.conflict_count), 0);
  return { entitiesWithConflicts: conflicts.length, totalConflicts };
}

export default { refreshStaleEntities, runCrossCheckAudit };

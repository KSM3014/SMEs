import cron from 'node-cron';
import authApiCollector from '../collectors/authApiCollector.js';
import publicApiCollector from '../collectors/publicApiCollector.js';
import { refreshStaleEntities, runCrossCheckAudit } from '../services/entityRefreshService.js';
import dotenv from 'dotenv';

dotenv.config();

/**
 * API Refresh Scheduler
 * Periodic tasks for keeping API data up-to-date
 */

class ApiRefreshScheduler {
  constructor() {
    this.publicApiRefreshCron = process.env.CRON_PUBLIC_API_REFRESH || '0 3 * * *'; // Daily at 3 AM
    this.myApiRefreshCron = process.env.CRON_MY_API_REFRESH || '0 9 * * 1';         // Weekly Monday at 9 AM
    this.entityRefreshCron = process.env.CRON_ENTITY_REFRESH || '0 2 * * *';         // Daily at 2 AM
    this.crossCheckCron = process.env.CRON_CROSSCHECK || '30 2 * * *';               // Daily at 2:30 AM
    this.tasks = [];
  }

  /**
   * Start all scheduled tasks
   */
  start() {
    console.log('[Scheduler] Starting API refresh schedulers...');

    // Daily public API refresh (3 AM)
    const publicApiTask = cron.schedule(this.publicApiRefreshCron, async () => {
      console.log(`\n[Scheduler] Running scheduled public API refresh... (${new Date().toISOString()})`);

      try {
        const result = await publicApiCollector.refreshPublicApis();
        console.log(`✅ [Scheduler] Public API refresh complete: ${result.inserted} APIs updated`);
      } catch (error) {
        console.error('❌ [Scheduler] Public API refresh failed:', error.message);
      }
    }, {
      scheduled: true,
      timezone: process.env.TZ || 'Asia/Seoul'
    });

    this.tasks.push(publicApiTask);
    console.log(`✅ [Scheduler] Public API refresh scheduled: ${this.publicApiRefreshCron}`);

    // Weekly my API refresh (Monday 9 AM)
    const myApiTask = cron.schedule(this.myApiRefreshCron, async () => {
      console.log(`\n[Scheduler] Running scheduled my API refresh... (${new Date().toISOString()})`);

      try {
        const result = await authApiCollector.collectAllMyApis();
        console.log(`✅ [Scheduler] My API refresh complete: ${result.inserted} APIs updated`);
      } catch (error) {
        console.error('❌ [Scheduler] My API refresh failed:', error.message);
      }
    }, {
      scheduled: true,
      timezone: process.env.TZ || 'Asia/Seoul'
    });

    this.tasks.push(myApiTask);
    console.log(`✅ [Scheduler] My API refresh scheduled: ${this.myApiRefreshCron}`);

    // Daily entity refresh (2 AM) — re-fetch stale entity data from live APIs
    const entityRefreshTask = cron.schedule(this.entityRefreshCron, async () => {
      console.log(`\n[Scheduler] Running entity refresh... (${new Date().toISOString()})`);
      try {
        const result = await refreshStaleEntities();
        console.log(`✅ [Scheduler] Entity refresh complete: ${result.refreshed} refreshed, ${result.failed} failed`);
      } catch (error) {
        console.error('❌ [Scheduler] Entity refresh failed:', error.message);
      }
    }, { scheduled: true, timezone: process.env.TZ || 'Asia/Seoul' });

    this.tasks.push(entityRefreshTask);
    console.log(`✅ [Scheduler] Entity refresh scheduled: ${this.entityRefreshCron}`);

    // Daily cross-check audit (2:30 AM) — detect conflicts between sources
    const crossCheckTask = cron.schedule(this.crossCheckCron, async () => {
      console.log(`\n[Scheduler] Running cross-check audit... (${new Date().toISOString()})`);
      try {
        const result = await runCrossCheckAudit();
        console.log(`✅ [Scheduler] Cross-check audit: ${result.entitiesWithConflicts} entities with ${result.totalConflicts} conflicts`);
      } catch (error) {
        console.error('❌ [Scheduler] Cross-check audit failed:', error.message);
      }
    }, { scheduled: true, timezone: process.env.TZ || 'Asia/Seoul' });

    this.tasks.push(crossCheckTask);
    console.log(`✅ [Scheduler] Cross-check audit scheduled: ${this.crossCheckCron}`);

    console.log('[Scheduler] All refresh schedulers started successfully\n');
  }

  /**
   * Stop all scheduled tasks
   */
  stop() {
    console.log('[Scheduler] Stopping all schedulers...');

    this.tasks.forEach(task => {
      if (task) {
        task.stop();
      }
    });

    this.tasks = [];
    console.log('✅ [Scheduler] All schedulers stopped');
  }

  /**
   * Get scheduler status
   */
  getStatus() {
    return {
      totalTasks: this.tasks.length,
      tasks: [
        { name: 'Public API Refresh', schedule: this.publicApiRefreshCron, active: !!this.tasks[0] },
        { name: 'My API Refresh', schedule: this.myApiRefreshCron, active: !!this.tasks[1] },
        { name: 'Entity Refresh', schedule: this.entityRefreshCron, active: !!this.tasks[2] },
        { name: 'Cross-Check Audit', schedule: this.crossCheckCron, active: !!this.tasks[3] },
      ]
    };
  }
}

export default new ApiRefreshScheduler();

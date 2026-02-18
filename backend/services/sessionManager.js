import { v4 as uuidv4 } from 'uuid';
import loginService from './loginService.js';
import sequelize from '../config/database.js';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Session Pool Manager
 * Manages multiple concurrent browser sessions to prevent bottlenecks
 * Auto-refreshes sessions every 30 minutes
 */

class SessionManager {
  constructor() {
    this.pool = [];
    this.maxSessions = parseInt(process.env.SESSION_POOL_SIZE || '5');
    this.refreshInterval = parseInt(process.env.SESSION_REFRESH_INTERVAL || '1800000'); // 30 minutes
    this.autoRefreshTimer = null;
  }

  /**
   * Initialize session pool with specified size
   */
  async initializePool() {
    try {
      console.log(`[SessionPool] Initializing with ${this.maxSessions} sessions...`);

      const initPromises = [];
      for (let i = 0; i < this.maxSessions; i++) {
        initPromises.push(this.createSession(i + 1));
      }

      const results = await Promise.allSettled(initPromises);

      const successful = results.filter(r => r.status === 'fulfilled').length;
      const failed = results.filter(r => r.status === 'rejected').length;

      console.log(`✅ [SessionPool] Initialized: ${successful} successful, ${failed} failed`);

      if (successful === 0) {
        throw new Error('Failed to initialize any sessions');
      }

      // Start auto-refresh
      this.startAutoRefresh();

      return {
        total: this.maxSessions,
        successful,
        failed,
        pool: this.pool
      };
    } catch (error) {
      console.error('❌ [SessionPool] Initialization failed:', error.message);
      throw error;
    }
  }

  /**
   * Create a new session
   */
  async createSession(index = null) {
    const startTime = Date.now();

    try {
      console.log(`[SessionPool] Creating session ${index || 'new'}...`);

      // Login and get browser instance
      const loginResult = await loginService.login();

      const sessionId = `sess_${uuidv4()}`;
      const now = new Date();
      const expiresAt = new Date(now.getTime() + this.refreshInterval);

      const session = {
        sessionId,
        index,
        browser: loginResult.browser,
        page: loginResult.page,
        cookies: loginResult.cookies,
        active: true,
        inUse: false,
        lastUsed: now,
        lastRefreshed: now,
        expiresAt,
        refreshCount: 0,
        errorCount: 0,
        createdAt: now
      };

      // Save to database
      await this.saveSessionToDB(session);

      // Add to pool
      this.pool.push(session);

      const duration = Date.now() - startTime;

      console.log(`✅ [SessionPool] Session ${sessionId} created (Duration: ${duration}ms)`);

      return session;
    } catch (error) {
      console.error(`❌ [SessionPool] Session creation failed:`, error.message);
      throw error;
    }
  }

  /**
   * Get an available session from the pool
   */
  async getAvailableSession() {
    try {
      // Find an available session (active and not in use)
      let session = this.pool.find(s => s.active && !s.inUse);

      if (!session) {
        console.log('[SessionPool] No available sessions, waiting...');

        // Wait for a session to become available
        await this.waitForAvailableSession();
        session = this.pool.find(s => s.active && !s.inUse);
      }

      if (!session) {
        throw new Error('No sessions available after waiting');
      }

      // Check if session needs refresh
      if (new Date() >= session.expiresAt) {
        console.log(`[SessionPool] Session ${session.sessionId} expired, refreshing...`);
        await this.refreshSession(session.sessionId);
        session = this.pool.find(s => s.sessionId === session.sessionId);
      }

      // Mark as in use
      session.inUse = true;
      session.lastUsed = new Date();

      await this.updateSessionInDB(session);

      console.log(`[SessionPool] Providing session ${session.sessionId}`);

      return session;
    } catch (error) {
      console.error('[SessionPool] Error getting session:', error.message);
      throw error;
    }
  }

  /**
   * Release a session back to the pool
   */
  async releaseSession(sessionId) {
    try {
      const session = this.pool.find(s => s.sessionId === sessionId);

      if (!session) {
        console.warn(`[SessionPool] Session ${sessionId} not found in pool`);
        return;
      }

      session.inUse = false;
      session.lastUsed = new Date();

      await this.updateSessionInDB(session);

      console.log(`[SessionPool] Released session ${sessionId}`);
    } catch (error) {
      console.error('[SessionPool] Error releasing session:', error.message);
    }
  }

  /**
   * Refresh a specific session
   */
  async refreshSession(sessionId) {
    const startTime = Date.now();

    try {
      console.log(`[SessionPool] Refreshing session ${sessionId}...`);

      const sessionIndex = this.pool.findIndex(s => s.sessionId === sessionId);

      if (sessionIndex === -1) {
        throw new Error(`Session ${sessionId} not found`);
      }

      const oldSession = this.pool[sessionIndex];

      // Close old browser instance
      if (oldSession.browser) {
        await oldSession.browser.close();
      }

      // Create new session
      const loginResult = await loginService.login();

      const now = new Date();
      const expiresAt = new Date(now.getTime() + this.refreshInterval);

      const newSession = {
        ...oldSession,
        browser: loginResult.browser,
        page: loginResult.page,
        cookies: loginResult.cookies,
        active: true,
        lastRefreshed: now,
        expiresAt,
        refreshCount: oldSession.refreshCount + 1,
        errorCount: 0
      };

      // Update pool
      this.pool[sessionIndex] = newSession;

      // Update database
      await this.updateSessionInDB(newSession);

      const duration = Date.now() - startTime;

      console.log(`✅ [SessionPool] Session ${sessionId} refreshed (Duration: ${duration}ms, Refresh count: ${newSession.refreshCount})`);

      return newSession;
    } catch (error) {
      console.error(`❌ [SessionPool] Session refresh failed:`, error.message);

      // Mark session as inactive
      const session = this.pool.find(s => s.sessionId === sessionId);
      if (session) {
        session.active = false;
        session.errorCount++;
        session.lastError = error.message;
        await this.updateSessionInDB(session);
      }

      throw error;
    }
  }

  /**
   * Start automatic session refresh
   */
  startAutoRefresh() {
    if (this.autoRefreshTimer) {
      clearInterval(this.autoRefreshTimer);
    }

    console.log(`[SessionPool] Starting auto-refresh every ${this.refreshInterval / 60000} minutes`);

    this.autoRefreshTimer = setInterval(async () => {
      console.log('[SessionPool] Running scheduled refresh...');

      for (const session of this.pool) {
        if (session.active && !session.inUse) {
          try {
            await this.refreshSession(session.sessionId);
            await this.sleep(5000); // 5s delay between refreshes
          } catch (error) {
            console.error(`[SessionPool] Auto-refresh failed for ${session.sessionId}:`, error.message);
          }
        }
      }

      console.log('[SessionPool] Scheduled refresh completed');
    }, this.refreshInterval);
  }

  /**
   * Stop automatic session refresh
   */
  stopAutoRefresh() {
    if (this.autoRefreshTimer) {
      clearInterval(this.autoRefreshTimer);
      this.autoRefreshTimer = null;
      console.log('[SessionPool] Auto-refresh stopped');
    }
  }

  /**
   * Wait for an available session (polling)
   */
  async waitForAvailableSession(maxWaitMs = 60000) {
    const startTime = Date.now();
    const pollInterval = 2000; // Check every 2 seconds

    while (Date.now() - startTime < maxWaitMs) {
      const availableSession = this.pool.find(s => s.active && !s.inUse);

      if (availableSession) {
        return availableSession;
      }

      await this.sleep(pollInterval);
    }

    throw new Error(`No sessions became available within ${maxWaitMs}ms`);
  }

  /**
   * Get pool status
   */
  getPoolStatus() {
    const total = this.pool.length;
    const active = this.pool.filter(s => s.active).length;
    const inUse = this.pool.filter(s => s.inUse).length;
    const available = this.pool.filter(s => s.active && !s.inUse).length;

    return {
      total,
      active,
      inUse,
      available,
      sessions: this.pool.map(s => ({
        sessionId: s.sessionId,
        index: s.index,
        active: s.active,
        inUse: s.inUse,
        refreshCount: s.refreshCount,
        errorCount: s.errorCount,
        lastUsed: s.lastUsed,
        expiresAt: s.expiresAt
      }))
    };
  }

  /**
   * Shutdown pool gracefully
   */
  async shutdown() {
    console.log('[SessionPool] Shutting down...');

    this.stopAutoRefresh();

    for (const session of this.pool) {
      try {
        if (session.browser) {
          await session.browser.close();
        }
        session.active = false;
        await this.updateSessionInDB(session);
      } catch (error) {
        console.error(`Error closing session ${session.sessionId}:`, error.message);
      }
    }

    this.pool = [];
    console.log('✅ [SessionPool] Shutdown complete');
  }

  /**
   * Save session to database
   */
  async saveSessionToDB(session) {
    try {
      await sequelize.query(`
        INSERT INTO sessions (
          session_id, cookies, active, in_use, last_used, last_refreshed,
          refresh_count, error_count, created_at, expires_at, metadata
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        ON CONFLICT (session_id) DO NOTHING
      `, {
        bind: [
          session.sessionId,
          JSON.stringify(session.cookies),
          session.active,
          session.inUse,
          session.lastUsed,
          session.lastRefreshed,
          session.refreshCount || 0,
          session.errorCount || 0,
          session.createdAt,
          session.expiresAt,
          JSON.stringify({ index: session.index })
        ]
      });
    } catch (error) {
      console.error('Failed to save session to DB:', error.message);
    }
  }

  /**
   * Update session in database
   */
  async updateSessionInDB(session) {
    try {
      await sequelize.query(`
        UPDATE sessions
        SET active = $1, in_use = $2, last_used = $3, last_refreshed = $4,
            refresh_count = $5, error_count = $6, expires_at = $7,
            last_error = $8, metadata = $9
        WHERE session_id = $10
      `, {
        bind: [
          session.active,
          session.inUse,
          session.lastUsed,
          session.lastRefreshed,
          session.refreshCount || 0,
          session.errorCount || 0,
          session.expiresAt,
          session.lastError || null,
          JSON.stringify({ index: session.index }),
          session.sessionId
        ]
      });
    } catch (error) {
      console.error('Failed to update session in DB:', error.message);
    }
  }

  /**
   * Sleep helper
   */
  async sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export default new SessionManager();

import sessionManager from '../services/sessionManager.js';
import sequelize, { batchInsert } from '../config/database.js';
import CryptoJS from 'crypto-js';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Authenticated API Collector
 * Collects 96 private APIs from data.go.kr My Page
 * Uses session pool to prevent bottlenecks
 */

class AuthApiCollector {
  constructor() {
    this.myPageUrl = process.env.DATAGOER_MYPAGE_URL;
    this.batchSize = parseInt(process.env.API_COLLECTION_BATCH_SIZE || '20');
    this.delay = parseInt(process.env.API_COLLECTION_DELAY || '2000');
    this.encryptionKey = process.env.ENCRYPTION_KEY;
  }

  /**
   * Encrypt API key using AES-256
   */
  encryptApiKey(apiKey) {
    return CryptoJS.AES.encrypt(apiKey, this.encryptionKey).toString();
  }

  /**
   * Decrypt API key
   */
  decryptApiKey(encryptedKey) {
    const bytes = CryptoJS.AES.decrypt(encryptedKey, this.encryptionKey);
    return bytes.toString(CryptoJS.enc.Utf8);
  }

  /**
   * Extract API information from My Page DOM
   */
  async extractMyApis(page) {
    try {
      console.log('[AuthAPICollector] Extracting API information from DOM...');

      const apis = await page.evaluate(() => {
        const apiElements = document.querySelectorAll('.api-list-item, .my-api-item, tr.api-row');

        return Array.from(apiElements).map(element => {
          try {
            // Extract various fields (adjust selectors based on actual HTML structure)
            const getName = () => {
              return element.querySelector('.api-name, .service-name, td.name, h3, h4')?.textContent?.trim() || 'Unknown API';
            };

            const getEndpoint = () => {
              return element.querySelector('.endpoint, .api-url, .url, a[href*="api"]')?.textContent?.trim()
                || element.querySelector('a[href*="api"]')?.href || '';
            };

            const getApiKey = () => {
              return element.querySelector('.api-key, .service-key, .key, input[name*="key"]')?.value
                || element.querySelector('.api-key, .service-key, .key')?.textContent?.trim() || '';
            };

            const getCategory = () => {
              return element.querySelector('.category, .dept, td.category')?.textContent?.trim() || '';
            };

            const getProvider = () => {
              return element.querySelector('.provider, .org, .institution')?.textContent?.trim() || '';
            };

            const getDescription = () => {
              return element.querySelector('.description, .desc, p')?.textContent?.trim() || '';
            };

            const getStatus = () => {
              const statusText = element.querySelector('.status, .state, span.badge')?.textContent?.trim() || 'active';
              return statusText.includes('활성') || statusText.includes('Active') ? 'active' : 'inactive';
            };

            const getQuota = () => {
              const quotaText = element.querySelector('.quota, .limit')?.textContent?.trim() || '1000';
              return parseInt(quotaText.replace(/[^0-9]/g, '')) || 1000;
            };

            return {
              name: getName(),
              endpoint: getEndpoint(),
              apiKey: getApiKey(),
              category: getCategory(),
              provider: getProvider(),
              description: getDescription(),
              status: getStatus(),
              requestQuota: getQuota()
            };
          } catch (error) {
            console.error('Error extracting individual API:', error.message);
            return null;
          }
        }).filter(api => api && api.endpoint); // Filter out nulls and APIs without endpoints
      });

      console.log(`[AuthAPICollector] Extracted ${apis.length} APIs from page`);

      return apis;
    } catch (error) {
      console.error('[AuthAPICollector] DOM extraction error:', error.message);
      throw error;
    }
  }

  /**
   * Test API endpoint to get sample response
   */
  async testApiEndpoint(endpoint, apiKey) {
    try {
      const axios = (await import('axios')).default;

      const response = await axios.get(endpoint, {
        headers: {
          'Authorization': `Bearer ${apiKey}`
        },
        params: {
          serviceKey: apiKey,
          numOfRows: 10, // Request small sample
          pageNo: 1
        },
        timeout: 10000
      });

      return {
        success: true,
        sampleResponse: response.data,
        responseFormat: response.headers['content-type']?.includes('json') ? 'JSON' : 'XML',
        httpMethod: 'GET'
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        sampleResponse: null
      };
    }
  }

  /**
   * Collect all My APIs (96 APIs)
   */
  async collectAllMyApis() {
    const startTime = Date.now();
    let session = null;

    try {
      console.log('[AuthAPICollector] Starting My APIs collection...');

      // Get available session
      session = await sessionManager.getAvailableSession();
      const { page } = session;

      // Navigate to My Page
      console.log(`[AuthAPICollector] Navigating to ${this.myPageUrl}...`);
      await page.goto(this.myPageUrl, {
        waitUntil: 'networkidle2',
        timeout: 30000
      });

      // Wait for API list to load
      await page.waitForSelector('.api-list-item, .my-api-item, tr.api-row', { timeout: 10000 });

      // Check for pagination
      const hasMultiplePages = await page.evaluate(() => {
        const pagination = document.querySelector('.pagination, .pager');
        return pagination !== null;
      });

      let allApis = [];

      if (hasMultiplePages) {
        // Handle pagination
        console.log('[AuthAPICollector] Multiple pages detected, collecting from all pages...');

        let currentPage = 1;
        let hasNextPage = true;

        while (hasNextPage) {
          console.log(`[AuthAPICollector] Processing page ${currentPage}...`);

          const apis = await this.extractMyApis(page);
          allApis = allApis.concat(apis);

          // Check for next page
          const nextButtonSelector = 'a.next, button.next, a:contains("다음"), .pagination a:last-child';
          const nextButton = await page.$(nextButtonSelector);

          if (nextButton) {
            await nextButton.click();
            await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 10000 });
            await this.sleep(this.delay);
            currentPage++;
          } else {
            hasNextPage = false;
          }
        }
      } else {
        // Single page
        allApis = await this.extractMyApis(page);
      }

      console.log(`[AuthAPICollector] Extracted ${allApis.length} APIs total`);

      // Process and encrypt API keys
      const processedApis = allApis.map(api => ({
        api_id: `my_${this.generateApiId(api.endpoint)}`,
        name: api.name,
        endpoint: api.endpoint,
        api_key: this.encryptApiKey(api.apiKey), // Encrypt API key
        category: api.category || 'Uncategorized',
        provider: api.provider || 'Unknown',
        description: api.description || '',
        status: api.status || 'active',
        request_quota: api.requestQuota || 1000,
        requests_used: 0,
        response_format: 'JSON',
        http_method: 'GET'
      }));

      // Batch insert to database
      console.log('[AuthAPICollector] Saving to database...');

      const insertResult = await this.saveApisToDB(processedApis);

      // Test APIs in batches (optional, can be slow)
      if (process.env.TEST_APIS_ON_COLLECTION === 'true') {
        console.log('[AuthAPICollector] Testing APIs...');
        await this.testApisInBatches(processedApis);
      }

      const duration = Date.now() - startTime;

      console.log(`✅ [AuthAPICollector] Collection complete: ${insertResult.inserted} APIs saved (Duration: ${duration / 1000}s)`);

      // Log to database
      await this.logCollection('my_apis_collection', 'success', {
        api_count: allApis.length,
        inserted_count: insertResult.inserted,
        duration_ms: duration,
        session_id: session.sessionId
      });

      return {
        total: allApis.length,
        inserted: insertResult.inserted,
        errors: insertResult.errors,
        duration
      };

    } catch (error) {
      console.error('❌ [AuthAPICollector] Collection failed:', error.message);

      await this.logCollection('my_apis_collection', 'failed', {
        error: error.message,
        session_id: session?.sessionId
      });

      throw error;
    } finally {
      // Release session back to pool
      if (session) {
        await sessionManager.releaseSession(session.sessionId);
      }
    }
  }

  /**
   * Save APIs to database with encryption
   */
  async saveApisToDB(apis) {
    try {
      let inserted = 0;
      const errors = [];

      for (const api of apis) {
        try {
          const [result] = await sequelize.query(`
            INSERT INTO my_apis (
              api_id, name, endpoint, api_key, category, provider,
              description, status, request_quota, requests_used,
              response_format, http_method
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
            ON CONFLICT (endpoint) DO UPDATE SET
              name = EXCLUDED.name,
              api_key = EXCLUDED.api_key,
              category = EXCLUDED.category,
              provider = EXCLUDED.provider,
              description = EXCLUDED.description,
              status = EXCLUDED.status,
              updated_at = CURRENT_TIMESTAMP
            RETURNING id
          `, {
            bind: [
              api.api_id,
              api.name,
              api.endpoint,
              api.api_key, // Already encrypted
              api.category,
              api.provider,
              api.description,
              api.status,
              api.request_quota,
              api.requests_used,
              api.response_format,
              api.http_method
            ]
          });

          inserted++;
        } catch (error) {
          errors.push({
            api: api.name,
            error: error.message
          });
        }
      }

      return { inserted, errors };
    } catch (error) {
      console.error('[AuthAPICollector] Database save error:', error.message);
      throw error;
    }
  }

  /**
   * Test APIs in batches
   */
  async testApisInBatches(apis) {
    const batchSize = 5;

    for (let i = 0; i < apis.length; i += batchSize) {
      const batch = apis.slice(i, i + batchSize);

      const testPromises = batch.map(async (api) => {
        const decryptedKey = this.decryptApiKey(api.api_key);
        const testResult = await this.testApiEndpoint(api.endpoint, decryptedKey);

        // Update database with test results
        await sequelize.query(`
          UPDATE my_apis
          SET last_tested_at = CURRENT_TIMESTAMP,
              test_status = $1,
              sample_response = $2
          WHERE endpoint = $3
        `, {
          bind: [
            testResult.success ? 'success' : 'failed',
            testResult.sampleResponse ? JSON.stringify(testResult.sampleResponse) : null,
            api.endpoint
          ]
        });

        return testResult;
      });

      await Promise.allSettled(testPromises);
      await this.sleep(this.delay);
    }
  }

  /**
   * Generate unique API ID from endpoint
   */
  generateApiId(endpoint) {
    return CryptoJS.MD5(endpoint).toString().substring(0, 16);
  }

  /**
   * Log collection events
   */
  async logCollection(logType, status, metadata = {}) {
    try {
      await sequelize.query(`
        INSERT INTO collection_logs (log_type, status, message, metadata, api_count, duration_ms, session_id)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
      `, {
        bind: [
          logType,
          status,
          `${logType} ${status}`,
          JSON.stringify(metadata),
          metadata.api_count || null,
          metadata.duration_ms || null,
          metadata.session_id || null
        ]
      });
    } catch (error) {
      console.error('Failed to log collection event:', error.message);
    }
  }

  /**
   * Sleep helper
   */
  async sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export default new AuthApiCollector();

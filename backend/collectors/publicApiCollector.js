import axios from 'axios';
import sequelize from '../config/database.js';
import CryptoJS from 'crypto-js';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Public API Collector
 * Collects 11,992 public APIs from data.go.kr
 * No authentication required
 */

class PublicApiCollector {
  constructor() {
    this.baseUrl = process.env.DATAGOER_PUBLIC_API_URL || 'https://www.data.go.kr/tcs/dss/selectDataSetList.do';
    this.pageSize = parseInt(process.env.PUBLIC_API_PAGE_SIZE || '100');
    this.delay = parseInt(process.env.API_COLLECTION_DELAY || '2000');
    this.timeout = parseInt(process.env.API_COLLECTION_TIMEOUT || '120000');
  }

  /**
   * Fetch a single page of public APIs
   */
  async fetchPublicApisPage(page = 1) {
    try {
      console.log(`[PublicAPICollector] Fetching page ${page}...`);

      const response = await axios.get(this.baseUrl, {
        params: {
          page,
          perPage: this.pageSize,
          searchType: 'OPEN_API',
          publicDataDetailPk: '',
          recmSe: '',
          detailType: '',
          machinReadng: '',
          publicDataPk: '',
          orgFullName: '',
          selType: '',
          keyword: ''
        },
        timeout: this.timeout,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });

      // Parse response based on format
      if (typeof response.data === 'object' && response.data.result) {
        // JSON format
        return this.parseJsonResponse(response.data);
      } else if (typeof response.data === 'string') {
        // Might be HTML or XML, need to parse accordingly
        return this.parseHtmlResponse(response.data);
      }

      throw new Error('Unexpected response format');
    } catch (error) {
      console.error(`[PublicAPICollector] Page ${page} fetch error:`, error.message);
      throw error;
    }
  }

  /**
   * Parse JSON response
   */
  parseJsonResponse(data) {
    try {
      if (!data.result || !Array.isArray(data.result)) {
        return { apis: [], hasNextPage: false, total: 0 };
      }

      const apis = data.result.map(item => ({
        name: item.dataSetNm || item.title || 'Unknown',
        endpoint: item.openApiUrl || item.apiUrl || item.serviceUrl || '',
        category: item.ctgryNm || item.category || 'Uncategorized',
        subcategory: item.ctgryNmSub || '',
        provider: item.orgNm || item.insttNm || 'Unknown',
        description: item.dataSetDesc || item.description || '',
        format: item.dataFormat || 'JSON',
        license: item.license || '',
        updateFrequency: item.updtCyclNm || '',
        lastUpdate: item.updtDt || null,
        tags: item.keywords ? item.keywords.split(',').map(t => t.trim()) : []
      }));

      return {
        apis,
        hasNextPage: data.page < data.totalPages,
        total: data.totalCount || data.result.length
      };
    } catch (error) {
      console.error('[PublicAPICollector] JSON parse error:', error.message);
      return { apis: [], hasNextPage: false, total: 0 };
    }
  }

  /**
   * Parse HTML response (fallback if API returns HTML)
   */
  parseHtmlResponse(html) {
    try {
      // This is a fallback parser if the API returns HTML instead of JSON
      // You may need to use cheerio or similar library for robust HTML parsing
      const apis = [];

      // Basic regex-based extraction (replace with proper HTML parser if needed)
      const apiRegex = /<div class="api-item">([\s\S]*?)<\/div>/g;
      let match;

      while ((match = apiRegex.exec(html)) !== null) {
        apis.push({
          name: 'Parsed from HTML',
          endpoint: '',
          category: 'Unknown',
          provider: 'Unknown',
          description: '',
          format: 'Unknown'
        });
      }

      return { apis, hasNextPage: false, total: apis.length };
    } catch (error) {
      console.error('[PublicAPICollector] HTML parse error:', error.message);
      return { apis: [], hasNextPage: false, total: 0 };
    }
  }

  /**
   * Collect all public APIs (11,992 total)
   */
  async collectAllPublicApis() {
    const startTime = Date.now();

    try {
      console.log('[PublicAPICollector] Starting public APIs collection...');

      let currentPage = 1;
      let hasNextPage = true;
      let allApis = [];
      let totalExpected = 11992;

      while (hasNextPage && allApis.length < totalExpected) {
        try {
          const result = await this.fetchPublicApisPage(currentPage);

          if (result.total > 0 && totalExpected !== result.total) {
            totalExpected = result.total;
            console.log(`[PublicAPICollector] Total APIs updated to ${totalExpected}`);
          }

          allApis = allApis.concat(result.apis);

          console.log(`[PublicAPICollector] Page ${currentPage}: Collected ${result.apis.length} APIs (Total: ${allApis.length}/${totalExpected})`);

          hasNextPage = result.hasNextPage && allApis.length < totalExpected;
          currentPage++;

          // Rate limiting delay
          if (hasNextPage) {
            await this.sleep(this.delay);
          }

        } catch (error) {
          console.error(`[PublicAPICollector] Page ${currentPage} failed:`, error.message);

          // Retry logic
          await this.sleep(this.delay * 2);
          continue;
        }
      }

      console.log(`[PublicAPICollector] Collection phase complete: ${allApis.length} APIs extracted`);

      // Process and prepare for database
      const processedApis = allApis
        .filter(api => api.endpoint) // Only APIs with valid endpoints
        .map(api => ({
          api_id: `pub_${this.generateApiId(api.endpoint)}`,
          name: api.name,
          endpoint: api.endpoint,
          category: api.category || 'Uncategorized',
          subcategory: api.subcategory || '',
          provider: api.provider || 'Unknown',
          description: api.description || '',
          format: api.format || 'JSON',
          auth_required: false,
          license: api.license || '',
          update_frequency: api.updateFrequency || '',
          last_update: api.lastUpdate || null,
          tags: api.tags || []
        }));

      // Save to database
      console.log('[PublicAPICollector] Saving to database...');

      const insertResult = await this.saveApisToDB(processedApis);

      const duration = Date.now() - startTime;

      console.log(`✅ [PublicAPICollector] Collection complete: ${insertResult.inserted} APIs saved (Duration: ${duration / 1000}s)`);

      // Log to database
      await this.logCollection('public_apis_collection', 'success', {
        api_count: allApis.length,
        inserted_count: insertResult.inserted,
        error_count: insertResult.errors.length,
        duration_ms: duration
      });

      return {
        total: allApis.length,
        inserted: insertResult.inserted,
        errors: insertResult.errors,
        duration
      };

    } catch (error) {
      console.error('❌ [PublicAPICollector] Collection failed:', error.message);

      await this.logCollection('public_apis_collection', 'failed', {
        error: error.message
      });

      throw error;
    }
  }

  /**
   * Save public APIs to database
   */
  async saveApisToDB(apis) {
    try {
      let inserted = 0;
      const errors = [];

      // Batch insert for performance
      const batchSize = 100;

      for (let i = 0; i < apis.length; i += batchSize) {
        const batch = apis.slice(i, i + batchSize);

        for (const api of batch) {
          try {
            await sequelize.query(`
              INSERT INTO public_apis (
                api_id, name, endpoint, category, subcategory, provider,
                description, format, auth_required, license, update_frequency,
                last_update, tags
              )
              VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
              ON CONFLICT (endpoint) DO UPDATE SET
                name = EXCLUDED.name,
                category = EXCLUDED.category,
                subcategory = EXCLUDED.subcategory,
                provider = EXCLUDED.provider,
                description = EXCLUDED.description,
                format = EXCLUDED.format,
                license = EXCLUDED.license,
                update_frequency = EXCLUDED.update_frequency,
                last_update = EXCLUDED.last_update,
                tags = EXCLUDED.tags,
                updated_at = CURRENT_TIMESTAMP
            `, {
              bind: [
                api.api_id,
                api.name,
                api.endpoint,
                api.category,
                api.subcategory,
                api.provider,
                api.description,
                api.format,
                api.auth_required,
                api.license,
                api.update_frequency,
                api.last_update,
                api.tags
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

        console.log(`[PublicAPICollector] Batch ${Math.floor(i / batchSize) + 1}: ${Math.min(i + batchSize, apis.length)}/${apis.length} processed`);
      }

      return { inserted, errors };
    } catch (error) {
      console.error('[PublicAPICollector] Database save error:', error.message);
      throw error;
    }
  }

  /**
   * Update existing APIs (for scheduled refresh)
   */
  async refreshPublicApis() {
    console.log('[PublicAPICollector] Starting scheduled refresh...');

    try {
      // Get current API count
      const [countResult] = await sequelize.query('SELECT COUNT(*) as count FROM public_apis');
      const currentCount = countResult[0]?.count || 0;

      console.log(`[PublicAPICollector] Current DB count: ${currentCount}`);

      // Collect fresh data
      const result = await this.collectAllPublicApis();

      console.log(`✅ [PublicAPICollector] Refresh complete: ${result.inserted} APIs updated`);

      return result;
    } catch (error) {
      console.error('❌ [PublicAPICollector] Refresh failed:', error.message);
      throw error;
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
        INSERT INTO collection_logs (log_type, status, message, metadata, api_count, duration_ms)
        VALUES ($1, $2, $3, $4, $5, $6)
      `, {
        bind: [
          logType,
          status,
          `${logType} ${status}`,
          JSON.stringify(metadata),
          metadata.api_count || null,
          metadata.duration_ms || null
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

export default new PublicApiCollector();

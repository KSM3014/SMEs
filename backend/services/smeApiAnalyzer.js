import axios from 'axios';
import sequelize from '../config/database.js';
import CryptoJS from 'crypto-js';
import dotenv from 'dotenv';

dotenv.config();

/**
 * SME API Analyzer
 * Analyzes and parses SME company data from data.go.kr APIs
 * Intelligently maps API responses to database schema
 */

class SMEApiAnalyzer {
  constructor() {
    this.encryptionKey = process.env.ENCRYPTION_KEY;
  }

  /**
   * Decrypt API key from database
   */
  decryptApiKey(encryptedKey) {
    const bytes = CryptoJS.AES.decrypt(encryptedKey, this.encryptionKey);
    return bytes.toString(CryptoJS.enc.Utf8);
  }

  /**
   * Get SME-related APIs from database
   */
  async getSMEApis() {
    try {
      const [apis] = await sequelize.query(`
        SELECT api_id, name, endpoint, api_key, category, provider, description
        FROM my_apis
        WHERE status = 'active'
        AND (
          category ILIKE '%기업%'
          OR category ILIKE '%중소%'
          OR category ILIKE '%벤처%'
          OR description ILIKE '%중소기업%'
          OR description ILIKE '%SME%'
          OR description ILIKE '%재무%'
          OR description ILIKE '%임원%'
        )
        ORDER BY name
      `);

      console.log(`[SMEAnalyzer] Found ${apis.length} SME-related APIs`);

      return apis;
    } catch (error) {
      console.error('[SMEAnalyzer] Error fetching SME APIs:', error.message);
      throw error;
    }
  }

  /**
   * Call API and get response
   */
  async callApi(apiInfo, params = {}) {
    try {
      const apiKey = this.decryptApiKey(apiInfo.api_key);

      const defaultParams = {
        serviceKey: apiKey,
        numOfRows: 100,
        pageNo: 1,
        type: 'json',
        ...params
      };

      console.log(`[SMEAnalyzer] Calling API: ${apiInfo.name}...`);

      const response = await axios.get(apiInfo.endpoint, {
        params: defaultParams,
        timeout: 30000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });

      return {
        success: true,
        data: response.data,
        apiInfo: apiInfo
      };
    } catch (error) {
      console.error(`[SMEAnalyzer] API call failed for ${apiInfo.name}:`, error.message);

      return {
        success: false,
        error: error.message,
        apiInfo: apiInfo
      };
    }
  }

  /**
   * Analyze API response structure
   */
  analyzeStructure(responseData) {
    try {
      const structure = {
        rootKeys: [],
        dataPath: null,
        itemsArray: null,
        fields: {},
        sampleItem: null
      };

      // Find data path (common patterns in Korean gov APIs)
      const commonPaths = [
        'response.body.items.item',
        'response.body.items',
        'response.body',
        'data.items',
        'data',
        'items.item',
        'items',
        'result'
      ];

      for (const path of commonPaths) {
        const data = this.getNestedProperty(responseData, path);
        if (data) {
          structure.dataPath = path;
          structure.itemsArray = Array.isArray(data) ? data : [data];
          break;
        }
      }

      if (structure.itemsArray && structure.itemsArray.length > 0) {
        structure.sampleItem = structure.itemsArray[0];
        structure.fields = this.inferFieldTypes(structure.sampleItem);
      }

      structure.rootKeys = Object.keys(responseData);

      return structure;
    } catch (error) {
      console.error('[SMEAnalyzer] Structure analysis error:', error.message);
      return null;
    }
  }

  /**
   * Get nested property by path string
   */
  getNestedProperty(obj, path) {
    return path.split('.').reduce((current, prop) => {
      return current?.[prop];
    }, obj);
  }

  /**
   * Infer field types from sample data
   */
  inferFieldTypes(sampleItem) {
    const fields = {};

    for (const [key, value] of Object.entries(sampleItem)) {
      let type = 'string';
      let category = 'unknown';

      // Infer type
      if (value === null || value === undefined) {
        type = 'nullable';
      } else if (typeof value === 'number') {
        type = Number.isInteger(value) ? 'integer' : 'decimal';
      } else if (typeof value === 'boolean') {
        type = 'boolean';
      } else if (typeof value === 'object') {
        type = Array.isArray(value) ? 'array' : 'object';
      } else if (typeof value === 'string') {
        // Detect specific patterns
        if (/^\d{4}-\d{2}-\d{2}/.test(value)) {
          type = 'date';
        } else if (/^\d+$/.test(value)) {
          type = 'numeric_string';
        }
      }

      // Categorize field (company_info, financial, officer, etc.)
      category = this.categorizeField(key);

      fields[key] = {
        type,
        category,
        sample: value,
        length: typeof value === 'string' ? value.length : null
      };
    }

    return fields;
  }

  /**
   * Categorize field based on key name
   */
  categorizeField(fieldKey) {
    const key = fieldKey.toLowerCase();

    // Company basic info
    if (key.includes('corp') || key.includes('회사') || key.includes('기업') ||
        key.includes('company') || key.includes('bizr') || key.includes('사업자')) {
      return 'company_info';
    }

    // Financial data
    if (key.includes('매출') || key.includes('자산') || key.includes('부채') || key.includes('자본') ||
        key.includes('수익') || key.includes('이익') || key.includes('비용') ||
        key.includes('revenue') || key.includes('profit') || key.includes('asset') ||
        key.includes('liability') || key.includes('equity') || key.includes('income')) {
      return 'financial';
    }

    // Officers/Executives
    if (key.includes('임원') || key.includes('대표') || key.includes('이사') ||
        key.includes('officer') || key.includes('director') || key.includes('ceo') ||
        key.includes('executive')) {
      return 'officer';
    }

    // Industry/Business type
    if (key.includes('업종') || key.includes('산업') || key.includes('industry')) {
      return 'industry';
    }

    // Location
    if (key.includes('주소') || key.includes('address') || key.includes('location') ||
        key.includes('addr')) {
      return 'location';
    }

    // Date
    if (key.includes('일자') || key.includes('날짜') || key.includes('date') ||
        key.includes('설립') || key.includes('estb')) {
      return 'date';
    }

    return 'other';
  }

  /**
   * Map API response to database schema
   */
  mapToSchema(apiResponse, structure) {
    try {
      const mappings = {
        company_info: {},
        financial: {},
        officers: []
      };

      if (!structure.itemsArray) {
        return mappings;
      }

      for (const item of structure.itemsArray) {
        // Map company info
        const companyMapping = this.mapCompanyInfo(item, structure.fields);
        if (Object.keys(companyMapping).length > 0) {
          mappings.company_info = { ...mappings.company_info, ...companyMapping };
        }

        // Map financial data
        const financialMapping = this.mapFinancialData(item, structure.fields);
        if (Object.keys(financialMapping).length > 0) {
          mappings.financial = { ...mappings.financial, ...financialMapping };
        }

        // Map officers (can have multiple)
        const officerMapping = this.mapOfficerData(item, structure.fields);
        if (Object.keys(officerMapping).length > 0) {
          mappings.officers.push(officerMapping);
        }
      }

      return mappings;
    } catch (error) {
      console.error('[SMEAnalyzer] Mapping error:', error.message);
      return null;
    }
  }

  /**
   * Map company information fields
   */
  mapCompanyInfo(item, fields) {
    const mapping = {};

    // Common field name patterns for company info
    const fieldPatterns = {
      business_number: ['bizrno', 'brno', '사업자등록번호', 'businessno'],
      company_name: ['corpnm', 'companynm', '회사명', '기업명', 'compnm'],
      ceo_name: ['ceonm', 'reprnm', 'rprsennm', '대표자', 'representative'],
      establishment_date: ['estbdt', 'establdt', '설립일', 'founddt'],
      industry_code: ['indutycd', 'induscode', '업종코드'],
      industry_name: ['indutynm', 'indusname', '업종명'],
      employee_count: ['enpscl', 'empcnt', '임직원수', 'employee'],
      address: ['addr', 'address', '주소', 'location'],
      phone: ['tel', 'phone', 'telno', '전화'],
      website: ['homepage', 'website', 'url', 'hmpg']
    };

    for (const [dbField, patterns] of Object.entries(fieldPatterns)) {
      for (const [key, value] of Object.entries(item)) {
        const keyLower = key.toLowerCase().replace(/[_\s]/g, '');
        if (patterns.some(pattern => keyLower.includes(pattern))) {
          mapping[dbField] = value;
          break;
        }
      }
    }

    return mapping;
  }

  /**
   * Map financial data fields
   */
  mapFinancialData(item, fields) {
    const mapping = {};

    const fieldPatterns = {
      revenue: ['매출', 'revenue', 'sales', 'slamt'],
      total_assets: ['총자산', 'totalasset', 'tast'],
      total_liabilities: ['총부채', 'totalliability', 'tliab'],
      total_equity: ['자본총계', 'totalequity', 'tequ'],
      operating_profit: ['영업이익', 'operatingprofit', 'opprft'],
      net_income: ['당기순이익', 'netincome', 'ntinc'],
      capital_stock: ['자본금', 'capital', 'capstk']
    };

    for (const [dbField, patterns] of Object.entries(fieldPatterns)) {
      for (const [key, value] of Object.entries(item)) {
        const keyLower = key.toLowerCase().replace(/[_\s]/g, '');
        if (patterns.some(pattern => keyLower.includes(pattern))) {
          // Convert to number if it's a numeric string
          mapping[dbField] = this.parseNumericValue(value);
          break;
        }
      }
    }

    return mapping;
  }

  /**
   * Map officer data fields
   */
  mapOfficerData(item, fields) {
    const mapping = {};

    const fieldPatterns = {
      name: ['성명', 'name', 'nm', 'personnm'],
      position: ['직위', 'position', 'pos', 'title'],
      department: ['부서', 'department', 'dept'],
      ownership_percentage: ['지분율', 'ownership', 'stake', 'share']
    };

    for (const [dbField, patterns] of Object.entries(fieldPatterns)) {
      for (const [key, value] of Object.entries(item)) {
        const keyLower = key.toLowerCase().replace(/[_\s]/g, '');
        if (patterns.some(pattern => keyLower.includes(pattern))) {
          mapping[dbField] = value;
          break;
        }
      }
    }

    return mapping;
  }

  /**
   * Parse numeric value (handles Korean number formats)
   */
  parseNumericValue(value) {
    if (typeof value === 'number') {
      return value;
    }

    if (typeof value === 'string') {
      // Remove commas and convert
      const cleaned = value.replace(/,/g, '');
      const parsed = parseFloat(cleaned);
      return isNaN(parsed) ? null : parsed;
    }

    return null;
  }

  /**
   * Analyze multiple SME APIs and create mapping configurations
   */
  async analyzeAllSMEApis() {
    try {
      console.log('[SMEAnalyzer] Starting comprehensive SME API analysis...\n');

      const smeApis = await this.getSMEApis();
      const results = [];

      for (const api of smeApis) {
        console.log(`\n[${results.length + 1}/${smeApis.length}] Analyzing: ${api.name}`);

        // Call API
        const response = await this.callApi(api);

        if (!response.success) {
          console.log(`  ❌ Failed: ${response.error}`);
          results.push({
            api: api,
            success: false,
            error: response.error
          });
          continue;
        }

        // Analyze structure
        const structure = this.analyzeStructure(response.data);

        if (!structure || !structure.itemsArray) {
          console.log(`  ⚠️  No data items found`);
          results.push({
            api: api,
            success: false,
            error: 'No data items in response'
          });
          continue;
        }

        // Create mapping
        const mapping = this.mapToSchema(response.data, structure);

        console.log(`  ✅ Success! Data path: ${structure.dataPath}, Items: ${structure.itemsArray.length}`);
        console.log(`     Fields found: ${Object.keys(structure.fields).length}`);
        console.log(`     - Company info fields: ${Object.keys(mapping.company_info).length}`);
        console.log(`     - Financial fields: ${Object.keys(mapping.financial).length}`);
        console.log(`     - Officer records: ${mapping.officers.length}`);

        results.push({
          api: api,
          success: true,
          structure: structure,
          mapping: mapping,
          sampleData: structure.sampleItem
        });

        // Delay between API calls
        await this.sleep(2000);
      }

      console.log(`\n[SMEAnalyzer] Analysis complete!`);
      console.log(`  Total APIs analyzed: ${results.length}`);
      console.log(`  Successful: ${results.filter(r => r.success).length}`);
      console.log(`  Failed: ${results.filter(r => !r.success).length}\n`);

      // Save results
      await this.saveAnalysisResults(results);

      return results;
    } catch (error) {
      console.error('[SMEAnalyzer] Analysis failed:', error.message);
      throw error;
    }
  }

  /**
   * Save analysis results to database for future use
   */
  async saveAnalysisResults(results) {
    try {
      for (const result of results) {
        if (!result.success) continue;

        const { api, structure, mapping } = result;

        // Determine data category
        let dataCategory = 'unknown';
        if (Object.keys(mapping.company_info).length > 0) dataCategory = 'company_info';
        if (Object.keys(mapping.financial).length > 0) dataCategory = 'financial';
        if (mapping.officers.length > 0) dataCategory = 'officers';

        // Create fields mapping
        const fieldsMapping = {};
        for (const [key, fieldInfo] of Object.entries(structure.fields)) {
          if (fieldInfo.category !== 'unknown') {
            fieldsMapping[key] = {
              db_category: fieldInfo.category,
              data_type: fieldInfo.type
            };
          }
        }

        // Save to sme_api_mapping table
        await sequelize.query(`
          INSERT INTO sme_api_mapping (api_id, data_category, fields_mapping, transform_rules)
          VALUES ($1, $2, $3, $4)
          ON CONFLICT (api_id, data_category) DO UPDATE
          SET fields_mapping = EXCLUDED.fields_mapping,
              transform_rules = EXCLUDED.transform_rules,
              updated_at = CURRENT_TIMESTAMP
        `, {
          bind: [
            api.api_id,
            dataCategory,
            JSON.stringify(fieldsMapping),
            JSON.stringify({ data_path: structure.dataPath })
          ]
        });
      }

      console.log('[SMEAnalyzer] Analysis results saved to database');
    } catch (error) {
      console.error('[SMEAnalyzer] Failed to save results:', error.message);
    }
  }

  /**
   * Sleep helper
   */
  async sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export default new SMEApiAnalyzer();

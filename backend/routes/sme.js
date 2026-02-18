import express from 'express';
import sequelize from '../config/database.js';
import companyDataService from '../services/companyDataService.js';
import adminAuth from '../middleware/adminAuth.js';
import { safeErrorMessage } from '../middleware/safeError.js';

const router = express.Router();

/**
 * SME API Routes (통합 버전)
 * DART + 공공데이터 우선순위 통합
 */

// ============================================
// 1. 검색 (사업자등록번호 또는 회사명)
// ============================================

/**
 * GET /api/sme/search
 * 사업자등록번호 또는 회사명으로 검색
 */
router.get('/search', async (req, res) => {
  try {
    const { q, page = 1, limit = 20 } = req.query;

    if (!q || q.trim().length < 2) {
      return res.status(400).json({
        success: false,
        error: '검색어를 2자 이상 입력해주세요'
      });
    }

    console.log(`[Search] Query: "${q}", Page: ${page}`);

    const result = await companyDataService.search(q.trim(), {
      page: parseInt(page),
      limit: parseInt(limit)
    });

    res.json({
      success: true,
      data: result.data,
      pagination: {
        page: result.page,
        limit: result.limit,
        total: result.total,
        totalPages: Math.ceil(result.total / result.limit)
      }
    });

  } catch (error) {
    console.error('[Search] Error:', error);
    res.status(500).json({
      success: false,
      error: safeErrorMessage(error)
    });
  }
});

// ============================================
// 2. 기업 상세 정보
// ============================================

/**
 * GET /api/sme/company/:id
 * 기업 상세 정보 조회 (사업자등록번호)
 * DART + 공공데이터 자동 병합
 */
router.get('/company/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { forceRefresh = false, includeConflicts = false } = req.query;

    console.log(`[Company Detail] Business Number: ${id}, Force Refresh: ${forceRefresh}`);

    const company = await companyDataService.getCompany(id, {
      forceRefresh: forceRefresh === 'true',
      includeConflicts: includeConflicts === 'true'
    });

    if (!company) {
      return res.status(404).json({
        success: false,
        error: '기업 정보를 찾을 수 없습니다'
      });
    }

    res.json({
      success: true,
      data: company
    });

  } catch (error) {
    console.error('[Company Detail] Error:', error);
    res.status(500).json({
      success: false,
      error: safeErrorMessage(error)
    });
  }
});

// ============================================
// 3. 데이터 수집 (수동 트리거)
// ============================================

/**
 * POST /api/sme/collect
 * 특정 기업 데이터 수집 (DART + 공공데이터)
 */
router.post('/collect', adminAuth, async (req, res) => {
  try {
    const { business_number, force_refresh = true } = req.body;

    if (!business_number) {
      return res.status(400).json({
        success: false,
        error: '사업자등록번호가 필요합니다'
      });
    }

    console.log(`[Collect] Triggering data collection for ${business_number}`);

    const company = await companyDataService.getCompany(business_number, {
      forceRefresh: force_refresh,
      includeConflicts: true
    });

    res.json({
      success: true,
      data: company,
      message: '데이터 수집 완료'
    });

  } catch (error) {
    console.error('[Collect] Error:', error);
    res.status(500).json({
      success: false,
      error: safeErrorMessage(error)
    });
  }
});

// ============================================
// 4. 랭킹
// ============================================

/**
 * GET /api/sme/rankings
 * 기업 랭킹 (매출, 영업이익률, ROE 등)
 */
router.get('/rankings', async (req, res) => {
  try {
    const { metric = 'revenue', limit = 50 } = req.query;

    const validMetrics = ['revenue', 'operating_margin', 'roe', 'employee_count'];
    if (!validMetrics.includes(metric)) {
      return res.status(400).json({
        success: false,
        error: `Invalid metric. Use one of: ${validMetrics.join(', ')}`
      });
    }

    // metric is validated above via validMetrics whitelist
    const safeMetric = metric; // already whitelisted
    const safeLimit = Math.min(Math.max(parseInt(limit) || 50, 1), 200);

    const [rankings] = await sequelize.query(`
      SELECT
        business_number, company_name, ceo_name, industry_name,
        revenue, operating_profit, operating_margin, roe,
        employee_count, venture_certification, innovation_certification,
        primary_source, data_quality_score
      FROM companies
      WHERE ${safeMetric} IS NOT NULL
      ORDER BY ${safeMetric} DESC
      LIMIT $1
    `, {
      bind: [safeLimit]
    });

    res.json({
      success: true,
      data: rankings
    });

  } catch (error) {
    console.error('[Rankings] Error:', error);
    res.status(500).json({
      success: false,
      error: safeErrorMessage(error)
    });
  }
});

// ============================================
// 5. 통계
// ============================================

/**
 * GET /api/sme/stats
 * 데이터 소스별 통계
 */
router.get('/stats', async (req, res) => {
  try {
    const [stats] = await sequelize.query(`
      SELECT
        primary_source,
        COUNT(*) as company_count,
        AVG(data_quality_score) as avg_quality_score,
        COUNT(CASE WHEN venture_certification THEN 1 END) as venture_count,
        COUNT(CASE WHEN innovation_certification THEN 1 END) as innobiz_count,
        COUNT(CASE WHEN listed THEN 1 END) as listed_count,
        AVG(revenue) as avg_revenue,
        MAX(last_updated) as last_update
      FROM companies
      GROUP BY primary_source
    `);

    res.json({
      success: true,
      data: stats
    });

  } catch (error) {
    console.error('[Stats] Error:', error);
    res.status(500).json({
      success: false,
      error: safeErrorMessage(error)
    });
  }
});

// ============================================
// 6. 산업별 조회
// ============================================

/**
 * GET /api/sme/industries
 * 산업 목록
 */
router.get('/industries', async (req, res) => {
  try {
    const [industries] = await sequelize.query(`
      SELECT
        industry_code,
        industry_name,
        COUNT(*) as company_count,
        AVG(revenue) as avg_revenue,
        AVG(employee_count) as avg_employees
      FROM companies
      WHERE industry_code IS NOT NULL
      GROUP BY industry_code, industry_name
      ORDER BY company_count DESC
    `);

    res.json({
      success: true,
      data: industries
    });

  } catch (error) {
    console.error('[Industries] Error:', error);
    res.status(500).json({
      success: false,
      error: safeErrorMessage(error)
    });
  }
});

/**
 * GET /api/sme/industry/:code
 * 특정 산업의 기업 목록
 */
router.get('/industry/:code', async (req, res) => {
  try {
    const { code } = req.params;
    const { page = 1, limit = 20, sortBy = 'revenue' } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    // Whitelist allowed sort columns to prevent SQL injection
    const validSortColumns = ['revenue', 'operating_margin', 'roe', 'employee_count', 'company_name', 'data_quality_score'];
    const safeSortBy = validSortColumns.includes(sortBy) ? sortBy : 'revenue';

    const [companies] = await sequelize.query(`
      SELECT
        business_number, company_name, ceo_name, industry_name,
        revenue, operating_margin, roe, employee_count,
        venture_certification, innovation_certification,
        primary_source, data_quality_score
      FROM companies
      WHERE industry_code = $1
      ORDER BY ${safeSortBy} DESC
      LIMIT $2 OFFSET $3
    `, {
      bind: [code, parseInt(limit), offset]
    });

    const [countResult] = await sequelize.query(`
      SELECT COUNT(*) as total
      FROM companies
      WHERE industry_code = $1
    `, { bind: [code] });

    res.json({
      success: true,
      companies,
      total: parseInt(countResult[0]?.total || 0),
      page: parseInt(page),
      limit: parseInt(limit)
    });

  } catch (error) {
    console.error('[Industry Companies] Error:', error);
    res.status(500).json({
      success: false,
      error: safeErrorMessage(error)
    });
  }
});

// ============================================
// 7. AI 추천
// ============================================

/**
 * GET /api/sme/recommendations
 * AI 기반 투자 추천 기업
 */
router.get('/recommendations', async (req, res) => {
  try {
    // 품질 점수, 재무지표 기반 추천
    const [recommended] = await sequelize.query(`
      SELECT
        business_number, company_name, ceo_name, industry_name,
        revenue, operating_profit, operating_margin, roe, debt_ratio,
        employee_count, venture_certification, innovation_certification,
        primary_source, data_quality_score,
        (
          COALESCE(data_quality_score, 0) * 0.3 +
          CASE WHEN operating_margin > 10 THEN 30 ELSE operating_margin * 3 END +
          CASE WHEN roe > 15 THEN 30 ELSE roe * 2 END +
          CASE WHEN venture_certification THEN 10 ELSE 0 END
        ) as recommendation_score
      FROM companies
      WHERE data_quality_score >= 60
        AND revenue IS NOT NULL
        AND operating_margin IS NOT NULL
      ORDER BY recommendation_score DESC
      LIMIT 20
    `);

    res.json({
      success: true,
      data: recommended
    });

  } catch (error) {
    console.error('[Recommendations] Error:', error);
    res.status(500).json({
      success: false,
      error: safeErrorMessage(error)
    });
  }
});

// ============================================
// 8. 지도 데이터
// ============================================

/**
 * GET /api/sme/map-data
 * 지역별 기업 분포 데이터
 */
router.get('/map-data', async (req, res) => {
  try {
    const { bounds } = req.query;

    // 지역별 통계 (간단 버전)
    const [stats] = await sequelize.query(`
      SELECT
        COUNT(*) as total_companies,
        AVG(revenue) as avg_revenue,
        COUNT(CASE WHEN venture_certification THEN 1 END) as venture_count,
        COUNT(CASE WHEN innovation_certification THEN 1 END) as innobiz_count
      FROM companies
    `);

    // 상위 기업
    const [topCompanies] = await sequelize.query(`
      SELECT
        business_number, company_name, address,
        revenue, operating_margin, data_quality_score
      FROM companies
      WHERE revenue IS NOT NULL
      ORDER BY revenue DESC
      LIMIT 10
    `);

    res.json({
      success: true,
      ...stats[0],
      top_companies: topCompanies
    });

  } catch (error) {
    console.error('[Map Data] Error:', error);
    res.status(500).json({
      success: false,
      error: safeErrorMessage(error)
    });
  }
});

export default router;

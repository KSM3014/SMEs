import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import sequelize, { initializeDatabase } from './config/database.js';
import sessionManager from './services/sessionManager.js';
import apiRefreshScheduler from './schedulers/apiRefresh.js';
import smeRoutes from './routes/sme.js';
import mockRoutes from './routes/mock.js';
import companyRoutes from './routes/company.js';
import adminAuth from './middleware/adminAuth.js';
import { safeErrorMessage } from './middleware/safeError.js';

dotenv.config();

/**
 * SME Investor Service - Main Server
 * Provides REST API for accessing collected data.go.kr APIs
 */

const app = express();
const PORT = process.env.PORT || 3000;

// ============================================
// Middleware
// ============================================

// Security headers
app.use(helmet());

// CORS configuration
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:3001',
  credentials: process.env.CORS_CREDENTIALS === 'true'
}));

// Request parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Logging
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
} else {
  app.use(morgan('combined'));
}

// Rate limiting (exclude SSE endpoints — long-lived connections)
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000'), // 15 minutes
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100'),
  message: 'Too many requests from this IP, please try again later.',
  skip: (req) => req.path.startsWith('/company/live/')
});

app.use('/api/', limiter);

// ============================================
// Root & Health Check
// ============================================

// Root endpoint - provide helpful information
app.get('/', (req, res) => {
  res.json({
    name: 'SME Investor Service API',
    version: '1.0.0',
    mode: 'MOCK',
    status: 'running',
    endpoints: {
      health: '/health',
      companyApi: '/api/company',
      smeApi: '/api/sme',
      mockApi: '/api/mock',
      frontend: 'http://localhost:3001'
    },
    availableCompanyEndpoints: [
      'GET /api/company/search?q={query}',
      'GET /api/company/search?brno={brno}&crno={crno}&name={name}',
      'GET /api/company/analyze/:brno',
      'GET /api/company/quick/:brno',
      'GET /api/company/sources',
      'POST /api/company/cache/clear'
    ],
    message: 'This is an API server. Visit http://localhost:3001 for the web interface.'
  });
});

app.get('/health', async (req, res) => {
  try {
    await sequelize.authenticate();

    const poolStatus = sessionManager.getPoolStatus();

    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      database: 'connected',
      sessionPool: {
        total: poolStatus.total,
        active: poolStatus.active,
        available: poolStatus.available
      },
      uptime: process.uptime(),
      memory: process.memoryUsage()
    });
  } catch (error) {
    res.status(500).json({
      status: 'unhealthy',
      error: safeErrorMessage(error)
    });
  }
});

// ============================================
// API Routes
// ============================================

// SME Routes (투자자용 중소기업 정보 API)
app.use('/api/sme', smeRoutes);

// Company Routes (Entity Resolution 기반 통합 검색)
app.use('/api/company', companyRoutes);

// Mock Routes (개발용 - DB 연결 없이 테스트)
app.use('/api/mock', mockRoutes);

// My APIs endpoints
app.get('/api/my-apis', async (req, res) => {
  try {
    const { category, status, page = 1, limit = 50 } = req.query;

    let whereClause = '';
    const params = [];

    if (category) {
      whereClause += ' AND category = $1';
      params.push(category);
    }

    if (status) {
      whereClause += ` AND status = $${params.length + 1}`;
      params.push(status);
    }

    const offset = (parseInt(page) - 1) * parseInt(limit);

    const [apis] = await sequelize.query(`
      SELECT id, api_id, name, endpoint, category, provider,
             description, status, request_quota, requests_used,
             response_format, http_method, last_tested_at, test_status,
             collected_at, updated_at
      FROM my_apis
      WHERE 1=1 ${whereClause}
      ORDER BY collected_at DESC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
    `, {
      bind: [...params, parseInt(limit), offset]
    });

    const [countResult] = await sequelize.query(`
      SELECT COUNT(*) as total FROM my_apis WHERE 1=1 ${whereClause}
    `, {
      bind: params
    });

    res.json({
      success: true,
      data: apis,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: parseInt(countResult[0]?.total || 0),
        totalPages: Math.ceil(parseInt(countResult[0]?.total || 0) / parseInt(limit))
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: safeErrorMessage(error)
    });
  }
});

// Public APIs endpoints
app.get('/api/public-apis', async (req, res) => {
  try {
    const { category, provider, search, page = 1, limit = 50 } = req.query;

    let whereClause = '';
    const params = [];

    if (category) {
      whereClause += ' AND category = $1';
      params.push(category);
    }

    if (provider) {
      whereClause += ` AND provider = $${params.length + 1}`;
      params.push(provider);
    }

    if (search) {
      whereClause += ` AND (name ILIKE $${params.length + 1} OR description ILIKE $${params.length + 1})`;
      params.push(`%${search}%`);
    }

    const offset = (parseInt(page) - 1) * parseInt(limit);

    const [apis] = await sequelize.query(`
      SELECT id, api_id, name, endpoint, category, subcategory, provider,
             description, format, auth_required, license, update_frequency,
             last_update, tags, popularity_score, collected_at, updated_at
      FROM public_apis
      WHERE 1=1 ${whereClause}
      ORDER BY popularity_score DESC, collected_at DESC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
    `, {
      bind: [...params, parseInt(limit), offset]
    });

    const [countResult] = await sequelize.query(`
      SELECT COUNT(*) as total FROM public_apis WHERE 1=1 ${whereClause}
    `, {
      bind: params
    });

    res.json({
      success: true,
      data: apis,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: parseInt(countResult[0]?.total || 0),
        totalPages: Math.ceil(parseInt(countResult[0]?.total || 0) / parseInt(limit))
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: safeErrorMessage(error)
    });
  }
});

// API categories summary
app.get('/api/categories', async (req, res) => {
  try {
    const [myApiCategories] = await sequelize.query(`
      SELECT category, COUNT(*) as count
      FROM my_apis
      GROUP BY category
      ORDER BY count DESC
    `);

    const [publicApiCategories] = await sequelize.query(`
      SELECT category, COUNT(*) as count
      FROM public_apis
      GROUP BY category
      ORDER BY count DESC
    `);

    res.json({
      success: true,
      data: {
        myApis: myApiCategories,
        publicApis: publicApiCategories
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: safeErrorMessage(error)
    });
  }
});

// Statistics endpoint
app.get('/api/stats', async (req, res) => {
  try {
    const [stats] = await sequelize.query(`
      SELECT
        (SELECT COUNT(*) FROM my_apis) as total_my_apis,
        (SELECT COUNT(*) FROM my_apis WHERE status = 'active') as active_my_apis,
        (SELECT COUNT(*) FROM public_apis) as total_public_apis,
        (SELECT COUNT(DISTINCT category) FROM public_apis) as total_categories,
        (SELECT COUNT(DISTINCT provider) FROM public_apis) as total_providers
    `);

    res.json({
      success: true,
      data: stats[0]
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: safeErrorMessage(error)
    });
  }
});

// Session pool status endpoint (admin only)
app.get('/api/sessions/status', adminAuth, (req, res) => {
  try {
    const status = sessionManager.getPoolStatus();
    res.json({
      success: true,
      data: status
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: safeErrorMessage(error)
    });
  }
});

// Collection logs endpoint (admin only)
app.get('/api/logs', adminAuth, async (req, res) => {
  try {
    const { logType, status, limit = 50 } = req.query;

    let whereClause = '';
    const params = [];

    if (logType) {
      whereClause += ' AND log_type = $1';
      params.push(logType);
    }

    if (status) {
      whereClause += ` AND status = $${params.length + 1}`;
      params.push(status);
    }

    const [logs] = await sequelize.query(`
      SELECT id, log_type, status, message, error_details,
             duration_ms, api_count, timestamp, metadata
      FROM collection_logs
      WHERE 1=1 ${whereClause}
      ORDER BY timestamp DESC
      LIMIT $${params.length + 1}
    `, {
      bind: [...params, parseInt(limit)]
    });

    res.json({
      success: true,
      data: logs
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: safeErrorMessage(error)
    });
  }
});

// ============================================
// Error Handling
// ============================================

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found'
  });
});

// Global error handler
app.use((err, req, res, _next) => {
  console.error('Server error:', err);

  res.status(err.status || 500).json({
    success: false,
    error: process.env.NODE_ENV === 'development' ? err.message : 'Internal server error'
  });
});

// ============================================
// Server Initialization
// ============================================

async function startServer() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  SME Investor Service - Starting Server');
  console.log('═══════════════════════════════════════════════════════════\n');

  try {
    // 1. Database 연결
    console.log('[1/3] Connecting to PostgreSQL...');
    await initializeDatabase();

    // 2. Session Pool 초기화 (필요시)
    // console.log('[2/3] Initializing session pool...');
    // await sessionManager.initializePool();

    // 3. Express 서버 시작
    console.log('[2/3] Starting Express server...');
    app.listen(PORT, () => {
      console.log('═══════════════════════════════════════════════════════════');
      console.log(`✅ Server running on port ${PORT}`);
      console.log(`   Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`   Mode: PRODUCTION (86 APIs + DART + Entity Resolution)`);
      console.log(`   Company API: http://localhost:${PORT}/api/company`);
      console.log(`   SME API: http://localhost:${PORT}/api/sme`);
      console.log(`   Mock API: http://localhost:${PORT}/api/mock`);
      console.log(`   Health: http://localhost:${PORT}/health`);
      console.log('═══════════════════════════════════════════════════════════\n');
      console.log('🎯 Ready to fetch company data from DART + Public APIs');
    });

  } catch (error) {
    console.error('❌ Server startup failed:', error.message);
    console.error('   Falling back to MOCK mode...\n');

    // Fallback: MOCK 모드로 실행
    app.listen(PORT, () => {
      console.log('⚠️  Running in MOCK MODE (DB connection failed)');
      console.log(`   Mock API: http://localhost:${PORT}/api/mock`);
    });
  }
}

// ============================================
// Graceful Shutdown
// ============================================

process.on('SIGTERM', async () => {
  console.log('\n[Shutdown] SIGTERM received, shutting down gracefully...');
  await shutdown();
});

process.on('SIGINT', async () => {
  console.log('\n[Shutdown] SIGINT received, shutting down gracefully...');
  await shutdown();
});

async function shutdown() {
  try {
    console.log('[Shutdown] Stopping schedulers...');
    apiRefreshScheduler.stop();

    console.log('[Shutdown] Closing session pool...');
    await sessionManager.shutdown();

    console.log('[Shutdown] Closing database connection...');
    await sequelize.close();

    console.log('✅ Shutdown complete');
    process.exit(0);
  } catch (error) {
    console.error('❌ Shutdown error:', error.message);
    process.exit(1);
  }
}

// Start server
startServer();

export default app;

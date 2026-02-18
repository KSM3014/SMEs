-- ============================================
-- SME Investor Service - PostgreSQL Database Schema
-- ============================================

-- Enable extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Drop existing tables (for development)
DROP TABLE IF EXISTS generated_apps CASCADE;
DROP TABLE IF EXISTS proposals CASCADE;
DROP TABLE IF EXISTS sessions CASCADE;
DROP TABLE IF EXISTS public_apis CASCADE;
DROP TABLE IF EXISTS my_apis CASCADE;
DROP TABLE IF EXISTS collection_logs CASCADE;

-- ============================================
-- 1. My APIs Table (96 authenticated APIs)
-- ============================================
CREATE TABLE my_apis (
    id SERIAL PRIMARY KEY,
    api_id VARCHAR(100) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    endpoint TEXT NOT NULL,
    api_key TEXT NOT NULL,                          -- AES-256 encrypted
    service_key TEXT,                               -- Some APIs use service_key instead
    category VARCHAR(100),
    subcategory VARCHAR(100),
    provider VARCHAR(200),
    description TEXT,
    status VARCHAR(50) DEFAULT 'active',            -- active, inactive, expired
    request_quota INT DEFAULT 1000,                 -- Daily quota
    requests_used INT DEFAULT 0,
    quota_reset_date DATE,
    response_format VARCHAR(20) DEFAULT 'JSON',     -- JSON, XML, CSV
    http_method VARCHAR(10) DEFAULT 'GET',          -- GET, POST
    required_params JSONB,                          -- Required parameters
    optional_params JSONB,                          -- Optional parameters
    sample_response JSONB,                          -- Sample API response
    last_tested_at TIMESTAMP,
    test_status VARCHAR(20),                        -- success, failed, pending
    collected_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    metadata JSONB,
    UNIQUE(endpoint)
);

-- Indexes for my_apis
CREATE INDEX idx_my_apis_category ON my_apis(category);
CREATE INDEX idx_my_apis_status ON my_apis(status);
CREATE INDEX idx_my_apis_provider ON my_apis(provider);
CREATE INDEX idx_my_apis_collected_at ON my_apis(collected_at DESC);

-- ============================================
-- 2. Public APIs Table (11,992 open APIs)
-- ============================================
CREATE TABLE public_apis (
    id SERIAL PRIMARY KEY,
    api_id VARCHAR(100) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    endpoint TEXT NOT NULL,
    category VARCHAR(100),
    subcategory VARCHAR(100),
    provider VARCHAR(200),
    description TEXT,
    format VARCHAR(20) DEFAULT 'JSON',              -- Response format
    auth_required BOOLEAN DEFAULT FALSE,
    license VARCHAR(100),
    update_frequency VARCHAR(50),                   -- Daily, Weekly, Monthly, etc.
    last_update DATE,
    data_size VARCHAR(50),                          -- Approximate data size
    tags TEXT[],                                    -- Array of tags
    related_apis INTEGER[],                         -- Array of related API IDs
    popularity_score INT DEFAULT 0,                 -- Usage popularity
    sample_response JSONB,
    collected_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    metadata JSONB,
    UNIQUE(endpoint)
);

-- Indexes for public_apis
CREATE INDEX idx_public_apis_category ON public_apis(category);
CREATE INDEX idx_public_apis_provider ON public_apis(provider);
CREATE INDEX idx_public_apis_auth_required ON public_apis(auth_required);
CREATE INDEX idx_public_apis_tags ON public_apis USING GIN(tags);
CREATE INDEX idx_public_apis_popularity ON public_apis(popularity_score DESC);

-- ============================================
-- 3. Service Proposals Table (LLM-generated ideas)
-- ============================================
CREATE TABLE proposals (
    id SERIAL PRIMARY KEY,
    uuid UUID DEFAULT uuid_generate_v4() UNIQUE,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    tagline VARCHAR(200),
    target_audience VARCHAR(200),
    apis_used JSONB NOT NULL,                       -- Array of API endpoints used
    api_combinations TEXT,                          -- Human-readable API combination description
    features JSONB,                                 -- Core features (array)
    differentiation TEXT,                           -- Key differentiators
    revenue_model TEXT,
    implementation_difficulty VARCHAR(20),          -- low, medium, high
    estimated_dev_time VARCHAR(50),                 -- e.g., "2-3 months"
    quality_score INT CHECK (quality_score >= 0 AND quality_score <= 10),
    evaluation_criteria JSONB,                      -- Detailed scoring breakdown
    status VARCHAR(20) DEFAULT 'draft',             -- draft, approved, rejected, implemented
    generated_app_id INT,
    trends_data JSONB,                              -- External research data
    similar_services JSONB,                         -- Competitive analysis
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    approved_at TIMESTAMP,
    metadata JSONB
);

-- Indexes for proposals
CREATE INDEX idx_proposals_status ON proposals(status);
CREATE INDEX idx_proposals_quality_score ON proposals(quality_score DESC);
CREATE INDEX idx_proposals_created_at ON proposals(created_at DESC);
CREATE INDEX idx_proposals_apis_used ON proposals USING GIN(apis_used);

-- ============================================
-- 4. Generated Apps Table (Auto-generated fullstack apps)
-- ============================================
CREATE TABLE generated_apps (
    id SERIAL PRIMARY KEY,
    uuid UUID DEFAULT uuid_generate_v4() UNIQUE,
    proposal_id INT REFERENCES proposals(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(255) UNIQUE NOT NULL,
    path TEXT NOT NULL,                             -- File system path
    tech_stack JSONB,                               -- Frontend, backend, DB choices
    database_type VARCHAR(20),                      -- PostgreSQL, MongoDB
    database_schema JSONB,                          -- Generated schema structure
    api_routes JSONB,                               -- List of API endpoints created
    frontend_components JSONB,                      -- List of React components
    status VARCHAR(20) DEFAULT 'building',          -- building, ready, error, archived
    build_log TEXT,                                 -- Build process logs
    error_log TEXT,                                 -- Error messages if failed
    build_started_at TIMESTAMP,
    build_completed_at TIMESTAMP,
    build_duration_seconds INT,
    last_run_at TIMESTAMP,
    deployment_url TEXT,                            -- Optional deployment URL
    github_repo TEXT,                               -- Optional GitHub repository
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    metadata JSONB
);

-- Indexes for generated_apps
CREATE INDEX idx_generated_apps_status ON generated_apps(status);
CREATE INDEX idx_generated_apps_proposal_id ON generated_apps(proposal_id);
CREATE INDEX idx_generated_apps_created_at ON generated_apps(created_at DESC);

-- ============================================
-- 5. Sessions Table (Multi-session pool management)
-- ============================================
CREATE TABLE sessions (
    id SERIAL PRIMARY KEY,
    session_id VARCHAR(255) UNIQUE NOT NULL,
    cookies JSONB NOT NULL,                         -- Browser cookies
    user_agent TEXT,
    viewport JSONB,                                 -- Viewport configuration
    active BOOLEAN DEFAULT TRUE,
    in_use BOOLEAN DEFAULT FALSE,                   -- Currently being used
    last_used TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_refreshed TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    refresh_count INT DEFAULT 0,
    error_count INT DEFAULT 0,
    last_error TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP,
    metadata JSONB
);

-- Indexes for sessions
CREATE INDEX idx_sessions_active ON sessions(active);
CREATE INDEX idx_sessions_in_use ON sessions(in_use);
CREATE INDEX idx_sessions_last_used ON sessions(last_used DESC);

-- ============================================
-- 6. Collection Logs Table (Monitoring and debugging)
-- ============================================
CREATE TABLE collection_logs (
    id SERIAL PRIMARY KEY,
    log_type VARCHAR(50) NOT NULL,                  -- login, api_collection, session_refresh
    session_id VARCHAR(255),
    status VARCHAR(20) NOT NULL,                    -- success, failed, warning
    message TEXT,
    error_details TEXT,
    duration_ms INT,
    api_count INT,                                  -- Number of APIs collected (if applicable)
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    metadata JSONB
);

-- Indexes for collection_logs
CREATE INDEX idx_collection_logs_type ON collection_logs(log_type);
CREATE INDEX idx_collection_logs_status ON collection_logs(status);
CREATE INDEX idx_collection_logs_timestamp ON collection_logs(timestamp DESC);
CREATE INDEX idx_collection_logs_session_id ON collection_logs(session_id);

-- ============================================
-- Triggers for updated_at timestamps
-- ============================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_my_apis_updated_at BEFORE UPDATE ON my_apis
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_public_apis_updated_at BEFORE UPDATE ON public_apis
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_proposals_updated_at BEFORE UPDATE ON proposals
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_generated_apps_updated_at BEFORE UPDATE ON generated_apps
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- Views for common queries
-- ============================================

-- Active APIs with decryption helper (use with caution)
CREATE OR REPLACE VIEW active_my_apis AS
SELECT
    id,
    api_id,
    name,
    endpoint,
    category,
    provider,
    status,
    request_quota,
    requests_used,
    last_tested_at,
    test_status
FROM my_apis
WHERE status = 'active';

-- API usage summary
CREATE OR REPLACE VIEW api_usage_summary AS
SELECT
    category,
    COUNT(*) as total_apis,
    SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active_apis,
    SUM(requests_used) as total_requests,
    AVG(requests_used::FLOAT / NULLIF(request_quota, 0) * 100) as avg_quota_usage
FROM my_apis
GROUP BY category;

-- Proposal quality distribution
CREATE OR REPLACE VIEW proposal_quality_distribution AS
SELECT
    CASE
        WHEN quality_score >= 9 THEN 'Excellent (9-10)'
        WHEN quality_score >= 7 THEN 'Good (7-8)'
        WHEN quality_score >= 5 THEN 'Average (5-6)'
        ELSE 'Below Average (<5)'
    END as quality_tier,
    COUNT(*) as count,
    ROUND(AVG(quality_score), 2) as avg_score
FROM proposals
GROUP BY quality_tier
ORDER BY avg_score DESC;

-- ============================================
-- Sample Data (for testing)
-- ============================================

-- Insert sample session (will be replaced by actual sessions)
INSERT INTO sessions (session_id, cookies, active) VALUES
('sess_initial', '[]'::jsonb, false);

-- ============================================
-- Grants (adjust based on your user)
-- ============================================

-- GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO your_db_user;
-- GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO your_db_user;

-- ============================================
-- Schema version tracking
-- ============================================

CREATE TABLE IF NOT EXISTS schema_version (
    version VARCHAR(20) PRIMARY KEY,
    applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    description TEXT
);

INSERT INTO schema_version (version, description) VALUES
('1.0.0', 'Initial schema with my_apis, public_apis, proposals, generated_apps, sessions, collection_logs');

-- ============================================
-- End of Schema
-- ============================================

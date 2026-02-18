-- ============================================
-- SME Company Information - Extended Schema
-- ============================================

-- Drop existing SME tables if they exist
DROP TABLE IF EXISTS sme_financial_statements CASCADE;
DROP TABLE IF EXISTS sme_officers CASCADE;
DROP TABLE IF EXISTS sme_board_members CASCADE;
DROP TABLE IF EXISTS sme_companies CASCADE;

-- ============================================
-- 1. SME Companies Master Table
-- ============================================
CREATE TABLE sme_companies (
    id SERIAL PRIMARY KEY,
    business_number VARCHAR(20) UNIQUE NOT NULL,     -- 사업자등록번호
    company_name VARCHAR(255) NOT NULL,              -- 회사명
    company_name_en VARCHAR(255),                    -- 영문 회사명
    ceo_name VARCHAR(100),                           -- 대표자명
    establishment_date DATE,                         -- 설립일
    company_type VARCHAR(50),                        -- 기업형태 (주식회사, 유한회사 등)
    industry_code VARCHAR(20),                       -- 업종코드
    industry_name VARCHAR(200),                      -- 업종명
    employee_count INT,                              -- 임직원 수
    capital_amount BIGINT,                           -- 자본금 (원)
    address TEXT,                                    -- 본사 주소
    address_detail TEXT,                             -- 상세 주소
    postal_code VARCHAR(10),                         -- 우편번호
    phone VARCHAR(20),                               -- 전화번호
    fax VARCHAR(20),                                 -- 팩스
    email VARCHAR(100),                              -- 이메일
    website TEXT,                                    -- 홈페이지
    description TEXT,                                -- 회사 소개
    main_products TEXT,                              -- 주요 제품/서비스
    certifications TEXT[],                           -- 인증 현황
    awards TEXT[],                                   -- 수상 내역
    status VARCHAR(20) DEFAULT 'active',             -- 영업상태 (active, suspended, closed)
    venture_certification BOOLEAN DEFAULT FALSE,     -- 벤처기업 인증 여부
    innovation_certification BOOLEAN DEFAULT FALSE,  -- 이노비즈 인증 여부
    main_firm_certification BOOLEAN DEFAULT FALSE,   -- 메인비즈 인증 여부
    api_sources JSONB,                               -- 데이터 출처 API 목록
    last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    metadata JSONB
);

-- ============================================
-- 2. SME Financial Statements (재무제표)
-- ============================================
CREATE TABLE sme_financial_statements (
    id SERIAL PRIMARY KEY,
    company_id INT REFERENCES sme_companies(id) ON DELETE CASCADE,
    fiscal_year INT NOT NULL,                        -- 회계연도
    quarter VARCHAR(2),                              -- 분기 (Q1, Q2, Q3, Q4, YR=연간)
    statement_type VARCHAR(20) NOT NULL,             -- 재무제표 유형 (BS=대차대조표, IS=손익계산서, CF=현금흐름표)

    -- 대차대조표 (Balance Sheet) 항목
    total_assets BIGINT,                             -- 총 자산
    current_assets BIGINT,                           -- 유동 자산
    non_current_assets BIGINT,                       -- 비유동 자산
    total_liabilities BIGINT,                        -- 총 부채
    current_liabilities BIGINT,                      -- 유동 부채
    non_current_liabilities BIGINT,                  -- 비유동 부채
    total_equity BIGINT,                             -- 총 자본
    capital_stock BIGINT,                            -- 자본금
    retained_earnings BIGINT,                        -- 이익잉여금

    -- 손익계산서 (Income Statement) 항목
    revenue BIGINT,                                  -- 매출액
    cost_of_sales BIGINT,                            -- 매출원가
    gross_profit BIGINT,                             -- 매출총이익
    operating_expenses BIGINT,                       -- 판매비와관리비
    operating_profit BIGINT,                         -- 영업이익
    non_operating_income BIGINT,                     -- 영업외수익
    non_operating_expenses BIGINT,                   -- 영업외비용
    income_before_tax BIGINT,                        -- 법인세차감전순이익
    income_tax_expense BIGINT,                       -- 법인세비용
    net_income BIGINT,                               -- 당기순이익

    -- 현금흐름표 (Cash Flow Statement) 항목
    operating_cash_flow BIGINT,                      -- 영업활동 현금흐름
    investing_cash_flow BIGINT,                      -- 투자활동 현금흐름
    financing_cash_flow BIGINT,                      -- 재무활동 현금흐름
    cash_increase BIGINT,                            -- 현금 증가액

    -- 재무비율 (Calculated Ratios)
    debt_ratio DECIMAL(10, 2),                       -- 부채비율 (%)
    current_ratio DECIMAL(10, 2),                    -- 유동비율 (%)
    roe DECIMAL(10, 2),                              -- 자기자본이익률 ROE (%)
    roa DECIMAL(10, 2),                              -- 총자산이익률 ROA (%)
    gross_profit_margin DECIMAL(10, 2),              -- 매출총이익률 (%)
    operating_profit_margin DECIMAL(10, 2),          -- 영업이익률 (%)
    net_profit_margin DECIMAL(10, 2),                -- 순이익률 (%)

    api_source VARCHAR(255),                         -- 데이터 출처 API
    data_quality_score INT,                          -- 데이터 품질 점수 (1-10)
    last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    metadata JSONB,

    UNIQUE(company_id, fiscal_year, quarter, statement_type)
);

-- ============================================
-- 3. SME Officers (임원 정보)
-- ============================================
CREATE TABLE sme_officers (
    id SERIAL PRIMARY KEY,
    company_id INT REFERENCES sme_companies(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,                      -- 성명
    position VARCHAR(100),                           -- 직위 (대표이사, 사내이사, 사외이사 등)
    position_type VARCHAR(20),                       -- 직위 유형 (CEO, CFO, COO, CTO, etc.)
    department VARCHAR(100),                         -- 담당 부서
    appointment_date DATE,                           -- 취임일
    resignation_date DATE,                           -- 퇴임일
    is_current BOOLEAN DEFAULT TRUE,                 -- 현직 여부
    ownership_shares BIGINT,                         -- 보유 주식 수
    ownership_percentage DECIMAL(10, 4),             -- 지분율 (%)
    education TEXT,                                  -- 학력
    career TEXT,                                     -- 주요 경력
    photo_url TEXT,                                  -- 사진 URL
    api_source VARCHAR(255),
    last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    metadata JSONB
);

-- ============================================
-- 4. SME Board Members (이사회 구성원)
-- ============================================
CREATE TABLE sme_board_members (
    id SERIAL PRIMARY KEY,
    company_id INT REFERENCES sme_companies(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,                      -- 성명
    member_type VARCHAR(50),                         -- 유형 (사내이사, 사외이사, 감사위원 등)
    committee VARCHAR(100),                          -- 위원회 (감사위원회, 보상위원회 등)
    appointment_date DATE,                           -- 선임일
    term_end_date DATE,                              -- 임기 종료일
    is_independent BOOLEAN,                          -- 독립성 여부
    attendance_rate DECIMAL(5, 2),                   -- 이사회 참석률 (%)
    expertise TEXT,                                  -- 전문분야
    other_positions TEXT,                            -- 타사 겸직 현황
    api_source VARCHAR(255),
    last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    metadata JSONB
);

-- ============================================
-- 5. SME API Mapping (어떤 API에서 어떤 데이터를 가져올지)
-- ============================================
CREATE TABLE sme_api_mapping (
    id SERIAL PRIMARY KEY,
    api_id VARCHAR(100) REFERENCES my_apis(api_id),
    data_category VARCHAR(50) NOT NULL,              -- company_info, financial, officers, board
    fields_mapping JSONB NOT NULL,                   -- API 응답 필드 → DB 컬럼 매핑
    transform_rules JSONB,                           -- 데이터 변환 규칙
    is_active BOOLEAN DEFAULT TRUE,
    priority INT DEFAULT 1,                          -- 우선순위 (여러 API에서 같은 데이터 제공 시)
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- Indexes for Performance
-- ============================================

CREATE INDEX idx_sme_companies_business_number ON sme_companies(business_number);
CREATE INDEX idx_sme_companies_name ON sme_companies(company_name);
CREATE INDEX idx_sme_companies_industry ON sme_companies(industry_code);
CREATE INDEX idx_sme_companies_status ON sme_companies(status);

CREATE INDEX idx_sme_financial_company_year ON sme_financial_statements(company_id, fiscal_year DESC);
CREATE INDEX idx_sme_financial_year ON sme_financial_statements(fiscal_year DESC);
CREATE INDEX idx_sme_financial_type ON sme_financial_statements(statement_type);

CREATE INDEX idx_sme_officers_company ON sme_officers(company_id);
CREATE INDEX idx_sme_officers_current ON sme_officers(company_id, is_current);
CREATE INDEX idx_sme_officers_position ON sme_officers(position_type);

CREATE INDEX idx_sme_board_company ON sme_board_members(company_id);
CREATE INDEX idx_sme_board_type ON sme_board_members(member_type);

CREATE INDEX idx_sme_api_mapping_category ON sme_api_mapping(data_category);
CREATE INDEX idx_sme_api_mapping_active ON sme_api_mapping(is_active);

-- ============================================
-- Views for Common Queries
-- ============================================

-- Latest financial data per company
CREATE OR REPLACE VIEW sme_latest_financials AS
SELECT DISTINCT ON (company_id)
    company_id,
    fiscal_year,
    quarter,
    revenue,
    operating_profit,
    net_income,
    total_assets,
    total_liabilities,
    total_equity,
    debt_ratio,
    roe,
    operating_profit_margin
FROM sme_financial_statements
ORDER BY company_id, fiscal_year DESC,
    CASE quarter
        WHEN 'YR' THEN 5
        WHEN 'Q4' THEN 4
        WHEN 'Q3' THEN 3
        WHEN 'Q2' THEN 2
        WHEN 'Q1' THEN 1
        ELSE 0
    END DESC;

-- Current officers per company
CREATE OR REPLACE VIEW sme_current_officers AS
SELECT
    o.*,
    c.company_name
FROM sme_officers o
JOIN sme_companies c ON o.company_id = c.id
WHERE o.is_current = TRUE
ORDER BY c.company_name, o.position_type;

-- Company overview with latest financials
CREATE OR REPLACE VIEW sme_company_overview AS
SELECT
    c.*,
    f.fiscal_year,
    f.revenue,
    f.operating_profit,
    f.net_income,
    f.total_assets,
    f.debt_ratio,
    f.roe
FROM sme_companies c
LEFT JOIN sme_latest_financials f ON c.id = f.company_id
WHERE c.status = 'active';

-- ============================================
-- Functions for Data Quality
-- ============================================

-- Calculate financial ratios automatically
CREATE OR REPLACE FUNCTION calculate_financial_ratios()
RETURNS TRIGGER AS $$
BEGIN
    -- Debt Ratio (부채비율)
    IF NEW.total_equity > 0 THEN
        NEW.debt_ratio := ROUND((NEW.total_liabilities::DECIMAL / NEW.total_equity * 100), 2);
    END IF;

    -- Current Ratio (유동비율)
    IF NEW.current_liabilities > 0 THEN
        NEW.current_ratio := ROUND((NEW.current_assets::DECIMAL / NEW.current_liabilities * 100), 2);
    END IF;

    -- ROE (자기자본이익률)
    IF NEW.total_equity > 0 AND NEW.net_income IS NOT NULL THEN
        NEW.roe := ROUND((NEW.net_income::DECIMAL / NEW.total_equity * 100), 2);
    END IF;

    -- ROA (총자산이익률)
    IF NEW.total_assets > 0 AND NEW.net_income IS NOT NULL THEN
        NEW.roa := ROUND((NEW.net_income::DECIMAL / NEW.total_assets * 100), 2);
    END IF;

    -- Gross Profit Margin (매출총이익률)
    IF NEW.revenue > 0 AND NEW.gross_profit IS NOT NULL THEN
        NEW.gross_profit_margin := ROUND((NEW.gross_profit::DECIMAL / NEW.revenue * 100), 2);
    END IF;

    -- Operating Profit Margin (영업이익률)
    IF NEW.revenue > 0 AND NEW.operating_profit IS NOT NULL THEN
        NEW.operating_profit_margin := ROUND((NEW.operating_profit::DECIMAL / NEW.revenue * 100), 2);
    END IF;

    -- Net Profit Margin (순이익률)
    IF NEW.revenue > 0 AND NEW.net_income IS NOT NULL THEN
        NEW.net_profit_margin := ROUND((NEW.net_income::DECIMAL / NEW.revenue * 100), 2);
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_calculate_ratios
BEFORE INSERT OR UPDATE ON sme_financial_statements
FOR EACH ROW
EXECUTE FUNCTION calculate_financial_ratios();

-- ============================================
-- Sample API Mappings (to be populated)
-- ============================================

-- Example: 중소기업 현황정보 API 매핑
-- INSERT INTO sme_api_mapping (api_id, data_category, fields_mapping) VALUES
-- ('my_abc123', 'company_info', '{
--   "bizrno": "business_number",
--   "corpNm": "company_name",
--   "estbDt": "establishment_date",
--   "indutyNm": "industry_name",
--   "enpSclCdNm": "company_type"
-- }'::jsonb);

-- ============================================
-- Schema Version
-- ============================================

INSERT INTO schema_version (version, description) VALUES
('1.1.0', 'SME company information schema - companies, financials, officers, board members');

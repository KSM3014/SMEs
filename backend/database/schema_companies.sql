-- 기업 정보 통합 테이블
-- 사업자등록번호를 Primary Key로 사용

CREATE TABLE IF NOT EXISTS companies (
  -- 기본 식별정보
  business_number VARCHAR(12) PRIMARY KEY,
  company_name VARCHAR(255) NOT NULL,
  ceo_name VARCHAR(255),

  -- 기본 정보
  address TEXT,
  phone VARCHAR(20),
  email VARCHAR(255),
  website VARCHAR(255),
  establishment_date DATE,
  employee_count INTEGER,

  -- 업종 정보
  industry_name VARCHAR(255),
  industry_code VARCHAR(10),

  -- 재무 정보
  revenue BIGINT,              -- 매출액
  operating_profit BIGINT,     -- 영업이익
  net_profit BIGINT,           -- 당기순이익
  operating_margin DECIMAL(5,2), -- 영업이익률 (%)
  roe DECIMAL(5,2),            -- ROE (%)
  debt_ratio DECIMAL(6,2),     -- 부채비율 (%)

  -- 재무상태표
  total_assets BIGINT,         -- 자산총계
  total_liabilities BIGINT,    -- 부채총계
  total_equity BIGINT,         -- 자본총계

  -- 인증 정보
  venture_certification BOOLEAN DEFAULT FALSE,
  innovation_certification BOOLEAN DEFAULT FALSE,
  main_biz_certification BOOLEAN DEFAULT FALSE,

  -- 상장 정보
  listed BOOLEAN DEFAULT FALSE,
  stock_code VARCHAR(10),
  market_cap BIGINT,

  -- DART 정보
  corp_code VARCHAR(8),        -- DART 고유번호

  -- 데이터 소스 (JSONB)
  dart_data JSONB,             -- DART에서 가져온 원본 데이터
  public_data JSONB,           -- 공공데이터에서 가져온 원본 데이터
  other_data JSONB,            -- 기타 출처 데이터
  merged_data JSONB,           -- 병합된 최종 데이터

  -- 메타데이터
  primary_source VARCHAR(20),  -- 주 데이터 출처 (DART, PUBLIC, OTHER)
  data_quality_score INTEGER,  -- 데이터 품질 점수 (0-100)

  -- 타임스탬프
  last_updated TIMESTAMP,      -- 데이터 최종 업데이트 시간
  fetched_at TIMESTAMP,        -- 조회 시간
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 인덱스 생성
CREATE INDEX IF NOT EXISTS idx_companies_name ON companies(company_name);
CREATE INDEX IF NOT EXISTS idx_companies_industry ON companies(industry_code);
CREATE INDEX IF NOT EXISTS idx_companies_revenue ON companies(revenue DESC);
CREATE INDEX IF NOT EXISTS idx_companies_quality ON companies(data_quality_score DESC);
CREATE INDEX IF NOT EXISTS idx_companies_source ON companies(primary_source);
CREATE INDEX IF NOT EXISTS idx_companies_updated ON companies(last_updated DESC);

-- Full text search index (PostgreSQL)
CREATE INDEX IF NOT EXISTS idx_companies_name_fts ON companies
USING gin(to_tsvector('korean', company_name));

-- 업데이트 트리거 (updated_at 자동 갱신)
CREATE OR REPLACE FUNCTION update_companies_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_companies_updated_at
  BEFORE UPDATE ON companies
  FOR EACH ROW
  EXECUTE FUNCTION update_companies_updated_at();

-- 데이터 통계 뷰
CREATE OR REPLACE VIEW companies_stats AS
SELECT
  primary_source,
  COUNT(*) as company_count,
  AVG(data_quality_score) as avg_quality_score,
  COUNT(CASE WHEN venture_certification THEN 1 END) as venture_count,
  COUNT(CASE WHEN innovation_certification THEN 1 END) as innobiz_count,
  COUNT(CASE WHEN listed THEN 1 END) as listed_count,
  AVG(revenue) as avg_revenue,
  AVG(employee_count) as avg_employees,
  MAX(last_updated) as last_data_update
FROM companies
GROUP BY primary_source;

-- 코멘트 추가
COMMENT ON TABLE companies IS '기업 정보 통합 테이블 - DART, 공공데이터, 기타 출처 병합';
COMMENT ON COLUMN companies.business_number IS '사업자등록번호 (Primary Key)';
COMMENT ON COLUMN companies.primary_source IS '주 데이터 출처: DART > PUBLIC > OTHER 우선순위';
COMMENT ON COLUMN companies.data_quality_score IS '데이터 품질 점수 0-100 (높을수록 완전한 데이터)';
COMMENT ON COLUMN companies.merged_data IS '우선순위에 따라 병합된 최종 데이터 (JSONB)';

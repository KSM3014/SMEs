-- My APIs 테이블 (data.go.kr 마이페이지에서 수집한 96개 API)
-- 사용자가 신청한 인증 API 정보 저장

CREATE TABLE IF NOT EXISTS my_apis (
  -- 기본 식별정보
  id SERIAL PRIMARY KEY,
  api_id VARCHAR(50) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  endpoint TEXT NOT NULL UNIQUE,

  -- 보안 정보 (암호화된 API 키)
  api_key TEXT NOT NULL,  -- AES-256 암호화

  -- API 메타데이터
  category VARCHAR(100),
  provider VARCHAR(255),
  description TEXT,
  status VARCHAR(20) DEFAULT 'active',

  -- 할당량 및 사용량
  request_quota INTEGER DEFAULT 1000,
  requests_used INTEGER DEFAULT 0,

  -- API 스펙
  response_format VARCHAR(20) DEFAULT 'JSON',
  http_method VARCHAR(10) DEFAULT 'GET',

  -- 테스트 결과
  last_tested_at TIMESTAMP,
  test_status VARCHAR(20),
  sample_response JSONB,

  -- 타임스탬프
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 인덱스 생성
CREATE INDEX IF NOT EXISTS idx_my_apis_name ON my_apis(name);
CREATE INDEX IF NOT EXISTS idx_my_apis_category ON my_apis(category);
CREATE INDEX IF NOT EXISTS idx_my_apis_status ON my_apis(status);
CREATE INDEX IF NOT EXISTS idx_my_apis_provider ON my_apis(provider);

-- 업데이트 트리거
CREATE OR REPLACE FUNCTION update_my_apis_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_my_apis_updated_at
  BEFORE UPDATE ON my_apis
  FOR EACH ROW
  EXECUTE FUNCTION update_my_apis_updated_at();

-- 코멘트
COMMENT ON TABLE my_apis IS 'data.go.kr 마이페이지에서 수집한 사용자 신청 API 목록 (96건)';
COMMENT ON COLUMN my_apis.api_key IS 'AES-256 암호화된 API 키';
COMMENT ON COLUMN my_apis.request_quota IS '일일 또는 월간 요청 할당량';
COMMENT ON COLUMN my_apis.requests_used IS '사용된 요청 수';

-- Collection Logs 테이블
-- API 수집 작업 로그 기록

CREATE TABLE IF NOT EXISTS collection_logs (
  id SERIAL PRIMARY KEY,
  log_type VARCHAR(50) NOT NULL,
  status VARCHAR(20) NOT NULL,
  message TEXT,
  metadata JSONB,

  -- 수집 통계
  api_count INTEGER,
  duration_ms INTEGER,
  session_id VARCHAR(255),

  -- 타임스탬프
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 인덱스 생성
CREATE INDEX IF NOT EXISTS idx_collection_logs_type ON collection_logs(log_type);
CREATE INDEX IF NOT EXISTS idx_collection_logs_status ON collection_logs(status);
CREATE INDEX IF NOT EXISTS idx_collection_logs_created ON collection_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_collection_logs_session ON collection_logs(session_id);

-- 코멘트
COMMENT ON TABLE collection_logs IS 'API 수집 작업 이벤트 로그';
COMMENT ON COLUMN collection_logs.log_type IS '로그 타입: my_apis_collection, public_apis_collection 등';
COMMENT ON COLUMN collection_logs.metadata IS '추가 메타데이터 (JSON)';

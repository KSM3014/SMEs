-- Sessions 테이블
-- 세션 풀 관리용 테이블

CREATE TABLE IF NOT EXISTS sessions (
  id SERIAL PRIMARY KEY,
  session_id VARCHAR(255) UNIQUE NOT NULL,
  cookies JSONB,
  active BOOLEAN DEFAULT TRUE,
  in_use BOOLEAN DEFAULT FALSE,

  -- 타임스탬프
  last_used TIMESTAMP,
  last_refreshed TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP,

  -- 카운터
  refresh_count INTEGER DEFAULT 0,
  error_count INTEGER DEFAULT 0,

  -- 메타데이터
  metadata JSONB
);

-- 인덱스 생성
CREATE INDEX IF NOT EXISTS idx_sessions_id ON sessions(session_id);
CREATE INDEX IF NOT EXISTS idx_sessions_active ON sessions(active);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);

-- 코멘트
COMMENT ON TABLE sessions IS '세션 풀 관리 테이블';
COMMENT ON COLUMN sessions.session_id IS '고유 세션 ID (UUID)';
COMMENT ON COLUMN sessions.cookies IS '브라우저 쿠키 (JSON)';

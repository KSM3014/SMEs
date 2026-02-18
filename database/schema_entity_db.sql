-- ============================================================
-- Entity DB Schema — Phase 4: 데이터 DB화
-- 4 tables: entity_registry, entity_source_data, source_crosscheck, batch_collection_log
-- ============================================================

-- 1. entity_registry: 엔티티 메인 테이블 (1 row per 기업)
CREATE TABLE IF NOT EXISTS entity_registry (
  id              SERIAL PRIMARY KEY,
  entity_id       VARCHAR(50) UNIQUE NOT NULL,
  brno            VARCHAR(20),
  crno            VARCHAR(20),
  canonical_name  VARCHAR(200),
  name_variants   TEXT[],
  confidence      DECIMAL(5,4),
  match_level     VARCHAR(20),
  sources_count   SMALLINT DEFAULT 0,
  sources         TEXT[],
  last_fetched_at TIMESTAMP,
  refresh_due_at  TIMESTAMP,
  is_stale        BOOLEAN DEFAULT FALSE,
  batch_id        VARCHAR(50),
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT entity_brno_or_crno CHECK (brno IS NOT NULL OR crno IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_entity_brno   ON entity_registry(brno);
CREATE INDEX IF NOT EXISTS idx_entity_crno   ON entity_registry(crno);
CREATE INDEX IF NOT EXISTS idx_entity_stale  ON entity_registry(is_stale, refresh_due_at);
CREATE INDEX IF NOT EXISTS idx_entity_batch  ON entity_registry(batch_id);

-- Trigger: auto-update updated_at
CREATE OR REPLACE FUNCTION update_entity_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_entity_updated_at ON entity_registry;
CREATE TRIGGER trg_entity_updated_at
  BEFORE UPDATE ON entity_registry
  FOR EACH ROW EXECUTE FUNCTION update_entity_updated_at();


-- 2. entity_source_data: API별 원본 데이터 (1 row per entity × source)
CREATE TABLE IF NOT EXISTS entity_source_data (
  id              SERIAL PRIMARY KEY,
  entity_id       VARCHAR(50) NOT NULL REFERENCES entity_registry(entity_id) ON DELETE CASCADE,
  source_name     VARCHAR(200) NOT NULL,
  raw_data        JSONB NOT NULL,
  brno            VARCHAR(20),
  crno            VARCHAR(20),
  company_name    VARCHAR(200),
  address         TEXT,
  representative  VARCHAR(100),
  industry_code   VARCHAR(20),
  fetched_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  is_current      BOOLEAN DEFAULT TRUE,

  UNIQUE (entity_id, source_name)
);

CREATE INDEX IF NOT EXISTS idx_source_entity  ON entity_source_data(entity_id);
CREATE INDEX IF NOT EXISTS idx_source_name    ON entity_source_data(source_name);
CREATE INDEX IF NOT EXISTS idx_source_fetched ON entity_source_data(fetched_at DESC);
CREATE INDEX IF NOT EXISTS idx_source_brno    ON entity_source_data(brno);


-- 3. source_crosscheck: 소스간 교차 검증 결과
CREATE TABLE IF NOT EXISTS source_crosscheck (
  id              SERIAL PRIMARY KEY,
  entity_id       VARCHAR(50) NOT NULL REFERENCES entity_registry(entity_id) ON DELETE CASCADE,
  source_a        VARCHAR(200) NOT NULL,
  source_b        VARCHAR(200) NOT NULL,
  field           VARCHAR(50) NOT NULL,
  value_a         TEXT,
  value_b         TEXT,
  is_conflict     BOOLEAN NOT NULL,
  similarity      DECIMAL(5,4),
  checked_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  UNIQUE (entity_id, source_a, source_b, field)
);

CREATE INDEX IF NOT EXISTS idx_crosscheck_entity   ON source_crosscheck(entity_id);
CREATE INDEX IF NOT EXISTS idx_crosscheck_conflict ON source_crosscheck(is_conflict, checked_at DESC);


-- 4. batch_collection_log: 배치 실행 이력
CREATE TABLE IF NOT EXISTS batch_collection_log (
  id              SERIAL PRIMARY KEY,
  batch_id        VARCHAR(50) UNIQUE NOT NULL,
  input_source    VARCHAR(100),
  total_companies INTEGER DEFAULT 0,
  processed       INTEGER DEFAULT 0,
  succeeded       INTEGER DEFAULT 0,
  failed          INTEGER DEFAULT 0,
  status          VARCHAR(20) DEFAULT 'running',
  started_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  completed_at    TIMESTAMP,
  error_log       JSONB,
  metadata        JSONB
);

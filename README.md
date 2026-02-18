# SME Investor Service

**중소기업 투자자 정보 통합 플랫폼**

data.go.kr의 96개 인증 API와 11,992개 공개 API를 자동 수집하여 중소기업 정보를 통합하고, 투자자에게 최적화된 랜딩 페이지를 제공하는 풀스택 웹 애플리케이션 자동 생성 시스템입니다.

## 🎯 Project Overview

### 핵심 기능
1. **Phase 1: 데이터 수집**
   - data.go.kr 자동 로그인 (Puppeteer + OCR 보안문자 인식)
   - 다중 세션 풀 관리 (5개 동시 세션으로 bottleneck 방지)
   - 마이페이지 API 96건 자동 수집 (인증 필요)
   - 공개 API 11,992건 자동 수집
   - 주기적 자동 갱신 (Public APIs: 매일 새벽 3시, My APIs: 매주 월요일 9시)

2. **Phase 2: 서비스 제안** (Coming Soon)
   - 외부 트렌드 리서치 (Google Trends, ProductHunt)
   - LLM 기반 서비스 아이디어 자동 생성 (일 3개)
   - 품질 자기 검증 (점수 8점 이상만 승인)

3. **Phase 3: 풀스택 앱 자동 생성** (Coming Soon)
   - API 응답 구조 자동 분석
   - DB 스키마 자동 설계 (MongoDB/PostgreSQL)
   - 백엔드 코드 자동 생성 (Express + API 프록시)
   - 프론트엔드 코드 자동 생성 (React)
   - 보안 강화 (API 키 완전 은닉)

### 보안 우선
⚠️ **CRITICAL**: API 키는 절대 프론트엔드에 노출되지 않습니다
- 백엔드 프록시 패턴 사용
- AES-256 암호화로 DB 저장
- 환경변수로 민감 정보 관리

---

## 📋 Prerequisites

### Required
- **Node.js**: v18.0.0 이상
- **PostgreSQL**: v14 이상
- **npm**: v9.0.0 이상

### Optional
- **Docker**: 컨테이너 실행 시
- **Google Chrome**: Puppeteer가 자동 설치

---

## 🚀 Quick Start

### 1. Installation

```bash
# Clone repository (if applicable)
cd C:\Users\Administrator\Desktop\Projects\SMEs

# Install backend dependencies
cd backend
npm install

# Copy environment template
cp ../.env.example ../.env
```

### 2. Database Setup

**PostgreSQL 설치 및 DB 생성:**

```bash
# PostgreSQL 접속
psql -U postgres

# DB 생성
CREATE DATABASE sme_investor_db;

# 스키마 적용
psql -U postgres -d sme_investor_db -f database/schema.sql
```

### 3. Environment Configuration

`.env` 파일을 열고 다음 정보를 입력하세요:

```env
# data.go.kr 계정 (필수!)
DATAGOER_EMAIL=your_email@example.com
DATAGOER_PASSWORD=your_password

# Database (PostgreSQL)
DB_HOST=localhost
DB_PORT=5432
DB_NAME=sme_investor_db
DB_USER=postgres
DB_PASSWORD=your_db_password

# Security Keys (아래 명령어로 생성)
JWT_SECRET=your_jwt_secret_32_chars_min
ENCRYPTION_KEY=your_aes256_key_exactly_32chars
ENCRYPTION_IV=your_iv_16chars

# Optional: LLM (Phase 2용)
OPENAI_API_KEY=your_openai_api_key
```

**보안 키 생성 방법:**
```bash
# JWT Secret (32+ characters)
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Encryption Key (정확히 32 characters)
node -e "console.log(require('crypto').randomBytes(16).toString('hex'))"

# Encryption IV (정확히 16 characters)
node -e "console.log(require('crypto').randomBytes(8).toString('hex'))"
```

### 4. Initial Collection (첫 실행 시 필수!)

**Phase 1: 모든 API 수집 (1회 실행)**

```bash
cd backend
npm run collect:init
```

**예상 소요 시간:**
- My APIs (96건): ~2-5분
- Public APIs (11,992건): ~20-40분
- **Total**: 약 30-45분

**진행 상황 예시:**
```
[Step 1/4] Initializing database connection...
✅ Database ready

[Step 2/4] Initializing session pool...
[SessionPool] Creating session 1...
[Login] Navigating to https://www.data.go.kr/member/login.do...
[Login] Captcha detected, attempting OCR...
[OCR] Recognized: "A7K9B" (Confidence: 0.92)
✅ [Login] Success!
✅ Session pool ready: 5/5 sessions active

[Step 3/4] Collecting My APIs (96 authenticated APIs)...
[AuthAPICollector] Extracted 96 APIs from page
✅ My APIs Collection Complete: 96 APIs saved

[Step 4/4] Collecting Public APIs (11,992 open APIs)...
[PublicAPICollector] Page 1/120 - 100 APIs (Total: 100/11992)
...
✅ Public APIs Collection Complete: 11,992 APIs saved

═══════════════════════════════════════════════════════════
Total My APIs:        96
Total Public APIs:    11,992
Grand Total:          12,088
Total Duration:       32.5 minutes
═══════════════════════════════════════════════════════════

🎉 Initial collection completed successfully!
```

### 5. Start Server

**정상 운영 모드:**

```bash
cd backend
npm start
```

**개발 모드 (nodemon):**

```bash
npm run dev
```

**서버 시작 확인:**
```
═══════════════════════════════════════════════════════════
  SME Investor Service - Starting Server
═══════════════════════════════════════════════════════════

[1/3] Connecting to database...
✅ Database connected

[2/3] Initializing session pool...
✅ Session pool initialized: 5/5 sessions

[3/3] Starting scheduled tasks...
✅ Public API refresh scheduled: 0 3 * * *
✅ My API refresh scheduled: 0 9 * * 1
✅ Schedulers started

═══════════════════════════════════════════════════════════
✅ Server running on port 3000
   Environment: development
   API Base URL: http://localhost:3000/api
   Health Check: http://localhost:3000/health
═══════════════════════════════════════════════════════════
```

---

## 📡 API Endpoints

### Health Check
```bash
GET /health
```

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2026-02-15T08:00:00.000Z",
  "database": "connected",
  "sessionPool": {
    "total": 5,
    "active": 5,
    "available": 4
  },
  "uptime": 3600,
  "memory": { ... }
}
```

### Get My APIs
```bash
GET /api/my-apis?page=1&limit=50&category=금융&status=active
```

**Query Parameters:**
- `page` (number): 페이지 번호 (default: 1)
- `limit` (number): 페이지당 항목 수 (default: 50)
- `category` (string): 카테고리 필터
- `status` (string): 상태 필터 (active/inactive)

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "api_id": "my_abc123",
      "name": "중소기업 현황 정보 API",
      "endpoint": "https://api.data.go.kr/...",
      "category": "기업",
      "provider": "중소벤처기업부",
      "description": "...",
      "status": "active",
      "request_quota": 1000,
      "requests_used": 45,
      "response_format": "JSON",
      "collected_at": "2026-02-15T00:00:00.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 50,
    "total": 96,
    "totalPages": 2
  }
}
```

### Get Public APIs
```bash
GET /api/public-apis?search=중소기업&category=기업&page=1&limit=50
```

**Query Parameters:**
- `search` (string): 검색어 (name, description 검색)
- `category` (string): 카테고리 필터
- `provider` (string): 제공기관 필터
- `page`, `limit`: 페이지네이션

### Get Categories
```bash
GET /api/categories
```

**Response:**
```json
{
  "success": true,
  "data": {
    "myApis": [
      { "category": "기업", "count": 35 },
      { "category": "금융", "count": 28 },
      ...
    ],
    "publicApis": [
      { "category": "교통", "count": 2450 },
      { "category": "보건", "count": 1890 },
      ...
    ]
  }
}
```

### Get Statistics
```bash
GET /api/stats
```

**Response:**
```json
{
  "success": true,
  "data": {
    "total_my_apis": 96,
    "active_my_apis": 93,
    "total_public_apis": 11992,
    "total_categories": 42,
    "total_providers": 156
  }
}
```

### Get Session Pool Status
```bash
GET /api/sessions/status
```

**Response:**
```json
{
  "success": true,
  "data": {
    "total": 5,
    "active": 5,
    "inUse": 1,
    "available": 4,
    "sessions": [
      {
        "sessionId": "sess_abc123",
        "index": 1,
        "active": true,
        "inUse": false,
        "refreshCount": 3,
        "errorCount": 0,
        "lastUsed": "2026-02-15T08:00:00.000Z",
        "expiresAt": "2026-02-15T08:30:00.000Z"
      }
    ]
  }
}
```

### Get Collection Logs
```bash
GET /api/logs?logType=login&status=success&limit=50
```

---

## 🔧 NPM Scripts

```bash
# Start server (production)
npm start

# Start server (development with nodemon)
npm run dev

# Initial collection (run once)
npm run collect:init

# Collect My APIs only
npm run collect:my-apis

# Collect Public APIs only
npm run collect:public-apis

# Run tests
npm test
```

---

## 🏗️ Project Structure

```
SMEs/
├── backend/
│   ├── collectors/
│   │   ├── authApiCollector.js      # 96 My APIs 수집기
│   │   ├── publicApiCollector.js    # 11,992 Public APIs 수집기
│   │   └── initialCollect.js        # 초기 수집 스크립트
│   ├── config/
│   │   └── database.js              # PostgreSQL 설정
│   ├── services/
│   │   ├── loginService.js          # 자동 로그인 + OCR
│   │   └── sessionManager.js        # 세션 풀 관리
│   ├── schedulers/
│   │   └── apiRefresh.js            # 주기적 갱신 (cron)
│   ├── routes/                      # API 라우트 (확장 예정)
│   ├── utils/                       # 유틸리티 함수
│   ├── server.js                    # Express 서버
│   └── package.json
├── database/
│   ├── schema.sql                   # PostgreSQL 스키마
│   ├── migrations/                  # DB 마이그레이션
│   └── seeds/                       # 샘플 데이터
├── frontend/                        # React 프론트엔드 (Phase 3)
├── docs/                            # 문서
├── tests/                           # 테스트
├── output/                          # 생성된 프로젝트들 (Phase 3)
├── .env                             # 환경변수 (보안!)
├── .env.example                     # 환경변수 템플릿
└── README.md
```

---

## 🔒 Security Best Practices

### API Key Management
1. **절대 금지**: API 키를 코드에 하드코딩
2. **올바른 방법**: `.env` 파일에 저장 + `.gitignore` 등록
3. **DB 저장**: AES-256 암호화 사용
4. **프론트엔드 접근**: 백엔드 프록시를 통해서만

### Database
```sql
-- API 키 암호화 저장 예시
INSERT INTO my_apis (api_key)
VALUES (PGP_SYM_ENCRYPT('your-api-key', 'encryption-key'));

-- API 키 복호화 조회 (백엔드 내부에서만)
SELECT PGP_SYM_DECRYPT(api_key::bytea, 'encryption-key')
FROM my_apis WHERE id = 1;
```

### Environment Variables
```bash
# .gitignore에 반드시 추가
.env
.env.local
.env.production
```

---

## 🐛 Troubleshooting

### 1. 로그인 실패
**증상:** `Login failed after 5 attempts`

**원인:**
- 보안문자 인식 실패 (OCR)
- data.go.kr 계정 정보 오류
- 네트워크 문제

**해결:**
```bash
# 1. .env 파일의 계정 정보 확인
DATAGOER_EMAIL=your_email@example.com
DATAGOER_PASSWORD=your_password

# 2. OCR 신뢰도 임계값 낮추기
CAPTCHA_CONFIDENCE_THRESHOLD=0.70  # (기본: 0.80)

# 3. Headless 모드 끄고 직접 확인
PUPPETEER_HEADLESS=false

# 4. 재시도 횟수 늘리기
SESSION_MAX_RETRIES=10  # (기본: 5)
```

### 2. 세션 만료
**증상:** `Session expired, refreshing...`

**원인:** 30분 자동 갱신 주기 내에 세션이 만료됨

**해결:**
```bash
# 갱신 주기 단축 (밀리초)
SESSION_REFRESH_INTERVAL=900000  # 15분 (기본: 30분)
```

### 3. DB 연결 실패
**증상:** `Unable to connect to PostgreSQL`

**해결:**
```bash
# PostgreSQL 서비스 상태 확인
# Windows:
sc query postgresql-x64-14

# 서비스 시작
net start postgresql-x64-14

# DB 연결 정보 확인
psql -U postgres -d sme_investor_db -c "SELECT 1"
```

### 4. Public API 수집 중단
**증상:** 중간에 수집이 멈춤

**해결:**
```bash
# 타임아웃 늘리기
API_COLLECTION_TIMEOUT=300000  # 5분 (기본: 2분)

# 딜레이 늘리기 (Rate Limiting 방지)
API_COLLECTION_DELAY=5000  # 5초 (기본: 2초)

# 재시도 (이어서 수집)
npm run collect:public-apis
```

---

## 📊 Monitoring

### Real-time Logs
```bash
# 서버 로그 실시간 확인
cd backend
npm run dev

# DB 로그 조회
psql -U postgres -d sme_investor_db

SELECT * FROM collection_logs
ORDER BY timestamp DESC
LIMIT 20;
```

### Health Check
```bash
# HTTP 요청
curl http://localhost:3000/health

# 세션 풀 상태
curl http://localhost:3000/api/sessions/status
```

---

## 🗓️ Scheduled Tasks

### Public API Refresh
- **Frequency**: 매일 새벽 3시
- **Cron**: `0 3 * * *`
- **Duration**: ~30분
- **Purpose**: 신규 API 추가, 기존 API 업데이트

### My API Refresh
- **Frequency**: 매주 월요일 오전 9시
- **Cron**: `0 9 * * 1`
- **Duration**: ~5분
- **Purpose**: API 키 상태 확인, 할당량 리셋 확인

---

## 🚧 Roadmap

### Phase 1: 데이터 수집 ✅ (Completed)
- [x] 자동 로그인 + OCR
- [x] 세션 풀 관리
- [x] My APIs 96건 수집
- [x] Public APIs 11,992건 수집
- [x] 주기적 갱신 스케줄러

### Phase 2: 서비스 제안 🚧 (In Progress)
- [ ] Google Trends 연동
- [ ] ProductHunt 크롤링
- [ ] LLM 기반 서비스 기획
- [ ] 품질 자기 검증
- [ ] 제안 대시보드 UI

### Phase 3: 풀스택 앱 자동 생성 📝 (Planned)
- [ ] API 응답 구조 분석
- [ ] DB 스키마 자동 설계
- [ ] 백엔드 코드 생성 (Express)
- [ ] 프론트엔드 코드 생성 (React)
- [ ] 보안 검증 자동화
- [ ] E2E 테스트 자동화

---

## 📞 Support

### Issues
문제가 발생하면 다음 정보를 포함하여 보고해주세요:
1. `.env` 파일 설정 (민감 정보 제외)
2. 에러 로그 (`collection_logs` 테이블)
3. Node.js 버전 (`node --version`)
4. PostgreSQL 버전 (`psql --version`)

### Logs Location
```bash
# Application logs
./logs/app.log
./logs/error.log

# Database logs
SELECT * FROM collection_logs WHERE status = 'failed';
```

---

## 📝 License

MIT License

---

## 🙏 Acknowledgments

- **data.go.kr**: 공공데이터포털
- **Puppeteer**: 브라우저 자동화
- **Tesseract.js**: OCR 엔진
- **PostgreSQL**: 데이터베이스
- **Express.js**: 백엔드 프레임워크

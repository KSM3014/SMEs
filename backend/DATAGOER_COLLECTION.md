# data.go.kr API 수집 가이드

## 🎯 목적
data.go.kr 마이페이지에서 신청한 96개 API를 자동으로 수집하여 DB에 저장

## 📋 사전 준비

### 1. 환경변수 확인 (.env)
```bash
DATAGOER_EMAIL=hye4103
DATAGOER_PASSWORD=mskclone1!
DATAGOER_LOGIN_URL=https://auth.data.go.kr/sso/common-login?...
ENCRYPTION_KEY=sme_investor_encryption_secret_key_2025_v1_secure
```

### 2. DB 테이블 확인
```sql
-- 이미 생성됨:
✅ my_apis
✅ collection_logs
✅ sessions
```

## 🚀 실행 방법

```bash
cd backend
node scripts/run_collect_apis.js
```

### 실행 흐름
1. **브라우저 자동 실행** (headless: false)
2. **data.go.kr 홈페이지 접속**
3. **로그인 페이지 이동**
4. **아이디/비밀번호 자동 입력**
5. **⚠️ 수동 작업 필요**: 보안문자 입력 + 로그인 버튼 클릭
6. **마이페이지 - API 신청 페이지 이동**
7. **API 정보 자동 추출**
8. **DB 저장 (암호화)**

## 📊 예상 결과

```
🚀 data.go.kr API 수집 시작...

[1/5] 홈페이지 이동...
[2/5] 로그인 페이지 이동...
[3/5] 로그인 정보 입력...

⚠️  보안문자를 풀고 로그인 버튼을 눌러주세요!

✅ 로그인 성공!

[4/5] 마이페이지 - API 신청 페이지 이동...
[5/5] API 정보 추출 중...

✅ 96개 API 추출 완료

📋 샘플:
  1. 국세청_사업자등록상태_조회
  2. 중소벤처기업부_벤처기업확인서
  3. 한국산업기술진흥협회_이노비즈인증현황
  ...

💾 데이터베이스 저장 중...

  ✓ 국세청_사업자등록상태_조회
  ✓ 중소벤처기업부_벤처기업확인서
  ...

📊 결과: 96개 저장 완료!
✅ 수집 완료!
```

## 🔍 수집 후 확인

```sql
-- 수집된 API 확인
SELECT name, category, provider, status
FROM my_apis
ORDER BY created_at DESC;

-- 카테고리별 분포
SELECT category, COUNT(*) as count
FROM my_apis
GROUP BY category
ORDER BY count DESC;

-- 로그 확인
SELECT * FROM collection_logs
ORDER BY created_at DESC
LIMIT 10;
```

## 🔒 보안

- API 키는 **AES-256 암호화** 후 저장
- 복호화는 서버 측에서만 가능
- 프론트엔드에는 절대 노출되지 않음

## ⚠️ 문제 해결

### API가 0개 추출된 경우
1. `myapis_page.png` 스크린샷 확인
2. 페이지 구조가 예상과 다를 수 있음
3. 페이지 셀렉터 수정 필요

### 로그인 실패
1. 보안문자 정확히 입력했는지 확인
2. 계정 정보 `.env` 파일 확인
3. 로그인 URL 변경 여부 확인

## 📝 다음 단계

수집 완료 후:
1. **API 분석**: 어떤 API들이 중소기업 데이터 제공하는지 파악
2. **통합**: `publicDataClient.js`에 추가
3. **우선순위 설정**: DART → 공공데이터 API → 기타

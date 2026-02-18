# sminfo.mss.go.kr 통합 현황

## ✅ 완료된 작업

### 1. Rate Limit 관리
- **제한**: 분당 3회
- **구현**: `checkRateLimit()` 메서드로 자동 대기
- **로그**: 요청 횟수 및 대기 시간 출력

### 2. 세션 관리
- 브라우저 재사용 (`this.browser`, `this.page`)
- 로그인 상태 유지 (`this.isLoggedIn`)
- 자동 재로그인 지원

### 3. 로그인 자동화 (개선됨)
**확장된 셀렉터 패턴**:
```javascript
// ID 입력 필드
- input[name="userId"], input[name="id"], input[name="user_id"]
- input#userId, input#id, input#user_id
- input[name="mberId"], input#mberId  // 한국 정부 사이트 패턴
- input[name="loginId"], input#loginId
- fallback: 첫 번째 visible text input
```

```javascript
// 비밀번호 입력 필드
- input[name="password"], input[name="pw"], input[name="passwd"]
- input#password, input#pw, input#passwd
- input[name="mberPw"], input#mberPw  // 한국 정부 사이트 패턴
- input[name="loginPw"], input#loginPw
- fallback: 첫 번째 visible password input
```

```javascript
// 로그인 버튼
- button[type="submit"], input[type="submit"], input[type="image"]
- button.login, a.login, button#loginBtn
- a[href*="login"], button[onclick*="login"]
- fallback: 텍스트에 "로그인" 포함된 버튼 검색
```

**디버깅 기능**:
- 로그인 폼을 찾지 못하면 `sminfo_debug_login.png` 스크린샷 자동 저장
- 사용된 셀렉터 로깅

### 4. 기업 검색 (개선됨)
**사업자번호 입력 필드 셀렉터**:
```javascript
- input[name="bizNo"], input[name="businessNumber"], input[name="bizrno"]
- input#bizNo, input#businessNumber, input#bizrno
- input[name="brno"], input#brno
- input[name="bmanEnprsDscmNo"]  // 국민연금 API 패턴
- input[name="corpNo"], input#corpNo
- fallback: placeholder/label에 "사업자" 포함된 input 검색
```

**검색 버튼 셀렉터**:
```javascript
- button.search, button#searchBtn, button.searchBtn
- button[type="submit"], input[type="submit"]
- button[onclick*="search"], a[onclick*="search"]
- fallback: 텍스트에 "검색" 또는 "조회" 포함된 버튼
```

**디버깅 기능**:
- 검색 폼을 찾지 못하면 `sminfo_debug_search.png` 저장
- 하이픈 자동 제거 (210-81-29428 → 2108129428)

### 5. 재무정보 추출 (대폭 개선)
**다양한 패턴 매칭**:
```javascript
// 매출액
label.match(/매출|revenue|sales/i)

// 영업이익
label.match(/영업이익|operating.*profit/i)

// 당기순이익
label.match(/당기순이익|순이익|net.*profit|net.*income/i)

// 자산총계
label.match(/자산총계|총자산|total.*asset/i)

// 부채총계
label.match(/부채총계|총부채|total.*liabilit/i)

// 자본총계
label.match(/자본총계|총자본|자기자본|total.*equity|shareholders.*equity/i)
```

**지원 HTML 구조**:
1. `<table>` 구조 (기본)
2. `<dl><dt><dd>` 구조 (일부 정부 사이트)

**디버깅 기능**:
- 데이터를 찾지 못하면:
  - `sminfo_debug_nodata.png` 스크린샷 저장
  - `sminfo_debug_nodata.html` HTML 저장
  - 발견된 라벨 샘플 출력 (최대 20개)

### 6. companyDataService 통합
**사용 조건**: DART와 공공데이터 모두 재무정보 없을 때만 호출
```javascript
const hasFinancialData = merged.revenue || merged.total_assets || merged.operating_profit;
if (!hasFinancialData) {
  // sminfo 최후 수단 사용
}
```

**병합 우선순위**:
1. DART (1순위)
2. 공공데이터 (2순위)
3. **sminfo (3순위 - 최후 수단)**

## ⚠️ 아직 확인 필요

### 1. 실제 페이지 구조 확인
현재 구현은 **추정된 셀렉터**를 기반으로 함. 실제 페이지에서 테스트 필요:

**확인할 사항**:
- [ ] 로그인 URL이 정확한지 (`https://sminfo.mss.go.kr/`)
- [ ] 로그인 폼 셀렉터가 맞는지
- [ ] 기업 검색 페이지 URL (`https://sminfo.mss.go.kr/cm/sv/CSV001R0.do`)
- [ ] 사업자번호 입력 필드 셀렉터
- [ ] 재무정보가 표시되는 테이블 구조
- [ ] 라벨 텍스트 패턴 (한글/영어)

### 2. 테스트 방법
```bash
# 1. 실제 기업으로 테스트 (fallback 확인)
cd backend
node -e "
import('./services/companyDataService.js').then(async (module) => {
  const service = new module.default();
  const data = await service.getCompanyByBusinessNumber('124-81-00998');
  console.log(data);
  process.exit(0);
});
"

# 2. sminfo 직접 테스트 (디버깅 파일 확인)
node -e "
import('./services/sminfoClient.js').then(async (module) => {
  const client = new module.default();
  const data = await client.getCompanyByBusinessNumber('124-81-00998');
  console.log(data);
  await client.close();
  process.exit(0);
});
"

# 3. 디버깅 파일 확인
ls -lh sminfo_debug_*.png sminfo_debug_*.html
```

### 3. 수동 검증 필요
실제 sminfo.mss.go.kr 사이트에 로그인하여:
1. 기업 검색 페이지 찾기
2. 사업자번호 입력 후 검색
3. 재무정보 테이블 구조 확인
4. 실제 HTML을 보고 셀렉터 조정

## 📊 현재 상태

| 항목 | 상태 | 비고 |
|------|------|------|
| Rate Limit 관리 | ✅ 완료 | 분당 3회 제한, 자동 대기 |
| 세션 관리 | ✅ 완료 | 브라우저 재사용 |
| 로그인 셀렉터 | ⚠️ 확장됨 | 실제 페이지 확인 필요 |
| 검색 셀렉터 | ⚠️ 확장됨 | 실제 페이지 확인 필요 |
| 재무정보 추출 | ⚠️ 대폭 개선 | 실제 데이터 구조 확인 필요 |
| 디버깅 기능 | ✅ 완료 | 스크린샷/HTML 자동 저장 |
| companyDataService 통합 | ✅ 완료 | 최후 수단으로 동작 |

## 🎯 다음 단계

1. **실제 테스트**:
   ```bash
   # sminfo가 호출되는지 확인
   node -e "..." (위 테스트 명령 참조)
   ```

2. **디버깅 파일 분석**:
   - `sminfo_debug_*.png` 스크린샷 확인
   - `sminfo_debug_*.html` HTML 구조 확인
   - 실제 셀렉터 파악

3. **셀렉터 조정**:
   - HTML 분석 결과를 바탕으로 셀렉터 수정
   - `sminfoClient.js` 업데이트

4. **성공 케이스 확보**:
   - 최소 1개 기업에서 재무정보 추출 성공
   - 로그 확인: `[Sminfo] ✅ Financial data retrieved`

## 💡 Tips

- **sminfo는 최후 수단**: 일반적으로 DART나 공공데이터에서 데이터를 가져옴
- **Rate Limit 주의**: 분당 3회만 호출 가능하므로 테스트 시 주의
- **디버깅 활용**: 실패 시 자동 저장되는 스크린샷/HTML 확인
- **트래픽 낮음**: 사용자 요청이 많지 않아 rate limit 문제 없을 것으로 예상

## 📝 로그인 정보

```bash
# .env 파일에 설정됨
SMINFO_USER_ID=msk129
SMINFO_PASSWORD=mskclone1!
```

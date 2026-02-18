# sminfo.mss.go.kr 조회 제한 처리 방침

## ⚠️ Rate Limit
- **제한**: 분당 3회
- **제공**: 중소기업 재무정보
- **URL**: https://sminfo.mss.go.kr/

## 🎯 활용 전략

### ❌ DB 구축 단계에서 제외
sminfo는 **자동 데이터 수집 대상이 아님**

```javascript
// ❌ 이렇게 하지 않음
async function collectAllCompanies() {
  for (const company of companies) {
    await sminfo.getFinancialData(company); // NO!
  }
}
```

### ✅ 프론트엔드 요청 시 최후 수단으로만 사용

```javascript
// ✅ 올바른 사용법
async function getCompany(businessNumber) {
  // 1순위: DART
  let data = await dartClient.getCompany(businessNumber);
  if (data) return data;

  // 2순위: 공공데이터 API (data.go.kr)
  data = await publicDataClient.getCompany(businessNumber);
  if (data) return data;

  // 최후 수단: sminfo (rate limit 주의)
  console.warn('Using sminfo as fallback - rate limited to 3/min');
  data = await sminfoClient.getCompany(businessNumber);
  return data;
}
```

## 📐 조회 순서 (Priority)

```
사용자 요청: 기업 재무정보 조회
    ↓
[1순위] DART API 조회
    ↓ (데이터 없음?)
[2순위] data.go.kr 공공데이터 API
    ↓ (데이터 없음?)
[3순위] 기타 소스
    ↓ (모두 실패?)
[최후] sminfo.mss.go.kr
    ⚠️ Rate limit: 분당 3회
```

## 🔧 구현

### companyDataService.js 수정

```javascript
async getCompany(businessNumber, options = {}) {
  const sources = {
    dart: null,
    public: null,
    sminfo: null  // 최초에는 null
  };

  // DART 조회
  sources.dart = await this.dartClient.getCompany(businessNumber);

  // 공공데이터 조회
  sources.public = await this.publicClient.getCompany(businessNumber);

  // 병합
  let merged = mergeCompanyData(sources, businessNumber);

  // 재무정보가 부족한 경우에만 sminfo 조회
  if (options.forceComplete && !merged.revenue && !merged.total_assets) {
    console.warn('[Fallback] Using sminfo.mss.go.kr - rate limited');
    sources.sminfo = await this.sminfoClient.getCompany(businessNumber);

    // 재병합
    merged = mergeCompanyData(sources, businessNumber);
  }

  return merged;
}
```

### 프론트엔드 요청

```javascript
// 일반 조회 (sminfo 사용 안 함)
const company = await api.getCompany(businessNumber);

// 상세 조회 (최후 수단으로 sminfo 사용)
const companyDetailed = await api.getCompany(businessNumber, {
  forceComplete: true  // 재무정보 완전히 채우기
});
```

## 🚦 Rate Limit 관리

```javascript
class SminfoClient {
  constructor() {
    this.requestCount = 0;
    this.lastResetTime = Date.now();
  }

  async getCompany(businessNumber) {
    // Rate limit 체크
    const now = Date.now();
    if (now - this.lastResetTime > 60000) {
      this.requestCount = 0;
      this.lastResetTime = now;
    }

    if (this.requestCount >= 3) {
      const waitTime = 60000 - (now - this.lastResetTime);
      throw new Error(`Rate limit exceeded. Wait ${waitTime}ms`);
    }

    this.requestCount++;

    // 실제 조회 로직
    // ...
  }
}
```

## 📝 로그인 정보

```bash
ID: msk129
PW: mskclone1!
```

## ⚡ 요약

| 단계 | sminfo 사용 여부 | 이유 |
|------|-----------------|------|
| **DB 구축** | ❌ 사용 안 함 | Rate limit으로 대량 수집 불가 |
| **일반 조회** | ❌ 사용 안 함 | DART, 공공데이터로 충분 |
| **상세 조회** | ✅ 최후 수단 | 재무정보 없을 때만 |

**핵심**: sminfo는 "보험" - 다른 모든 소스가 실패했을 때만 사용!

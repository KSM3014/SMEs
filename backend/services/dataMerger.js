/**
 * Data Merger Service
 * 여러 데이터 소스를 우선순위에 따라 병합
 *
 * 우선순위:
 * 1. DART (전자공시시스템)
 * 2. 공공데이터 (data.go.kr)
 * 3. 기타
 */

/**
 * 데이터 소스별 우선순위
 */
const DATA_SOURCE_PRIORITY = {
  DART: 1,
  PUBLIC: 2,
  OTHER: 3
};

/**
 * 필드별 우선순위 매핑
 * 특정 필드는 특정 소스를 우선할 수 있음
 */
const FIELD_SOURCE_PREFERENCE = {
  // 재무 데이터 - DART 우선
  revenue: 'DART',
  operating_profit: 'DART',
  net_profit: 'DART',
  total_assets: 'DART',
  total_liabilities: 'DART',

  // 기본 정보 - 공공데이터 우선
  business_number: 'PUBLIC',
  establishment_date: 'PUBLIC',
  employee_count: 'PUBLIC',

  // 공시 정보 - DART만
  stock_code: 'DART',
  listed: 'DART',
  market_cap: 'DART'
};

/**
 * 여러 데이터 소스를 병합
 * @param {Object} sources - { dart: {}, public: {}, other: {} }
 * @param {String} businessNumber - 사업자등록번호
 * @returns {Object} 병합된 데이터
 */
function mergeCompanyData(sources, businessNumber) {
  const merged = {
    business_number: businessNumber,
    data_sources: {},
    primary_source: null,
    last_updated: new Date().toISOString()
  };

  // 모든 소스 데이터 저장
  if (sources.dart) merged.data_sources.dart = sources.dart;
  if (sources.public) merged.data_sources.public = sources.public;
  if (sources.other) merged.data_sources.other = sources.other;

  // 우선순위에 따라 병합
  const orderedSources = [
    { name: 'DART', data: sources.dart },
    { name: 'PUBLIC', data: sources.public },
    { name: 'OTHER', data: sources.other }
  ].filter(s => s.data);

  // 기본 병합 (우선순위 순)
  for (const source of orderedSources) {
    if (!merged.primary_source) {
      merged.primary_source = source.name;
    }

    for (const [key, value] of Object.entries(source.data)) {
      // 이미 값이 있으면 스킵 (높은 우선순위가 이미 설정)
      if (merged[key] !== undefined && merged[key] !== null) {
        continue;
      }

      // 필드별 선호 소스가 있는지 확인
      const preferredSource = FIELD_SOURCE_PREFERENCE[key];
      if (preferredSource && preferredSource !== source.name) {
        // 선호 소스가 다르면, 선호 소스에 값이 있을 때만 스킵
        const preferredData = sources[preferredSource.toLowerCase()];
        if (preferredData && preferredData[key]) {
          continue;
        }
      }

      merged[key] = value;
    }
  }

  // 데이터 품질 점수 계산
  merged.data_quality_score = calculateDataQualityScore(merged);

  return merged;
}

/**
 * 데이터 품질 점수 계산
 * @param {Object} data
 * @returns {Number} 0-100 점수
 */
function calculateDataQualityScore(data) {
  let score = 0;
  const maxScore = 100;

  // 필수 필드 (각 10점)
  const requiredFields = [
    'company_name',
    'ceo_name',
    'business_number',
    'address',
    'industry_name'
  ];

  requiredFields.forEach(field => {
    if (data[field]) score += 10;
  });

  // 재무 정보 (각 5점)
  const financialFields = [
    'revenue',
    'operating_profit',
    'net_profit',
    'total_assets'
  ];

  financialFields.forEach(field => {
    if (data[field]) score += 5;
  });

  // DART 데이터 있으면 보너스 +20점
  if (data.data_sources?.dart) score += 20;

  // 최근 업데이트 (1년 이내) +10점
  if (data.last_updated) {
    const lastUpdate = new Date(data.last_updated);
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

    if (lastUpdate > oneYearAgo) score += 10;
  }

  return Math.min(score, maxScore);
}

/**
 * 데이터 충돌 감지
 * @param {Object} sources
 * @returns {Array} 충돌 목록
 */
function detectConflicts(sources) {
  const conflicts = [];
  const fields = new Set();

  // 모든 필드 수집
  Object.values(sources).forEach(source => {
    if (source) {
      Object.keys(source).forEach(key => fields.add(key));
    }
  });

  // 각 필드별로 소스 간 값 비교
  fields.forEach(field => {
    const values = {};

    Object.entries(sources).forEach(([sourceName, sourceData]) => {
      if (sourceData && sourceData[field] !== undefined) {
        values[sourceName] = sourceData[field];
      }
    });

    // 값이 2개 이상이고 서로 다르면 충돌
    const uniqueValues = [...new Set(Object.values(values))];
    if (uniqueValues.length > 1) {
      conflicts.push({
        field,
        values,
        resolved_value: resolveConflict(field, values)
      });
    }
  });

  return conflicts;
}

/**
 * 충돌 해결
 * @param {String} field
 * @param {Object} values - { DART: value1, PUBLIC: value2, ... }
 * @returns {*} 해결된 값
 */
function resolveConflict(field, values) {
  // 필드별 선호 소스가 있으면 그것 사용
  const preferredSource = FIELD_SOURCE_PREFERENCE[field];
  if (preferredSource && values[preferredSource]) {
    return values[preferredSource];
  }

  // 없으면 우선순위 순으로 반환
  if (values.DART !== undefined) return values.DART;
  if (values.PUBLIC !== undefined) return values.PUBLIC;
  if (values.OTHER !== undefined) return values.OTHER;

  return null;
}

/**
 * 데이터 소스 정보 생성
 * @param {Object} merged
 * @returns {Object}
 */
function generateSourceInfo(merged) {
  const info = {
    primary: merged.primary_source,
    sources_used: Object.keys(merged.data_sources || {}),
    quality_score: merged.data_quality_score,
    completeness: calculateCompleteness(merged),
    last_updated: merged.last_updated
  };

  return info;
}

/**
 * 데이터 완성도 계산
 * @param {Object} data
 * @returns {Number} 0-100 퍼센트
 */
function calculateCompleteness(data) {
  const allPossibleFields = [
    'company_name', 'ceo_name', 'business_number', 'address',
    'industry_name', 'employee_count', 'establishment_date',
    'revenue', 'operating_profit', 'net_profit', 'total_assets',
    'total_liabilities', 'phone', 'website', 'email'
  ];

  const filledFields = allPossibleFields.filter(field =>
    data[field] !== undefined && data[field] !== null
  );

  return Math.round((filledFields.length / allPossibleFields.length) * 100);
}

export {
  mergeCompanyData,
  detectConflicts,
  calculateDataQualityScore,
  generateSourceInfo,
  DATA_SOURCE_PRIORITY
};

/**
 * Misc API Registry — Phase 2.5 Priority Tier 4 APIs
 *
 * 14개: 행안부(6), 국민연금탈퇴(1), 한국조폐공사(1), 체육진흥공단(1),
 *       창업진흥원(1), 한국가스공사(1), 환경공단추가(2), 부산경매(1)
 *
 * These are lower-priority APIs with varying response formats.
 * Most use brno or cond[BRNO::EQ] query pattern.
 */

import dotenv from 'dotenv';
dotenv.config();

const SHARED_SERVICE_KEY = process.env.DATA_GO_KR_SHARED_KEY || process.env.NTS_API_KEY;

// ============================================================
// Helper: parse XML items (same as apiRegistry.js)
// ============================================================

function parseXmlItems(xml) {
  if (!xml || typeof xml !== 'string') return [];
  const items = xml.match(/<item>([\s\S]*?)<\/item>/g) || [];
  return items.map(item => {
    const fields = {};
    const tagRegex = /<([a-zA-Z]\w*)>([^<]*)<\/[a-zA-Z]\w*>/g;
    let m;
    while ((m = tagRegex.exec(item)) !== null) { fields[m[1]] = m[2]; }
    return fields;
  });
}

/** 행안부 공공데이터 표준 포맷: { currentCount, data, matchCount, page, perPage, totalCount } */
function extractMoisItems(data) {
  if (data?.data && Array.isArray(data.data)) return data.data;
  if (data?.response?.body?.items?.item) {
    const items = data.response.body.items.item;
    return Array.isArray(items) ? items : [items];
  }
  return [];
}

// ============================================================
// Factory: 행안부 brno 검색 API (cond[BRNO::EQ] 패턴)
// ============================================================

function moisApi(id, name, url, opts = {}) {
  const queryParam = opts.queryParam || 'cond[BRNO::EQ]';
  return {
    id,
    name,
    provider: '행정안전부',
    dataGoKrId: opts.dataGoKrId || null,
    endpoint: url,
    queryKeyType: 'brno',
    queryKeyParam: queryParam,
    responseFormat: 'json',
    buildRequest: (brno) => ({
      url,
      params: {
        serviceKey: SHARED_SERVICE_KEY,
        [queryParam]: brno,
        page: 1,
        perPage: opts.perPage || 10,
        type: 'json',
        ...(opts.extraParams || {})
      }
    }),
    extractResponse: (data) => {
      const items = extractMoisItems(data);
      if (items.length === 0) return null;
      return { items, totalCount: data?.totalCount || items.length, rawData: data };
    }
  };
}

// ============================================================
// 행안부 6개
// ============================================================

export const MOIS_TIER4_APIS = [
  moisApi('mois_funeral_service', '행안부_상조업',
    'https://apis.data.go.kr/1741000/funeral_service_providers/info',
    { dataGoKrId: '15155088' }),

  moisApi('mois_elevator_maintenance', '행안부_승강기유지관리',
    'https://apis.data.go.kr/1741000/elevator_maintenance/info',
    { dataGoKrId: '15155095' }),

  moisApi('mois_elevator_manufacturer', '행안부_승강기제조수입',
    'https://apis.data.go.kr/1741000/elevator_manufacturers_importers/info',
    { dataGoKrId: '15155100' }),

  moisApi('mois_air_pollution', '행안부_대기오염배출시설',
    'https://apis.data.go.kr/1741000/air_pollution_facility_installation/info',
    { dataGoKrId: '15154973' }),

  moisApi('mois_water_pollution', '행안부_수질오염원시설',
    'https://apis.data.go.kr/1741000/water_pollution_source_other/info',
    { dataGoKrId: '15154989' }),

  moisApi('mois_disaster_insurance', '행안부_재난배상책임보험',
    'https://apis.data.go.kr/1741000/ndms/facilInfo',
    { dataGoKrId: '15125655', queryParam: 'cond[brno::LIKE]' }),
];

// ============================================================
// 기타 기관 8개
// ============================================================

export const OTHER_TIER4_APIS = [
  {
    id: 'nps_withdrawn',
    name: '국민연금_탈퇴사업장정보',
    provider: '국민연금공단',
    dataGoKrId: '15020284',
    endpoint: 'https://apis.data.go.kr/B552015/NpsScsnBplcInfoInqireServiceV2',
    queryKeyType: 'companyName',
    responseFormat: 'xml',
    buildRequest: (companyName) => ({
      url: 'https://apis.data.go.kr/B552015/NpsScsnBplcInfoInqireServiceV2/getDetailInfoSearchV2',
      params: { serviceKey: SHARED_SERVICE_KEY, wkplNm: companyName, pageNo: 1, numOfRows: 10 }
    }),
    extractResponse: (data) => {
      const str = typeof data === 'string' ? data : JSON.stringify(data);
      return parseXmlItems(str);
    }
  },
  {
    id: 'komsco_franchise',
    name: '한국조폐공사_가맹점기본정보',
    provider: '한국조폐공사',
    dataGoKrId: '15119539',
    endpoint: 'https://apis.data.go.kr/B190001/localFranchisesV2',
    queryKeyType: 'brno',
    responseFormat: 'json',
    buildRequest: (brno) => ({
      url: 'https://apis.data.go.kr/B190001/localFranchisesV2/franchiseV2',
      params: { serviceKey: SHARED_SERVICE_KEY, 'cond[brno::EQ]': brno, page: 1, perPage: 10, type: 'json' }
    }),
    extractResponse: (data) => {
      const items = extractMoisItems(data);
      return items.length > 0 ? { items, rawData: data } : null;
    }
  },
  {
    id: 'kspo_sports_course',
    name: '체육진흥공단_스포츠강좌이용권',
    provider: '국민체육진흥공단',
    dataGoKrId: '15107784',
    endpoint: 'https://apis.data.go.kr/B551014/SRVC_OD_API_FACIL_COURSE',
    queryKeyType: 'brno',
    responseFormat: 'xml',
    buildRequest: (brno) => ({
      url: 'https://apis.data.go.kr/B551014/SRVC_OD_API_FACIL_COURSE/todz_api_facil_course_i',
      params: { serviceKey: SHARED_SERVICE_KEY, brno, pageNo: 1, numOfRows: 10 }
    }),
    extractResponse: (data) => {
      const str = typeof data === 'string' ? data : JSON.stringify(data);
      return parseXmlItems(str);
    }
  },
  {
    id: 'kised_host_institution',
    name: '창업진흥원_주관기관정보',
    provider: '창업진흥원',
    dataGoKrId: '15125366',
    endpoint: 'https://apis.data.go.kr/B552735/kisedPmsService',
    queryKeyType: 'none',
    responseFormat: 'xml',
    buildRequest: (params = {}) => ({
      url: 'https://apis.data.go.kr/B552735/kisedPmsService/getInstitutionInformation',
      params: { serviceKey: SHARED_SERVICE_KEY, pageNo: 1, numOfRows: 10, type: 'json', ...params }
    }),
    extractResponse: (data) => {
      // This API uses <col name="...">value</col> XML format
      const str = typeof data === 'string' ? data : JSON.stringify(data);
      const items = parseXmlItems(str);
      return items.length > 0 ? items : null;
    }
  },
  {
    id: 'kogas_contract',
    name: '한국가스공사_계약정보',
    provider: '한국가스공사',
    dataGoKrId: '15072207',
    endpoint: 'https://apis.data.go.kr/B551210/contractInfoList4',
    queryKeyType: 'none',
    responseFormat: 'xml',
    buildRequest: (params = {}) => ({
      url: 'https://apis.data.go.kr/B551210/contractInfoList4/getContractinfoList4',
      params: { serviceKey: SHARED_SERVICE_KEY, pageNo: 1, numOfRows: 10, ...params }
    }),
    extractResponse: (data) => {
      const str = typeof data === 'string' ? data : JSON.stringify(data);
      return parseXmlItems(str);
    }
  },
  {
    id: 'keco_waste_sanctions',
    name: '환경공단_폐기물행정처분',
    provider: '한국환경공단',
    dataGoKrId: '15156661',
    endpoint: 'https://apis.data.go.kr/B552584/wstdspGrndsInfo',
    queryKeyType: 'brno',
    responseFormat: 'json',
    buildRequest: (brno) => ({
      url: 'https://apis.data.go.kr/B552584/wstdspGrndsInfo/getlist',
      params: { serviceKey: SHARED_SERVICE_KEY, brno, pageNo: 1, numOfRows: 10, type: 'json' }
    }),
    extractResponse: (data) => {
      const items = data?.body?.items || [];
      return Array.isArray(items) && items.length > 0 ? { items, rawData: data } : null;
    }
  },
  {
    id: 'keco_electronics_info',
    name: '환경공단_전기전자업체정보',
    provider: '한국환경공단',
    dataGoKrId: '15156648',
    endpoint: 'https://apis.data.go.kr/B552584/elcPrdBzentInfo',
    queryKeyType: 'brno',
    responseFormat: 'json',
    buildRequest: (brno) => ({
      url: 'https://apis.data.go.kr/B552584/elcPrdBzentInfo/getlist',
      params: { serviceKey: SHARED_SERVICE_KEY, brno, pageNo: 1, numOfRows: 10, type: 'json' }
    }),
    extractResponse: (data) => {
      const items = data?.body?.items || [];
      return Array.isArray(items) && items.length > 0 ? { items, rawData: data } : null;
    }
  },
  {
    id: 'busan_auction',
    name: '부산_국제수산물유통_경매결과',
    provider: '부산광역시',
    dataGoKrId: '15141320',
    endpoint: 'https://apis.data.go.kr/6260000/KjMarketAuction2',
    queryKeyType: 'none',
    responseFormat: 'xml',
    buildRequest: (params = {}) => ({
      url: 'https://apis.data.go.kr/6260000/KjMarketAuction2/getAuctionResultDay',
      params: { serviceKey: SHARED_SERVICE_KEY, pageNo: 1, numOfRows: 10, ...params }
    }),
    extractResponse: (data) => {
      const str = typeof data === 'string' ? data : JSON.stringify(data);
      return parseXmlItems(str);
    }
  },
];

// ============================================================
// Combined Export
// ============================================================

export const MISC_API_REGISTRY = {
  mois: MOIS_TIER4_APIS,
  others: OTHER_TIER4_APIS,
  all: [...MOIS_TIER4_APIS, ...OTHER_TIER4_APIS],
};

export default MISC_API_REGISTRY;

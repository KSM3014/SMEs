/**
 * API Registry - 26개 KEEP API 설정
 *
 * 패턴:
 * A: Direct Query (brno/crno → 즉시 결과)
 * B: 2-step (회사명 검색 → ID 매칭)
 * C: Reverse Match (그룹명 검색 → 응답에서 crno 추출)
 * D: Bulk + Filter (전체 다운로드 → brno로 필터링)
 */

import dotenv from 'dotenv';
dotenv.config();

const SHARED_SERVICE_KEY = process.env.DATA_GO_KR_SHARED_KEY || process.env.NTS_API_KEY;

/**
 * Pattern A: Direct Query (11개)
 */
export const DIRECT_QUERY_APIS = [
  {
    id: 'nts_status',
    name: '국세청_사업자등록상태조회',
    endpoint: 'https://api.odcloud.kr/api/nts-businessman/v1/status',
    method: 'POST',
    queryKey: 'b_no',
    queryKeyType: 'brno',
    buildRequest: (brno) => ({
      url: 'https://api.odcloud.kr/api/nts-businessman/v1/status',
      method: 'POST',
      params: { serviceKey: SHARED_SERVICE_KEY },
      body: { b_no: [brno] }
    }),
    extractResponse: (data) => {
      const item = data?.data?.[0] || {};
      return {
        companyName: null, // NTS status API doesn't return company name
        brno: item.b_no || null,
        crno: null,
        address: null,
        representative: null,
        industryCode: null,
        rawData: item
      };
    }
  },
  {
    id: 'ftc_ecommerce',
    name: '공정위_통신판매사업자',
    endpoint: 'https://apis.data.go.kr/1130000/MllBs_2Service',
    operations: ['/getMllBs_2'],
    queryKey: 'brno',
    queryKeyType: 'brno',
    buildRequest: (brno) => ({
      url: 'https://apis.data.go.kr/1130000/MllBs_2Service/getMllBs_2',
      params: { serviceKey: SHARED_SERVICE_KEY, brno, pageNo: 1, numOfRows: 10, type: 'json' }
    }),
    extractResponse: (data) => {
      const items = data?.response?.body?.items?.item || [];
      const item = Array.isArray(items) ? items[0] : items;
      if (!item) return null;
      return {
        companyName: item.bsnmNm || null,
        brno: item.brno || null,
        crno: null,
        address: item.rprsBpladrs || null,
        representative: item.rprsNm || null,
        industryCode: null,
        rawData: Array.isArray(items) ? items : [item]
      };
    }
  },
  // 금융위원회 9개 - 모두 crno 기반, 동일 패턴
  {
    id: 'fsc_basic',
    name: '금융위_기업기본정보',
    endpoint: 'https://apis.data.go.kr/1160100/service/GetCorpBasicInfoService_V2',
    operations: ['/getCorpOutline_V2'],
    queryKey: 'crno',
    queryKeyType: 'crno',
    buildRequest: (crno) => ({
      url: 'https://apis.data.go.kr/1160100/service/GetCorpBasicInfoService_V2/getCorpOutline_V2',
      params: { serviceKey: SHARED_SERVICE_KEY, crno, pageNo: 1, numOfRows: 1, resultType: 'json' }
    }),
    extractResponse: (data) => {
      const items = data?.response?.body?.items?.item || [];
      const item = Array.isArray(items) ? items[0] : items;
      if (!item) return null;
      return {
        companyName: item.corpNm || null,
        brno: item.bzno || null,
        crno: item.crno || null,
        address: item.enpBsadr || null,
        representative: item.enpRprFnm || null,
        industryCode: item.enpKrxLstgAbbr || null,
        rawData: item
      };
    }
  },
  {
    id: 'fsc_financial',
    name: '금융위_기업재무정보',
    endpoint: 'https://apis.data.go.kr/1160100/service/GetFinaStatInfoService_V2',
    operations: ['/getBs_V2', '/getIs_V2', '/getCf_V2'],
    queryKey: 'crno',
    queryKeyType: 'crno',
    buildRequest: (crno) => ({
      url: 'https://apis.data.go.kr/1160100/service/GetFinaStatInfoService_V2/getBs_V2',
      params: { serviceKey: SHARED_SERVICE_KEY, crno, pageNo: 1, numOfRows: 100, resultType: 'json' }
    }),
    extractResponse: (data) => {
      const items = data?.response?.body?.items?.item || [];
      const arr = Array.isArray(items) ? items : [items].filter(Boolean);
      if (arr.length === 0) return null;
      return {
        companyName: arr[0]?.corpNm || null,
        brno: arr[0]?.bzno || null,
        crno: arr[0]?.crno || null,
        address: null,
        representative: null,
        industryCode: null,
        rawData: arr
      };
    }
  },
  {
    id: 'fsc_governance',
    name: '금융위_기업지배구조',
    endpoint: 'https://apis.data.go.kr/1160100/GetCGDiscInfoService',
    operations: ['/getCGDiscInfo'],
    queryKey: 'crno',
    queryKeyType: 'crno',
    buildRequest: (crno) => ({
      url: 'https://apis.data.go.kr/1160100/GetCGDiscInfoService/getCGDiscInfo',
      params: { serviceKey: SHARED_SERVICE_KEY, crno, pageNo: 1, numOfRows: 10, resultType: 'json' }
    }),
    extractResponse: extractFscStandard
  },
  {
    id: 'fsc_short_term',
    name: '금융위_단기금융증권',
    endpoint: 'https://apis.data.go.kr/1160100/service/GetShorTermSecuIssuInfoService',
    operations: ['/getShorTermSecuIssuInfo'],
    queryKey: 'crno',
    queryKeyType: 'crno',
    buildRequest: (crno) => ({
      url: 'https://apis.data.go.kr/1160100/service/GetShorTermSecuIssuInfoService/getShorTermSecuIssuInfo',
      params: { serviceKey: SHARED_SERVICE_KEY, crno, pageNo: 1, numOfRows: 10, resultType: 'json' }
    }),
    extractResponse: extractFscStandard
  },
  {
    id: 'fsc_disclosure',
    name: '금융위_금융회사공시',
    endpoint: 'https://apis.data.go.kr/1160100/service/GetFnCoDiscInfoService_V2',
    operations: ['/getFnCoDiscInfo_V2'],
    queryKey: 'crno',
    queryKeyType: 'crno',
    buildRequest: (crno) => ({
      url: 'https://apis.data.go.kr/1160100/service/GetFnCoDiscInfoService_V2/getFnCoDiscInfo_V2',
      params: { serviceKey: SHARED_SERVICE_KEY, crno, pageNo: 1, numOfRows: 10, resultType: 'json' }
    }),
    extractResponse: extractFscStandard
  },
  {
    id: 'fsc_bond',
    name: '금융위_채권발행',
    endpoint: 'https://apis.data.go.kr/1160100/service/GetBondTradInfoService',
    operations: ['/getBondTradInfo'],
    queryKey: 'crno',
    queryKeyType: 'crno',
    buildRequest: (crno) => ({
      url: 'https://apis.data.go.kr/1160100/service/GetBondTradInfoService/getBondTradInfo',
      params: { serviceKey: SHARED_SERVICE_KEY, crno, pageNo: 1, numOfRows: 10, resultType: 'json' }
    }),
    extractResponse: extractFscStandard
  },
  {
    id: 'fsc_fn_basic',
    name: '금융위_금융회사기본',
    endpoint: 'https://apis.data.go.kr/1160100/service/GetFnCoBasiInfoService',
    operations: ['/getFnCoBasiInfo'],
    queryKey: 'crno',
    queryKeyType: 'crno',
    buildRequest: (crno) => ({
      url: 'https://apis.data.go.kr/1160100/service/GetFnCoBasiInfoService/getFnCoBasiInfo',
      params: { serviceKey: SHARED_SERVICE_KEY, crno, pageNo: 1, numOfRows: 10, resultType: 'json' }
    }),
    extractResponse: extractFscStandard
  },
  {
    id: 'fsc_stock',
    name: '금융위_주식발행',
    endpoint: 'https://apis.data.go.kr/1160100/service/GetStocIssuInfoService_V2',
    operations: ['/getStocIssuStat_V2'],
    queryKey: 'crno',
    queryKeyType: 'crno',
    buildRequest: (crno) => ({
      url: 'https://apis.data.go.kr/1160100/service/GetStocIssuInfoService_V2/getStocIssuStat_V2',
      params: { serviceKey: SHARED_SERVICE_KEY, crno, pageNo: 1, numOfRows: 10, resultType: 'json' }
    }),
    extractResponse: extractFscStandard
  },
  {
    id: 'fsc_dividend',
    name: '금융위_주식배당',
    endpoint: 'https://apis.data.go.kr/1160100/service/GetStocDiviInfoService',
    operations: ['/getStocDiviInfo'],
    queryKey: 'crno',
    queryKeyType: 'crno',
    buildRequest: (crno) => ({
      url: 'https://apis.data.go.kr/1160100/service/GetStocDiviInfoService/getStocDiviInfo',
      params: { serviceKey: SHARED_SERVICE_KEY, crno, pageNo: 1, numOfRows: 10, resultType: 'json' }
    }),
    extractResponse: extractFscStandard
  }
];

/**
 * Pattern B: 2-step Query (2개)
 */
export const TWO_STEP_APIS = [
  {
    id: 'ksd_corp',
    name: '한국예탁결제원_기업정보',
    endpoint: 'https://apis.data.go.kr/1160100/service/GetCorpBasicInfoService_V2',
    queryKeyType: 'companyName',
    buildSearchRequest: (companyName) => ({
      url: 'https://apis.data.go.kr/1160100/service/GetCorpBasicInfoService_V2/getCorpOutline_V2',
      params: { serviceKey: SHARED_SERVICE_KEY, corpNm: companyName, pageNo: 1, numOfRows: 20, resultType: 'json' }
    }),
    extractCandidates: (data) => {
      const items = data?.response?.body?.items?.item || [];
      const arr = Array.isArray(items) ? items : [items].filter(Boolean);
      return arr.map(item => ({
        companyName: item.corpNm || null,
        brno: item.bzno || null,
        crno: item.crno || null,
        address: item.enpBsadr || null,
        representative: item.enpRprFnm || null,
        rawData: item
      }));
    }
  },
  {
    id: 'kised_startup',
    name: '창업진흥원_창업기업',
    endpoint: 'https://apis.data.go.kr/B552735/kisedCertService',
    queryKeyType: 'companyName',
    buildSearchRequest: (companyName) => ({
      url: 'https://apis.data.go.kr/B552735/kisedCertService/getCertList',
      params: { serviceKey: SHARED_SERVICE_KEY, applyBsnmNm: companyName, pageNo: 1, numOfRows: 20, type: 'json' }
    }),
    extractCandidates: (data) => {
      const items = data?.response?.body?.items?.item || [];
      const arr = Array.isArray(items) ? items : [items].filter(Boolean);
      return arr.map(item => ({
        companyName: item.applyBsnmNm || null,
        brno: item.applyBrno || null,
        crno: item.applyCrno || null,
        address: null,
        representative: item.applyRprsvNm || null,
        rawData: item
      }));
    }
  }
];

/**
 * Pattern C: Reverse Match - 공정위 대규모기업집단 (7개)
 */
export const REVERSE_MATCH_APIS = [
  {
    id: 'ftc_group_affiliate',
    name: '공정위_대규모기업집단_소속회사',
    endpoint: 'https://apis.data.go.kr/1130000/appnGroupAffiList',
    operations: ['/getappnGroupAffiList'],
    buildRequest: (groupName) => ({
      url: 'https://apis.data.go.kr/1130000/appnGroupAffiList/getappnGroupAffiList',
      params: { serviceKey: SHARED_SERVICE_KEY, bzentyNm: groupName, pageNo: 1, numOfRows: 100, type: 'json' }
    }),
    extractResponse: (data) => {
      const items = data?.response?.body?.items?.item || [];
      return (Array.isArray(items) ? items : [items].filter(Boolean)).map(item => ({
        companyName: item.bzentyNm || null,
        crno: item.crno || null,
        brno: null,
        groupName: item.groupNm || null,
        rawData: item
      }));
    }
  },
  {
    id: 'ftc_group_list',
    name: '공정위_지정_대규모기업집단',
    endpoint: 'https://apis.data.go.kr/1130000/appnGroupSttusList',
    operations: ['/getappnGroupSttusList'],
    buildRequest: (groupName) => ({
      url: 'https://apis.data.go.kr/1130000/appnGroupSttusList/getappnGroupSttusList',
      params: { serviceKey: SHARED_SERVICE_KEY, groupNm: groupName, pageNo: 1, numOfRows: 100, type: 'json' }
    }),
    extractResponse: (data) => {
      const items = data?.response?.body?.items?.item || [];
      return (Array.isArray(items) ? items : [items].filter(Boolean)).map(item => ({
        companyName: null,
        crno: null,
        brno: null,
        groupName: item.groupNm || null,
        rawData: item
      }));
    }
  },
  {
    id: 'ftc_group_overview',
    name: '공정위_소속회사개요',
    endpoint: 'https://apis.data.go.kr/1130000/affiliationCompSttusList',
    operations: ['/getaffiliationCompSttusList'],
    buildRequest: (groupName) => ({
      url: 'https://apis.data.go.kr/1130000/affiliationCompSttusList/getaffiliationCompSttusList',
      params: { serviceKey: SHARED_SERVICE_KEY, groupNm: groupName, pageNo: 1, numOfRows: 100, type: 'json' }
    }),
    extractResponse: extractFtcGroupStandard
  },
  {
    id: 'ftc_group_finance',
    name: '공정위_소속회사재무',
    endpoint: 'https://apis.data.go.kr/1130000/financeCompSttusList',
    operations: ['/getfinanceCompSttusList'],
    buildRequest: (groupName) => ({
      url: 'https://apis.data.go.kr/1130000/financeCompSttusList/getfinanceCompSttusList',
      params: { serviceKey: SHARED_SERVICE_KEY, groupNm: groupName, pageNo: 1, numOfRows: 100, type: 'json' }
    }),
    extractResponse: extractFtcGroupStandard
  },
  {
    id: 'ftc_group_stockholder',
    name: '공정위_소속회사주주',
    endpoint: 'https://apis.data.go.kr/1130000/stockholderCompSttusList',
    operations: ['/getstockholderCompSttusList'],
    buildRequest: (groupName) => ({
      url: 'https://apis.data.go.kr/1130000/stockholderCompSttusList/getstockholderCompSttusList',
      params: { serviceKey: SHARED_SERVICE_KEY, groupNm: groupName, pageNo: 1, numOfRows: 100, type: 'json' }
    }),
    extractResponse: extractFtcGroupStandard
  },
  {
    id: 'ftc_group_executive',
    name: '공정위_소속회사임원',
    endpoint: 'https://apis.data.go.kr/1130000/executiveCompSttusList',
    operations: ['/getexecutiveCompSttusList'],
    buildRequest: (groupName) => ({
      url: 'https://apis.data.go.kr/1130000/executiveCompSttusList/getexecutiveCompSttusList',
      params: { serviceKey: SHARED_SERVICE_KEY, groupNm: groupName, pageNo: 1, numOfRows: 100, type: 'json' }
    }),
    extractResponse: extractFtcGroupStandard
  },
  {
    id: 'ftc_group_changes',
    name: '공정위_계열편입제외변경',
    endpoint: 'https://apis.data.go.kr/1130000/tyAssetsRentDelngDtlsList',
    operations: ['/gettyAssetsRentDelngDtlsList'],
    buildRequest: (groupName) => ({
      url: 'https://apis.data.go.kr/1130000/tyAssetsRentDelngDtlsList/gettyAssetsRentDelngDtlsList',
      params: { serviceKey: SHARED_SERVICE_KEY, groupNm: groupName, pageNo: 1, numOfRows: 100, type: 'json' }
    }),
    extractResponse: extractFtcGroupStandard
  }
];

/**
 * Pattern D: Bulk + Filter (1개 - 근로복지공단만 유효)
 * 행안부_후원방문판매, 식약처_의약품, 식약처_화장품: 404 (deprecated) → 제거
 */
export const BULK_FILTER_APIS = [
  {
    id: 'comwel_insurance',
    name: '근로복지공단_고용산재보험',
    endpoint: 'https://apis.data.go.kr/B490001/gySjbPstateInfoService',
    operations: ['/getGySjBoheomBsshItem'],
    brnoField: 'saeopjaDrno',
    nameField: 'saeopjangNm',
    totalRecords: 6358198,
    strategy: 'db',
    responseFormat: 'json',
    buildPageRequest: (pageNo, numOfRows = 1000) => ({
      url: 'https://apis.data.go.kr/B490001/gySjbPstateInfoService/getGySjBoheomBsshItem',
      params: { serviceKey: SHARED_SERVICE_KEY, pageNo, numOfRows }
    }),
    extractItems: (data) => {
      const items = data?.response?.body?.items?.item || [];
      return Array.isArray(items) ? items : [items].filter(Boolean);
    },
    extractBrno: (item) => item.saeopjaDrno ? String(item.saeopjaDrno) : null
  }
];

/**
 * Pattern E: 2-step Query with partial brno match (국민연금)
 * Step 1: Search by company name → get candidates with masked brno
 * Step 2: Match by brno prefix (first 6 digits) → get detail via seq
 */
export const NPS_API = {
  id: 'nps_workplace',
  name: '국민연금공단_가입사업장내역',
  endpoint: 'https://apis.data.go.kr/B552015/NpsBplcInfoInqireServiceV2',
  operations: ['/getBassInfoSearchV2', '/getDetailInfoSearchV2', '/getPdAcctoSttusInfoSearchV2'],
  queryKeyType: 'companyName+brno',
  responseFormat: 'xml',

  /**
   * Step 1: Search by company name (tries multiple variants)
   */
  buildSearchRequest: (companyName) => ({
    url: 'https://apis.data.go.kr/B552015/NpsBplcInfoInqireServiceV2/getBassInfoSearchV2',
    params: { serviceKey: SHARED_SERVICE_KEY, wkplNm: companyName, pageNo: 1, numOfRows: 50 }
  }),

  /**
   * Step 2: Get detail by seq (from matched candidate)
   */
  buildDetailRequest: (seq) => ({
    url: 'https://apis.data.go.kr/B552015/NpsBplcInfoInqireServiceV2/getDetailInfoSearchV2',
    params: { serviceKey: SHARED_SERVICE_KEY, seq, pageNo: 1, numOfRows: 1 }
  }),

  /**
   * Step 3: Get period-based status by seq
   */
  buildPeriodRequest: (seq) => ({
    url: 'https://apis.data.go.kr/B552015/NpsBplcInfoInqireServiceV2/getPdAcctoSttusInfoSearchV2',
    params: { serviceKey: SHARED_SERVICE_KEY, seq, pageNo: 1, numOfRows: 1 }
  }),

  /**
   * Extract candidates from XML search response.
   * Strategy: 1) brno prefix match, 2) fallback to shortest name match
   * since API masks brno (last 4 digits) and some companies register
   * with a different brno than commonly known.
   */
  extractCandidates: (xmlStr, knownBrno, searchName) => {
    const items = parseXmlItems(xmlStr);
    const brnoPrefix = knownBrno ? knownBrno.substring(0, 6) : null;

    const toCandidate = (item) => ({
      companyName: item.wkplNm || null,
      brno: item.bzowrRgstNo || null, // Masked: 124810****
      seq: item.seq || null,
      address: item.wkplRoadNmDtlAddr || null,
      status: item.wkplJnngStcd || null, // 1=가입, 2=탈퇴
      styleCode: item.wkplStylDvcd || null,
      dataCrtYm: item.dataCrtYm || null,
      rawData: item
    });

    // Strategy 1: Filter by brno prefix
    if (brnoPrefix) {
      const brnoMatched = items.filter(
        item => item.bzowrRgstNo && item.bzowrRgstNo.startsWith(brnoPrefix)
      );
      if (brnoMatched.length > 0) {
        return brnoMatched.map(toCandidate);
      }
    }

    // Strategy 2: Fallback — score entries by name similarity to searchName
    const NON_COMPANY = /어린이집|급식소|마을금고|직원식당|사내식당|기숙사|출장소|연수원/;
    const candidates = items
      .filter(item => item.wkplNm && item.wkplNm.length < 40)
      .filter(item => !NON_COMPANY.test(item.wkplNm))
      .map(item => {
        const name = item.wkplNm;
        // Exact match with search variant
        if (searchName && name === searchName) return { item, score: 100 };
        // Name contains 주식회사/㈜/(주) suffix/prefix of the base name
        const cleanName = name
          .replace(/주식회사\s*/g, '').replace(/\s*주식회사/g, '')
          .replace(/\(주\)\s*/g, '').replace(/\s*\(주\)/g, '')
          .replace(/㈜\s*/g, '').replace(/\s*㈜/g, '').trim();
        const cleanSearch = (searchName || '')
          .replace(/주식회사\s*/g, '').replace(/\s*주식회사/g, '')
          .replace(/\(주\)\s*/g, '').replace(/\s*\(주\)/g, '')
          .replace(/㈜\s*/g, '').replace(/\s*㈜/g, '').trim();
        if (cleanSearch && cleanName === cleanSearch) return { item, score: 95 };
        if (cleanSearch && cleanName.startsWith(cleanSearch)) {
          const rest = cleanName.substring(cleanSearch.length);
          // Word boundary: rest starts with space (e.g., "에스케이하이닉스 주식회사")
          if (rest.startsWith(' ') || rest === '') return { item, score: 90 };
          // Non-boundary: rest is part of a different name (e.g., "카카오토")
          return { item, score: 60 };
        }
        if (cleanSearch && cleanName.includes(cleanSearch)) return { item, score: 55 };
        return { item, score: 50 - name.length }; // shorter = higher
      })
      .sort((a, b) => b.score - a.score);

    // Require score >= 85 to avoid false positives
    // (e.g. "케이피에이카카오" containing "카카오" = score 70, should be rejected)
    if (candidates.length > 0 && candidates[0].score >= 85) {
      return [toCandidate(candidates[0].item)];
    }

    return items.map(toCandidate);
  },

  /**
   * Extract detail from XML detail response
   */
  extractDetail: (xmlStr) => {
    const items = parseXmlItems(xmlStr);
    if (items.length === 0) return null;
    const item = items[0];
    return {
      companyName: item.wkplNm || null,
      brno: item.bzowrRgstNo || null,
      employeeCount: item.jnngpCnt ? parseInt(item.jnngpCnt) : null,
      monthlyPensionAmount: item.crrmmNtcAmt ? parseInt(item.crrmmNtcAmt) : null,
      industryCode: item.wkplIntpCd || null,
      industryName: item.vldtVlKrnNm || null,
      address: item.wkplRoadNmDtlAddr || null,
      joinDate: item.adptDt || null,
      leaveDate: item.scsnDt && item.scsnDt !== '00010101' ? item.scsnDt : null,
      status: item.wkplJnngStcd || null,
      rawData: item
    };
  },

  /**
   * Extract period status from XML
   */
  extractPeriodStatus: (xmlStr) => {
    const items = parseXmlItems(xmlStr);
    if (items.length === 0) return null;
    const item = items[0];
    return {
      newSubscribers: item.nwAcqzrCnt ? parseInt(item.nwAcqzrCnt) : null,
      lostSubscribers: item.lssJnngpCnt ? parseInt(item.lssJnngpCnt) : null,
      rawData: item
    };
  },

  /**
   * Name variants to try for search (Korean company name patterns).
   * NPS uses LIKE search, so we try multiple patterns including
   * Korean phonetic versions of English letters.
   */
  getNameVariants: (companyName) => {
    const base = companyName
      .replace(/^주식회사\s*/g, '').replace(/\s*주식회사$/g, '')
      .replace(/^\(주\)\s*/g, '').replace(/\s*\(주\)$/g, '')
      .replace(/^㈜\s*/g, '').replace(/\s*㈜$/g, '')
      .trim();

    // Korean phonetic mapping for common English prefixes in company names
    const PHONETIC_MAP = {
      'LG': '엘지', 'SK': '에스케이', 'KT': '케이티', 'GS': '지에스',
      'CJ': '씨제이', 'LS': '엘에스', 'HD': '에이치디', 'DL': '디엘',
      'LX': '엘엑스', 'HJ': '에이치제이',
    };

    // Generate Korean phonetic version if name starts with English prefix
    let phoneticBase = null;
    for (const [eng, kor] of Object.entries(PHONETIC_MAP)) {
      if (base.startsWith(eng)) {
        phoneticBase = base.replace(eng, kor);
        break;
      }
    }

    const variants = [
      base + '(주)',         // 삼성전자(주)
      '(주)' + base,         // (주)삼성전자
      '주식회사 ' + base,    // 주식회사 카카오
      base + ' 주식회사',    // 에스케이하이닉스 주식회사
      base,                  // 삼성전자 — broad LIKE match
    ];

    // Add Korean phonetic variants if applicable
    if (phoneticBase) {
      variants.splice(0, 0,
        phoneticBase + '(주)',       // 엘지전자(주)
        phoneticBase,                // 엘지전자
        phoneticBase + ' 주식회사',  // 에스케이하이닉스 주식회사
      );
    }

    // Deduplicate
    return [...new Set(variants)];
  }
};

/**
 * Parse XML items from data.go.kr response
 */
function parseXmlItems(xml) {
  if (!xml || typeof xml !== 'string') return [];
  const items = xml.match(/<item>([\s\S]*?)<\/item>/g) || [];
  return items.map(item => {
    const fields = {};
    const tagRegex = /<([a-zA-Z]\w*)>([^<]*)<\/[a-zA-Z]\w*>/g;
    let m;
    while ((m = tagRegex.exec(item)) !== null) {
      fields[m[1]] = m[2];
    }
    return fields;
  });
}

/**
 * 금융위 표준 응답 추출기
 */
function extractFscStandard(data) {
  const items = data?.response?.body?.items?.item || [];
  const arr = Array.isArray(items) ? items : [items].filter(Boolean);
  if (arr.length === 0) return null;
  return {
    companyName: arr[0]?.corpNm || arr[0]?.fncoNm || null,
    brno: arr[0]?.bzno || null,
    crno: arr[0]?.crno || null,
    address: arr[0]?.enpBsadr || null,
    representative: arr[0]?.enpRprFnm || null,
    industryCode: null,
    rawData: arr
  };
}

/**
 * 공정위 대규모기업집단 표준 응답 추출기
 */
function extractFtcGroupStandard(data) {
  const items = data?.response?.body?.items?.item || [];
  return (Array.isArray(items) ? items : [items].filter(Boolean)).map(item => ({
    companyName: item.bzentyNm || item.corpNm || null,
    crno: item.crno || null,
    brno: null,
    groupName: item.groupNm || null,
    rawData: item
  }));
}

/**
 * 전체 API 레지스트리
 */
export const API_REGISTRY = {
  directQuery: DIRECT_QUERY_APIS,
  twoStep: TWO_STEP_APIS,
  reverseMatch: REVERSE_MATCH_APIS,
  bulkFilter: BULK_FILTER_APIS,
  nps: NPS_API
};

export default API_REGISTRY;

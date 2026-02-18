/**
 * Expanded API Registry — Phase 2.5 신규 Priority Tier 1-3 APIs
 *
 * 47개 신규 API: 금융위(13), 공정위(12), 식약처(13), 환경공단(7), 기타(5)
 * 3개 제외: 공정위 등록상세 3개 (서버 500 에러)
 *
 * Patterns follow apiRegistry.js conventions:
 *   - buildRequest(identifier) → { url, params, method?, body? }
 *   - extractResponse(data)    → standardized object or array
 */

import dotenv from 'dotenv';
dotenv.config();

const SHARED_SERVICE_KEY = process.env.DATA_GO_KR_SHARED_KEY || process.env.NTS_API_KEY;

// ============================================================
// Shared extractors
// ============================================================

/** Standard FSC JSON response: data.response.body.items.item */
function extractFscItems(data) {
  const items = data?.response?.body?.items?.item;
  if (!items) return [];
  return Array.isArray(items) ? items : [items].filter(Boolean);
}

/** Standard FSC extractor — returns first item as standardized object */
function extractFscStandard(data) {
  const arr = extractFscItems(data);
  if (arr.length === 0) return null;
  const item = arr[0];
  return {
    companyName: item.corpNm || item.cmpyNm || item.fncoNm || item.stckIssuCmpyNm || null,
    brno: item.bzno || null,
    crno: item.crno || null,
    address: null,
    representative: null,
    industryCode: null,
    rawData: arr.length === 1 ? item : arr
  };
}

/** FTC EgovMap XML response — parse to key/value pairs */
function parseFtcEgovMap(data) {
  const str = typeof data === 'string' ? data : JSON.stringify(data);
  // Check for error
  if (str.includes('ESSENTIAL_PARAMETER_ERROR') || str.includes('resultCode>11<')) return null;
  // Parse items from XML list
  const itemBlocks = str.match(/<item>([\s\S]*?)<\/item>/g) || [];
  return itemBlocks.map(block => {
    const fields = {};
    const tagRegex = /<([a-zA-Z]\w*)>([^<]*)<\/[a-zA-Z]\w*>/g;
    let m;
    while ((m = tagRegex.exec(block)) !== null) { fields[m[1]] = m[2]; }
    return fields;
  });
}

/** MFDS header/body JSON: data.header.resultCode === '00' or '0000' */
function extractMfdsItems(data) {
  // MFDS APIs have various structures
  if (data?.header?.resultCode === '00' || data?.header?.resultCode === '0000') {
    const items = data?.body?.items || data?.body?.item || [];
    return Array.isArray(items) ? items : [items].filter(Boolean);
  }
  // Some MFDS use response.body.items.item
  const items = data?.response?.body?.items?.item;
  if (items) return Array.isArray(items) ? items : [items].filter(Boolean);
  return [];
}

/** KECO JSON: data.header + data.body */
function extractKecoItems(data) {
  if (data?.header?.resultCode === '00' || data?.header?.resultCode === '0000') {
    const items = data?.body?.items || data?.body?.item || [];
    return Array.isArray(items) ? items : [items].filter(Boolean);
  }
  // Some KECO use flat body
  if (data?.body && typeof data.body === 'object') {
    return data.body.items || data.body.item || [];
  }
  return [];
}

// ============================================================
// Factory functions for common patterns
// ============================================================

/** Create a standard FSC crno-query API */
function fscApi(id, name, url, opts = {}) {
  return {
    id,
    name,
    provider: '금융위원회',
    dataGoKrId: opts.dataGoKrId || null,
    endpoint: url.replace(/\/[^/]+$/, ''),
    queryKeyType: opts.queryKeyType || 'crno',
    responseFormat: 'json',
    buildRequest: (identifier) => ({
      url,
      params: {
        serviceKey: SHARED_SERVICE_KEY,
        ...(opts.queryKeyType === 'isin' ? { isinCd: identifier } :
            opts.queryKeyType === 'date' ? {} :
            { crno: identifier }),
        pageNo: 1,
        numOfRows: opts.numOfRows || 10,
        resultType: 'json',
        ...(opts.extraParams || {})
      }
    }),
    extractResponse: opts.extractor || extractFscStandard
  };
}

/** Create a FTC brno-query API (EgovMap XML response) */
function ftcBrnoApi(id, name, url, opts = {}) {
  return {
    id,
    name,
    provider: '공정거래위원회',
    dataGoKrId: opts.dataGoKrId || null,
    endpoint: url.replace(/\/[^/]+$/, ''),
    queryKeyType: 'brno',
    responseFormat: opts.format || 'xml',
    buildRequest: (brno) => ({
      url,
      params: {
        serviceKey: SHARED_SERVICE_KEY,
        brno,
        pageNo: 1,
        numOfRows: opts.numOfRows || 10,
        type: 'json',
        ...(opts.extraParams || {})
      }
    }),
    extractResponse: (data) => {
      // Try JSON first (some FTC APIs return JSON with type=json)
      if (data?.items || data?.item) {
        const items = data.items || data.item;
        return Array.isArray(items) ? items : [items];
      }
      // Fall back to EgovMap XML parsing
      return parseFtcEgovMap(data);
    }
  };
}

/** Create a FTC group-level API (reverse match / year-based) */
function ftcGroupApi(id, name, url, opts = {}) {
  return {
    id,
    name,
    provider: '공정거래위원회',
    dataGoKrId: opts.dataGoKrId || null,
    endpoint: url.replace(/\/[^/]+$/, ''),
    queryKeyType: opts.queryKeyType || 'none',
    responseFormat: 'json',
    buildRequest: (params = {}) => ({
      url,
      params: {
        serviceKey: SHARED_SERVICE_KEY,
        pageNo: 1,
        numOfRows: opts.numOfRows || 100,
        type: 'json',
        ...(opts.extraParams || {}),
        ...params
      }
    }),
    extractResponse: (data) => {
      // FTC group APIs return data at top level with custom key
      const key = opts.dataKey;
      const items = key ? data?.[key] : null;
      if (items) return Array.isArray(items) ? items : [items];
      // Fallback: try standard response body
      const stdItems = data?.response?.body?.items?.item;
      if (stdItems) return Array.isArray(stdItems) ? stdItems : [stdItems];
      return parseFtcEgovMap(data) || [];
    }
  };
}

/** Create a MFDS brno-query API */
function mfdsApi(id, name, url, queryParam, opts = {}) {
  return {
    id,
    name,
    provider: '식품의약품안전처',
    dataGoKrId: opts.dataGoKrId || null,
    endpoint: url.replace(/\/[^/]+$/, ''),
    queryKeyType: 'brno',
    queryKeyParam: queryParam,
    responseFormat: 'json',
    buildRequest: (brno) => ({
      url,
      params: {
        serviceKey: SHARED_SERVICE_KEY,
        [queryParam]: brno,
        pageNo: 1,
        numOfRows: opts.numOfRows || 10,
        type: 'json',
        ...(opts.extraParams || {})
      }
    }),
    extractResponse: (data) => {
      const items = extractMfdsItems(data);
      if (items.length === 0) return null;
      return { items, rawData: data };
    }
  };
}

/** Create a KECO brno-query API */
function kecoApi(id, name, url, queryParam, opts = {}) {
  return {
    id,
    name,
    provider: '한국환경공단',
    dataGoKrId: opts.dataGoKrId || null,
    endpoint: url.replace(/\/[^/]+$/, ''),
    queryKeyType: 'brno',
    queryKeyParam: queryParam,
    responseFormat: 'json',
    buildRequest: (brno) => ({
      url,
      params: {
        serviceKey: SHARED_SERVICE_KEY,
        [queryParam]: brno,
        pageNo: 1,
        numOfRows: opts.numOfRows || 10,
        type: 'json',
        ...(opts.extraParams || {})
      }
    }),
    extractResponse: (data) => {
      const items = extractKecoItems(data);
      if (items.length === 0) return null;
      return { items, rawData: data };
    }
  };
}

// ============================================================
// 금융위원회 신규 13개 — crno Direct Query (Pattern A)
// ============================================================

export const FSC_EXPANDED_APIS = [
  fscApi('fsc_disc_dividend', '금융위_공시정보_배당',
    'https://apis.data.go.kr/1160100/service/GetDiscInfoService_V2/getDiviDiscInfo_V2',
    { dataGoKrId: '15059649' }),

  fscApi('fsc_krx_listed', '금융위_KRX상장종목정보',
    'https://apis.data.go.kr/1160100/service/GetKrxListedInfoService/getItemInfo',
    { dataGoKrId: '15094775', numOfRows: 100 }),

  fscApi('fsc_fn_financial_credit', '금융위_금융회사재무신용정보',
    'https://apis.data.go.kr/1160100/service/GetFnCoFinaStatCredInfoService_V2/getFnCoBs_V2',
    { dataGoKrId: '15059594' }),

  fscApi('fsc_fund_raising', '금융위_자금조달공시정보',
    'https://apis.data.go.kr/1160100/service/GetPBFincDiscInfoService/getPrplcCptUseInfo',
    { dataGoKrId: '15139255' }),

  fscApi('fsc_stock_issuance_disc', '금융위_주식발행공시정보',
    'https://apis.data.go.kr/1160100/GetStkIssuInfoService/getStkIssuInfo',
    { dataGoKrId: '15150946' }),

  fscApi('fsc_stock_distribution', '금융위_주식분포및사고주권',
    'https://apis.data.go.kr/1160100/service/GetStocTradInfoService/getIrreRigforSecu',
    { dataGoKrId: '15043364', numOfRows: 50 }),

  fscApi('fsc_stock_rights_schedule', '금융위_주식권리일정',
    'https://apis.data.go.kr/1160100/service/GetStocRighScheService/getRighExerReasSche',
    { dataGoKrId: '15059609' }),

  fscApi('fsc_borrowing_investment', '금융위_차입투자정보',
    'https://apis.data.go.kr/1160100/service/GetBorrInveInfoService/getNPLReviInfo',
    { dataGoKrId: '15059585' }),

  fscApi('fsc_stock_deposit', '금융위_주식등록예탁가능',
    'https://apis.data.go.kr/1160100/service/GetStocDepoInfoService/getDepoAvaiWhet',
    { dataGoKrId: '15059607' }),

  fscApi('fsc_dr_international', '금융위_국제거래종목(DR)',
    'https://apis.data.go.kr/1160100/service/GetDrTradItemInfoService/getDepoReceItem',
    { dataGoKrId: '15059582' }),

  // 시세 APIs — need basDt (date) or isinCd instead of crno
  fscApi('fsc_stock_price', '금융위_주식시세정보',
    'https://apis.data.go.kr/1160100/service/GetStockSecuritiesInfoService/getStockPriceInfo',
    { dataGoKrId: '15094808', queryKeyType: 'date', numOfRows: 50 }),

  fscApi('fsc_etf_price', '금융위_증권상품시세(ETF)',
    'https://apis.data.go.kr/1160100/service/GetSecuritiesProductInfoService/getETFPriceInfo',
    { dataGoKrId: '15094806', queryKeyType: 'date', numOfRows: 50 }),

  fscApi('fsc_bond_rights_schedule', '금융위_채권권리일정',
    'https://apis.data.go.kr/1160100/service/GetBondRighScheInfoService/getBondRighExerSche',
    { dataGoKrId: '15059611' }),
];

// ============================================================
// 공정거래위원회 신규 12개 (3개 500에러 제외)
// ============================================================

export const FTC_EXPANDED_APIS = [
  // Reverse match: group-level data
  ftcGroupApi('ftc_group_industry', '공정위_대규모기업집단_참여업종',
    'https://apis.data.go.kr/1130000/typeOfBusinessCompSttusList/typeOfBusinessCompSttusListApi',
    { dataGoKrId: '15091902', dataKey: 'typeOfBusinessCompSttus' }),

  ftcGroupApi('ftc_holding_subsidiaries', '공정위_지주회사_자회사손자회사',
    'https://apis.data.go.kr/1130000/holdingProgCompSttusList/holdingProgCompStusListApi',
    { dataGoKrId: '15091909', dataKey: 'holdingProgCompSttus' }),

  // brno direct query: 인허가 현황/상세
  ftcBrnoApi('ftc_door_sales_status', '공정위_방문판매_등록현황',
    'https://apis.data.go.kr/1130000/ClslBs_2Service/getClslBsBiznoInfo_2',
    { dataGoKrId: '15126302' }),
  // 15126301 방문판매_등록상세 — SERVER_ERROR(500), 제외

  ftcBrnoApi('ftc_sponsored_sales_status', '공정위_후원방문판매_등록현황',
    'https://apis.data.go.kr/1130000/SrlClslBs_2Service/getSrlClslBsBiznoInfo_2',
    { dataGoKrId: '15126329' }),
  // 15126332 후원방문판매_등록상세 — SERVER_ERROR(500), 제외

  ftcBrnoApi('ftc_telecom_sales_detail', '공정위_통신판매_등록상세',
    'https://apis.data.go.kr/1130000/MllBsDtl_3Service/getMllBsInfoDetail_3',
    { dataGoKrId: '15126315' }),

  ftcBrnoApi('ftc_phone_sales_status', '공정위_전화권유판매_등록현황',
    'https://apis.data.go.kr/1130000/TelidsalBs_2Service/getTelidsalBsBiznoInfo_2',
    { dataGoKrId: '15126345' }),
  // 15126339 전화권유판매_등록상세 — SERVER_ERROR(500), 제외

  ftcBrnoApi('ftc_prepaid_install_status', '공정위_선불식할부거래_등록현황',
    'https://apis.data.go.kr/1130000/InstallplanBs_2Service/getInstallplanBsInfo_2',
    { dataGoKrId: '15126348' }),

  ftcBrnoApi('ftc_prepaid_install_detail', '공정위_선불식할부거래_등록상세',
    'https://apis.data.go.kr/1130000/InstallplanBsDtl_3Service/getInstallplanBsInfoDetail_3',
    { dataGoKrId: '15126347' }),

  ftcBrnoApi('ftc_prepaid_install_info', '공정위_선불식할부거래_정보',
    'https://apis.data.go.kr/1130000/InstallplanBsIf_2Service/getInstallplanBsIfBiznoInfo_2',
    { dataGoKrId: '15127078' }),

  ftcBrnoApi('ftc_prepaid_install_info_detail', '공정위_선불식할부거래_정보상세',
    'https://apis.data.go.kr/1130000/InstallplanBsIfDtl_2Service/getInstallplanBsIfInfoDetail_2',
    { dataGoKrId: '15127082' }),

  // Year-based bulk: 가맹정보 (output contains brno+crno)
  ftcGroupApi('ftc_franchise_hq', '공정위_가맹정보_가맹본부등록',
    'https://apis.data.go.kr/1130000/FftcJnghdqrtrsRgsInfo2_Service/getjnghdqrtrsListinfo',
    { dataGoKrId: '15125441', queryKeyType: 'year',
      extraParams: { yr: new Date().getFullYear() - 1 } }),

  ftcGroupApi('ftc_fairdata_franchise', '공정위_페어데이터_가맹본부현황',
    'https://apis.data.go.kr/1130000/FftcCtpvJnghdqrtrsStusService/getFftcCtpvJnghdqrtrsStus',
    { dataGoKrId: '15143521', queryKeyType: 'year',
      extraParams: { yr: new Date().getFullYear() - 1 } }),
];

// ============================================================
// 식품의약품안전처 신규 13개 — brno/BRNO/bizrno Direct Query
// ============================================================

export const MFDS_APIS = [
  mfdsApi('mfds_school_food_supplier', '식약처_급식_식재료공급업체',
    'https://apis.data.go.kr/1471000/SlunchScolIngrSuplyEntpInfoService/getSlunchScolIngrSuplyEntpInfoService',
    'BRNO', { dataGoKrId: '15117398' }),

  mfdsApi('mfds_school_food_caterer', '식약처_급식_위탁급식업체',
    'https://apis.data.go.kr/1471000/SlunchScolCnsgSlunchEntpInfoService/getSlunchScolCnsgSlunchEntpInfoService',
    'BRNO', { dataGoKrId: '15117399' }),

  mfdsApi('mfds_reference_drug', '식약처_대조약조회',
    'https://apis.data.go.kr/1471000/MdcCompDrugInfoService04/getMdcCompDrugList04',
    'bizrno', { dataGoKrId: '15058806' }),

  mfdsApi('mfds_medical_device_gmp', '식약처_의료기기GMP지정현황',
    'https://apis.data.go.kr/1471000/MdlpGmpAppnSttusInfoService02/getItemGroupList01',
    'brno', { dataGoKrId: '15058930' }),

  mfdsApi('mfds_medical_device_distributor', '식약처_의료기기유통업체',
    'https://apis.data.go.kr/1471000/MdeqCircEntpInfoService/getMdeqCircEntpInfoService',
    'BRNO', { dataGoKrId: '15117405' }),

  mfdsApi('mfds_medical_device_integrated', '식약처_의료기기통합업체',
    'https://apis.data.go.kr/1471000/MdeqItgrtEntpInfoService/getMdeqItgrtEntpInfoService',
    'BRNO', { dataGoKrId: '15117407' }),

  mfdsApi('mfds_medical_device_sanctions', '식약처_의료기기행정처분',
    'https://apis.data.go.kr/1471000/MdeqAdmmInfoService1/getMdeqAdmmInfoService1',
    'BRNO', { dataGoKrId: '15117141' }),

  mfdsApi('mfds_quasi_drug_production', '식약처_의약외품생산수입실적',
    'https://apis.data.go.kr/1471000/QdrgProdIprtPfmc/getQdrgProdIprtPfmc',
    'BIZRNO', { dataGoKrId: '15115469' }),

  mfdsApi('mfds_quasi_drug_permit', '식약처_의약외품제품허가',
    'https://apis.data.go.kr/1471000/QdrgPrdtPrmsnInfoService03/getQdrgPrdtPrmsnInfoInq03',
    'bizrno', { dataGoKrId: '15095679' }),

  mfdsApi('mfds_drug_identification', '식약처_의약품낱알식별',
    'https://apis.data.go.kr/1471000/MdcinGrnIdntfcInfoService03/getMdcinGrnIdntfcInfoList03',
    'bizrno', { dataGoKrId: '15057639' }),

  mfdsApi('mfds_drug_expiry', '식약처_의약품유효기간',
    'https://apis.data.go.kr/1471000/DrugPrdlstVldPrdInfoService01/getDrugPrdlstVldPrdInfoService01',
    'BIZRNO', { dataGoKrId: '15111775' }),

  mfdsApi('mfds_drug_recall', '식약처_의약품회수판매중지',
    'https://apis.data.go.kr/1471000/MdcinRtrvlSleStpgeInfoService04/getMdcinRtrvlSleStpgeEtcItem03',
    'bizrno', { dataGoKrId: '15059114' }),

  mfdsApi('mfds_dur_info', '식약처_DUR품목정보',
    'https://apis.data.go.kr/1471000/DURPrdlstInfoService03/getUsjntTabooInfoList03',
    'bizrno', { dataGoKrId: '15059486' }),
];

// ============================================================
// 한국환경공단 신규 7개 — brno/brNo Direct Query
// ============================================================

export const KECO_APIS = [
  kecoApi('keco_nonpoint_pollution', '환경공단_비점오염저감시설',
    'https://apis.data.go.kr/B552584/kecoapi/TpYnNppService/getNpsFcYn',
    'brno', { dataGoKrId: '15124968' }),

  kecoApi('keco_recycling_certification', '환경공단_순환자원인정업체',
    'https://apis.data.go.kr/B552584/kecoapi/rotatRsrcRcgService/getRotatRsrcRcgBzentyInfo',
    'brNo', { dataGoKrId: '15141648' }),

  kecoApi('keco_recycling_distribution', '환경공단_순환자원유통지원',
    'https://apis.data.go.kr/B552584/kecoapi/rtlSprtService/getRtlSprtInfo',
    'brno', { dataGoKrId: '15141609' }),

  kecoApi('keco_allbaro_member', '환경공단_올바로회원정보',
    'https://apis.data.go.kr/B552584/kecoapi/TpYnAbrMbrService/getAllbaroMbrTpYn',
    'brno', { dataGoKrId: '15125000' }),

  kecoApi('keco_electronics_recycling', '환경공단_전기전자재활용업체',
    'https://apis.data.go.kr/B552584/kecoapi/ecoassysBzentyService/getEcoassysBzentyInfo',
    'brNo', { dataGoKrId: '15141647' }),

  kecoApi('keco_measurement_agency', '환경공단_측정대행업체',
    'https://apis.data.go.kr/B552584/kecoapi/EmaMeasService/getMeasCmpyReg',
    'brno', { dataGoKrId: '15124997' }),

  kecoApi('keco_waste_disposal', '환경공단_폐기물처리업체',
    'https://apis.data.go.kr/B552584/kecoapi/wstdspBzentyService/getWstdspBzentyInfo',
    'brNo', { dataGoKrId: '15141649' }),
];

// ============================================================
// 기타 Priority 상위 5개
// ============================================================

export const MISC_PRIORITY_APIS = [
  {
    id: 'kipo_patent_register',
    name: '지식재산처_등록원부',
    provider: '특허청',
    dataGoKrId: '15124946',
    endpoint: 'https://apis.data.go.kr/1430000/PttRgstRtInfoInqSvc',
    queryKeyType: 'patentNo',
    responseFormat: 'json',
    buildRequest: (patentNo) => ({
      url: 'https://apis.data.go.kr/1430000/PttRgstRtInfoInqSvc/getPatentRegisterHistory',
      params: { serviceKey: SHARED_SERVICE_KEY, patentNo, pageNo: 1, numOfRows: 10, type: 'json' }
    }),
    extractResponse: (data) => {
      if (data?.resultCode !== '00' && data?.resultCode !== '0000') return null;
      return { totalCount: data.totalCount, rawData: data };
    }
  },
  {
    id: 'hrdkorea_training',
    name: '산업인력공단_기업별훈련참여정보',
    provider: '한국산업인력공단',
    dataGoKrId: '15110018',
    endpoint: 'https://apis.data.go.kr/B490007/hrd4uService1',
    queryKeyType: 'brno',
    responseFormat: 'json',
    buildRequest: (brno) => ({
      url: 'https://apis.data.go.kr/B490007/hrd4uService1/getBizHrdInfo',
      params: { serviceKey: SHARED_SERVICE_KEY, v_saeopjaDrno: brno, pageNo: 1, numOfRows: 10, type: 'json' }
    }),
    extractResponse: (data) => {
      const items = data?.responseBody?.items || [];
      return Array.isArray(items) && items.length > 0 ? { items, rawData: data } : null;
    }
  },
  {
    id: 'semas_commercial_district',
    name: '소상공인_상가상권정보',
    provider: '소상공인시장진흥공단',
    dataGoKrId: '15012005',
    endpoint: 'https://apis.data.go.kr/B553077/api/open/sdsc2',
    queryKeyType: 'area',
    responseFormat: 'json',
    buildRequest: (params = {}) => ({
      url: 'https://apis.data.go.kr/B553077/api/open/sdsc2/storeZoneOne',
      params: { serviceKey: SHARED_SERVICE_KEY, pageNo: 1, numOfRows: 10, type: 'json', ...params }
    }),
    extractResponse: (data) => {
      if (data?.header?.resultCode === '00') {
        return { items: data?.body?.items || [], rawData: data };
      }
      return null;
    }
  },
  // 다단계판매 — brno/등록번호 query
  ftcBrnoApi('ftc_mlm_info', '공정위_다단계판매_정보',
    'https://apis.data.go.kr/1130000/MvlBsIf_2Service/getMvlBsIfCoRegNoInfo_2',
    { dataGoKrId: '15127059' }),

  ftcBrnoApi('ftc_mlm_info_detail', '공정위_다단계판매_정보상세',
    'https://apis.data.go.kr/1130000/MvlBsIfDtl_2Service/getMvlBsIfInfoDetail_2',
    { dataGoKrId: '15127067' }),
];

// ============================================================
// Combined Export
// ============================================================

export const EXPANDED_DIRECT_QUERY_APIS = [
  ...FSC_EXPANDED_APIS,
  ...FTC_EXPANDED_APIS.filter(a => a.queryKeyType === 'brno'),
  ...MFDS_APIS,
  ...KECO_APIS,
  ...MISC_PRIORITY_APIS.filter(a => a.queryKeyType === 'brno' || a.queryKeyType === 'patentNo'),
];

export const EXPANDED_REVERSE_MATCH_APIS = [
  ...FTC_EXPANDED_APIS.filter(a => a.queryKeyType === 'none'),
];

export const EXPANDED_BULK_APIS = [
  ...FTC_EXPANDED_APIS.filter(a => a.queryKeyType === 'year'),
  ...MISC_PRIORITY_APIS.filter(a => a.queryKeyType === 'area'),
];

export const EXPANDED_API_REGISTRY = {
  directQuery: EXPANDED_DIRECT_QUERY_APIS,
  reverseMatch: EXPANDED_REVERSE_MATCH_APIS,
  bulkFilter: EXPANDED_BULK_APIS,
  // Flatten all for iteration
  all: [...FSC_EXPANDED_APIS, ...FTC_EXPANDED_APIS, ...MFDS_APIS, ...KECO_APIS, ...MISC_PRIORITY_APIS],
};

export default EXPANDED_API_REGISTRY;

/**
 * Procurement Adapter — 조달청 나라장터 (Korea Public Procurement Service)
 *
 * Searches public procurement contracts and bid awards for a specific company.
 *
 * APIs used:
 *   1. 계약정보서비스 (CntrctInfoService) — 물품/용역/공사 contracts
 *   2. 낙찰정보서비스 (ScsbidInfoService) — 물품/용역/공사 bid awards
 *   3. 공공데이터개방표준서비스 (PubDataOpnStdService) — standardized contract data
 *
 * Strategy:
 *   - These APIs do NOT support server-side company filtering (dmstcCpnm/bizno params are ignored)
 *   - We fetch recent data in parallel pages, then filter client-side by BRN in corpList/bidwinnrBizno
 *   - Date range limit: ~2 months for 계약, ~1 month for 낙찰
 *   - Max numOfRows: 999
 *
 * @module procurementAdapter
 */

import axios from 'axios';
import dotenv from 'dotenv';
dotenv.config();

const SHARED_KEY = process.env.DATA_GO_KR_SHARED_KEY;
const REQUEST_TIMEOUT = 15000;
const MAX_ROWS = 999;
const MAX_PAGES = 3;  // 3 pages x 999 = up to 2997 items per operation

// API base URLs
const CONTRACT_BASE = 'https://apis.data.go.kr/1230000/ao/CntrctInfoService';
const AWARD_BASE = 'https://apis.data.go.kr/1230000/as/ScsbidInfoService';
const STD_BASE = 'https://apis.data.go.kr/1230000/ao/PubDataOpnStdService';

/**
 * Build date range for recent N months (YYYYMMDDhhmm format)
 */
function buildDateRange(months = 2) {
  const end = new Date();
  const start = new Date(end);
  start.setMonth(start.getMonth() - months);

  const fmt = (d) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}${m}${day}0000`;
  };

  return { inqryBgnDt: fmt(start), inqryEndDt: fmt(end) };
}

/**
 * Parse corpList pipe-delimited string from 계약정보서비스
 * Format: "[idx^type^sole/joint^name^ceo^country^ratio^name2^?^bizno]"
 * Multiple entries separated by "]["
 */
function parseCorpList(corpListStr) {
  if (!corpListStr || typeof corpListStr !== 'string') return [];
  const entries = corpListStr.split(/\]\s*\[/).map(s => s.replace(/^\[/, '').replace(/\]$/, ''));
  return entries.map(entry => {
    const parts = entry.split('^');
    return {
      name: parts[3] || '',
      ceo: parts[4] || '',
      bizno: (parts[9] || '').replace(/-/g, ''),
      type: parts[1] || '',
      ratio: parts[6] || '',
    };
  }).filter(c => c.name);
}

/**
 * Fetch a single API page with error handling
 */
async function fetchPage(url, params) {
  try {
    const res = await axios.get(url, { params, timeout: REQUEST_TIMEOUT });
    const body = res.data?.response?.body;
    if (body?.items && Array.isArray(body.items)) {
      return { items: body.items, totalCount: body.totalCount || 0 };
    }
    // Check for error response format
    const errorKey = Object.keys(res.data || {}).find(k => k.includes('Error'));
    if (errorKey) {
      return { items: [], totalCount: 0, error: res.data[errorKey]?.header?.resultMsg };
    }
    return { items: [], totalCount: 0 };
  } catch (err) {
    return { items: [], totalCount: 0, error: err.message };
  }
}

/**
 * Fetch multiple pages in parallel for a given operation
 * Optimistic: launch all pages at once without waiting for the first
 */
async function fetchPagesParallel(url, baseParams, maxPages = MAX_PAGES) {
  // Launch all pages in parallel (optimistic - assume data exists)
  const pagePromises = [];
  for (let p = 1; p <= maxPages; p++) {
    pagePromises.push(fetchPage(url, { ...baseParams, numOfRows: MAX_ROWS, pageNo: p }));
  }
  const pageResults = await Promise.allSettled(pagePromises);

  let allItems = [];
  let totalCount = 0;
  for (const result of pageResults) {
    if (result.status === 'fulfilled' && result.value.items) {
      allItems.push(...result.value.items);
      if (result.value.totalCount > totalCount) totalCount = result.value.totalCount;
    }
  }

  return { items: allItems, totalCount };
}


// ============================================================
// Contract Search (계약정보서비스)
// ============================================================

/**
 * Search contracts by BRN (business registration number)
 * Fetches recent contracts and filters by corpList matching
 */
async function searchContracts(brno, companyName) {
  const dateRange = buildDateRange(2);
  const baseParams = {
    serviceKey: SHARED_KEY,
    type: 'json',
    inqryDiv: 1,
    ...dateRange,
  };

  // Search all 3 contract types in parallel (1 page each for speed)
  const [thng, servc, cnstwk] = await Promise.allSettled([
    fetchPagesParallel(`${CONTRACT_BASE}/getCntrctInfoListThng`, baseParams, 1),
    fetchPagesParallel(`${CONTRACT_BASE}/getCntrctInfoListServc`, baseParams, 1),
    fetchPagesParallel(`${CONTRACT_BASE}/getCntrctInfoListCnstwk`, baseParams, 1),
  ]);

  const allItems = [];
  for (const result of [thng, servc, cnstwk]) {
    if (result.status === 'fulfilled' && result.value.items) {
      allItems.push(...result.value.items);
    }
  }

  // Filter by BRN or company name in corpList
  const normalizedBrno = (brno || '').replace(/-/g, '');
  const cleanName = (companyName || '')
    .replace(/주식회사\s*/g, '').replace(/㈜\s*/g, '').replace(/\(주\)\s*/g, '')
    .replace(/유한회사\s*/g, '').replace(/유한책임회사\s*/g, '').trim();

  const matches = allItems.filter(item => {
    const corps = parseCorpList(item.corpList);
    return corps.some(c => {
      if (normalizedBrno && c.bizno === normalizedBrno) return true;
      if (cleanName && cleanName.length >= 2 && c.name.includes(cleanName)) return true;
      return false;
    });
  });

  return matches.map(item => {
    const corps = parseCorpList(item.corpList);
    const matchedCorp = corps.find(c =>
      (normalizedBrno && c.bizno === normalizedBrno) ||
      (cleanName && c.name.includes(cleanName))
    );
    return {
      type: 'contract',
      subType: item.bsnsDivNm || '물품',
      contractNo: item.untyCntrctNo || '',
      title: item.cntrctNm || '',
      amount: parseInt(item.thtmCntrctAmt) || parseInt(item.totCntrctAmt) || 0,
      totalAmount: parseInt(item.totCntrctAmt) || 0,
      date: item.cntrctDate || item.cntrctCnclsDate || '',
      period: item.cntrctPrd || '',
      agency: item.cntrctInsttNm || '',
      method: item.cntrctCnclsMthdNm || '',
      corpName: matchedCorp?.name || '',
      corpBizno: matchedCorp?.bizno || '',
      corpRatio: matchedCorp?.ratio || '',
      url: item.cntrctDtlInfoUrl || item.cntrctInfoUrl || '',
    };
  });
}


// ============================================================
// Standard Contract Search (공공데이터개방표준서비스)
// ============================================================

/**
 * Search standardized contract data by BRN
 * This API has rprsntCorpBizrno field in responses.
 * We use a shorter window (2 weeks) and scan more pages to maximize coverage.
 */
async function searchStandardContracts(brno) {
  const dateRange = buildDateRange(1);
  const baseParams = {
    serviceKey: SHARED_KEY,
    type: 'json',
    cntrctBgnDt: dateRange.inqryBgnDt,
    cntrctEndDt: dateRange.inqryEndDt,
  };

  const result = await fetchPagesParallel(
    `${STD_BASE}/getDataSetOpnStdCntrctInfo`,
    baseParams,
    MAX_PAGES
  );

  const normalizedBrno = (brno || '').replace(/-/g, '');
  if (!normalizedBrno || result.items.length === 0) return [];

  return result.items
    .filter(item => {
      const itemBrno = (item.rprsntCorpBizrno || '').replace(/-/g, '');
      return itemBrno === normalizedBrno;
    })
    .map(item => ({
      type: 'contract_std',
      title: item.cntrctNm || item.bidNtceNm || '',
      amount: parseInt(item.cntrctAmt) || 0,
      totalAmount: parseInt(item.ttalCntrctAmt) || 0,
      date: item.cntrctCnclsDate || '',
      method: item.cntrctCnclsMthdNm || '',
      agency: item.cntrctInsttNm || '',
      demandAgency: item.dmndInsttNm || '',
      corpName: item.rprsntCorpNm || '',
      corpBizno: (item.rprsntCorpBizrno || '').replace(/-/g, ''),
      corpCeo: item.rprsntCorpCeoNm || '',
      bidNo: item.bidNtceNo || '',
      contractNo: item.cntrctNo || '',
      url: item.cntrctInfoUrl || '',
    }));
}


// ============================================================
// Award Search (낙찰정보서비스)
// ============================================================

/**
 * Search bid awards by BRN
 */
async function searchAwards(brno, companyName) {
  const dateRange = buildDateRange(1);
  const baseParams = {
    serviceKey: SHARED_KEY,
    type: 'json',
    inqryDiv: 1,
    ...dateRange,
  };

  // Search all 3 award types in parallel (1 page each for speed)
  const [thng, servc, cnstwk] = await Promise.allSettled([
    fetchPagesParallel(`${AWARD_BASE}/getScsbidListSttusThng`, baseParams, 1),
    fetchPagesParallel(`${AWARD_BASE}/getScsbidListSttusServc`, baseParams, 1),
    fetchPagesParallel(`${AWARD_BASE}/getScsbidListSttusCnstwk`, baseParams, 1),
  ]);

  const allItems = [];
  for (const result of [thng, servc, cnstwk]) {
    if (result.status === 'fulfilled' && result.value.items) {
      allItems.push(...result.value.items);
    }
  }

  const normalizedBrno = (brno || '').replace(/-/g, '');
  const cleanName = (companyName || '')
    .replace(/주식회사\s*/g, '').replace(/㈜\s*/g, '').replace(/\(주\)\s*/g, '')
    .replace(/유한회사\s*/g, '').replace(/유한책임회사\s*/g, '').trim();

  return allItems
    .filter(item => {
      const itemBrno = (item.bidwinnrBizno || '').replace(/-/g, '');
      const itemName = item.bidwinnrNm || '';
      if (normalizedBrno && itemBrno === normalizedBrno) return true;
      if (cleanName && cleanName.length >= 2 && itemName.includes(cleanName)) return true;
      return false;
    })
    .map(item => ({
      type: 'award',
      title: item.bidNtceNm || '',
      amount: parseInt(item.sucsfbidAmt) || 0,
      rate: parseFloat(item.sucsfbidRate) || 0,
      date: item.fnlSucsfDate || item.rlOpengDt || '',
      bidNo: item.bidNtceNo || '',
      agency: item.dminsttNm || '',
      participants: parseInt(item.prtcptCnum) || 0,
      winnerName: item.bidwinnrNm || '',
      winnerBizno: (item.bidwinnrBizno || '').replace(/-/g, ''),
      winnerCeo: item.bidwinnrCeoNm || '',
    }));
}


// ============================================================
// Main Export
// ============================================================

/**
 * Fetch all procurement data for a company
 *
 * @param {Object} params
 * @param {string} params.companyName - Company name
 * @param {string} params.brno - Business registration number (10 digits)
 * @returns {Object} Structured procurement data
 */
export async function fetchProcurementData({ companyName, brno }) {
  if (!SHARED_KEY) {
    throw new Error('DATA_GO_KR_SHARED_KEY not configured');
  }

  if (!brno && !companyName) {
    throw new Error('brno or companyName required');
  }

  const cleanBrno = (brno || '').replace(/-/g, '');
  const startTime = Date.now();

  console.log(`[Procurement] Searching for "${companyName}" (BRN: ${cleanBrno})`);

  // Run all 3 search strategies in parallel
  const [contractsResult, stdContractsResult, awardsResult] = await Promise.allSettled([
    searchContracts(cleanBrno, companyName),
    searchStandardContracts(cleanBrno),
    searchAwards(cleanBrno, companyName),
  ]);

  const contracts = contractsResult.status === 'fulfilled' ? contractsResult.value : [];
  const stdContracts = stdContractsResult.status === 'fulfilled' ? stdContractsResult.value : [];
  const awards = awardsResult.status === 'fulfilled' ? awardsResult.value : [];

  const durationMs = Date.now() - startTime;

  // Deduplicate contracts (same contractNo or same title+date)
  const seenContracts = new Set();
  const allContracts = [];

  for (const c of [...stdContracts, ...contracts]) {
    const key = c.contractNo || c.contractNo || `${c.title}|${c.date}`;
    if (!seenContracts.has(key)) {
      seenContracts.add(key);
      allContracts.push(c);
    }
  }

  // Sort by date descending
  allContracts.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  awards.sort((a, b) => (b.date || '').localeCompare(a.date || ''));

  // Aggregate metrics
  const contractAmounts = allContracts.map(c => c.amount).filter(a => a > 0);
  const awardAmounts = awards.map(a => a.amount).filter(a => a > 0);

  const totalContractValue = contractAmounts.reduce((sum, a) => sum + a, 0);
  const totalAwardValue = awardAmounts.reduce((sum, a) => sum + a, 0);
  const avgAwardRate = awards.length > 0
    ? awards.reduce((sum, a) => sum + (a.rate || 0), 0) / awards.length
    : 0;

  const result = {
    contracts: allContracts.slice(0, 20), // Top 20 most recent
    awards: awards.slice(0, 20),
    contractCount: allContracts.length,
    awardCount: awards.length,
    totalContractValue,
    totalAwardValue,
    totalValue: totalContractValue + totalAwardValue,
    avgContractAmount: contractAmounts.length > 0
      ? Math.round(totalContractValue / contractAmounts.length)
      : 0,
    avgAwardRate: Math.round(avgAwardRate * 100) / 100,
    latestContract: allContracts[0] || null,
    latestAward: awards[0] || null,
    isGovernmentVendor: allContracts.length > 0 || awards.length > 0,
    searchPeriod: '최근 2개월',
    durationMs,
    source: '조달청 나라장터',
    errors: [
      contractsResult.status === 'rejected' ? `계약: ${contractsResult.reason?.message}` : null,
      stdContractsResult.status === 'rejected' ? `표준: ${stdContractsResult.reason?.message}` : null,
      awardsResult.status === 'rejected' ? `낙찰: ${awardsResult.reason?.message}` : null,
    ].filter(Boolean),
  };

  console.log(`[Procurement] "${companyName}" → contracts=${result.contractCount}, awards=${result.awardCount}, value=${result.totalValue.toLocaleString()}원 (${durationMs}ms)`);

  return result;
}

export default { fetchProcurementData };

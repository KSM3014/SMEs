/**
 * Entity Data Mapper
 * Transforms entity_registry + entity_source_data + DART data
 * into the flat shape expected by CompanyDetail.jsx frontend.
 */

import dartApiService from './dartApiService.js';
import DartClient from './dartClient.js';
import { resolveIndustryName } from './ksicCodes.js';
import dotenv from 'dotenv';

dotenv.config();

const dartClient = new DartClient(process.env.DART_API_KEY);

/**
 * Fetch DART data for an entity by looking up corp_code from company name.
 * Returns null for non-listed or unregistered companies.
 */
export async function fetchDartData(entity) {
  if (!entity?.canonicalName) return null;

  try {
    const corpCode = await dartClient.findCorpCodeByName(entity.canonicalName);
    if (!corpCode) return null;

    const currentYear = new Date().getFullYear();
    // Try current year, then previous years until we find data
    for (let y = currentYear; y >= currentYear - 2; y--) {
      const data = await dartApiService.collectCompanyData(corpCode, y);
      if (data.financials || data.officers?.length > 0) {
        data._fiscalYear = y;
        return data;
      }
    }
    // Return whatever we got (at least company_info)
    const data = await dartApiService.collectCompanyData(corpCode, currentYear - 1);
    data._fiscalYear = currentYear - 1;
    return data;
  } catch (err) {
    console.error('[DataMapper] DART fetch error:', err.message);
    return null;
  }
}

/**
 * Main mapping function.
 * @param {Object} entity - from loadEntityFromDb()
 * @param {Object|null} dartData - from dartApiService.collectCompanyData()
 * @returns {Object} CompanyDetail-compatible flat structure
 */
export function mapEntityToCompanyDetail(entity, dartData) {
  if (!entity) return null;

  const basic = extractBasicInfo(entity);
  const dartInfo = dartData?.company_info || null;
  const financials = dartData?.financials || null;

  // Merge basic info: entity sources + DART (DART takes priority for richer fields)
  const company = {
    business_number: entity.brno || dartInfo?.business_number || null,
    company_name: dartInfo?.corp_name || entity.canonicalName || basic.company_name,
    ceo_name: dartInfo?.ceo_name || basic.representative || null,
    address: dartInfo?.address || basic.address || null,
    phone: dartInfo?.phone || basic.phone || null,
    website: dartInfo?.homepage || basic.website || null,
    establishment_date: formatDartDate(dartInfo?.establishment_date) || formatDartDate(basic.establishment_date) || null,
    industry_code: dartInfo?.industry_code || basic.industry_code || null,
    industry_name: (() => {
      const code = dartInfo?.industry_code || basic.industry_code || null;
      return dartInfo?.industry_name || basic.industry_name || resolveIndustryName(code) || code || null;
    })(),
    industry_display: (() => {
      const code = dartInfo?.industry_code || basic.industry_code || null;
      const name = dartInfo?.industry_name || basic.industry_name || resolveIndustryName(code) || null;
      if (code && name) return `${code} (${name})`;
      return name || code || null;
    })(),
    corp_registration_no: dartInfo?.jurir_no || null,
    corp_cls: dartInfo?.corp_cls || null,
    employee_count: basic.employee_count || null,

    // Certifications — extracted from raw API data
    venture_certification: extractCertification(entity, 'venture'),
    innovation_certification: extractCertification(entity, 'innobiz'),
    main_biz_certification: false,
    listed: dartInfo?.corp_cls === 'Y' || dartInfo?.stock_code?.trim()?.length > 0 || false,
    stock_code: dartInfo?.stock_code?.trim() || null,
    corp_code: dartInfo?.corp_code || null,

    // Financial metrics from DART
    revenue: financials?.is?.revenue || null,
    operating_profit: financials?.is?.operating_profit || null,
    operating_margin: calcMargin(financials?.is?.operating_profit, financials?.is?.revenue),
    roe: calcROE(financials?.is?.net_income, financials?.bs?.total_equity),
    debt_ratio: calcDebtRatio(financials?.bs?.total_liabilities, financials?.bs?.total_equity),
    total_assets: financials?.bs?.total_assets || null,
    total_liabilities: financials?.bs?.total_liabilities || null,
    total_equity: financials?.bs?.total_equity || null,
    net_profit: financials?.is?.net_income || null,

    // Detailed financial sections
    financial_statements: mapFinancialStatements(financials),
    financial_history: [], // Would need multi-year DART data
    officers: mapOfficers(dartData?.officers),
    shareholders: mapShareholders(dartData?.ownership),

    // 3-year comparison (single year available → use as current)
    three_year_average: financials ? {
      revenue: financials.is?.revenue || null,
      operating_margin: calcMargin(financials.is?.operating_profit, financials.is?.revenue),
      roe: calcROE(financials.is?.net_income, financials.bs?.total_equity),
      debt_ratio: calcDebtRatio(financials.bs?.total_liabilities, financials.bs?.total_equity)
    } : null,

    // Red flags
    red_flags: generateRedFlags(entity, dartData),

    // Entity metadata (prefixed with _ to distinguish from business data)
    _entity: {
      entityId: entity.entityId,
      confidence: entity.confidence,
      matchLevel: entity.matchLevel,
      sourcesCount: entity.sourcesCount,
      sources: entity.sources
    },
    _conflicts: entity.conflicts || [],
    _apiData: entity.apiData || [],
    _lastFetchedAt: entity.lastFetchedAt,
    _isStale: entity.isStale,
    _hasDart: !!dartData?.company_info
  };

  return company;
}

// ─── Internal helpers ─────────────────────────────────────

/**
 * Extract standardized fields from a single source's raw_data.
 * Handles known API response patterns (NPS, FSC, FTC, 근로복지공단, etc.)
 */
function extractFieldsFromRawData(rawData) {
  if (!rawData || typeof rawData !== 'object') return {};

  // NPS (국민연금): nested data.detail structure
  if (rawData.detail && typeof rawData.detail === 'object') {
    const d = rawData.detail;
    return {
      companyName: d.companyName || null,
      address: d.address || null,
      industryCode: d.industryCode || null,
      industryName: d.industryName || null,
      employeeCount: d.employeeCount ? parseInt(d.employeeCount) : null,
      establishmentDate: d.joinDate || null,
    };
  }

  // FSC Discovery (금융위_기업기본정보): flat object with enpXxx fields
  if (rawData.enpBsadr !== undefined || rawData.corpNm || rawData.enpRprFnm) {
    return {
      companyName: rawData.corpNm || null,
      address: rawData.enpBsadr || null,
      representative: rawData.enpRprFnm || null,
      phone: rawData.enpTlno || null,
      website: rawData.enpHmpgUrl || null,
      industryCode: rawData.enpMainBizNm || null,
      employeeCount: rawData.enpEmpeCnt ? parseInt(rawData.enpEmpeCnt) : null,
      establishmentDate: rawData.enpEstbDt || null,
    };
  }

  // Array of results (근로복지공단, FTC, FSC expanded, etc.)
  if (Array.isArray(rawData) && rawData.length > 0) {
    const d = rawData[0];
    if (!d || typeof d !== 'object') return {};

    // 근로복지공단_고용산재보험: addr, gyEopjongCd/Nm, etc.
    if (d.gyEopjongNm || d.gyEopjongCd) {
      return {
        address: d.addr || null,
        industryCode: d.gyEopjongCd?.toString() || null,
        industryName: d.gyEopjongNm || null,
        establishmentDate: d.seongripDt?.toString() || null,
      };
    }

    // FTC (공정위_통신판매): bsnmNm, rprsNm, rprsBpladrs
    if (d.bsnmNm || d.rprsNm) {
      return {
        companyName: d.bsnmNm || null,
        address: d.rprsBpladrs || null,
        representative: d.rprsNm || null,
      };
    }

    // FSC expanded: corpNm, enpBsadr pattern in array
    if (d.corpNm) {
      return {
        companyName: d.corpNm || null,
        address: d.enpBsadr || null,
        representative: d.enpRprFnm || null,
      };
    }
  }

  // NTS (국세청_사업자등록상태): b_no, b_stt, tax_type
  if (rawData.b_no && rawData.b_stt) {
    return {
      taxType: rawData.tax_type || null,
      businessStatus: rawData.b_stt || null,
    };
  }

  return {};
}

function extractBasicInfo(entity) {
  const apiData = entity.apiData || [];
  if (apiData.length === 0) {
    return { company_name: entity.canonicalName, address: null, representative: null, industry_code: null, industry_name: null, employee_count: null, phone: null, website: null, establishment_date: null };
  }

  // Phase 1: Collect from top-level DB-stored fields
  const collected = {
    companyName: [],
    address: [],
    representative: [],
    industryCode: [],
    industryName: [],
    employeeCount: [],
    phone: [],
    website: [],
    establishmentDate: [],
  };

  for (const s of apiData) {
    if (s.companyName) collected.companyName.push(s.companyName);
    if (s.address) collected.address.push(s.address);
    if (s.representative) collected.representative.push(s.representative);
    if (s.industryCode) collected.industryCode.push(s.industryCode);
  }

  // Phase 2: Mine from raw_data (handles adapters that don't extract to top-level)
  for (const s of apiData) {
    const extracted = extractFieldsFromRawData(s.data);
    if (extracted.companyName) collected.companyName.push(extracted.companyName);
    if (extracted.address) collected.address.push(extracted.address);
    if (extracted.representative) collected.representative.push(extracted.representative);
    if (extracted.industryCode) collected.industryCode.push(String(extracted.industryCode));
    if (extracted.industryName) collected.industryName.push(extracted.industryName);
    if (extracted.employeeCount) collected.employeeCount.push(extracted.employeeCount);
    if (extracted.phone) collected.phone.push(extracted.phone);
    if (extracted.website) collected.website.push(extracted.website);
    if (extracted.establishmentDate) collected.establishmentDate.push(extracted.establishmentDate);
  }

  return {
    company_name: mostFrequent(collected.companyName) || entity.canonicalName,
    address: mostFrequent(collected.address),
    representative: mostFrequent(collected.representative),
    industry_code: mostFrequent(collected.industryCode),
    industry_name: mostFrequent(collected.industryName),
    employee_count: collected.employeeCount.length > 0 ? Math.max(...collected.employeeCount) : null,
    phone: mostFrequent(collected.phone),
    website: mostFrequent(collected.website),
    establishment_date: mostFrequent(collected.establishmentDate),
  };
}

/** Pick the most frequent non-empty value from an array */
function mostFrequent(arr) {
  if (!arr || arr.length === 0) return null;
  const counts = {};
  for (const v of arr) {
    const key = String(v).trim();
    if (!key) continue;
    counts[key] = (counts[key] || 0) + 1;
  }
  const entries = Object.entries(counts);
  if (entries.length === 0) return null;
  return entries.sort((a, b) => b[1] - a[1])[0][0];
}

function extractCertification(entity, type) {
  const sources = (entity.sources || []).map(s => s.toLowerCase());
  const apiData = entity.apiData || [];

  if (type === 'venture') {
    // Check if any source mentions venture certification
    const ventureSource = sources.some(s => s.includes('벤처') || s.includes('venture'));
    if (ventureSource) return true;
    // Check raw_data for venture indicators
    for (const src of apiData) {
      const raw = src.data;
      if (raw && typeof raw === 'object') {
        const str = JSON.stringify(raw).toLowerCase();
        if (str.includes('벤처확인') || str.includes('venture')) return true;
      }
    }
  }

  if (type === 'innobiz') {
    const innobizSource = sources.some(s => s.includes('이노비즈') || s.includes('innobiz'));
    if (innobizSource) return true;
    for (const src of apiData) {
      const raw = src.data;
      if (raw && typeof raw === 'object') {
        const str = JSON.stringify(raw).toLowerCase();
        if (str.includes('이노비즈') || str.includes('innobiz')) return true;
      }
    }
  }

  return false;
}

function mapFinancialStatements(financials) {
  if (!financials) return null;

  const { bs, is: income, cf } = financials;

  return {
    balance_sheet: bs ? {
      current_assets: bs.current_assets || null,
      non_current_assets: bs.non_current_assets || null,
      total_assets: bs.total_assets || null,
      current_liabilities: bs.current_liabilities || null,
      non_current_liabilities: bs.non_current_liabilities || null,
      total_liabilities: bs.total_liabilities || null,
      capital_stock: bs.capital_stock || null,
      retained_earnings: bs.retained_earnings || null,
      total_equity: bs.total_equity || null
    } : null,
    income_statement: income ? {
      revenue: income.revenue || null,
      cost_of_sales: income.cost_of_sales || null,
      gross_profit: income.gross_profit || null,
      operating_expenses: income.operating_expenses || null,
      operating_profit: income.operating_profit || null,
      non_operating_income: income.non_operating_income || null,
      non_operating_expenses: income.non_operating_expenses || null,
      profit_before_tax: income.income_before_tax || null,
      income_tax: income.income_tax_expense || null,
      net_profit: income.net_income || null
    } : null,
    cash_flow: cf ? {
      net_profit: cf.net_income || null,
      operating_adjustments: null,
      operating_cash_flow: cf.operating_cash_flow || null,
      investing_cash_flow: cf.investing_cash_flow || null,
      financing_cash_flow: cf.financing_cash_flow || null,
      net_cash_flow: cf.cash_increase || null
    } : null
  };
}

function mapOfficers(officers) {
  if (!officers || officers.length === 0) return [];

  return officers.map(o => ({
    name: o.name,
    position: o.responsibility || o.position || o.is_registered || '-',
    appointment_date: null, // DART doesn't provide exact appointment date
    career: o.career || null,
    note: [
      o.is_fulltime,
      o.max_shareholder_relation !== '-' ? o.max_shareholder_relation : null,
      o.tenure_end?.trim() ? `임기 ${o.tenure_end.trim()}` : null
    ].filter(Boolean).join(', ') || null
  }));
}

function mapShareholders(ownership) {
  if (!ownership || ownership.length === 0) return [];

  // Deduplicate by name (combine 보통주 + 우선주)
  const byName = new Map();
  for (const o of ownership) {
    const existing = byName.get(o.name);
    if (existing) {
      existing.shares += o.shares || 0;
      existing.percentage += o.ownership_percentage || 0;
    } else {
      byName.set(o.name, {
        name: o.name,
        type: classifyShareholderType(o),
        shares: o.shares || 0,
        percentage: o.ownership_percentage || 0,
        relation: o.relation || '-',
        note: o.stock_kind || null
      });
    }
  }

  return [...byName.values()].sort((a, b) => b.percentage - a.percentage);
}

function classifyShareholderType(ownership) {
  const rel = (ownership.relation || '').toLowerCase();
  if (rel.includes('본인') || rel.includes('최대주주')) return 'founder';
  if (rel.includes('특수관계인')) return 'individual';
  if (ownership.name?.includes('보험') || ownership.name?.includes('투자') ||
      ownership.name?.includes('은행') || ownership.name?.includes('증권') ||
      ownership.name?.includes('자산운용')) return 'institutional';
  if (ownership.name?.includes('자사주') || ownership.name?.includes('자기주식')) return 'treasury';
  return 'individual';
}

function generateRedFlags(entity, dartData) {
  const flags = [];

  // 1. Cross-check conflicts
  const conflicts = entity.conflicts || [];
  if (conflicts.length > 0) {
    const fieldCounts = {};
    for (const c of conflicts) {
      fieldCounts[c.field] = (fieldCounts[c.field] || 0) + 1;
    }
    flags.push({
      title: '소스간 데이터 불일치',
      severity: conflicts.length > 5 ? 'high' : 'medium',
      description: `${conflicts.length}건의 소스간 불일치 발견 (${Object.keys(fieldCounts).join(', ')})`,
      details: conflicts.slice(0, 3).map(c =>
        `${c.field}: "${c.valueA}" vs "${c.valueB}" (유사도: ${(c.similarity * 100).toFixed(0)}%)`
      ).join('\n')
    });
  }

  // 2. Financial red flags from DART
  if (dartData?.financials) {
    const { bs, is: income } = dartData.financials;

    // High debt ratio
    const debtRatio = calcDebtRatio(bs?.total_liabilities, bs?.total_equity);
    if (debtRatio !== null && debtRatio > 200) {
      flags.push({
        title: '높은 부채비율',
        severity: debtRatio > 400 ? 'high' : 'medium',
        description: `부채비율 ${debtRatio.toFixed(1)}% (200% 이상)`,
        details: `부채총계: ${formatKrw(bs.total_liabilities)}, 자본총계: ${formatKrw(bs.total_equity)}`
      });
    }

    // Operating loss
    if (income?.operating_profit != null && income.operating_profit < 0) {
      flags.push({
        title: '영업손실',
        severity: 'high',
        description: `영업이익: ${formatKrw(income.operating_profit)}`,
        details: `매출액: ${formatKrw(income.revenue)}, 영업손실 발생`
      });
    }

    // Net loss
    if (income?.net_income != null && income.net_income < 0 && income.operating_profit >= 0) {
      flags.push({
        title: '당기순손실',
        severity: 'medium',
        description: `당기순이익: ${formatKrw(income.net_income)}`,
        details: '영업이익은 흑자이나 당기순손실 발생'
      });
    }

    // Capital impairment
    if (bs?.total_equity != null && bs?.capital_stock != null && bs.total_equity < bs.capital_stock) {
      flags.push({
        title: '자본잠식',
        severity: 'high',
        description: '자본총계가 자본금 미만 (부분 자본잠식)',
        details: `자본총계: ${formatKrw(bs.total_equity)}, 자본금: ${formatKrw(bs.capital_stock)}`
      });
    }
  }

  // 3. Low confidence entity resolution
  if (entity.confidence != null && entity.confidence < 0.6) {
    flags.push({
      title: '낮은 데이터 신뢰도',
      severity: 'low',
      description: `Entity Resolution 신뢰도: ${(entity.confidence * 100).toFixed(1)}%`,
      details: `${entity.sourcesCount}개 소스에서 수집된 데이터의 일치도가 낮습니다.`
    });
  }

  return flags;
}

// ─── Utility functions ────────────────────────────────────

/**
 * Convert DART date format (YYYYMMDD) to ISO date string (YYYY-MM-DD)
 */
function formatDartDate(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') return null;
  // Handle YYYYMMDD format
  if (/^\d{8}$/.test(dateStr)) {
    return `${dateStr.slice(0, 4)}-${dateStr.slice(4, 6)}-${dateStr.slice(6, 8)}`;
  }
  // Already formatted or other format — return as-is
  return dateStr;
}

function calcMargin(profit, revenue) {
  if (profit == null || revenue == null || revenue === 0) return null;
  return Math.round((profit / revenue) * 10000) / 100;
}

function calcROE(netIncome, equity) {
  if (netIncome == null || equity == null || equity === 0) return null;
  return Math.round((netIncome / equity) * 10000) / 100;
}

function calcDebtRatio(liabilities, equity) {
  if (liabilities == null || equity == null || equity === 0) return null;
  return Math.round((liabilities / equity) * 10000) / 100;
}

function formatKrw(amount) {
  if (amount == null) return '-';
  const billions = amount / 100000000;
  if (Math.abs(billions) >= 1) return `${billions.toFixed(0)}억원`;
  const millions = amount / 10000;
  return `${millions.toFixed(0)}만원`;
}

/**
 * Map sminfo normalized data to frontend financial_statements structure.
 * Used for non-listed companies where DART data is unavailable.
 */
export function mapSminfoToFinancials(sminfoData) {
  if (!sminfoData) return null;
  return {
    balance_sheet: {
      total_assets: sminfoData.total_assets || null,
      total_liabilities: sminfoData.total_liabilities || null,
      total_equity: sminfoData.total_equity || null,
      current_assets: null,
      non_current_assets: null,
      current_liabilities: null,
      non_current_liabilities: null,
      capital_stock: null,
      retained_earnings: null
    },
    income_statement: {
      revenue: sminfoData.revenue || null,
      operating_profit: sminfoData.operating_profit || null,
      net_profit: sminfoData.net_profit || null,
      cost_of_sales: null,
      gross_profit: null,
      operating_expenses: null,
      non_operating_income: null,
      non_operating_expenses: null,
      profit_before_tax: null,
      income_tax: null
    },
    cash_flow: null
  };
}

export default {
  mapEntityToCompanyDetail,
  fetchDartData,
  mapSminfoToFinancials
};

/**
 * KIPRIS Plus Adapter — 한국 특허정보 검색 (KIPRIS Plus API)
 *
 * Searches Korean patents/utility models by applicant (company) name.
 * Aggregates: total patents, registered patents, recent 3-year patents,
 * top IPC codes, recent patent titles.
 *
 * API: http://plus.kipris.or.kr/kipo-api/kipi/patUtiModInfoSearchSevice/getAdvancedSearch
 * Response format: XML
 * Auth: ServiceKey (URL-encoded)
 */

import http from 'http';

// KIPRIS Plus API key (must be URL-encoded in URLs due to / and =)
const KIPRIS_KEY = process.env.KIPRIS_API_KEY || 'e0kkxkKqlwXnVaSZE/A9=TXeuDeyHD1NNEHubWCNrjc=';
const KIPRIS_KEY_ENCODED = encodeURIComponent(KIPRIS_KEY);

const BASE_URL = 'http://plus.kipris.or.kr/kipo-api/kipi/patUtiModInfoSearchSevice/getAdvancedSearch';
const TM_BASE_URL = 'http://plus.kipris.or.kr/kipo-api/kipi/trademarkInfoSearchService/getAdvancedSearch';

const REQUEST_TIMEOUT = 15000; // 15 seconds

// --- IPC code descriptions (top-level sections) ---
const IPC_SECTIONS = {
  A: '생활필수품',
  B: '처리조작/운수',
  C: '화학/야금',
  D: '섬유/제지',
  E: '건축',
  F: '기계공학/조명/가열/무기',
  G: '물리학',
  H: '전기',
};

// More specific IPC class descriptions (2-char prefix)
const IPC_CLASSES = {
  'A01': '농업/임업/축산', 'A21': '제빵/제과', 'A23': '식품/식료품',
  'A41': '의류', 'A43': '신발', 'A47': '가구/가정용품',
  'A61': '의학/수의학/위생', 'A62': '인명구조/소방', 'A63': '스포츠/오락',
  'B01': '물리적/화학적 공정', 'B05': '분무/분사', 'B21': '금속 기계적 가공',
  'B22': '주조/분말야금', 'B23': '공작기계/금속가공', 'B25': '수공구/휴대공구',
  'B29': '플라스틱 가공', 'B32': '적층체', 'B41': '인쇄',
  'B60': '차량일반', 'B62': '무궤도 차량', 'B63': '선박',
  'B64': '항공기/비행', 'B65': '운반/포장/저장',
  'C01': '무기화학', 'C02': '수처리', 'C04': '시멘트/세라믹',
  'C07': '유기화학', 'C08': '유기 고분자 화합물', 'C09': '염료/접착제',
  'C10': '석유/가스/코크', 'C12': '생화학/미생물학', 'C22': '야금/합금',
  'C23': '금속 피복/표면처리', 'C25': '전기분해/전기영동',
  'D01': '천연/인조 섬유', 'D04': '편조/레이스', 'D06': '섬유처리',
  'D21': '제지',
  'E01': '도로/철도/교량', 'E02': '수공/기초공사', 'E04': '건축물',
  'E05': '자물쇠/열쇠/창/문', 'E06': '문/창/셔터',
  'F01': '기계/엔진', 'F02': '연소기관', 'F03': '수력/풍력 기관',
  'F04': '펌프/압축기', 'F15': '유체압 액추에이터', 'F16': '기계요소',
  'F21': '조명', 'F24': '가열/환기', 'F25': '냉동/냉각',
  'F28': '열교환',
  'G01': '측정/시험', 'G02': '광학', 'G03': '사진/인쇄',
  'G05': '제어/조절', 'G06': '컴퓨팅/계산/계수', 'G08': '신호장치',
  'G09': '교육/표시', 'G10': '악기/음향', 'G11': '정보 저장',
  'G16': '정보통신기술(ICT)',
  'H01': '기본적 전기소자', 'H02': '전력의 발전/변환/배전',
  'H03': '기본 전자 회로', 'H04': '전기 통신 기술', 'H05': '전기기술',
  'H10': '반도체 소자',
};

/**
 * HTTP GET request (KIPRIS uses http, not https)
 */
function httpGet(url) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, { timeout: REQUEST_TIMEOUT }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode === 200) {
          resolve(data);
        } else {
          reject(new Error(`KIPRIS HTTP ${res.statusCode}`));
        }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('KIPRIS request timeout'));
    });
  });
}

/**
 * Extract text between XML tags using regex
 */
function extractTag(xml, tag) {
  const match = xml.match(new RegExp(`<${tag}>([^<]*)</${tag}>`));
  return match ? match[1] : null;
}

/**
 * Extract all items from XML response
 */
function extractItems(xml) {
  const items = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match;
  while ((match = itemRegex.exec(xml)) !== null) {
    const itemXml = match[1];
    items.push({
      applicantName: extractTag(itemXml, 'applicantName') || '',
      applicationDate: extractTag(itemXml, 'applicationDate') || '',
      applicationNumber: extractTag(itemXml, 'applicationNumber') || '',
      inventionTitle: extractTag(itemXml, 'inventionTitle') || '',
      ipcNumber: extractTag(itemXml, 'ipcNumber') || '',
      registerDate: extractTag(itemXml, 'registerDate') || '',
      registerNumber: extractTag(itemXml, 'registerNumber') || '',
      registerStatus: extractTag(itemXml, 'registerStatus') || '',
      openDate: extractTag(itemXml, 'openDate') || '',
      openNumber: extractTag(itemXml, 'openNumber') || '',
      publicationDate: extractTag(itemXml, 'publicationDate') || '',
    });
  }
  return items;
}

/**
 * Check if the API response is a success
 */
function isSuccess(xml) {
  const successYN = extractTag(xml, 'successYN');
  return successYN === 'Y';
}

/**
 * Get total count from response
 */
function getTotalCount(xml) {
  const tc = extractTag(xml, 'totalCount');
  return tc ? parseInt(tc, 10) : 0;
}

/**
 * Format date string (YYYYMMDD -> YYYY-MM-DD)
 */
function formatDate(d) {
  if (!d || d.length !== 8) return d || null;
  return `${d.substring(0, 4)}-${d.substring(4, 6)}-${d.substring(6, 8)}`;
}

/**
 * Map registerStatus to a standardized status label
 */
function mapStatus(raw) {
  const map = {
    '등록': 'registered',
    '공개': 'published',
    '거절': 'rejected',
    '소멸': 'lapsed',
    '취하': 'withdrawn',
    '포기': 'abandoned',
    '무효': 'invalidated',
    '공고': 'announced',
  };
  return map[raw] || raw;
}

/**
 * Get IPC code human-readable name
 */
function getIpcName(code) {
  if (!code) return '기타';
  const clean = code.trim();
  // Try 3-char class first (e.g., "A61"), then 1-char section (e.g., "A")
  const cls3 = clean.substring(0, 3);
  const sec1 = clean.substring(0, 1);
  return IPC_CLASSES[cls3] || IPC_SECTIONS[sec1] || clean;
}

/**
 * Search patents by applicant name (all statuses)
 * Returns totalCount and items (up to numOfRows)
 */
async function searchPatents(applicantName, { numOfRows = 50, lastvalue = '', applicationDate = '' } = {}) {
  const params = new URLSearchParams({
    applicant: applicantName,
    patent: 'true',
    utility: 'true',
    numOfRows: String(numOfRows),
    ServiceKey: KIPRIS_KEY,
  });
  if (lastvalue) params.set('lastvalue', lastvalue);
  if (applicationDate) params.set('applicationDate', applicationDate);
  // Sort by application date descending (newest first)
  params.set('sortSpec', 'AD');
  params.set('descSort', 'true');

  const url = `${BASE_URL}?${params.toString()}`;

  const xml = await httpGet(url);

  if (!isSuccess(xml)) {
    const msg = extractTag(xml, 'resultMsg') || 'Unknown error';
    throw new Error(`KIPRIS patent search failed: ${msg}`);
  }

  return {
    totalCount: getTotalCount(xml),
    items: extractItems(xml),
  };
}

/**
 * Search trademarks by applicant name
 * May return 0 results if trademark API is not subscribed
 */
async function searchTrademarks(applicantName) {
  const params = new URLSearchParams({
    applicant: applicantName,
    numOfRows: '5',
    ServiceKey: KIPRIS_KEY,
  });

  const url = `${TM_BASE_URL}?${params.toString()}`;

  try {
    const xml = await httpGet(url);
    if (!isSuccess(xml)) return { totalCount: 0, items: [] };
    return {
      totalCount: getTotalCount(xml),
      items: [], // trademark items have different structure, parse if needed later
    };
  } catch {
    // Trademark API may not be subscribed yet
    return { totalCount: 0, items: [] };
  }
}

/**
 * Compute IP score (0-100) based on patent metrics
 *
 * Scoring breakdown:
 *   - Patent count: 0-35 points (log scale, cap at 1000+)
 *   - Registered ratio: 0-25 points
 *   - Recent activity (3yr): 0-25 points
 *   - IPC diversity: 0-15 points
 */
function computeIpScore({ total, registered, recent3yr, ipcCount }) {
  if (total === 0) return 0;

  // Patent count score (logarithmic: 1=5, 10=15, 50=25, 200=30, 1000+=35)
  const countScore = Math.min(35, Math.round(5 + 10 * Math.log10(Math.max(1, total))));

  // Registration ratio score
  const regRatio = total > 0 ? registered / total : 0;
  const regScore = Math.round(regRatio * 25);

  // Recent activity score (what % of total patents are recent)
  const recentRatio = total > 0 ? Math.min(1, recent3yr / Math.max(total * 0.3, 1)) : 0;
  const activityScore = Math.min(25, Math.round(recentRatio * 25));

  // IPC diversity score
  const diversityScore = Math.min(15, ipcCount * 3);

  return Math.min(100, countScore + regScore + activityScore + diversityScore);
}

/**
 * Main: Fetch patent data for a company name
 *
 * Makes 3 API calls in parallel:
 *   1. All patents (total count + recent items for IPC analysis)
 *   2. Registered-only patents (count)
 *   3. Recent 3-year patents (count)
 *   4. Trademarks (count, may fail gracefully)
 *
 * Returns structured IP portfolio data
 */
export async function fetchPatentData(companyName) {
  if (!companyName) throw new Error('Company name required for KIPRIS search');

  // Strip common prefixes for cleaner search
  const cleanName = companyName
    .replace(/주식회사\s*/g, '').replace(/㈜\s*/g, '').replace(/\(주\)\s*/g, '')
    .replace(/유한회사\s*/g, '').replace(/유한책임회사\s*/g, '')
    .trim();

  if (!cleanName || cleanName.length < 2) {
    throw new Error('Company name too short for KIPRIS search');
  }

  const now = new Date();
  const threeYearsAgo = new Date(now.getFullYear() - 3, now.getMonth(), now.getDate());
  const dateFrom = `${threeYearsAgo.getFullYear()}${String(threeYearsAgo.getMonth() + 1).padStart(2, '0')}${String(threeYearsAgo.getDate()).padStart(2, '0')}`;
  const dateTo = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
  const recentDateRange = `${dateFrom}~${dateTo}`;

  console.log(`[KIPRIS] Searching patents for "${cleanName}" (original: "${companyName}")`);

  // Execute all API calls in parallel
  const [allResult, registeredResult, recentResult, tmResult] = await Promise.allSettled([
    searchPatents(cleanName, { numOfRows: 50 }),      // Top 50 for analysis
    searchPatents(cleanName, { lastvalue: 'R', numOfRows: 1 }),  // Registered count only
    searchPatents(cleanName, { applicationDate: recentDateRange, numOfRows: 1 }),  // Recent count
    searchTrademarks(cleanName),                        // Trademark count
  ]);

  const allPatents = allResult.status === 'fulfilled' ? allResult.value : { totalCount: 0, items: [] };
  const registeredCount = registeredResult.status === 'fulfilled' ? registeredResult.value.totalCount : 0;
  const recentCount = recentResult.status === 'fulfilled' ? recentResult.value.totalCount : 0;
  const tmData = tmResult.status === 'fulfilled' ? tmResult.value : { totalCount: 0 };

  console.log(`[KIPRIS] "${cleanName}" → total=${allPatents.totalCount}, registered=${registeredCount}, recent3yr=${recentCount}, trademarks=${tmData.totalCount}`);

  // Analyze IPC codes from the items we fetched
  const ipcCounts = {};
  for (const item of allPatents.items) {
    if (!item.ipcNumber) continue;
    // IPC numbers are pipe-separated, e.g., "G06F 16/00|G06F 3/048"
    const codes = item.ipcNumber.split('|').map(c => c.trim());
    for (const code of codes) {
      const cls = code.substring(0, 3); // e.g., "G06"
      if (cls.length >= 3) {
        ipcCounts[cls] = (ipcCounts[cls] || 0) + 1;
      }
    }
  }

  // Top 3 IPC categories
  const topIpcCodes = Object.entries(ipcCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([code, count]) => ({
      code,
      name: getIpcName(code),
      count,
    }));

  // Recent 5 patents for display
  const recentPatents = allPatents.items
    .slice(0, 5)
    .map(item => ({
      title: item.inventionTitle,
      applicationDate: formatDate(item.applicationDate),
      registerDate: formatDate(item.registerDate),
      status: item.registerStatus,
      statusEn: mapStatus(item.registerStatus),
      applicationNumber: item.applicationNumber,
      applicantName: item.applicantName || null,
      ipcNumber: item.ipcNumber?.split('|')[0]?.trim() || null,
    }));

  // Compute IP score
  const ipScore = computeIpScore({
    total: allPatents.totalCount,
    registered: registeredCount,
    recent3yr: recentCount,
    ipcCount: Object.keys(ipcCounts).length,
  });

  return {
    patents: {
      total: allPatents.totalCount,
      registered: registeredCount,
      recent3yr: recentCount,
      topIpcCodes,
      recentPatents,
    },
    trademarks: {
      total: tmData.totalCount,
      registered: 0, // TODO: parse when trademark API is approved
    },
    ipScore,
    searchedName: cleanName,
    source: 'KIPRIS Plus',
    timestamp: new Date().toISOString(),
  };
}

export default { fetchPatentData };

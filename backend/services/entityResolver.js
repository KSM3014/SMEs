/**
 * Entity Resolution Service
 * 여러 API 응답에서 동일 기업을 식별하고 통합
 *
 * 매칭 기준:
 * - 사업자번호(brno) OR 법인번호(crno) exact match → 동일 entity
 * - 회사명 fuzzy match (정규화 후 80% 이상) → 동일 entity
 * - 다중 필드 정합성 검증 (주소, 대표자, 업종 등)
 */

// 한국 법인 접미사/접두사 제거 패턴
const LEGAL_SUFFIXES_KO = [
  '주식회사', '㈜', '유한회사', '유한공사', '합자회사',
  '합명회사', '사단법인', '재단법인', '학교법인',
  '의료법인', '사회복지법인', '농업회사법인', '영농조합법인'
];

const LEGAL_PREFIXES_KO = ['주식회사', '㈜'];

const LEGAL_SUFFIXES_EN = [
  'co., ltd.', 'co.,ltd.', 'co.,ltd', 'co. ltd.',
  'corp.', 'corporation', 'inc.', 'incorporated',
  'ltd.', 'limited', 'llc', 'l.l.c.', 'plc'
];

const PARENTHETICAL = /\(주\)|\(유\)|\(사\)|\(재\)|\(합\)|\(농\)/g;

/**
 * 한국 회사명 정규화
 * "(주)삼성전자 주식회사" → "삼성전자"
 */
function normalizeCompanyName(name) {
  if (!name || typeof name !== 'string') return '';

  let norm = name.trim();

  // 1. 괄호형 접두사 제거: (주), (유) 등
  norm = norm.replace(PARENTHETICAL, '');

  // 2. 한국 법인 접미사 제거
  for (const suffix of LEGAL_SUFFIXES_KO) {
    const re = new RegExp(`\\s*${escapeRegex(suffix)}\\s*$`, 'i');
    norm = norm.replace(re, '');
  }

  // 3. 한국 법인 접두사 제거
  for (const prefix of LEGAL_PREFIXES_KO) {
    const re = new RegExp(`^\\s*${escapeRegex(prefix)}\\s*`, 'i');
    norm = norm.replace(re, '');
  }

  // 4. ㈜ (특수문자) 제거
  norm = norm.replace(/㈜/g, '');

  // 5. 영문 법인 접미사 제거
  const lower = norm.toLowerCase();
  for (const suffix of LEGAL_SUFFIXES_EN) {
    if (lower.endsWith(suffix)) {
      norm = norm.substring(0, norm.length - suffix.length);
      break;
    }
  }

  // 6. 공백 정규화
  norm = norm.replace(/\s+/g, ' ').trim();

  return norm;
}

/**
 * Levenshtein Distance 계산
 */
function levenshteinDistance(a, b) {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const matrix = [];

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      const cost = b.charAt(i - 1) === a.charAt(j - 1) ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,      // deletion
        matrix[i][j - 1] + 1,      // insertion
        matrix[i - 1][j - 1] + cost // substitution
      );
    }
  }

  return matrix[b.length][a.length];
}

/**
 * 회사명 유사도 계산 (0.0 ~ 1.0)
 */
function calculateNameSimilarity(nameA, nameB) {
  if (!nameA || !nameB) return 0;

  const normA = normalizeCompanyName(nameA);
  const normB = normalizeCompanyName(nameB);

  if (!normA || !normB) return 0;

  // 정확 매칭
  if (normA === normB) return 1.0;

  // 포함 관계 (한쪽이 다른 쪽을 포함)
  if (normA.includes(normB) || normB.includes(normA)) return 0.95;

  // Levenshtein 기반 유사도
  const distance = levenshteinDistance(normA, normB);
  const maxLen = Math.max(normA.length, normB.length);
  return 1 - (distance / maxLen);
}

/**
 * 사업자번호 정규화 (하이픈 제거)
 */
function normalizeBrno(brno) {
  if (!brno) return null;
  return String(brno).replace(/[-\s]/g, '').trim() || null;
}

/**
 * 법인번호 정규화 (하이픈 제거)
 */
function normalizeCrno(crno) {
  if (!crno) return null;
  return String(crno).replace(/[-\s]/g, '').trim() || null;
}

/**
 * API 응답에서 표준 필드 추출
 * 각 API 어댑터가 반환하는 표준화된 응답 형태:
 * {
 *   source: 'API이름',
 *   brno: '사업자번호' | null,
 *   crno: '법인번호' | null,
 *   companyName: '회사명' | null,
 *   address: '주소' | null,
 *   representative: '대표자' | null,
 *   industryCode: '업종코드' | null,
 *   rawData: { ...원본 응답 }
 * }
 */

// Confidence 계산 필드별 가중치
const FIELD_WEIGHTS = {
  brno: 0.35,
  crno: 0.35,
  companyName: 0.15,
  address: 0.08,
  representative: 0.05,
  industryCode: 0.02
};

const MATCH_THRESHOLD = 0.80;
const PROBABLE_THRESHOLD = 0.60;

/**
 * 두 API 응답 간 confidence 계산
 */
function calculatePairConfidence(responseA, responseB) {
  let totalWeight = 0;
  let matchScore = 0;

  // 사업자번호 exact match
  const brnoA = normalizeBrno(responseA.brno);
  const brnoB = normalizeBrno(responseB.brno);
  if (brnoA && brnoB) {
    totalWeight += FIELD_WEIGHTS.brno;
    if (brnoA === brnoB) matchScore += FIELD_WEIGHTS.brno;
  }

  // 법인번호 exact match
  const crnoA = normalizeCrno(responseA.crno);
  const crnoB = normalizeCrno(responseB.crno);
  if (crnoA && crnoB) {
    totalWeight += FIELD_WEIGHTS.crno;
    if (crnoA === crnoB) matchScore += FIELD_WEIGHTS.crno;
  }

  // 회사명 fuzzy match
  if (responseA.companyName && responseB.companyName) {
    totalWeight += FIELD_WEIGHTS.companyName;
    const nameSim = calculateNameSimilarity(responseA.companyName, responseB.companyName);
    matchScore += FIELD_WEIGHTS.companyName * nameSim;
  }

  // 주소 유사도
  if (responseA.address && responseB.address) {
    totalWeight += FIELD_WEIGHTS.address;
    const addrSim = calculateNameSimilarity(responseA.address, responseB.address);
    matchScore += FIELD_WEIGHTS.address * addrSim;
  }

  // 대표자 매칭
  if (responseA.representative && responseB.representative) {
    totalWeight += FIELD_WEIGHTS.representative;
    if (responseA.representative.trim() === responseB.representative.trim()) {
      matchScore += FIELD_WEIGHTS.representative;
    }
  }

  // 업종코드 매칭
  if (responseA.industryCode && responseB.industryCode) {
    totalWeight += FIELD_WEIGHTS.industryCode;
    if (responseA.industryCode === responseB.industryCode) {
      matchScore += FIELD_WEIGHTS.industryCode;
    }
  }

  return totalWeight > 0 ? matchScore / totalWeight : 0;
}

/**
 * Entity Group의 전체 정합성 계산
 * 그룹 내 모든 pair의 confidence 평균
 */
function calculateGroupConsistency(responses) {
  if (responses.length <= 1) return 1.0;

  let totalConfidence = 0;
  let pairCount = 0;

  for (let i = 0; i < responses.length; i++) {
    for (let j = i + 1; j < responses.length; j++) {
      totalConfidence += calculatePairConfidence(responses[i], responses[j]);
      pairCount++;
    }
  }

  return pairCount > 0 ? totalConfidence / pairCount : 0;
}

/**
 * Entity Resolution 메인 로직
 * 여러 API 응답을 받아 동일 기업 그룹으로 분류
 *
 * @param {Array} apiResponses - 표준화된 API 응답 배열
 * @returns {Object} { entities: [...], unmatched: [...] }
 */
function resolveEntities(apiResponses) {
  if (!apiResponses || apiResponses.length === 0) {
    return { entities: [], unmatched: [] };
  }

  // 그룹 관리: groupId → Set<responseIndex>
  const groups = new Map();
  const responseToGroup = new Map();
  let nextGroupId = 0;

  // Helper: 두 그룹 병합
  function mergeGroups(groupIdA, groupIdB) {
    if (groupIdA === groupIdB) return;
    const groupA = groups.get(groupIdA);
    const groupB = groups.get(groupIdB);
    for (const idx of groupB) {
      groupA.add(idx);
      responseToGroup.set(idx, groupIdA);
    }
    groups.delete(groupIdB);
  }

  // Helper: 새 그룹 생성 또는 기존 그룹에 추가
  function addToGroup(idx, existingGroupId = null) {
    if (existingGroupId !== null && groups.has(existingGroupId)) {
      groups.get(existingGroupId).add(idx);
      responseToGroup.set(idx, existingGroupId);
    } else {
      const gid = nextGroupId++;
      groups.set(gid, new Set([idx]));
      responseToGroup.set(idx, gid);
    }
  }

  // === Step 1: brno 기준 그룹핑 (exact match) ===
  const brnoIndex = new Map(); // brno → groupId
  for (let i = 0; i < apiResponses.length; i++) {
    const brno = normalizeBrno(apiResponses[i].brno);
    if (!brno) continue;

    if (brnoIndex.has(brno)) {
      const existingGroupId = brnoIndex.get(brno);
      addToGroup(i, existingGroupId);
    } else {
      addToGroup(i);
      brnoIndex.set(brno, responseToGroup.get(i));
    }
  }

  // === Step 2: crno 기준 그룹핑 (exact match) ===
  const crnoIndex = new Map(); // crno → groupId
  for (let i = 0; i < apiResponses.length; i++) {
    const crno = normalizeCrno(apiResponses[i].crno);
    if (!crno) continue;

    const currentGroupId = responseToGroup.get(i);

    if (crnoIndex.has(crno)) {
      const existingGroupId = crnoIndex.get(crno);
      if (currentGroupId !== undefined && currentGroupId !== existingGroupId) {
        // 이미 다른 그룹에 있음 → 그룹 병합
        mergeGroups(existingGroupId, currentGroupId);
      } else if (currentGroupId === undefined) {
        addToGroup(i, existingGroupId);
      }
      // else: 이미 같은 그룹
    } else {
      if (currentGroupId === undefined) {
        addToGroup(i);
      }
      crnoIndex.set(crno, responseToGroup.get(i));
    }
  }

  // === Step 3: 그룹 간 교차 검증 (brno-crno 교차 매칭) ===
  // 같은 응답에 brno+crno 둘 다 있으면 해당 그룹들 병합
  for (let i = 0; i < apiResponses.length; i++) {
    const brno = normalizeBrno(apiResponses[i].brno);
    const crno = normalizeCrno(apiResponses[i].crno);
    if (brno && crno) {
      const brnoGroupId = brnoIndex.get(brno);
      const crnoGroupId = crnoIndex.get(crno);
      if (brnoGroupId !== undefined && crnoGroupId !== undefined && brnoGroupId !== crnoGroupId) {
        mergeGroups(brnoGroupId, crnoGroupId);
        crnoIndex.set(crno, brnoGroupId);
      }
    }
  }

  // === Step 3.5: 그룹 간 name matching ===
  // brno 그룹과 crno 그룹이 분리되어 있지만 같은 회사명이면 병합
  const groupIds = [...groups.keys()];
  for (let i = 0; i < groupIds.length; i++) {
    for (let j = i + 1; j < groupIds.length; j++) {
      const gidA = groupIds[i];
      const gidB = groupIds[j];
      if (!groups.has(gidA) || !groups.has(gidB)) continue; // 이미 병합됨

      // 두 그룹의 회사명 비교
      const namesA = [...groups.get(gidA)]
        .map(idx => apiResponses[idx].companyName)
        .filter(Boolean);
      const namesB = [...groups.get(gidB)]
        .map(idx => apiResponses[idx].companyName)
        .filter(Boolean);

      let shouldMerge = false;
      for (const nameA of namesA) {
        for (const nameB of namesB) {
          if (calculateNameSimilarity(nameA, nameB) >= MATCH_THRESHOLD) {
            shouldMerge = true;
            break;
          }
        }
        if (shouldMerge) break;
      }

      if (shouldMerge) {
        mergeGroups(gidA, gidB);
      }
    }
  }

  // === Step 4: 미그룹 데이터 → fuzzy name match ===
  const ungrouped = [];
  for (let i = 0; i < apiResponses.length; i++) {
    if (!responseToGroup.has(i)) {
      ungrouped.push(i);
    }
  }

  for (const idx of ungrouped) {
    const response = apiResponses[idx];
    if (!response.companyName) {
      continue; // 이름도 ID도 없으면 매칭 불가
    }

    let bestGroupId = null;
    let bestSimilarity = 0;

    for (const [groupId, memberIndices] of groups) {
      // 그룹의 대표 이름들과 비교
      for (const memberIdx of memberIndices) {
        const memberName = apiResponses[memberIdx].companyName;
        if (!memberName) continue;

        const sim = calculateNameSimilarity(response.companyName, memberName);
        if (sim > bestSimilarity) {
          bestSimilarity = sim;
          bestGroupId = groupId;
        }
      }
    }

    if (bestSimilarity >= MATCH_THRESHOLD && bestGroupId !== null) {
      addToGroup(idx, bestGroupId);
    }
  }

  // === Step 5: 결과 구성 ===
  const entities = [];
  for (const [groupId, memberIndices] of groups) {
    const members = [...memberIndices].map(i => apiResponses[i]);
    const consistency = calculateGroupConsistency(members);

    // 대표 식별자 수집
    const identifiers = { brno: null, crno: null };
    const names = [];
    const sources = [];

    for (const member of members) {
      if (member.brno && !identifiers.brno) identifiers.brno = normalizeBrno(member.brno);
      if (member.crno && !identifiers.crno) identifiers.crno = normalizeCrno(member.crno);
      if (member.companyName) names.push(member.companyName);
      sources.push(member.source);
    }

    // 대표 이름: 정규화 후 가장 짧은 이름 선택
    const canonicalName = selectCanonicalName(names);

    entities.push({
      entityId: `ent_${identifiers.brno || identifiers.crno || groupId}`,
      confidence: consistency,
      matchLevel: consistency >= MATCH_THRESHOLD ? 'MATCH' :
                  consistency >= PROBABLE_THRESHOLD ? 'PROBABLE' : 'NO_MATCH',
      identifiers,
      canonicalName,
      nameVariants: [...new Set(names)],
      sources: [...new Set(sources)],
      data: members.map(m => ({
        source: m.source,
        rawData: m.rawData
      }))
    });
  }

  // 미매칭 데이터
  const unmatched = [];
  for (let i = 0; i < apiResponses.length; i++) {
    if (!responseToGroup.has(i)) {
      unmatched.push(apiResponses[i]);
    }
  }

  return { entities, unmatched };
}

/**
 * 대표 이름 선택
 * 정규화 후 가장 빈도가 높고, 같으면 가장 짧은 이름
 */
function selectCanonicalName(names) {
  if (names.length === 0) return null;

  // Sanitize: NPS returns "회사명/고용형태/프로젝트명" — extract first part
  const sanitized = names.map(n => sanitizeCompanyName(n)).filter(Boolean);
  if (sanitized.length === 0) return names[0];

  const normCounts = new Map();
  const normToOriginal = new Map();

  for (const name of sanitized) {
    const norm = normalizeCompanyName(name);
    if (!norm) continue;
    normCounts.set(norm, (normCounts.get(norm) || 0) + 1);
    // 가장 짧은 원본 이름 보존
    if (!normToOriginal.has(norm) || name.length < normToOriginal.get(norm).length) {
      normToOriginal.set(norm, name);
    }
  }

  // 빈도 내림차순, 같으면 길이 오름차순
  const sorted = [...normCounts.entries()].sort((a, b) => {
    if (b[1] !== a[1]) return b[1] - a[1];
    return a[0].length - b[0].length;
  });

  return sorted.length > 0 ? sorted[0][0] : sanitized[0];
}

/**
 * 회사명 정제 — NPS 프로젝트명/고용형태 제거, HTML 엔티티 디코딩
 */
function sanitizeCompanyName(name) {
  if (!name) return null;
  let clean = name;
  // Decode HTML entities: &amp; → &, etc.
  clean = clean.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"');
  // NPS pattern: "회사명/고용형태/프로젝트명" → extract first part
  if (clean.includes('/')) {
    const first = clean.split('/')[0].trim();
    if (first.length >= 2) clean = first;
  }
  return clean.trim() || null;
}

/**
 * 정규식 특수문자 이스케이프
 */
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export {
  normalizeCompanyName,
  calculateNameSimilarity,
  calculatePairConfidence,
  calculateGroupConsistency,
  resolveEntities,
  normalizeBrno,
  normalizeCrno,
  levenshteinDistance,
  MATCH_THRESHOLD,
  PROBABLE_THRESHOLD
};

export default {
  normalizeCompanyName,
  calculateNameSimilarity,
  resolveEntities,
  normalizeBrno,
  normalizeCrno
};

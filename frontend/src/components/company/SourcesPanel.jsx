/**
 * SourcesPanel — "기타" 섹션: API 소스 결과를 카드형으로 표시
 * 모든 소스 통일된 "+" 토글, 펼치면 추출된 key-value 표시 (raw JSON 아님)
 *
 * 배열형 데이터(근로복지공단, KRX 등)는 테이블로 표시
 * 모든 숫자 필드는 천단위 콤마 자동 적용
 */
import { useState } from 'react';
import './SourcesPanel.css';

// ── 숫자 포맷 유틸리티 ──
function formatNumber(val) {
  if (val === null || val === undefined || val === '') return null;
  const str = String(val).trim();
  // 순수 숫자 (음수, 소수 포함)만 포맷
  if (/^-?\d+(\.\d+)?$/.test(str)) {
    const num = Number(str);
    if (Number.isFinite(num)) return num.toLocaleString('ko-KR');
  }
  return null; // 숫자가 아니면 null
}

// 날짜 포맷: 20250319 → 2025-03-19
function formatDate(val) {
  if (!val) return null;
  const s = String(val).trim();
  if (/^\d{8}$/.test(s)) return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
  return null;
}

// 값 표시: 날짜 → 숫자 → 원본
function formatDisplayValue(val, key) {
  if (val === null || val === undefined || val === '') return '';
  const s = String(val);
  // 날짜 키 패턴
  if (/[Dd]t$|[Dd]ate$|일$/.test(key)) {
    const d = formatDate(s);
    if (d) return d;
  }
  // 숫자 포맷
  const n = formatNumber(s);
  if (n !== null) return n;
  return s;
}

// ── 주요 API 소스에서 표시할 필드 매핑 (한글 라벨) ──
const SOURCE_FIELD_MAP = {
  '금융위_기업기본정보': [
    { key: 'corpNm', label: '법인명' },
    { key: 'corpEnsnNm', label: '법인영문명' },
    { key: 'crno', label: '법인등록번호' },
    { key: 'bzno', label: '사업자등록번호' },
    { key: 'enpRprFnm', label: '대표자' },
    { key: 'enpBsadr', label: '소재지' },
    { key: 'enpDtadr', label: '상세주소' },
    { key: 'enpOzpno', label: '우편번호' },
    { key: 'enpTlno', label: '전화번호' },
    { key: 'enpFxno', label: '팩스번호' },
    { key: 'enpHmpgUrl', label: '홈페이지' },
    { key: 'enpEstbDt', label: '설립일' },
    { key: 'fstOpegDt', label: 'FSS 정보등록일' },
    { key: 'lastOpegDt', label: 'FSS 정보변경일' },
    { key: 'enpStacMm', label: '결산월' },
    { key: 'enpMainBizNm', label: '주업종명' },
    { key: 'sicNm', label: '표준산업분류명' },
    { key: 'smenpYn', label: '중소기업여부' },
    { key: 'enpEmpeCnt', label: '종업원수' },
    { key: 'enpPn1AvgSlryAmt', label: '1인평균급여액' },
    { key: 'empeAvgCnwkTermCtt', label: '평균근속연수' },
    { key: 'enpMntrBnkNm', label: '주거래은행' },
    { key: 'actnAudpnNm', label: '감사인' },
    { key: 'audtRptOpnnCtt', label: '감사보고서의견' },
    { key: 'corpRegMrktDcdNm', label: '법인시장구분' },
    { key: 'enpPbanCmpyNm', label: '공시회사명' },
    { key: 'enpKrxLstgDt', label: '유가증권상장일' },
    { key: 'enpKosdaqLstgDt', label: '코스닥상장일' },
    { key: 'fssCorpChgDtm', label: '정보변경일시' },
  ],

  '국세청_사업자등록상태조회': [
    { key: 'b_stt', label: '사업자상태' },
    { key: 'b_stt_cd', label: '상태코드' },
    { key: 'tax_type', label: '과세유형' },
    { key: 'tax_type_cd', label: '과세유형코드' },
    { key: 'end_dt', label: '폐업일' },
    { key: 'utcc_yn', label: '단위과세전환' },
    { key: 'invoice_apply_dt', label: '세금계산서적용일' },
  ],

  '국민연금공단_가입사업장내역': [
    { key: 'wkplNm', label: '사업장명' },
    { key: 'bzowrRgstNo', label: '사업자등록번호' },
    { key: 'wkplRoadNmDtlAddr', label: '주소' },
    { key: 'wkplJnngStdt', label: '가입일' },
    { key: 'crrmmNtcAmt', label: '당월고지금액' },
    { key: 'jnngpCnt', label: '가입자수' },
  ],

  // ── 금융위 배열형 API: 테이블 표시 ──
  '금융위_주식권리일정': {
    type: 'table',
    sortKey: 'basDt',
    sortDesc: true,
    columns: [
      { key: 'basDt', label: '기준일' },
      { key: 'stckIssuRcdNm', label: '발행구분' },
      { key: 'rgtExertRcdNm', label: '권리행사구분' },
      { key: 'rgtExertSttgDt', label: '권리행사시작일' },
      { key: 'rgtExertEdDt', label: '권리행사종료일' },
      { key: 'stckParPrc', label: '주당액면가' },
      { key: 'trsnmDptyDcdNm', label: '명의개서대리인' },
      { key: 'stckIssuCmpyNm', label: '발행회사' },
    ],
  },

  '금융위_주식발행공시정보': {
    type: 'table',
    sortKey: 'basDt',
    sortDesc: true,
    columns: [
      { key: 'bizYear', label: '사업연도' },
      { key: 'stckIssuTcntClsfNm', label: '구분' },
      { key: 'maxIssuStckTcnt', label: '발행할주식총수' },
      { key: 'acmlIssuStckTcnt', label: '누적발행주식수' },
      { key: 'acmlDcrsStckTcnt', label: '누적감소주식수' },
      { key: 'otsstcCnt', label: '유통주식수' },
      { key: 'trsstcCnt', label: '자기주식수' },
      { key: 'corpPtrnSeNm', label: '시장구분' },
    ],
  },

  '금융위_자금조달공시정보': {
    type: 'table',
    sortKey: 'basDt',
    sortDesc: true,
    columns: [
      { key: 'bizYr', label: '사업연도' },
      { key: 'cmpyNm', label: '회사명' },
      { key: 'cptUsePlanUsge', label: '자금사용계획(용도)' },
      { key: 'cptUsePlanAmtCn', label: '계획금액' },
      { key: 'realCptUsePres', label: '실제사용현황' },
      { key: 'realCptUseAmtCn', label: '실제사용금액' },
      { key: 'diffOcrnRsnCn', label: '차이원인' },
      { key: 'corpPtrnSeNm', label: '시장구분' },
    ],
  },

  '금융위_KRX상장종목정보': {
    type: 'table',
    sortKey: 'basDt',
    sortDesc: true,
    limit: 10,
    columns: [
      { key: 'basDt', label: '기준일' },
      { key: 'itmsNm', label: '종목명' },
      { key: 'srtnCd', label: '종목코드' },
      { key: 'isinCd', label: 'ISIN' },
      { key: 'mrktCtg', label: '시장구분' },
      { key: 'corpNm', label: '법인명' },
    ],
  },

  '금융위_공시정보_배당': {
    type: 'table',
    sortKey: 'basDt',
    sortDesc: true,
    columns: [
      { key: 'basDt', label: '기준일' },
      { key: 'crtmParPrc', label: '당기액면가' },
      { key: 'crtmPstcNpf', label: '당기주당순이익' },
      { key: 'crtmOnskCashDvdnAmt', label: '보통주현금배당(당기)' },
      { key: 'pvtrOnskCashDvdnAmt', label: '보통주현금배당(전기)' },
      { key: 'crtmOnskCashDvdnBnfRt', label: '보통주배당수익률(당기)' },
      { key: 'crtmOnskStckDvdnAmt', label: '보통주주식배당(당기)' },
      { key: 'crtmCashDvdnTndnCtt', label: '배당성향(당기)' },
    ],
  },

  '금융위_주식발행': {
    type: 'table',
    sortKey: 'basDt',
    sortDesc: true,
    limit: 10,
    columns: [
      { key: 'basDt', label: '기준일' },
      { key: 'stckIssuCmpyNm', label: '발행회사' },
      { key: 'onskTisuCnt', label: '보통주발행수' },
      { key: 'pfstTisuCnt', label: '우선주발행수' },
    ],
  },

  '금융위_기업재무정보': {
    type: 'pivot',
    // 피벗: bizYear별 acitNm → crtmAcitAmt
    pivotRow: 'acitNm',
    pivotCol: 'bizYear',
    pivotValue: 'crtmAcitAmt',
    filterKey: 'fnclDcd',
    filterValue: 'FS_ifrs_ConsolidatedMember', // 연결재무제표 우선
    fallbackFilterValue: 'FS_ifrs_SeparateMember',
    rowOrder: ['자산총계', '유동자산', '비유동자산', '부채총계', '유동부채', '비유동부채', '자본총계', '자본금', '이익잉여금', '이익잉여금(결손금)'],
  },

  '근로복지공단_고용산재보험': {
    type: 'table',
    sortKey: 'sangsiInwonCnt',
    sortDesc: true,
    columns: [
      { key: 'saeopjangNm', label: '사업장명' },
      { key: 'addr', label: '주소' },
      { key: 'gyEopjongNm', label: '업종명' },
      { key: 'sangsiInwonCnt', label: '상시근로자수' },
      { key: 'seongripDt', label: '성립일' },
      { key: 'opaBoheomFg', label: '산재보험' },
    ],
  },
};

// 범용 한글 필드명 매핑
const FIELD_LABEL_MAP = {
  crno: '법인등록번호', bzno: '사업자등록번호', brno: '사업자등록번호',
  bzowrRgstNo: '사업자등록번호', b_no: '사업자등록번호',
  corpNm: '법인명', corpName: '법인명', bsnmNm: '상호명',
  cmpyNm: '회사명', stckIssuCmpyNm: '주식발행회사명', fncoNm: '금융회사명',
  enpRprFnm: '대표자', rprsNm: '대표자', ceoNm: '대표자',
  enpBsadr: '소재지', addr: '주소', rprsBpladrs: '주소',
  enpEstbDt: '설립일', estbDt: '설립일',
  enpEmpeCnt: '종업원수', empeCnt: '종업원수',
  enpTlno: '전화번호', tlno: '전화번호',
  enpHmpgUrl: '홈페이지', hmUrl: '홈페이지',
  smenpYn: '중소기업여부',
  b_stt: '사업자상태', b_stt_cd: '상태코드',
  tax_type: '과세유형', tax_type_cd: '과세유형코드',
  end_dt: '폐업일', utcc_yn: '단위과세전환',
  invoice_apply_dt: '세금계산서적용일',
  wkplNm: '사업장명', wkplRoadNmDtlAddr: '주소',
  wkplJnngStdt: '가입일', crrmmNtcAmt: '당월고지금액', jnngpCnt: '가입자수',
  saeopjangNm: '사업장명', saeopjaDrno: '사업장관리번호',
  gyEopjongNm: '업종명', sangsiInwonCnt: '상시근로자수',
  opaBoheomFg: '산재보험가입여부',
  enpMainBizNm: '주업종명', sicNm: '표준산업분류명',
  fstOpegDt: 'FSS 정보등록일', lastOpegDt: 'FSS 정보변경일',
  enpStacMm: '결산월', corpEnsnNm: '법인영문명',
  enpOzpno: '우편번호', enpFxno: '팩스번호',
  actnAudpnNm: '감사인', audtRptOpnnCtt: '감사보고서의견',
  enpMntrBnkNm: '주거래은행', enpPbanCmpyNm: '공시회사명',
  fssCorpChgDtm: '정보변경일시', corpRegMrktDcdNm: '법인시장구분',
  enpPn1AvgSlryAmt: '1인평균급여액', empeAvgCnwkTermCtt: '평균근속연수',
  status: '상태', name: '이름', amount: '금액', date: '날짜',
  companyName: '기업명', address: '주소',
  industryCode: '업종코드', industryName: '업종명',
  representative: '대표자', phone: '전화번호',
  website: '홈페이지', establishmentDate: '설립일',
};

// 메타/노이즈 키 — 자동 추출 시 스킵
const SKIP_KEYS = new Set([
  'resultCode', 'resultMsg', 'numOfRows', 'pageNo', 'totalCount',
  'result_code', 'result_msg', 'status_code', 'request_cnt',
  'valid_cnt', 'rqst_regt_no', 'items', 'item', 'header', 'body',
  'response', 'data', 'list', 'result', 'rows',
]);

// ── 산재보험 코드 → 텍스트 ──
function formatInsuranceFlag(val) {
  const v = Number(val);
  if (v === 1) return '가입';
  if (v === 2) return '소멸';
  return String(val);
}

// 소스명에서 매칭되는 키 찾기
function findSourceConfig(sourceName) {
  for (const [key, config] of Object.entries(SOURCE_FIELD_MAP)) {
    if (sourceName?.includes(key) || key.includes(sourceName)) {
      return { displayName: key, config };
    }
  }
  return null;
}

// raw_data → 아이템 배열로 변환 (indexed object 처리)
function toItemArray(rawData) {
  if (!rawData || typeof rawData !== 'object') return [];
  if (Array.isArray(rawData)) return rawData;
  if (rawData.items && Array.isArray(rawData.items)) return rawData.items;
  // indexed object: { "0": {...}, "1": {...}, ... }
  const keys = Object.keys(rawData);
  if (keys.length > 0 && keys.every(k => /^\d+$/.test(k))) {
    return keys.sort((a, b) => Number(a) - Number(b)).map(k => rawData[k]);
  }
  // 단일 객체
  return [rawData];
}

// raw_data에서 실제 값 추출 (중첩 객체 지원)
function extractValue(data, key) {
  if (!data) return null;
  if (data[key] !== undefined) return data[key];
  // indexed object의 첫 번째 아이템에서 찾기
  const items = toItemArray(data);
  if (items.length > 0 && items[0] && items[0][key] !== undefined) {
    return items[0][key];
  }
  if (data.data && typeof data.data === 'object') {
    if (data.data[key] !== undefined) return data.data[key];
  }
  return null;
}

// 필드 키 → 한글 라벨
function getFieldLabel(key) {
  return FIELD_LABEL_MAP[key] || key;
}

// 알 수 없는 소스에서 자동으로 의미있는 key-value 추출
function autoExtractFields(rawData) {
  if (!rawData || typeof rawData !== 'object') return [];
  const fields = [];
  const seen = new Set();

  function walk(obj) {
    if (!obj || typeof obj !== 'object') return;
    if (Array.isArray(obj)) {
      if (obj.length > 0 && typeof obj[0] === 'object') walk(obj[0]);
      return;
    }
    for (const [k, v] of Object.entries(obj)) {
      if (SKIP_KEYS.has(k) || seen.has(k)) {
        if (v && typeof v === 'object') walk(v);
        continue;
      }
      if (v === null || v === undefined || v === '' || v === '-' || v === '0' || v === 0) continue;

      if (typeof v === 'object' && !Array.isArray(v)) {
        walk(v);
      } else if (Array.isArray(v)) {
        if (v.length > 0 && typeof v[0] !== 'object') {
          seen.add(k);
          fields.push({ key: k, label: getFieldLabel(k), value: v.join(', ') });
        } else if (v.length > 0) {
          walk(v[0]);
        }
      } else {
        seen.add(k);
        fields.push({ key: k, label: getFieldLabel(k), value: formatDisplayValue(v, k) });
      }
    }
  }

  // indexed object → 첫 번째 아이템만 walk
  const items = toItemArray(rawData);
  if (items.length > 1 && typeof items[0] === 'object') {
    walk(items[0]);
  } else {
    walk(rawData);
  }
  return fields;
}

// ── 테이블형 렌더러 ──
function TableRenderer({ items, config }) {
  const { columns, sortKey, sortDesc, limit } = config;

  // 정렬
  let sorted = [...items];
  if (sortKey) {
    sorted.sort((a, b) => {
      const va = String(a[sortKey] || '');
      const vb = String(b[sortKey] || '');
      return sortDesc ? vb.localeCompare(va) : va.localeCompare(vb);
    });
  }
  if (limit) sorted = sorted.slice(0, limit);

  if (sorted.length === 0) {
    return <div className="source-field source-field--empty"><span className="source-field__value">데이터 없음</span></div>;
  }

  return (
    <div className="source-table-wrap">
      <table className="source-table">
        <thead>
          <tr>
            {columns.map(col => (
              <th key={col.key}>{col.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((item, i) => (
            <tr key={i}>
              {columns.map(col => {
                let val = item[col.key];
                if (val === null || val === undefined || val === '') return <td key={col.key}>-</td>;
                // 산재보험 특수 포맷
                if (col.key === 'opaBoheomFg') val = formatInsuranceFlag(val);
                return <td key={col.key}>{formatDisplayValue(val, col.key)}</td>;
              })}
            </tr>
          ))}
        </tbody>
      </table>
      {limit && items.length > limit && (
        <div className="source-table-more">외 {items.length - limit}건</div>
      )}
    </div>
  );
}

// ── 피벗 테이블 렌더러 (기업재무정보용) ──
function PivotRenderer({ items, config }) {
  const { pivotRow, pivotCol, pivotValue, filterKey, filterValue, fallbackFilterValue, rowOrder } = config;

  // 필터: 연결재무제표 우선, 없으면 별도재무제표
  let filtered = items.filter(i => i[filterKey] === filterValue);
  if (filtered.length === 0 && fallbackFilterValue) {
    filtered = items.filter(i => i[filterKey] === fallbackFilterValue);
  }
  if (filtered.length === 0) filtered = items;

  // 피벗 데이터 구축
  const years = [...new Set(filtered.map(i => i[pivotCol]))].sort();
  const rowMap = new Map(); // acitNm → { year: amount }
  for (const item of filtered) {
    const row = item[pivotRow];
    const col = item[pivotCol];
    const val = item[pivotValue];
    if (!row || !col) continue;
    if (!rowMap.has(row)) rowMap.set(row, {});
    rowMap.get(row)[col] = val;
  }

  // 정렬
  const orderedRows = rowOrder
    ? rowOrder.filter(r => rowMap.has(r))
    : [...rowMap.keys()];

  if (orderedRows.length === 0) {
    return <div className="source-field source-field--empty"><span className="source-field__value">데이터 없음</span></div>;
  }

  return (
    <div className="source-table-wrap">
      <table className="source-table source-table--pivot">
        <thead>
          <tr>
            <th>항목</th>
            {years.map(y => <th key={y}>{y}년</th>)}
          </tr>
        </thead>
        <tbody>
          {orderedRows.map(row => (
            <tr key={row}>
              <td className="pivot-row-label">{row}</td>
              {years.map(y => {
                const val = rowMap.get(row)?.[y];
                return <td key={y} className="pivot-value">{val ? formatNumber(val) || val : '-'}</td>;
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── 메인 컴포넌트 ──
function SourcesPanel({ entity, apiData }) {
  const [expanded, setExpanded] = useState(new Set());

  if (!entity && !apiData) return null;

  const data = apiData || [];

  const toggle = (idx) => {
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(idx) ? next.delete(idx) : next.add(idx);
      return next;
    });
  };

  return (
    <div className="sources-panel">
      {data.length > 0 && (
        <div className="sources-cards">
          {data.map((src, idx) => {
            const sourceName = src.source || src.sourceName || `Source ${idx + 1}`;
            const rawData = src.data || src.rawData || src;
            const match = findSourceConfig(sourceName);
            const isOpen = expanded.has(idx);

            // 분기: 알려진 소스 vs 자동 추출
            let renderContent;
            let fieldCount = 0;

            if (match) {
              const { config } = match;

              if (config.type === 'table') {
                // 테이블형
                const items = toItemArray(rawData);
                fieldCount = items.length;
                renderContent = isOpen ? <TableRenderer items={items} config={config} /> : null;

              } else if (config.type === 'pivot') {
                // 피벗 테이블형
                const items = toItemArray(rawData);
                fieldCount = items.length;
                renderContent = isOpen ? <PivotRenderer items={items} config={config} /> : null;

              } else {
                // 기존 key-value 그리드
                const fields = config
                  .map(({ key, label }) => {
                    const val = extractValue(rawData, key);
                    if (val === null || val === undefined || val === '' || val === '0' || val === 0) return null;
                    return { key, label, value: formatDisplayValue(val, key) };
                  })
                  .filter(Boolean);
                fieldCount = fields.length;
                renderContent = isOpen ? (
                  <div className="source-card__fields">
                    {fields.length > 0 ? (
                      fields.map(({ key, label, value }) => (
                        <div key={key} className="source-field">
                          <span className="source-field__label">{label}</span>
                          <span className="source-field__value">{value}</span>
                        </div>
                      ))
                    ) : (
                      <div className="source-field source-field--empty">
                        <span className="source-field__value">데이터 없음</span>
                      </div>
                    )}
                  </div>
                ) : null;
              }
            } else {
              // 자동 추출
              const fields = autoExtractFields(rawData);
              fieldCount = fields.length;
              renderContent = isOpen ? (
                <div className="source-card__fields">
                  {fields.length > 0 ? (
                    fields.map(({ key, label, value }) => (
                      <div key={key} className="source-field">
                        <span className="source-field__label">{label}</span>
                        <span className="source-field__value">{value}</span>
                      </div>
                    ))
                  ) : (
                    <div className="source-field source-field--empty">
                      <span className="source-field__value">데이터 없음</span>
                    </div>
                  )}
                </div>
              ) : null;
            }

            const displayName = match ? match.displayName : sourceName;

            return (
              <div key={idx} className="source-card">
                <button
                  className="source-card__header"
                  onClick={() => toggle(idx)}
                >
                  <h4>{displayName}</h4>
                  <div className="source-card__meta">
                    {fieldCount > 0 && (
                      <span className="source-card__count">{fieldCount}건</span>
                    )}
                    <span className="source-card__toggle">{isOpen ? '−' : '+'}</span>
                  </div>
                </button>
                {renderContent}
              </div>
            );
          })}
        </div>
      )}

      {data.length === 0 && entity?.sources?.length > 0 && (
        <div className="source-tags">
          {entity.sources.map((s, i) => (
            <span key={i} className="source-tag">{s}</span>
          ))}
        </div>
      )}
    </div>
  );
}

export default SourcesPanel;

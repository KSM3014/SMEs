/**
 * SourcesPanel — "기타" 섹션: API 소스 결과를 카드형으로 표시
 * 모든 소스 통일된 "+" 토글, 펼치면 추출된 key-value 표시 (raw JSON 아님)
 */
import { useState } from 'react';
import './SourcesPanel.css';

// 주요 API 소스에서 표시할 필드 매핑 (한글 라벨)
const SOURCE_FIELD_MAP = {
  '금융위_기업기본정보': [
    { key: 'corpNm', label: '법인명' },
    { key: 'corpEnsnNm', label: '법인영문명' },
    { key: 'crno', label: '법인등록번호' },
    { key: 'bzno', label: '사업자등록번호' },
    { key: 'enpRprFnm', label: '대표자' },
    { key: 'enpBsadr', label: '소재지' },
    { key: 'enpOzpno', label: '우편번호' },
    { key: 'enpTlno', label: '전화번호' },
    { key: 'enpFxno', label: '팩스번호' },
    { key: 'enpHmpgUrl', label: '홈페이지' },
    { key: 'enpEstbDt', label: '설립일' },
    { key: 'fstOpegDt', label: '최초개업일' },
    { key: 'lastOpegDt', label: '최종개업일' },
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
};

// 범용 한글 필드명 매핑 — 모든 소스에서 자동 추출 시 사용
const FIELD_LABEL_MAP = {
  // 법인/사업자 등록
  crno: '법인등록번호', bzno: '사업자등록번호', brno: '사업자등록번호',
  bzowrRgstNo: '사업자등록번호', b_no: '사업자등록번호',
  corpNm: '법인명', corpName: '법인명', bsnmNm: '상호명',
  cmpyNm: '회사명', stckIssuCmpyNm: '주식발행회사명', fncoNm: '금융회사명',
  enpRprFnm: '대표자', rprsNm: '대표자', ceoNm: '대표자',
  applyRprsvNm: '신청대표자', applyBsnmNm: '신청상호명',
  enpBsadr: '소재지', addr: '주소', rprsBpladrs: '주소',
  enpEstbDt: '설립일', estbDt: '설립일', seongripDt: '설립일',
  enpEmpeCnt: '종업원수', empeCnt: '종업원수',
  enpTlno: '전화번호', tlno: '전화번호',
  enpHmpgUrl: '홈페이지', hmUrl: '홈페이지',

  // 금융/세금
  smenpYn: '중소기업여부', lastModDt: '최종수정일',
  b_stt: '사업자상태', b_stt_cd: '상태코드',
  tax_type: '과세유형', tax_type_cd: '과세유형코드',
  end_dt: '폐업일', utcc_yn: '단위과세전환',
  invoice_apply_dt: '세금계산서적용일',

  // 국민연금공단
  wkplNm: '사업장명', wkplRoadNmDtlAddr: '주소',
  wkplJnngStdt: '가입일', wkplJnngStcd: '가입상태코드',
  crrmmNtcAmt: '당월고지금액', jnngpCnt: '가입자수',
  nwAcqzrCnt: '신규가입자수', lssJnngpCnt: '소멸가입자수',
  adptDt: '적용일', scsnDt: '탈퇴일',
  wkplIntpCd: '사업장산업코드', wkplStylDvcd: '사업장유형코드',
  dataCrtYm: '데이터생성연월', seq: '순번',
  vldtVlKrnNm: '유효값한글명',

  // 근로복지공단 (고용보험/산재보험)
  saeopjangNm: '사업장명', saeopjaDrno: '사업장관리번호',
  gyEopjongNm: '업종명', gyEopjongCd: '업종코드',
  opaBoheomFg: '산재보험가입여부', sangsiInwonCnt: '상시근로자수',
  grpSaeopjangYn: '그룹사업장여부',
  goyongBoheomFg: '고용보험가입여부',
  sanjaeSeolyipDt: '산재보험성립일',
  goyongSeolyipDt: '고용보험성립일',
  sanjaeSosimulDt: '산재보험소멸일',
  goyongSosimulDt: '고용보험소멸일',
  jisaCode: '지사코드', jisaNm: '지사명',
  gwanhalJisaNm: '관할지사명',
  eopjongCd: '업종코드', eopjongNm: '업종명',
  saeopjangJusoDoroMyeong: '사업장도로명주소',
  saeopjangJibeonJuso: '사업장지번주소',
  saeopjangJusoPostNo: '사업장우편번호',
  daepyojaMyeong: '대표자명',

  // FSC 금융위
  enpMainBizNm: '주업종명', sicNm: '표준산업분류명',
  fstOpnDt: '최초개업일', fstOpegDt: '최초개업일',
  lastOpegDt: '최종개업일', enpStacMm: '결산월',
  corpEnsnNm: '법인영문명', enpOzpno: '우편번호',
  enpFxno: '팩스번호', enpDtadr: '상세주소',
  corpDcd: '법인구분코드', corpDcdNm: '법인구분명',
  actnAudpnNm: '감사인', audtRptOpnnCtt: '감사보고서의견',
  enpMntrBnkNm: '주거래은행', enpPbanCmpyNm: '공시회사명',
  fssCorpUnqNo: '금감원고유번호', fssCorpChgDtm: '정보변경일시',
  corpRegMrktDcd: '법인시장구분코드', corpRegMrktDcdNm: '법인시장구분',
  enpKrxLstgDt: '유가증권상장일', enpKosdaqLstgDt: '코스닥상장일',
  enpXchgLstgDt: '거래소상장일',
  enpKrxLstgAbolDt: '유가증권상장폐지일', enpKosdaqLstgAbolDt: '코스닥상장폐지일',
  enpXchgLstgAbolDt: '거래소상장폐지일',
  enpPn1AvgSlryAmt: '1인평균급여액', empeAvgCnwkTermCtt: '평균근속연수',
  aplcntNm: '신청인명',
  applyCrno: '신청법인등록번호', applyBrno: '신청사업자등록번호',
  rbf_tax_type: '간이과세유형', rbf_tax_type_cd: '간이과세유형코드',
  tax_type_change_dt: '과세유형변경일',

  // 환경공단 KECO
  rBizNm: '업소명', totalSplyAmt: '공급량',
  exhstAmt: '배출량', rcvryTrgtAmt: '회수목표량',
  locplcAddr: '소재지', exhstPrmsnNo: '배출허가번호',

  // 공정위 FTC
  dcCpNm: '판매업체명', dcPrdNm: '상품명',
  bzentyNm: '사업체명', groupNm: '그룹명',

  // 식약처 MFDS
  prdlstNm: '제품명', bsshNm: '제조업체명',
  prmisnDt: '허가일', prdlstReportNo: '보고번호',

  // 산업인력공단
  v_saeopjaDrno: '사업장관리번호',

  // 일반
  status: '상태', type: '유형', name: '이름',
  amount: '금액', count: '건수', date: '날짜',
  description: '설명', note: '비고', category: '분류',
  companyName: '기업명', address: '주소',
  industryCode: '업종코드', industryName: '업종명',
  representative: '대표자', phone: '전화번호',
  website: '홈페이지', establishmentDate: '설립일',
  joinDate: '가입일', leaveDate: '탈퇴일',
  newSubscribers: '신규가입자수', lostSubscribers: '소멸가입자수',
  styleCode: '사업장유형코드', businessStatus: '사업자상태',
  taxType: '과세유형',
};

// 메타/노이즈 키 — 자동 추출 시 스킵
const SKIP_KEYS = new Set([
  'resultCode', 'resultMsg', 'numOfRows', 'pageNo', 'totalCount',
  'result_code', 'result_msg', 'status_code', 'request_cnt',
  'valid_cnt', 'rqst_regt_no', 'items', 'item', 'header', 'body',
  'response', 'data', 'list', 'result', 'rows',
]);

// 소스명에서 매칭되는 키 찾기
function findSourceConfig(sourceName) {
  for (const [key, fields] of Object.entries(SOURCE_FIELD_MAP)) {
    if (sourceName?.includes(key) || key.includes(sourceName)) {
      return { displayName: key, fields };
    }
  }
  return null;
}

// raw_data에서 실제 값 추출 (중첩 객체 지원)
function extractValue(data, key) {
  if (!data) return null;
  if (data[key] !== undefined) return data[key];
  if (Array.isArray(data.items)) {
    for (const item of data.items) {
      if (item[key] !== undefined) return item[key];
    }
  }
  if (data.data && typeof data.data === 'object') {
    if (data.data[key] !== undefined) return data.data[key];
  }
  return null;
}

// 필드 키 → 한글 라벨 변환
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
        fields.push({ key: k, label: getFieldLabel(k), value: String(v) });
      }
    }
  }

  walk(rawData);
  return fields;
}

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
            const config = findSourceConfig(sourceName);
            const isOpen = expanded.has(idx);

            // 필드 추출: 알려진 소스는 SOURCE_FIELD_MAP, 아닌 건 자동 추출
            let fields;
            if (config) {
              fields = config.fields
                .map(({ key, label }) => {
                  const val = extractValue(rawData, key);
                  if (val === null || val === undefined || val === '' || val === '0' || val === 0) return null;
                  return { key, label, value: String(val) };
                })
                .filter(Boolean);
            } else {
              fields = autoExtractFields(rawData);
            }

            const displayName = config ? config.displayName : sourceName;
            const fieldCount = fields.length;

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
                {isOpen && (
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
                )}
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

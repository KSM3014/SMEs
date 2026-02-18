/**
 * SourcesPanel — "기타" 섹션: 주요 API 소스 결과를 카드형으로 표시
 */
import { useState } from 'react';
import './SourcesPanel.css';

// 주요 API 소스에서 표시할 필드 매핑
const SOURCE_FIELD_MAP = {
  '금융위원회_기업기본정보': [
    { key: 'crno', label: '법인등록번호' },
    { key: 'corpNm', label: '법인명' },
    { key: 'enpBsadr', label: '소재지' },
    { key: 'enpRprFnm', label: '대표자' },
    { key: 'enpEstbDt', label: '설립일' },
    { key: 'smenpYn', label: '중소기업여부' },
    { key: 'enpEmpeCnt', label: '종업원수' },
    { key: 'lastModDt', label: '최종수정일' },
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
    { key: 'saeopjangNm', label: '사업장명(원문)' },
  ],
};

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
  // 직접 키
  if (data[key] !== undefined) return data[key];
  // items 배열 내부
  if (Array.isArray(data.items)) {
    for (const item of data.items) {
      if (item[key] !== undefined) return item[key];
    }
  }
  // data 객체 내부
  if (data.data && typeof data.data === 'object') {
    if (data.data[key] !== undefined) return data.data[key];
  }
  return null;
}

function SourcesPanel({ entity, apiData }) {
  const [showRaw, setShowRaw] = useState(new Set());

  if (!entity && !apiData) return null;

  const data = apiData || [];

  const toggleRaw = (idx) => {
    setShowRaw(prev => {
      const next = new Set(prev);
      next.has(idx) ? next.delete(idx) : next.add(idx);
      return next;
    });
  };

  return (
    <div className="sources-panel">
      {/* 주요 API 소스 카드형 표시 */}
      {data.length > 0 && (
        <div className="sources-cards">
          {data.map((src, idx) => {
            const sourceName = src.source || src.sourceName || `Source ${idx + 1}`;
            const rawData = src.data || src.rawData || src;
            const config = findSourceConfig(sourceName);

            if (config) {
              // 주요 소스: 카드형 필드 표시
              return (
                <div key={idx} className="source-card">
                  <div className="source-card__header">
                    <h4>{config.displayName}</h4>
                    <button
                      className="raw-toggle"
                      onClick={() => toggleRaw(idx)}
                    >
                      {showRaw.has(idx) ? 'JSON 닫기' : 'JSON'}
                    </button>
                  </div>
                  <div className="source-card__fields">
                    {config.fields.map(({ key, label }) => {
                      const val = extractValue(rawData, key);
                      if (val === null || val === undefined || val === '') return null;
                      return (
                        <div key={key} className="source-field">
                          <span className="source-field__label">{label}</span>
                          <span className="source-field__value">{String(val)}</span>
                        </div>
                      );
                    })}
                  </div>
                  {showRaw.has(idx) && (
                    <pre className="source-card__raw">
                      {JSON.stringify(rawData, null, 2)}
                    </pre>
                  )}
                </div>
              );
            }

            // 기타 소스: 접을 수 있는 JSON
            return (
              <div key={idx} className="source-card source-card--minor">
                <button
                  className="source-card__header source-card__header--toggle"
                  onClick={() => toggleRaw(idx)}
                >
                  <h4>{sourceName}</h4>
                  <span>{showRaw.has(idx) ? '−' : '+'}</span>
                </button>
                {showRaw.has(idx) && (
                  <pre className="source-card__raw">
                    {JSON.stringify(rawData, null, 2)}
                  </pre>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* 데이터 없을 때 소스 이름 태그 표시 */}
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

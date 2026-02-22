/**
 * CompanyDetail — Progressive company data page (SSE-powered)
 *
 * Uses useCompanyLive() hook for real-time data streaming:
 *   [0ms]   db_data   → basic info from DB cache
 *   [~3s]   dart_data → DART financials/officers/shareholders
 *   [~20s]  live_diff → 86 API diff comparison
 *   [~20s]  complete  → final merged data
 */
import { useParams } from 'react-router-dom';
import useCompanyLive from '../hooks/useCompanyLive';
import FinancialChart from '../components/company/FinancialChart';
import FinancialStatements from '../components/company/FinancialStatements';
import OfficersTable from '../components/company/OfficersTable';
import ShareholdersTable from '../components/company/ShareholdersTable';
import ComparisonMetrics from '../components/company/ComparisonMetrics';
import RedFlags from '../components/company/RedFlags';
import StatusBar from '../components/company/StatusBar';
import SourcesPanel from '../components/company/SourcesPanel';
import './CompanyDetail.css';

function CompanyDetail() {
  const { id } = useParams();

  // id = BRN (10 digits), CRNO (13 digits), or DART corp_code (8 digits)
  const {
    status,
    company,
    dartAvailable,
    patentData,
    procurementData,
    diff,
    meta,
    error,
    events,
    isLoading,
    isComplete,
    hasData,
    hasPatent,
    hasProcurement,
  } = useCompanyLive(id);

  // 수동 확인 URL (사용자가 직접 데이터를 검증할 수 있는 웹사이트)
  const dartManualUrl = company?.corp_code
    ? `https://dart.fss.or.kr/dsab001/main.do?corpCd=${company.corp_code}`
    : 'https://dart.fss.or.kr/';
  const kiprisManualUrl = company?.company_name
    ? `https://kpat.kipris.or.kr/kpat/searchLogina.do?next=MainSearch&applicant=${encodeURIComponent(company.company_name)}`
    : 'https://kpat.kipris.or.kr/kpat/searchLogina.do?next=MainSearch';
  const g2bManualUrl = 'https://www.g2b.go.kr:8340/search.do';
  const sminfoManualUrl = 'https://sminfo.mss.go.kr/';
  const hometaxUrl = 'https://teht.hometax.go.kr/websquare/websquare.wq?w2xPath=/ui/ab/a/a/UTEABAAA13.xml';
  const ventureCheckUrl = 'https://www.smes.go.kr/venturein/home/viewHome';

  // Initial connecting state — full-page spinner
  if (status === 'connecting' && !hasData) {
    return (
      <div className="company-detail loading">
        <div className="spinner-container">
          <div className="spinner"></div>
          <p>기업 정보를 불러오는 중...</p>
        </div>
      </div>
    );
  }

  // Error state with no data
  if (status === 'error' && !hasData) {
    return (
      <div className="company-detail error">
        <div className="error-message">
          <h2>오류 발생</h2>
          <p>기업 정보를 불러올 수 없습니다.</p>
          <p className="text-muted">{error || 'SSE 연결 실패. 서버 상태를 확인해주세요.'}</p>
        </div>
      </div>
    );
  }

  // No data found (DB empty + API returned nothing)
  if (isComplete && !hasData) {
    return (
      <div className="company-detail error">
        <div className="error-message">
          <h2>데이터 없음</h2>
          <p>사업자등록번호 {id}에 대한 정보를 찾을 수 없습니다.</p>
        </div>
      </div>
    );
  }

  const formatDate = (dateString) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleDateString('ko-KR');
  };

  // Skeleton placeholder for sections waiting on DART data
  const SectionSkeleton = ({ title }) => (
    <section className="section-skeleton">
      <h2>{title}</h2>
      <div className="skeleton-content">
        <div className="skeleton-line skeleton-line--wide" />
        <div className="skeleton-line skeleton-line--medium" />
        <div className="skeleton-line skeleton-line--narrow" />
        <div className="skeleton-line skeleton-line--wide" />
      </div>
    </section>
  );

  // 데이터 출처 참조 (기준날짜 + 원본확인 링크)
  const DataSourceRef = ({ date, source, url }) => (
    <span className="data-source-ref">
      {date && <span className="data-source-ref-date">기준: {date}</span>}
      {source && <span className="data-source-ref-src">{source}</span>}
      {url && (
        <a href={url} target="_blank" rel="noopener noreferrer" className="data-source-ref-link" title="원본 데이터 직접 확인">
          원본확인
        </a>
      )}
    </span>
  );

  // Determine what to show for DART-dependent sections
  const dartLoaded = events.includes('dart_data');
  const showDartSkeleton = !dartLoaded && isLoading;

  return (
    <div className="company-detail">
      {/* Status Bar — always visible during loading */}
      {(isLoading || status === 'error') && (
        <StatusBar status={status} meta={meta} diff={diff} events={events} />
      )}

      {/* Complete status — brief summary */}
      {isComplete && (
        <StatusBar status="complete" meta={meta} diff={diff} events={events} />
      )}

      {/* 1. Company Header — Name + Badges */}
      {company && (
        <section className="company-header">
          <div className="company-title-row">
            <h1>{company.company_name || id}</h1>
            <div className="badges">
              {company.venture_certification?.certified && (
                <span className={`badge ${company.venture_certification.expired ? 'badge-outline' : 'badge-primary'}`} title={`${company.venture_certification.type} (${company.venture_certification.valid_from}~${company.venture_certification.valid_to})`}>
                  {company.venture_certification.expired ? '벤처인증(만료)' : '벤처인증'}
                </span>
              )}
              {company.innovation_certification && (
                <span className="badge badge-success">이노비즈</span>
              )}
              {company.main_biz_certification && (
                <span className="badge badge-info">주력산업</span>
              )}
              {company.strong_sme?.certified && (
                <span className="badge badge-warning" title={`${company.strong_sme.brand_name} (${company.strong_sme.selection_year})`}>
                  강소기업{company.strong_sme.is_youth_friendly ? '(청년친화)' : ''}
                </span>
              )}
              {(hasPatent || company.patent_data?.patents?.total > 0) && (
                <span className="badge badge-ip" title={`총 특허 ${(patentData || company.patent_data)?.patents?.total?.toLocaleString()}건`}>
                  IP {(patentData || company.patent_data)?.patents?.total?.toLocaleString()}건
                </span>
              )}
              {(hasProcurement || company.procurement?.isGovernmentVendor) && (
                <span className="badge badge-procurement" title={`조달청 계약 ${(procurementData || company.procurement)?.contractCount}건`}>
                  조달업체
                </span>
              )}
              {company.listed && (
                <span className="badge badge-secondary">상장</span>
              )}
              {company.stock_code && (
                <span className="badge badge-outline">{company.stock_code}</span>
              )}
            </div>
          </div>
        </section>
      )}

      {/* 2. 기업 개요 — Card Grid */}
      {company && (
        <section className="company-overview">
          <h2>
            기업 개요
            <DataSourceRef source="종합" url={hometaxUrl} />
          </h2>
          <div className="overview-grid">
            <div className="overview-card">
              <span className="overview-label">기업명</span>
              <span className="overview-value">{company.company_name || '-'}</span>
            </div>
            <div className="overview-card">
              <span className="overview-label">대표</span>
              <span className="overview-value">{company.ceo_name || '-'}</span>
            </div>
            <div className="overview-card">
              <span className="overview-label">직원수</span>
              <span className="overview-value">{company.employee_count ? `${company.employee_count.toLocaleString()}명` : '-'}</span>
            </div>
            <div className="overview-card">
              <span className="overview-label">사업주체</span>
              <span className="overview-value">{company.corp_code || company.corp_cls ? '법인기업' : '개인사업자'}</span>
            </div>
            <div className="overview-card">
              <span className="overview-label">기업유형</span>
              <span className="overview-value">
                {company.corp_cls === 'Y' ? '유가증권 상장법인'
                  : company.corp_cls === 'K' ? '코스닥 상장법인'
                  : company.corp_cls === 'N' ? '코넥스 상장법인'
                  : company.listed ? '상장법인'
                  : '비상장법인'}
              </span>
            </div>
            <div className="overview-card">
              <span className="overview-label">사업자등록번호</span>
              <span className="overview-value mono">{company.business_number || id}</span>
            </div>
            <div className="overview-card">
              <span className="overview-label">법인등록번호</span>
              <span className="overview-value mono">{company.corp_registration_no || '-'}</span>
            </div>
            <div className="overview-card">
              <span className="overview-label">업종</span>
              <span className="overview-value">{company.industry_display || company.industry_name || '-'}</span>
            </div>
            <div className="overview-card full-width">
              <span className="overview-label">설립일</span>
              <span className="overview-value">{formatDate(company.establishment_date)}</span>
            </div>
            <div className="overview-card full-width">
              <span className="overview-label">주소</span>
              <span className="overview-value">{company.address || '-'}</span>
            </div>
            <div className="overview-card">
              <span className="overview-label">대표연락처</span>
              <span className="overview-value">{company.phone || '-'}</span>
            </div>
            <div className="overview-card">
              <span className="overview-label">홈페이지</span>
              <span className="overview-value">
                {company.website ? (
                  <a href={company.website.startsWith('http') ? company.website : `http://${company.website}`} target="_blank" rel="noopener noreferrer">
                    {company.website}
                  </a>
                ) : '-'}
              </span>
            </div>
            <div className="overview-card full-width">
              <span className="overview-label">
                벤처인증
                {company.venture_certification?.certified && (
                  <a href={ventureCheckUrl} target="_blank" rel="noopener noreferrer" className="data-source-ref-link" style={{marginLeft: 6, fontSize: '0.65rem'}}>확인</a>
                )}
              </span>
              <span className="overview-value">
                {company.venture_certifications && company.venture_certifications.length > 0
                  ? company.venture_certifications.map((vc, i) => (
                      <span key={i} className={`venture-cert-item ${vc.expired ? 'venture-cert-expired' : ''}`}>
                        {vc.type} ({vc.valid_from}~{vc.valid_to}){vc.expired ? ' [만료]' : ''}
                        {vc.certifier && <span className="venture-cert-certifier"> | {vc.certifier}</span>}
                        {i < company.venture_certifications.length - 1 && <br />}
                      </span>
                    ))
                  : company.venture_certification?.certified
                    ? `${company.venture_certification.type} (${company.venture_certification.valid_from}~${company.venture_certification.valid_to})${company.venture_certification.expired ? ' [만료]' : ''}`
                    : '-'}
              </span>
            </div>
            <div className="overview-card">
              <span className="overview-label">주생산품</span>
              <span className="overview-value">{company.venture_certification?.main_products || company.strong_sme?.main_products || '-'}</span>
            </div>
            {company.strong_sme?.certified && (
              <div className="overview-card full-width">
                <span className="overview-label">강소기업</span>
                <span className="overview-value">
                  {company.strong_sme.brand_name} ({company.strong_sme.selection_year})
                  {company.strong_sme.is_youth_friendly && ' | 청년친화강소기업'}
                  {company.strong_sme.employee_count && ` | 상시근로자 ${company.strong_sme.employee_count.toLocaleString()}명`}
                </span>
              </div>
            )}
          </div>
        </section>
      )}

      {/* 2.5. 특허/IP 현황 — from KIPRIS */}
      {!events.includes('patent_data') && isLoading && (
        <SectionSkeleton title="특허/IP 현황" />
      )}
      {events.includes('patent_data') && (() => {
        const pd = patentData || company?.patent_data;
        if (!pd || pd.patents?.total === 0) return null;
        const patents = pd.patents;
        const ipScore = pd.ipScore || 0;
        const scoreColor = ipScore >= 70 ? 'ip-score--high' : ipScore >= 40 ? 'ip-score--mid' : 'ip-score--low';
        return (
          <section className="patent-section">
            <h2>
              특허/IP 현황
              <DataSourceRef source="KIPRIS" url={kiprisManualUrl} />
            </h2>

            {/* IP Score + Summary Stats */}
            <div className="patent-summary">
              <div className={`ip-score-circle ${scoreColor}`}>
                <span className="ip-score-value">{ipScore}</span>
                <span className="ip-score-label">IP 점수</span>
                <span className="ip-score-info" title={`IP 점수 산출 기준 (0~100):\n• 특허 보유 건수: 0~35점 (로그 스케일)\n• 등록 특허 비율: 0~25점\n• 최근 3년 활동성: 0~25점\n• IPC 기술분야 다양성: 0~15점\n\n점수 = (건수 + 등록비율 + 활동성 + 다양성)`}>&#x2139;</span>
              </div>
              <div className="patent-stats">
                <div className="patent-stat">
                  <span className="patent-stat-value">{patents.total?.toLocaleString()}</span>
                  <span className="patent-stat-label">총 특허</span>
                </div>
                <div className="patent-stat">
                  <span className="patent-stat-value">{patents.registered?.toLocaleString()}</span>
                  <span className="patent-stat-label">등록 특허</span>
                </div>
                <div className="patent-stat">
                  <span className="patent-stat-value">{patents.recent3yr?.toLocaleString()}</span>
                  <span className="patent-stat-label">최근 3년</span>
                </div>
                {pd.trademarks?.total > 0 && (
                  <div className="patent-stat">
                    <span className="patent-stat-value">{pd.trademarks.total?.toLocaleString()}</span>
                    <span className="patent-stat-label">상표</span>
                  </div>
                )}
              </div>
            </div>

            {/* Top IPC Categories */}
            {patents.topIpcCodes && patents.topIpcCodes.length > 0 && (
              <div className="patent-ipc">
                <h3>주요 기술 분류 (IPC)</h3>
                <div className="ipc-tags">
                  {patents.topIpcCodes.map((ipc, i) => {
                    const searchName = pd.searchedName || company?.company_name || '';
                    const kiprisIpcUrl = `http://kpat.kipris.or.kr/kpat/searchLogina.do?next=MainSearch&applicant=${encodeURIComponent(searchName)}&ipc=${encodeURIComponent(ipc.code)}`;
                    return (
                      <span key={i} className="ipc-tag" title={`IPC ${ipc.code}`}>
                        {ipc.name}{' '}
                        <a href={kiprisIpcUrl} target="_blank" rel="noopener noreferrer" className="ipc-tag-count-link" title={`KIPRIS에서 ${ipc.code} 분류 특허 ${ipc.count}건 확인`}>
                          {ipc.count}
                        </a>
                      </span>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Recent Patents */}
            {patents.recentPatents && patents.recentPatents.length > 0 && (
              <div className="patent-recent">
                <h3>최근 특허</h3>
                <table className="patent-table">
                  <thead>
                    <tr>
                      <th>제목</th>
                      <th>출원번호 (일자)</th>
                      <th>출원인 / 최종권리자</th>
                      <th>상태</th>
                    </tr>
                  </thead>
                  <tbody>
                    {patents.recentPatents.map((p, i) => (
                      <tr key={i}>
                        <td className="patent-title-cell">{p.title}</td>
                        <td className="patent-appno-cell mono">
                          {p.applicationNumber || '-'}
                          {p.applicationDate && <span className="patent-appno-date">{p.applicationDate}</span>}
                        </td>
                        <td className="patent-applicant-cell">{p.applicantName || '-'}</td>
                        <td>
                          <span className={`patent-status patent-status--${p.statusEn || 'unknown'}`}>
                            {p.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        );
      })()}

      {/* 2.7. 조달청 계약 이력 — from 나라장터 APIs */}
      {!events.includes('procurement_data') && isLoading && (
        <SectionSkeleton title="조달청 계약 이력" />
      )}
      {events.includes('procurement_data') && (() => {
        const pd = procurementData || company?.procurement;
        if (!pd || !pd.isGovernmentVendor) return null;
        const formatAmount = (amt) => {
          if (!amt || amt === 0) return '-';
          if (amt >= 100000000) return `${(amt / 100000000).toFixed(1)}억원`;
          if (amt >= 10000) return `${(amt / 10000).toFixed(0)}만원`;
          return `${amt.toLocaleString()}원`;
        };
        return (
          <section className="procurement-section">
            <h2>
              조달청 계약 이력
              <DataSourceRef date={pd.searchPeriod} source="나라장터" url={g2bManualUrl} />
            </h2>

            {/* Summary Stats */}
            <div className="procurement-summary">
              <div className="procurement-stat">
                <span className="procurement-stat-value">{pd.contractCount}</span>
                <span className="procurement-stat-label">계약 건수</span>
              </div>
              <div className="procurement-stat">
                <span className="procurement-stat-value">{formatAmount(pd.totalContractValue || pd.totalValue)}</span>
                <span className="procurement-stat-label">총 계약금액</span>
              </div>
              {pd.awardCount > 0 && (
                <div className="procurement-stat">
                  <span className="procurement-stat-value">{pd.awardCount}</span>
                  <span className="procurement-stat-label">낙찰 건수</span>
                </div>
              )}
              {pd.avgContractAmount > 0 && (
                <div className="procurement-stat">
                  <span className="procurement-stat-value">{formatAmount(pd.avgContractAmount)}</span>
                  <span className="procurement-stat-label">평균 계약액</span>
                </div>
              )}
            </div>

            {/* Recent Contracts Table */}
            {pd.contracts && pd.contracts.length > 0 && (
              <div className="procurement-contracts">
                <h3>최근 계약</h3>
                <table className="procurement-table">
                  <thead>
                    <tr>
                      <th>계약명</th>
                      <th>금액</th>
                      <th>계약일</th>
                      <th>발주기관</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pd.contracts.slice(0, 10).map((c, i) => (
                      <tr key={i}>
                        <td className="procurement-title-cell">
                          {c.url ? (
                            <a href={c.url} target="_blank" rel="noopener noreferrer">{c.title}</a>
                          ) : c.title}
                        </td>
                        <td className="procurement-amount-cell">{formatAmount(c.amount)}</td>
                        <td className="procurement-date-cell">{c.date || '-'}</td>
                        <td className="procurement-agency-cell">{c.agency || c.demandAgency || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Recent Awards Table */}
            {pd.awards && pd.awards.length > 0 && (
              <div className="procurement-awards">
                <h3>최근 낙찰</h3>
                <table className="procurement-table">
                  <thead>
                    <tr>
                      <th>공고명</th>
                      <th>낙찰금액</th>
                      <th>낙찰률</th>
                      <th>낙찰일</th>
                      <th>수요기관</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pd.awards.slice(0, 10).map((a, i) => (
                      <tr key={i}>
                        <td className="procurement-title-cell">{a.title}</td>
                        <td className="procurement-amount-cell">{formatAmount(a.amount)}</td>
                        <td>{a.rate ? `${a.rate}%` : '-'}</td>
                        <td className="procurement-date-cell">{a.date || '-'}</td>
                        <td className="procurement-agency-cell">{a.agency || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        );
      })()}

      {/* 3. 인물 정보 — 3-Column Grid */}
      {showDartSkeleton && <SectionSkeleton title="인물 정보" />}
      {!showDartSkeleton && company && (
        <section className="personnel-section">
          <h2>
            인물 정보
            {dartAvailable && <DataSourceRef date={company.report_period} source="DART" url={dartManualUrl} />}
          </h2>
          <div className="personnel-grid">
            {/* CEO Card */}
            <div className="personnel-card">
              <h3>대표자</h3>
              <div className="ceo-info">
                <p className="ceo-name">{company.ceo_name || '-'}</p>
                {company.officers && (() => {
                  const ceos = company.officers.filter(o =>
                    o.position?.includes('대표이사') || o.position?.includes('CEO')
                  );
                  if (ceos.length > 0) {
                    return <p className="ceo-role">{ceos.map(c => c.position).join(', ')}</p>;
                  }
                  return null;
                })()}
                <p className="ceo-source">{dartAvailable ? '출처: DART' : '-'}</p>
              </div>
            </div>

            {/* Officers Compact */}
            <div className="personnel-card">
              <h3>임원 현황</h3>
              {company.officers && company.officers.length > 0 ? (
                <OfficersTable officers={company.officers} compact />
              ) : (
                <p className="no-data-text">-</p>
              )}
            </div>

            {/* Shareholders Compact */}
            <div className="personnel-card">
              <h3>지분 현황</h3>
              {company.shareholders && company.shareholders.length > 0 ? (
                <ShareholdersTable shareholders={company.shareholders} compact />
              ) : (
                <p className="no-data-text">-</p>
              )}
            </div>
          </div>
        </section>
      )}

      {/* 4. 3-Year Average Comparison — 사업보고서 기준 (최신 연간 vs 3년 평균) */}
      {showDartSkeleton && <SectionSkeleton title="3년 평균 비교" />}
      {!showDartSkeleton && company && (
        company.three_year_average && company.latest_annual ? (
          <ComparisonMetrics
            current={company.latest_annual}
            average={company.three_year_average}
            sourceRef={<DataSourceRef date={company.report_period} source="DART" url={dartManualUrl} />}
          />
        ) : (
          <section className="comparison-placeholder">
            <h2>3년 평균 비교</h2>
            <p className="no-data-text">-</p>
          </section>
        )
      )}

      {/* 6. Red Flags — from entity cross-check + DART */}
      {company?.red_flags && company.red_flags.length > 0 && (
        <RedFlags flags={company.red_flags} />
      )}

      {/* 6.5. DART 확장 정보 — 직원현황, 감사의견, 배당, 재무지표 */}
      {!showDartSkeleton && company && (company.employee_status || company.directors_compensation || company.dividend_details || company.financial_indicators) && (
        <section className="dart-extended-section">
          <h2>
            기업 분석 (DART)
            <DataSourceRef date={company.report_period} source="DART" url={dartManualUrl} />
          </h2>
          <div className="dart-extended-grid">
            {/* 직원현황 */}
            {company.employee_status && (
              <div className="dart-ext-card">
                <h3>직원 현황</h3>
                <div className="dart-ext-content">
                  <div className="dart-ext-row">
                    <span className="dart-ext-label">총 직원수</span>
                    <span className="dart-ext-value">{company.employee_status.total?.toLocaleString() || '-'}명</span>
                  </div>
                  {company.employee_status.regular && (
                    <div className="dart-ext-row">
                      <span className="dart-ext-label">정규직</span>
                      <span className="dart-ext-value">{company.employee_status.regular.toLocaleString()}명</span>
                    </div>
                  )}
                  {company.employee_status.contract > 0 && (
                    <div className="dart-ext-row">
                      <span className="dart-ext-label">계약직</span>
                      <span className="dart-ext-value">{company.employee_status.contract.toLocaleString()}명</span>
                    </div>
                  )}
                  {company.employee_status.average_tenure && (
                    <div className="dart-ext-row">
                      <span className="dart-ext-label">평균 근속</span>
                      <span className="dart-ext-value">{company.employee_status.average_tenure}</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* 이사·감사 보수 */}
            {company.directors_compensation && (
              <div className="dart-ext-card">
                <h3>이사·감사 보수</h3>
                <div className="dart-ext-content">
                  <div className="dart-ext-row">
                    <span className="dart-ext-label">인원</span>
                    <span className="dart-ext-value">{company.directors_compensation.headcount || '-'}명</span>
                  </div>
                  <div className="dart-ext-row">
                    <span className="dart-ext-label">보수 총액</span>
                    <span className="dart-ext-value">
                      {company.directors_compensation.total_compensation
                        ? `${(company.directors_compensation.total_compensation / 100000000).toFixed(1)}억원`
                        : '-'}
                    </span>
                  </div>
                  <div className="dart-ext-row">
                    <span className="dart-ext-label">1인 평균</span>
                    <span className="dart-ext-value">
                      {company.directors_compensation.avg_compensation
                        ? `${(company.directors_compensation.avg_compensation / 10000).toLocaleString()}만원`
                        : '-'}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* 배당 */}
            {company.dividend_details && (
              <div className="dart-ext-card">
                <h3>배당 현황</h3>
                <div className="dart-ext-content">
                  {Object.entries(company.dividend_details).slice(0, 5).map(([label, data]) => (
                    <div className="dart-ext-row" key={label}>
                      <span className="dart-ext-label">{label}</span>
                      <span className="dart-ext-value">{data.current || '-'}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 재무지표 */}
            {company.financial_indicators && (
              <div className="dart-ext-card dart-ext-card--wide">
                <h3>DART 재무지표</h3>
                <div className="dart-indicators-grid">
                  {Object.entries(company.financial_indicators).map(([category, indicators]) => (
                    <div key={category} className="indicator-group">
                      <h4>{category === 'profitability' ? '수익성' : category === 'stability' ? '안전성' : category === 'growth' ? '성장성' : '활동성'}</h4>
                      {indicators.map((ind, i) => (
                        <div className="dart-ext-row" key={i}>
                          <span className="dart-ext-label">{ind.name}</span>
                          <span className="dart-ext-value">{ind.value || '-'}</span>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {/* 7. Financial Chart — from DART */}
      {showDartSkeleton && <SectionSkeleton title="재무 성과 추이" />}
      {!showDartSkeleton && company && (
        <section className="financial-chart-section">
          <h2>
            재무 성과 추이
            {company._hasDart && <DataSourceRef date={company.report_period} source="DART" url={dartManualUrl} />}
            {company._hasSminfo && !company._hasDart && <DataSourceRef source="sminfo" url={sminfoManualUrl} />}
          </h2>
          {company.financial_history && company.financial_history.length > 0 ? (
            <FinancialChart data={company.financial_history} />
          ) : (
            <p className="no-data-text">-</p>
          )}
        </section>
      )}

      {/* 8. Financial Statements — from DART or sminfo */}
      {showDartSkeleton && <SectionSkeleton title="재무제표" />}
      {!showDartSkeleton && company && (
        <section className="financial-statements-section">
          <h2>
            재무제표
            {company._hasDart && <DataSourceRef date={company.report_period} source="DART" url={dartManualUrl} />}
            {company._hasSminfo && !company._hasDart && (
              <DataSourceRef
                source={`sminfo (${Math.round((company._sminfoMatchScore || 0) * 100)}% 매칭)`}
                url={sminfoManualUrl}
              />
            )}
          </h2>
          {company.financial_statements ? (
            <FinancialStatements statements={company.financial_statements} />
          ) : (
            <p className="no-data-text">-</p>
          )}
        </section>
      )}

      {/* 9. Officers Full Table — from DART */}
      {showDartSkeleton && <SectionSkeleton title="임원 현황 (상세)" />}
      {!showDartSkeleton && company && (
        <section className="officers-section">
          <h2>
            임원 현황 (상세)
            {dartAvailable && <DataSourceRef date={company.report_period} source="DART" url={dartManualUrl} />}
          </h2>
          {company.officers && company.officers.length > 0 ? (
            <OfficersTable officers={company.officers} />
          ) : (
            <p className="no-data-text">-</p>
          )}
        </section>
      )}

      {/* 10. Shareholders Full Table — from DART */}
      {showDartSkeleton && <SectionSkeleton title="주주 현황 (상세)" />}
      {!showDartSkeleton && company && (
        <section className="shareholders-section">
          <h2>
            주주 현황 (상세)
            {dartAvailable && <DataSourceRef date={company.report_period} source="DART" url={dartManualUrl} />}
          </h2>
          {company.shareholders && company.shareholders.length > 0 ? (
            <ShareholdersTable shareholders={company.shareholders} />
          ) : (
            <p className="no-data-text">-</p>
          )}
        </section>
      )}

      {/* 11. Sources Panel — entity metadata + API raw data */}
      {company && (
        <section className="sources-section">
          <h2>기타</h2>
          {company._entity ? (
            <SourcesPanel
              entity={company._entity}
              apiData={company._apiData}
              conflicts={company._conflicts}
            />
          ) : (
            <p className="no-data-text">-</p>
          )}
        </section>
      )}
    </div>
  );
}

export default CompanyDetail;

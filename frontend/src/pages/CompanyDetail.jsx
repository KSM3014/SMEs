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

  // id = business_number (brno) from SearchBar navigation
  const {
    status,
    company,
    dartAvailable,
    diff,
    meta,
    error,
    events,
    isLoading,
    isComplete,
    hasData,
  } = useCompanyLive(id);

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
              {company.venture_certification && (
                <span className="badge badge-primary">벤처인증</span>
              )}
              {company.innovation_certification && (
                <span className="badge badge-success">이노비즈</span>
              )}
              {company.main_biz_certification && (
                <span className="badge badge-info">주력산업</span>
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
          <h2>기업 개요</h2>
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
            {company.corp_registration_no && (
              <div className="overview-card">
                <span className="overview-label">법인등록번호</span>
                <span className="overview-value mono">{company.corp_registration_no}</span>
              </div>
            )}
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
          </div>
        </section>
      )}

      {/* 3. 인물 정보 (DART) — 3-Column Grid (DART 데이터 있을 때만) */}
      {showDartSkeleton && <SectionSkeleton title="인물 정보 (DART)" />}
      {dartAvailable && (company?.officers?.length > 0 || company?.shareholders?.length > 0) && (
        <section className="personnel-section">
          <h2>인물 정보 (DART)</h2>
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
                <p className="ceo-source">출처: DART</p>
              </div>
            </div>

            {/* Officers Compact */}
            <div className="personnel-card">
              <h3>임원 현황</h3>
              {company.officers && company.officers.length > 0 ? (
                <OfficersTable officers={company.officers} compact />
              ) : (
                <p className="no-data-text">임원 정보 없음</p>
              )}
            </div>

            {/* Shareholders Compact */}
            <div className="personnel-card">
              <h3>지분 현황</h3>
              {company.shareholders && company.shareholders.length > 0 ? (
                <ShareholdersTable shareholders={company.shareholders} compact />
              ) : (
                <p className="no-data-text">주주 정보 없음</p>
              )}
            </div>
          </div>
        </section>
      )}

      {/* 4. 3-Year Average Comparison — from DART */}
      {company?.three_year_average && (
        <ComparisonMetrics current={company} average={company.three_year_average} />
      )}

      {/* 6. Red Flags — from entity cross-check + DART */}
      {company?.red_flags && company.red_flags.length > 0 && (
        <RedFlags flags={company.red_flags} />
      )}

      {/* 7. Financial Chart — from DART */}
      {showDartSkeleton && <SectionSkeleton title="재무 성과 추이" />}
      {company?.financial_history && company.financial_history.length > 0 && (
        <section className="financial-chart-section">
          <h2>재무 성과 추이</h2>
          <FinancialChart data={company.financial_history} />
        </section>
      )}

      {/* 8. Financial Statements — from DART or sminfo */}
      {showDartSkeleton && <SectionSkeleton title="재무제표" />}
      {company?.financial_statements && (
        <section className="financial-statements-section">
          <h2>
            재무제표
            {company._hasSminfo && (
              <span className="section-source-tag">
                출처: sminfo ({Math.round((company._sminfoMatchScore || 0) * 100)}% 매칭)
              </span>
            )}
            {company._hasDart && !company._hasSminfo && (
              <span className="section-source-tag">출처: DART</span>
            )}
          </h2>
          <FinancialStatements statements={company.financial_statements} />
        </section>
      )}

      {/* 9. Officers Full Table — from DART (DART 데이터 있을 때만) */}
      {dartAvailable && company?.officers && company.officers.length > 0 && (
        <section className="officers-section">
          <h2>임원 현황 (상세)</h2>
          <OfficersTable officers={company.officers} />
        </section>
      )}

      {/* 10. Shareholders Full Table — from DART (DART 데이터 있을 때만) */}
      {dartAvailable && company?.shareholders && company.shareholders.length > 0 && (
        <section className="shareholders-section">
          <h2>주주 현황 (상세)</h2>
          <ShareholdersTable shareholders={company.shareholders} />
        </section>
      )}

      {/* 11. Sources Panel — entity metadata + API raw data */}
      {company?._entity && (
        <section className="sources-section">
          <h2>기타</h2>
          <SourcesPanel
            entity={company._entity}
            apiData={company._apiData}
            conflicts={company._conflicts}
          />
        </section>
      )}
    </div>
  );
}

export default CompanyDetail;

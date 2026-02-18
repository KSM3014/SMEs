import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from 'react-query';
import { searchCompany } from '../../services/companyApi';
import './SearchBar.css';

function SearchBar() {
  const [query, setQuery] = useState('');
  const [showResults, setShowResults] = useState(false);
  const navigate = useNavigate();

  const { data: searchResponse, isLoading } = useQuery(
    ['companySearch', query],
    () => searchCompany(query),
    {
      enabled: query.length >= 2,
      onSuccess: () => setShowResults(true),
      retry: 1,
      staleTime: 30000,
    }
  );

  // Map entity results to display format
  const results = searchResponse?.data?.entities?.map(entity => ({
    id: entity.identifiers?.brno || entity.entityId,
    business_number: entity.identifiers?.brno || null,
    company_name: entity.canonicalName,
    confidence: entity.confidence,
    sourcesCount: entity.sourcesCount,
    nameVariants: entity.nameVariants,
  })) || [];

  const apiMeta = searchResponse?.meta || null;

  const handleSearch = (e) => {
    e.preventDefault();
    if (query.trim().length < 2) {
      alert('검색어를 2자 이상 입력해주세요');
      return;
    }
  };

  const handleResultClick = (company) => {
    navigate(`/company/${company.business_number || company.id}`);
    setShowResults(false);
    setQuery('');
  };

  return (
    <div className="search-bar-container">
      <form onSubmit={handleSearch} className="search-form">
        <div className="search-input-wrapper">
          <input
            type="text"
            className="search-input"
            placeholder="사업자등록번호 또는 회사명 검색 (예: 124-81-00998, 삼성전자)"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => query.length >= 2 && setShowResults(true)}
          />
          <button type="submit" className="search-button">
            {isLoading ? <span className="spinner small"></span> : '검색'}
          </button>
        </div>

        {showResults && results.length > 0 && (
          <div className="search-results">
            <div className="results-header">
              <span className="results-count">
                {results.length}개 기업 발견
                {apiMeta && (
                  <span className="results-meta">
                    {' '}({apiMeta.apisSucceeded}/{apiMeta.apisAttempted} APIs, {((apiMeta.durationMs || 0) / 1000).toFixed(1)}초)
                  </span>
                )}
              </span>
              <button
                type="button"
                className="close-results"
                onClick={() => setShowResults(false)}
              >
                &times;
              </button>
            </div>
            <div className="results-list">
              {results.map((company) => (
                <div
                  key={company.id}
                  className="result-item"
                  onClick={() => handleResultClick(company)}
                >
                  <div className="result-main">
                    <div className="result-title">
                      <h4>{company.company_name}</h4>
                      <span className={`confidence-badge confidence-${getConfidenceClass(company.confidence)}`}>
                        {((company.confidence || 0) * 100).toFixed(0)}%
                      </span>
                    </div>
                    <p className="result-meta text-muted">
                      {company.business_number || '-'} &middot; {company.sourcesCount || 0}개 소스
                      {company.nameVariants?.length > 1 && (
                        <> &middot; {company.nameVariants.slice(1, 3).join(', ')}</>
                      )}
                    </p>
                  </div>
                  <div className="result-sources">
                    <span className="source-count">{company.sourcesCount || 0}</span>
                    <span className="source-label">소스</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {showResults && searchResponse && results.length === 0 && (
          <div className="search-results">
            <div className="no-results">
              <p>검색 결과가 없습니다</p>
              <p className="text-muted text-sm">
                다른 검색어를 시도하거나 사업자등록번호를 정확히 입력해주세요
              </p>
            </div>
          </div>
        )}
      </form>

      <div className="search-examples">
        <span className="text-muted">예시:</span>
        <button type="button" className="example-query" onClick={() => setQuery('1248100998')}>
          삼성전자
        </button>
        <button type="button" className="example-query" onClick={() => setQuery('1301116006')}>
          LG전자
        </button>
        <button type="button" className="example-query" onClick={() => setQuery('2208717787')}>
          SK하이닉스
        </button>
      </div>
    </div>
  );
}

function getConfidenceClass(confidence) {
  if (confidence >= 0.8) return 'high';
  if (confidence >= 0.6) return 'medium';
  return 'low';
}

export default SearchBar;

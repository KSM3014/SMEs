import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { suggestCompany } from '../../services/companyApi';
import './SearchBar.css';

function SearchBar() {
  const [query, setQuery] = useState('');
  const [candidates, setCandidates] = useState([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedIdx, setSelectedIdx] = useState(-1);
  const containerRef = useRef(null);
  const debounceRef = useRef(null);
  const navigate = useNavigate();

  // 외부 클릭 시 드롭다운 닫기
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // 디바운스 검색 (300ms)
  const debouncedSearch = useCallback((value) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (value.trim().length < 2) {
      setCandidates([]);
      setShowDropdown(false);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      setIsLoading(true);
      try {
        const res = await suggestCompany(value.trim());
        const data = res?.data || [];
        setCandidates(data);
        setShowDropdown(data.length > 0);
        setSelectedIdx(-1);
      } catch {
        setCandidates([]);
      } finally {
        setIsLoading(false);
      }
    }, 300);
  }, []);

  const handleInputChange = (e) => {
    const value = e.target.value;
    setQuery(value);
    debouncedSearch(value);
  };

  const handleSelect = (candidate) => {
    // Navigate using best available identifier: BRN > CRNO > corp_code (DART)
    const identifier = candidate.business_number || candidate.corp_number || candidate.id;
    if (identifier) {
      navigate(`/company/${identifier}`);
    } else {
      return;
    }
    setShowDropdown(false);
    setQuery('');
    setCandidates([]);
  };

  const handleKeyDown = (e) => {
    if (!showDropdown || candidates.length === 0) {
      if (e.key === 'Enter') {
        e.preventDefault();
        // Enter 시에도 suggest 트리거
        debouncedSearch(query);
      }
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIdx(prev => Math.min(prev + 1, candidates.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIdx(prev => Math.max(prev - 1, -1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (selectedIdx >= 0 && selectedIdx < candidates.length) {
        handleSelect(candidates[selectedIdx]);
      }
    } else if (e.key === 'Escape') {
      setShowDropdown(false);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (query.trim().length < 2) return;
    debouncedSearch(query);
  };

  return (
    <div className="search-bar-container" ref={containerRef}>
      <form onSubmit={handleSubmit} className="search-form">
        <div className="search-input-wrapper">
          <input
            type="text"
            className="search-input"
            placeholder="사업자등록번호 또는 회사명 검색 (예: 210-81-29428, 아이센스)"
            value={query}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            onFocus={() => candidates.length > 0 && setShowDropdown(true)}
          />
          <button type="submit" className="search-button">
            {isLoading ? <span className="spinner small"></span> : '검색'}
          </button>
        </div>

        {showDropdown && candidates.length > 0 && (
          <div className="search-results">
            <div className="results-header">
              <span className="results-count">{candidates.length}개 후보</span>
              <button
                type="button"
                className="close-results"
                onClick={() => setShowDropdown(false)}
              >
                &times;
              </button>
            </div>
            <div className="results-list">
              <p className="results-instruction">조회할 기업을 선택하세요</p>
              {candidates.map((c, i) => (
                <div
                  key={c.id || i}
                  className={`result-item${i === selectedIdx ? ' selected' : ''}`}
                  onClick={() => handleSelect(c)}
                  onMouseEnter={() => setSelectedIdx(i)}
                >
                  <div className="result-main">
                    <div className="result-title">
                      <h4>{c.company_name}</h4>
                      {c.stock_code && (
                        <span className="badge badge-outline">{c.stock_code}</span>
                      )}
                      {c.source === 'dart' && (
                        <span className="confidence-badge confidence-medium">DART</span>
                      )}
                    </div>
                    <p className="result-meta text-muted">
                      {c.business_number
                        ? formatBrno(c.business_number)
                        : c.corp_number || '-'}
                      {c.sourcesCount > 0 && <> &middot; {c.sourcesCount}개 소스</>}
                    </p>
                  </div>
                  {c.sourcesCount > 0 && (
                    <div className="result-sources">
                      <span className="source-count">{c.sourcesCount}</span>
                      <span className="source-label">소스</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {showDropdown && !isLoading && query.length >= 2 && candidates.length === 0 && (
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
        <button type="button" className="example-query" onClick={() => { setQuery('아이센스'); debouncedSearch('아이센스'); }}>
          아이센스
        </button>
        <button type="button" className="example-query" onClick={() => { setQuery('삼성'); debouncedSearch('삼성'); }}>
          삼성
        </button>
        <button type="button" className="example-query" onClick={() => { setQuery('2108129428'); debouncedSearch('2108129428'); }}>
          210-81-29428
        </button>
      </div>
    </div>
  );
}

function formatBrno(brno) {
  if (!brno || brno.length !== 10) return brno || '-';
  return `${brno.slice(0, 3)}-${brno.slice(3, 5)}-${brno.slice(5)}`;
}

export default SearchBar;

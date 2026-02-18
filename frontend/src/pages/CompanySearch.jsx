import { useState } from 'react';
import { useQuery } from 'react-query';
import { searchCompany, analyzeCompany } from '../services/companyApi';
import './CompanySearch.css';

function CompanySearch() {
  const [query, setQuery] = useState('');
  const [searchTrigger, setSearchTrigger] = useState('');
  const [selectedEntity, setSelectedEntity] = useState(null);

  // Search query
  const {
    data: searchResult,
    isLoading: isSearching,
    error: searchError
  } = useQuery(
    ['companySearch', searchTrigger],
    () => searchCompany(searchTrigger),
    {
      enabled: searchTrigger.length >= 2,
      staleTime: 5 * 60 * 1000,
      retry: 1
    }
  );

  // Analyze query (when entity is selected)
  const {
    data: analyzeResult,
    isLoading: isAnalyzing
  } = useQuery(
    ['companyAnalyze', selectedEntity?.identifiers?.brno],
    () => analyzeCompany(selectedEntity.identifiers.brno),
    {
      enabled: !!selectedEntity?.identifiers?.brno,
      staleTime: 5 * 60 * 1000
    }
  );

  const handleSearch = (e) => {
    e.preventDefault();
    if (query.trim().length < 2) return;
    setSelectedEntity(null);
    setSearchTrigger(query.trim());
  };

  const handleExampleClick = (example) => {
    setQuery(example);
    setSelectedEntity(null);
    setSearchTrigger(example);
  };

  const handleEntityClick = (entity) => {
    setSelectedEntity(entity);
  };

  const handleBack = () => {
    setSelectedEntity(null);
  };

  // Detail view
  if (selectedEntity) {
    return (
      <div className="company-search container">
        <div className="entity-detail">
          <div className="back-link" onClick={handleBack}>
            &#8592; Back to results
          </div>

          <div className="entity-detail-header">
            <div className="entity-title">
              <h1>{selectedEntity.canonicalName || 'Unknown'}</h1>
              <ConfidenceBadge
                confidence={selectedEntity.confidence}
                matchLevel={selectedEntity.matchLevel}
              />
            </div>

            <div className="entity-ids">
              {selectedEntity.identifiers?.brno && (
                <div className="entity-id">
                  <span className="label">BRN:</span>
                  <span className="value">{selectedEntity.identifiers.brno}</span>
                </div>
              )}
              {selectedEntity.identifiers?.crno && (
                <div className="entity-id">
                  <span className="label">CRN:</span>
                  <span className="value">{selectedEntity.identifiers.crno}</span>
                </div>
              )}
            </div>

            {selectedEntity.nameVariants?.length > 1 && (
              <div className="name-variants">
                {selectedEntity.nameVariants.map((name, i) => (
                  <span key={i} className="name-variant">{name}</span>
                ))}
              </div>
            )}

            <div className="source-tags" style={{ marginTop: '0.75rem' }}>
              {selectedEntity.sources?.map((source, i) => (
                <span key={i} className="source-tag">{source}</span>
              ))}
            </div>
          </div>

          {isAnalyzing ? (
            <div className="search-loading">
              <div className="spinner"></div>
              <div className="loading-text">Analyzing company data...</div>
            </div>
          ) : analyzeResult?.data?.entity?.apiData ? (
            <ApiDataSections apiData={analyzeResult.data.entity.apiData} />
          ) : (
            <ApiDataSections apiData={selectedEntity.data || []} />
          )}
        </div>
      </div>
    );
  }

  // Search view
  return (
    <div className="company-search container">
      <div className="page-header">
        <h1>Entity Resolution Search</h1>
        <p>26 APIs + DART cross-referencing</p>
      </div>

      <div className="company-search-form">
        <form onSubmit={handleSearch}>
          <div className="search-row">
            <input
              type="text"
              className="search-input"
              placeholder="Company name, BRN (000-00-00000), or CRN"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <button
              type="submit"
              className="search-btn"
              disabled={isSearching || query.trim().length < 2}
            >
              {isSearching ? 'Searching...' : 'Search'}
            </button>
          </div>
        </form>

        <div className="search-examples">
          <span>Examples:</span>
          <button onClick={() => handleExampleClick('1248100998')}>
            1248100998
          </button>
          <button onClick={() => handleExampleClick('Samsung Electronics')}>
            Samsung Electronics
          </button>
          <button onClick={() => handleExampleClick('210-81-29428')}>
            210-81-29428
          </button>
        </div>
      </div>

      {isSearching && (
        <div className="search-loading">
          <div className="spinner"></div>
          <div className="loading-text">
            Querying 26+ APIs with Entity Resolution...
          </div>
          <div className="loading-meta">
            This may take 10-30 seconds for first-time queries
          </div>
        </div>
      )}

      {searchError && (
        <div className="search-error">
          <p>Search failed: {searchError.error || searchError.message || 'Unknown error'}</p>
        </div>
      )}

      {searchResult && !isSearching && (
        <>
          <div className="search-meta">
            <span className="result-count">
              {searchResult.data?.entities?.length || 0} entities found
              {searchResult.data?.unmatchedCount > 0 &&
                ` (${searchResult.data.unmatchedCount} unmatched)`}
            </span>
            <span className="search-timing">
              {searchResult.meta?.apisSucceeded}/{searchResult.meta?.apisAttempted} APIs
              {searchResult.meta?.durationMs && ` in ${(searchResult.meta.durationMs / 1000).toFixed(1)}s`}
            </span>
          </div>

          {searchResult.data?.entities?.length > 0 ? (
            searchResult.data.entities.map((entity, i) => (
              <EntityCard
                key={entity.entityId || i}
                entity={entity}
                onClick={() => handleEntityClick(entity)}
              />
            ))
          ) : (
            <div className="no-results">
              <h3>No results found</h3>
              <p>Try a different search term or use a business registration number</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function ConfidenceBadge({ confidence, matchLevel }) {
  const level = matchLevel?.toLowerCase() || 'no-match';
  const pct = (confidence * 100).toFixed(0);
  return (
    <span className={`confidence-badge ${level.replace('_', '-')}`}>
      {pct}% {matchLevel}
    </span>
  );
}

function EntityCard({ entity, onClick }) {
  return (
    <div className="entity-card" onClick={onClick}>
      <div className="entity-header">
        <div>
          <div className="entity-title">
            <h3>{entity.canonicalName || 'Unknown Entity'}</h3>
            <ConfidenceBadge
              confidence={entity.confidence}
              matchLevel={entity.matchLevel}
            />
          </div>
          <div className="entity-ids">
            {entity.identifiers?.brno && (
              <div className="entity-id">
                <span className="label">BRN:</span>
                <span className="value">{entity.identifiers.brno}</span>
              </div>
            )}
            {entity.identifiers?.crno && (
              <div className="entity-id">
                <span className="label">CRN:</span>
                <span className="value">{entity.identifiers.crno}</span>
              </div>
            )}
          </div>
        </div>
        <span className="source-count">
          {entity.sourcesCount || entity.sources?.length || 0} sources
        </span>
      </div>

      <div className="source-tags">
        {entity.sources?.slice(0, 8).map((source, i) => (
          <span key={i} className="source-tag">{source}</span>
        ))}
        {entity.sources?.length > 8 && (
          <span className="source-tag">+{entity.sources.length - 8} more</span>
        )}
      </div>
    </div>
  );
}

function ApiDataSections({ apiData }) {
  const [openSections, setOpenSections] = useState(new Set([0]));

  const toggleSection = (index) => {
    setOpenSections(prev => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  if (!apiData || apiData.length === 0) {
    return (
      <div className="no-results">
        <p>No detailed API data available</p>
      </div>
    );
  }

  return (
    <div className="api-data-sections">
      {apiData.map((item, index) => (
        <div key={index} className="api-data-section">
          <div
            className="api-section-header"
            onClick={() => toggleSection(index)}
          >
            <h4>{item.source}</h4>
            <span className={`toggle-icon ${openSections.has(index) ? 'open' : ''}`}>
              &#9660;
            </span>
          </div>
          {openSections.has(index) && (
            <div className="api-section-content">
              <RawDataTable data={item.data || item.rawData} />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function RawDataTable({ data }) {
  if (!data) return <p className="text-muted">No data</p>;

  // Array of objects → show first item's fields
  const obj = Array.isArray(data) ? data[0] : data;
  if (!obj || typeof obj !== 'object') {
    return <pre style={{ fontSize: '0.8rem', whiteSpace: 'pre-wrap' }}>{JSON.stringify(data, null, 2)}</pre>;
  }

  const entries = Object.entries(obj).filter(([, v]) =>
    v !== null && v !== undefined && v !== '' && typeof v !== 'object'
  );

  if (entries.length === 0) {
    return <pre style={{ fontSize: '0.8rem', whiteSpace: 'pre-wrap' }}>{JSON.stringify(obj, null, 2)}</pre>;
  }

  return (
    <>
      <table className="api-data-table">
        <tbody>
          {entries.map(([key, value]) => (
            <tr key={key}>
              <td>{key}</td>
              <td>{String(value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {Array.isArray(data) && data.length > 1 && (
        <p className="text-muted text-sm" style={{ marginTop: '0.5rem' }}>
          + {data.length - 1} more records
        </p>
      )}
    </>
  );
}

export default CompanySearch;

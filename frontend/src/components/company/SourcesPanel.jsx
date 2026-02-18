/**
 * SourcesPanel — Shows 86 API source list with expandable raw_data
 *
 * Displays:
 * - Total sources count
 * - List of API sources with toggleable raw data
 * - Entity metadata (confidence, matchLevel)
 */
import { useState } from 'react';
import './SourcesPanel.css';

function SourcesPanel({ entity, apiData, conflicts }) {
  const [expandedSources, setExpandedSources] = useState(new Set());

  if (!entity && !apiData) return null;

  const sources = entity?.sources || [];
  const data = apiData || [];

  const toggleSource = (idx) => {
    setExpandedSources(prev => {
      const next = new Set(prev);
      next.has(idx) ? next.delete(idx) : next.add(idx);
      return next;
    });
  };

  return (
    <div className="sources-panel">
      {/* Entity metadata */}
      {entity && (
        <div className="sources-panel__meta">
          <div className="meta-item">
            <span className="meta-label">Entity ID</span>
            <span className="meta-value mono">{entity.entityId}</span>
          </div>
          <div className="meta-item">
            <span className="meta-label">신뢰도</span>
            <span className={`meta-value confidence-${getConfidenceLevel(entity.confidence)}`}>
              {entity.confidence != null ? `${(entity.confidence * 100).toFixed(1)}%` : '-'}
            </span>
          </div>
          <div className="meta-item">
            <span className="meta-label">매칭 수준</span>
            <span className="meta-value">{entity.matchLevel || '-'}</span>
          </div>
          <div className="meta-item">
            <span className="meta-label">데이터 소스</span>
            <span className="meta-value">{entity.sourcesCount || sources.length}개</span>
          </div>
        </div>
      )}

      {/* Conflicts */}
      {conflicts && conflicts.length > 0 && (
        <div className="sources-panel__conflicts">
          <h4>소스간 불일치 ({conflicts.length}건)</h4>
          <div className="conflict-list">
            {conflicts.slice(0, 5).map((c, i) => (
              <div key={i} className="conflict-item">
                <span className="conflict-field">{c.field}</span>
                <span className="conflict-values">
                  &ldquo;{truncate(c.valueA, 30)}&rdquo; vs &ldquo;{truncate(c.valueB, 30)}&rdquo;
                </span>
                <span className="conflict-sim">{((c.similarity || 0) * 100).toFixed(0)}%</span>
              </div>
            ))}
            {conflicts.length > 5 && (
              <span className="conflict-more">...외 {conflicts.length - 5}건</span>
            )}
          </div>
        </div>
      )}

      {/* API source list */}
      {data.length > 0 && (
        <div className="sources-panel__list">
          <h4>API 소스 데이터 ({data.length}개)</h4>
          {data.map((src, idx) => (
            <div key={idx} className="source-item">
              <button
                className="source-item__header"
                onClick={() => toggleSource(idx)}
              >
                <span className="source-item__name">{src.source || src.sourceName || `Source ${idx + 1}`}</span>
                <span className="source-item__toggle">
                  {expandedSources.has(idx) ? '−' : '+'}
                </span>
              </button>
              {expandedSources.has(idx) && (
                <pre className="source-item__data">
                  {JSON.stringify(src.data || src.rawData || src, null, 2)}
                </pre>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Source names only (if no apiData but has source names) */}
      {data.length === 0 && sources.length > 0 && (
        <div className="sources-panel__list">
          <h4>수집 소스 ({sources.length}개)</h4>
          <div className="source-tags">
            {sources.map((s, i) => (
              <span key={i} className="source-tag">{s}</span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function getConfidenceLevel(conf) {
  if (conf == null) return 'unknown';
  if (conf >= 0.8) return 'high';
  if (conf >= 0.6) return 'medium';
  return 'low';
}

function truncate(str, max) {
  if (!str) return '-';
  return str.length > max ? str.slice(0, max) + '...' : str;
}

export default SourcesPanel;

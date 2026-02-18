/**
 * DiffSummary — Visualizes DB vs Live diff results
 *
 * Shows: "+2 added, ~13 updated, -0 removed" with colored indicators
 */
import './DiffSummary.css';

function DiffSummary({ diff, meta }) {
  if (!diff) return null;

  const { added = [], updated = [], removed = [], unchangedCount = 0, hasChanges } = diff;

  if (!hasChanges) {
    return (
      <div className="diff-summary diff-summary--unchanged">
        <span className="diff-summary__icon">&#10003;</span>
        <span>모든 데이터가 최신 상태입니다 ({unchangedCount}개 소스 확인됨)</span>
      </div>
    );
  }

  return (
    <div className="diff-summary">
      <div className="diff-summary__header">
        <h3>데이터 변경사항</h3>
        {meta && (
          <span className="diff-summary__meta">
            {meta.apisSucceeded}/{meta.apisAttempted} APIs &middot; {(meta.durationMs / 1000).toFixed(1)}초
          </span>
        )}
      </div>

      <div className="diff-summary__stats">
        {added.length > 0 && (
          <div className="diff-stat diff-stat--added">
            <span className="diff-stat__count">+{added.length}</span>
            <span className="diff-stat__label">추가</span>
          </div>
        )}
        {updated.length > 0 && (
          <div className="diff-stat diff-stat--updated">
            <span className="diff-stat__count">~{updated.length}</span>
            <span className="diff-stat__label">업데이트</span>
          </div>
        )}
        {removed.length > 0 && (
          <div className="diff-stat diff-stat--removed">
            <span className="diff-stat__count">-{removed.length}</span>
            <span className="diff-stat__label">삭제</span>
          </div>
        )}
        <div className="diff-stat diff-stat--unchanged">
          <span className="diff-stat__count">{unchangedCount}</span>
          <span className="diff-stat__label">변경 없음</span>
        </div>
      </div>

      {/* Source details */}
      {(added.length > 0 || updated.length > 0 || removed.length > 0) && (
        <div className="diff-summary__details">
          {added.map((src, i) => (
            <span key={`a-${i}`} className="diff-tag diff-tag--added">{src}</span>
          ))}
          {updated.map((src, i) => (
            <span key={`u-${i}`} className="diff-tag diff-tag--updated">{src}</span>
          ))}
          {removed.map((src, i) => (
            <span key={`r-${i}`} className="diff-tag diff-tag--removed">{src}</span>
          ))}
        </div>
      )}
    </div>
  );
}

export default DiffSummary;

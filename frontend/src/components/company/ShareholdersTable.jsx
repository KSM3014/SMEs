import './ShareholdersTable.css';

function ShareholdersTable({ shareholders, compact = false }) {
  if (!shareholders || shareholders.length === 0) {
    return (
      <div className="shareholders-table empty">
        <p className="text-muted">주주 정보가 없습니다.</p>
      </div>
    );
  }

  // "계" (총계) 행 제외
  const filtered = shareholders.filter(sh => sh.name !== '계' && sh.name !== '합계');

  // Compact mode: bullet-point list for 3-column grid
  if (compact) {
    return (
      <div className="shareholders-compact">
        <p className="compact-count">{filtered.length}건</p>
        <ul className="compact-list">
          {filtered.slice(0, 8).map((sh, i) => (
            <li key={i} className="compact-item">
              <strong>{sh.name}</strong>
              {sh.percentage != null && (
                <span className="compact-pct">{sh.percentage.toFixed(2)}%</span>
              )}
              {sh.shares != null && (
                <span className="compact-shares">{sh.shares.toLocaleString()}주</span>
              )}
            </li>
          ))}
          {filtered.length > 8 && (
            <li className="compact-more">+{filtered.length - 8}건 더보기</li>
          )}
        </ul>
      </div>
    );
  }

  const formatPercent = (value) => {
    if (!value) return '-';
    return `${value.toFixed(2)}%`;
  };

  const formatShares = (value) => {
    if (!value) return '-';
    return value.toLocaleString();
  };

  const getShareholderType = (type) => {
    switch (type) {
      case 'majority':
        return '대주주';
      case 'related':
        return '특수관계자';
      case 'institutional':
        return '기관투자자';
      case 'individual':
        return '개인';
      case 'foreign':
        return '외국인';
      case 'treasury':
        return '자기주식';
      default:
        return '기타';
    }
  };

  const getTypeClass = (type) => {
    return type || 'general';
  };

  const totalShares = filtered.reduce((sum, sh) => sum + (sh.shares || 0), 0);
  const totalPercentage = filtered.reduce((sum, sh) => sum + (sh.percentage || 0), 0);

  // 최대주주 지분율
  const majorityPct = filtered
    .filter(sh => sh.type === 'majority')
    .reduce((sum, sh) => sum + (sh.percentage || 0), 0);

  // 특수관계자 지분율
  const relatedPct = filtered
    .filter(sh => sh.type === 'related')
    .reduce((sum, sh) => sum + (sh.percentage || 0), 0);

  return (
    <div className="shareholders-table">
      <div className="table-container">
        <table>
          <thead>
            <tr>
              <th>주주명</th>
              <th>구분</th>
              <th className="text-right">보유주식수</th>
              <th className="text-right">지분율</th>
              <th>관계</th>
              <th>비고</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((shareholder, index) => (
              <tr key={index} className={getTypeClass(shareholder.type)}>
                <td>
                  <strong>{shareholder.name}</strong>
                </td>
                <td>
                  <span className={`type-badge ${getTypeClass(shareholder.type)}`}>
                    {getShareholderType(shareholder.type)}
                  </span>
                </td>
                <td className="text-right">{formatShares(shareholder.shares)}주</td>
                <td className="text-right">
                  <span className="percentage-value">
                    {formatPercent(shareholder.percentage)}
                  </span>
                </td>
                <td className="relation-cell">{shareholder.relation || '-'}</td>
                <td className="note-cell">{shareholder.note || '-'}</td>
              </tr>
            ))}
            <tr className="total-row">
              <td colSpan="2"><strong>합계</strong></td>
              <td className="text-right"><strong>{formatShares(totalShares)}주</strong></td>
              <td className="text-right"><strong>{formatPercent(totalPercentage)}</strong></td>
              <td colSpan="2"></td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="shareholders-summary">
        <div className="summary-item">
          <span className="summary-label">전체 주주</span>
          <span className="summary-value">{filtered.length}명</span>
        </div>
        <div className="summary-item">
          <span className="summary-label">대주주 지분율</span>
          <span className="summary-value">
            {majorityPct > 0 ? formatPercent(majorityPct) : formatPercent(Math.max(...filtered.map(sh => sh.percentage || 0)))}
          </span>
        </div>
        {relatedPct > 0 && (
          <div className="summary-item">
            <span className="summary-label">특수관계자 지분율</span>
            <span className="summary-value">{formatPercent(relatedPct)}</span>
          </div>
        )}
        <div className="summary-item">
          <span className="summary-label">외국인 지분율</span>
          <span className="summary-value">
            {formatPercent(
              filtered
                .filter(sh => sh.type === 'foreign')
                .reduce((sum, sh) => sum + (sh.percentage || 0), 0)
            )}
          </span>
        </div>
      </div>

      <div className="ownership-chart">
        <div className="chart-title">지분 구조</div>
        <div className="chart-bar">
          {filtered.slice(0, 5).map((shareholder, index) => (
            <div
              key={index}
              className={`chart-segment ${getTypeClass(shareholder.type)}`}
              style={{ width: `${shareholder.percentage}%` }}
              title={`${shareholder.name}: ${formatPercent(shareholder.percentage)}`}
            >
              {shareholder.percentage > 5 && (
                <span className="segment-label">{shareholder.name}</span>
              )}
            </div>
          ))}
          {totalPercentage < 100 && (
            <div
              className="chart-segment others"
              style={{ width: `${100 - totalPercentage}%` }}
              title={`기타: ${formatPercent(100 - totalPercentage)}`}
            >
              {(100 - totalPercentage) > 5 && <span className="segment-label">기타</span>}
            </div>
          )}
        </div>
        <div className="chart-legend">
          {filtered.slice(0, 5).map((shareholder, index) => (
            <div key={index} className="legend-item">
              <span className={`legend-color ${getTypeClass(shareholder.type)}`}></span>
              <span className="legend-text">{shareholder.name} ({formatPercent(shareholder.percentage)})</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default ShareholdersTable;

import './ComparisonMetrics.css';

function ComparisonMetrics({ current, average }) {
  if (!average) return null;

  const formatCurrency = (value) => {
    if (!value) return '-';
    return `${(value / 100000000).toFixed(0)}억원`;
  };

  const formatPercent = (value) => {
    if (value === null || value === undefined) return '-';
    return `${value.toFixed(1)}%`;
  };

  const getChangeIndicator = (currentValue, avgValue) => {
    if (!currentValue || !avgValue) return null;

    const diff = currentValue - avgValue;
    const diffPercent = ((diff / avgValue) * 100).toFixed(1);

    if (diff > 0) {
      return <span className="change-indicator positive">▲ {diffPercent}%</span>;
    } else if (diff < 0) {
      return <span className="change-indicator negative">▼ {Math.abs(diffPercent)}%</span>;
    }
    return <span className="change-indicator neutral">-</span>;
  };

  const metrics = [
    {
      label: '매출액',
      current: formatCurrency(current.revenue),
      average: formatCurrency(average.revenue),
      change: getChangeIndicator(current.revenue, average.revenue),
      type: 'currency'
    },
    {
      label: '영업이익률',
      current: formatPercent(current.operating_margin),
      average: formatPercent(average.operating_margin),
      change: getChangeIndicator(current.operating_margin, average.operating_margin),
      type: 'percent'
    },
    {
      label: 'ROE',
      current: formatPercent(current.roe),
      average: formatPercent(average.roe),
      change: getChangeIndicator(current.roe, average.roe),
      type: 'percent'
    },
    {
      label: '부채비율',
      current: formatPercent(current.debt_ratio),
      average: formatPercent(average.debt_ratio),
      change: getChangeIndicator(current.debt_ratio, average.debt_ratio),
      type: 'percent',
      inverse: true // Lower is better
    }
  ];

  return (
    <section className="comparison-metrics">
      <div className="comparison-header">
        <h2>📊 과거 3년 평균 대비 현재 성과</h2>
        <p className="text-muted">최근 실적과 과거 3년 평균을 비교합니다</p>
      </div>

      <div className="metrics-grid">
        {metrics.map((metric) => (
          <div key={metric.label} className="metric-card">
            <div className="metric-label">{metric.label}</div>
            <div className="metric-comparison">
              <div className="current-value">
                <span className="value-label">현재</span>
                <span className="value">{metric.current}</span>
              </div>
              <div className="vs-divider">vs</div>
              <div className="average-value">
                <span className="value-label">3년 평균</span>
                <span className="value">{metric.average}</span>
              </div>
            </div>
            <div className="metric-change">
              {metric.change}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

export default ComparisonMetrics;

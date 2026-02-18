import './RedFlags.css';

function RedFlags({ flags }) {
  if (!flags || flags.length === 0) return null;

  const getSeverityColor = (severity) => {
    switch (severity) {
      case 'high':
        return 'error';
      case 'medium':
        return 'warning';
      case 'low':
        return 'info';
      default:
        return 'info';
    }
  };

  const getSeverityIcon = (severity) => {
    switch (severity) {
      case 'high':
        return '🚨';
      case 'medium':
        return '⚠️';
      case 'low':
        return 'ℹ️';
      default:
        return 'ℹ️';
    }
  };

  const getSeverityLabel = (severity) => {
    switch (severity) {
      case 'high':
        return '높음';
      case 'medium':
        return '중간';
      case 'low':
        return '낮음';
      default:
        return '정보';
    }
  };

  return (
    <section className="red-flags">
      <div className="red-flags-header">
        <h2>⚠️ 주의사항 (Red Flags)</h2>
        <p className="text-muted">투자 전 검토가 필요한 항목입니다</p>
      </div>

      <div className="flags-list">
        {flags.map((flag, index) => (
          <div key={index} className={`flag-item ${getSeverityColor(flag.severity)}`}>
            <div className="flag-header">
              <div className="flag-title">
                <span className="flag-icon">{getSeverityIcon(flag.severity)}</span>
                <span className="flag-name">{flag.title}</span>
              </div>
              <span className={`severity-badge ${getSeverityColor(flag.severity)}`}>
                {getSeverityLabel(flag.severity)}
              </span>
            </div>
            <div className="flag-description">
              {flag.description}
            </div>
            {flag.details && (
              <div className="flag-details">
                <strong>상세:</strong> {flag.details}
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

export default RedFlags;

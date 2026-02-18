/**
 * StatusBar — SSE connection status + API progress indicator
 *
 * Displays:
 * - connecting: "연결 중..."
 * - db_loaded:  "DB 캐시 로드 완료 — 실시간 데이터 수집 중..."
 * - dart_loaded: "DART 데이터 로드 — 86 API 수집 중..."
 * - complete:   "데이터 수집 완료 (29/74 APIs)"
 * - error:      "연결 오류"
 */
import './StatusBar.css';

const STATUS_CONFIG = {
  connecting:  { label: '서버 연결 중...', className: 'connecting', icon: '...' },
  db_loaded:   { label: 'DB 캐시 로드 완료', sub: '실시간 데이터 수집 중...', className: 'loading', icon: null },
  dart_loaded: { label: 'DART 재무 데이터 수신', sub: '86 API 수집 중...', className: 'loading', icon: null },
  complete:    { label: '데이터 수집 완료', className: 'complete', icon: null },
  error:       { label: '연결 오류', className: 'error', icon: null },
};

function StatusBar({ status, meta, diff, events = [] }) {
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.connecting;

  const apisText = meta
    ? `${meta.apisSucceeded}/${meta.apisAttempted} APIs 성공`
    : null;

  const timeText = meta?.durationMs
    ? `${(meta.durationMs / 1000).toFixed(1)}초`
    : null;

  const diffText = diff?.hasChanges
    ? [
        diff.added?.length > 0 && `+${diff.added.length} 추가`,
        diff.updated?.length > 0 && `~${diff.updated.length} 업데이트`,
        diff.removed?.length > 0 && `-${diff.removed.length} 삭제`,
      ].filter(Boolean).join(', ')
    : null;

  return (
    <div className={`status-bar status-bar--${config.className}`}>
      <div className="status-bar__main">
        {config.className === 'loading' && (
          <div className="status-bar__spinner" />
        )}
        <span className="status-bar__label">{config.label}</span>
        {config.sub && (
          <span className="status-bar__sub">{config.sub}</span>
        )}
      </div>

      <div className="status-bar__details">
        {apisText && <span className="status-bar__tag">{apisText}</span>}
        {timeText && <span className="status-bar__tag">{timeText}</span>}
        {diffText && <span className="status-bar__tag status-bar__tag--diff">{diffText}</span>}
      </div>

      {/* Event progress dots */}
      <div className="status-bar__events">
        {['db_data', 'dart_data', 'live_diff', 'complete'].map(ev => (
          <span
            key={ev}
            className={`status-bar__dot ${events.includes(ev) ? 'status-bar__dot--done' : ''}`}
            title={ev}
          />
        ))}
      </div>
    </div>
  );
}

export default StatusBar;

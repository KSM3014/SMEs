import { useQuery } from 'react-query';
import { getRecommendations } from '../../services/api';
import { useNavigate } from 'react-router-dom';
import './RecommendationsTab.css';

function RecommendationsTab() {
  const navigate = useNavigate();

  const { data: recommendations, isLoading } = useQuery(
    'recommendations',
    getRecommendations
  );

  const formatCurrency = (value) => {
    if (!value) return '-';
    return `${(value / 100000000).toFixed(0)}억원`;
  };

  const formatPercent = (value) => {
    if (!value) return '-';
    return `${value.toFixed(1)}%`;
  };

  const getScoreColor = (score) => {
    if (score >= 80) return 'high';
    if (score >= 60) return 'medium';
    return 'low';
  };

  return (
    <div className="recommendations-tab">
      <div className="recommendations-header">
        <h2>🤖 AI 추천 기업</h2>
        <p className="text-muted">
          재무 데이터 분석을 통해 투자 가치가 높은 기업을 추천합니다
        </p>
      </div>

      {isLoading ? (
        <div className="spinner-container">
          <div className="spinner"></div>
        </div>
      ) : (
        <div className="recommendations-grid">
          {recommendations?.map((rec) => (
            <div
              key={rec.company.id}
              className="recommendation-card"
              onClick={() => navigate(`/company/${rec.company.id}`)}
            >
              <div className="card-header">
                <div className="company-info">
                  <h3>{rec.company.company_name}</h3>
                  <p className="industry">{rec.company.industry_name}</p>
                </div>
                <div className={`score-badge ${getScoreColor(rec.score)}`}>
                  <div className="score-value">{rec.score}</div>
                  <div className="score-label">점</div>
                </div>
              </div>

              <div className="badges-row">
                {rec.company.venture_certification && (
                  <span className="badge badge-primary">벤처인증</span>
                )}
                {rec.company.innovation_certification && (
                  <span className="badge badge-success">이노비즈</span>
                )}
                {rec.company.main_biz_certification && (
                  <span className="badge badge-info">주력산업</span>
                )}
              </div>

              <div className="recommendation-reason">
                <h4>추천 이유</h4>
                <p>{rec.reason}</p>
              </div>

              <div className="key-metrics">
                <div className="metric-item">
                  <span className="metric-label">매출액</span>
                  <span className="metric-value">{formatCurrency(rec.company.revenue)}</span>
                </div>
                <div className="metric-item">
                  <span className="metric-label">영업이익률</span>
                  <span className="metric-value">{formatPercent(rec.company.operating_margin)}</span>
                </div>
                <div className="metric-item">
                  <span className="metric-label">ROE</span>
                  <span className="metric-value">{formatPercent(rec.company.roe)}</span>
                </div>
                <div className="metric-item">
                  <span className="metric-label">부채비율</span>
                  <span className="metric-value">{formatPercent(rec.company.debt_ratio)}</span>
                </div>
              </div>

              <div className="strengths">
                <h4>강점</h4>
                <ul>
                  {rec.strengths?.map((strength, index) => (
                    <li key={index}>{strength}</li>
                  ))}
                </ul>
              </div>

              {rec.risks && rec.risks.length > 0 && (
                <div className="risks">
                  <h4>⚠️ 주의사항</h4>
                  <ul>
                    {rec.risks.map((risk, index) => (
                      <li key={index}>{risk}</li>
                    ))}
                  </ul>
                </div>
              )}

              <button className="view-detail-btn">
                상세 정보 보기 →
              </button>
            </div>
          ))}
        </div>
      )}

      {!isLoading && (!recommendations || recommendations.length === 0) && (
        <div className="empty-state">
          <p>현재 추천할 수 있는 기업이 없습니다.</p>
          <p className="text-muted">데이터가 수집되면 AI가 자동으로 분석하여 추천해드립니다.</p>
        </div>
      )}
    </div>
  );
}

export default RecommendationsTab;

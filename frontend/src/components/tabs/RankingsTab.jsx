import { useState } from 'react';
import { useQuery } from 'react-query';
import { getRankings } from '../../services/api';
import { useNavigate } from 'react-router-dom';
import './RankingsTab.css';

function RankingsTab() {
  const navigate = useNavigate();
  const [metric, setMetric] = useState('revenue');
  const [limit, setLimit] = useState(50);

  const { data: rankings, isLoading } = useQuery(
    ['rankings', metric, limit],
    () => getRankings(metric, limit)
  );

  const formatCurrency = (value) => {
    if (!value) return '-';
    return `${(value / 100000000).toFixed(0)}억원`;
  };

  const formatPercent = (value) => {
    if (!value) return '-';
    return `${value.toFixed(1)}%`;
  };

  const formatRatio = (value) => {
    if (!value) return '-';
    return `${value.toFixed(2)}`;
  };

  const getMetricValue = (company) => {
    switch (metric) {
      case 'revenue':
        return formatCurrency(company.revenue);
      case 'operating_margin':
        return formatPercent(company.operating_margin);
      case 'roe':
        return formatPercent(company.roe);
      case 'debt_ratio':
        return formatRatio(company.debt_ratio);
      case 'employees':
        return company.employee_count?.toLocaleString();
      default:
        return '-';
    }
  };

  const getMetricLabel = () => {
    switch (metric) {
      case 'revenue':
        return '매출액';
      case 'operating_margin':
        return '영업이익률';
      case 'roe':
        return 'ROE';
      case 'debt_ratio':
        return '부채비율';
      case 'employees':
        return '직원수';
      default:
        return '';
    }
  };

  return (
    <div className="rankings-tab">
      <div className="rankings-header">
        <h2>중소기업 성과 순위</h2>
        <p className="text-muted">다양한 지표로 기업 성과를 비교하세요</p>
      </div>

      <div className="rankings-controls">
        <div className="metric-selector">
          <label>지표 선택:</label>
          <div className="metric-buttons">
            <button
              className={`metric-btn ${metric === 'revenue' ? 'active' : ''}`}
              onClick={() => setMetric('revenue')}
            >
              📊 매출액
            </button>
            <button
              className={`metric-btn ${metric === 'operating_margin' ? 'active' : ''}`}
              onClick={() => setMetric('operating_margin')}
            >
              💰 영업이익률
            </button>
            <button
              className={`metric-btn ${metric === 'roe' ? 'active' : ''}`}
              onClick={() => setMetric('roe')}
            >
              📈 ROE
            </button>
            <button
              className={`metric-btn ${metric === 'debt_ratio' ? 'active' : ''}`}
              onClick={() => setMetric('debt_ratio')}
            >
              🏦 부채비율
            </button>
            <button
              className={`metric-btn ${metric === 'employees' ? 'active' : ''}`}
              onClick={() => setMetric('employees')}
            >
              👥 직원수
            </button>
          </div>
        </div>

        <div className="limit-selector">
          <label>표시 개수:</label>
          <select value={limit} onChange={(e) => setLimit(Number(e.target.value))}>
            <option value={20}>상위 20개</option>
            <option value={50}>상위 50개</option>
            <option value={100}>상위 100개</option>
          </select>
        </div>
      </div>

      {isLoading ? (
        <div className="spinner-container">
          <div className="spinner"></div>
        </div>
      ) : (
        <div className="rankings-table-container">
          <table className="rankings-table">
            <thead>
              <tr>
                <th className="rank-col">순위</th>
                <th>기업명</th>
                <th>업종</th>
                <th>대표</th>
                <th className="text-right">{getMetricLabel()}</th>
                <th className="text-right">매출액</th>
                <th className="text-right">영업이익률</th>
              </tr>
            </thead>
            <tbody>
              {rankings?.map((company, index) => (
                <tr
                  key={company.id}
                  onClick={() => navigate(`/company/${company.id}`)}
                  className="clickable-row"
                >
                  <td className="rank-col">
                    <div className={`rank-badge ${index < 3 ? 'top-three' : ''}`}>
                      {index === 0 && '🥇'}
                      {index === 1 && '🥈'}
                      {index === 2 && '🥉'}
                      {index >= 3 && (index + 1)}
                    </div>
                  </td>
                  <td>
                    <div className="company-name-cell">
                      <span className="company-name">{company.company_name}</span>
                      {company.venture_certification && (
                        <span className="badge badge-primary">벤처</span>
                      )}
                      {company.innovation_certification && (
                        <span className="badge badge-success">이노비즈</span>
                      )}
                    </div>
                  </td>
                  <td className="industry-cell">{company.industry_name}</td>
                  <td>{company.ceo_name}</td>
                  <td className="text-right metric-value">{getMetricValue(company)}</td>
                  <td className="text-right">{formatCurrency(company.revenue)}</td>
                  <td className="text-right">{formatPercent(company.operating_margin)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default RankingsTab;

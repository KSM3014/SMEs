import { useState } from 'react';
import { useQuery } from 'react-query';
import { getIndustries, getIndustryCompanies } from '../../services/api';
import { useNavigate } from 'react-router-dom';
import './IndustryTab.css';

function IndustryTab() {
  const navigate = useNavigate();
  const [selectedIndustry, setSelectedIndustry] = useState(null);
  const [sortBy, setSortBy] = useState('revenue');

  const { data: industries, isLoading: industriesLoading } = useQuery(
    'industries',
    getIndustries
  );

  const { data: companies, isLoading: companiesLoading } = useQuery(
    ['industry-companies', selectedIndustry, sortBy],
    () => getIndustryCompanies(selectedIndustry, 1, 20, sortBy),
    { enabled: !!selectedIndustry }
  );

  const formatCurrency = (value) => {
    if (!value) return '-';
    return `${(value / 100000000).toFixed(0)}억원`;
  };

  const formatPercent = (value) => {
    if (!value) return '-';
    return `${value.toFixed(1)}%`;
  };

  return (
    <div className="industry-tab">
      <div className="industry-header">
        <h2>산업군별 중소기업</h2>
        <p className="text-muted">업종별로 기업을 탐색하고 비교하세요</p>
      </div>

      {industriesLoading ? (
        <div className="spinner-container">
          <div className="spinner"></div>
        </div>
      ) : (
        <>
          <div className="industry-grid">
            {industries?.map((industry) => (
              <button
                key={industry.code}
                className={`industry-card ${selectedIndustry === industry.code ? 'active' : ''}`}
                onClick={() => setSelectedIndustry(industry.code)}
              >
                <div className="industry-icon">{industry.icon || '🏢'}</div>
                <div className="industry-info">
                  <h3>{industry.name}</h3>
                  <p className="text-muted">{industry.company_count}개 기업</p>
                </div>
              </button>
            ))}
          </div>

          {selectedIndustry && (
            <div className="companies-section">
              <div className="companies-header">
                <h3>기업 목록</h3>
                <div className="sort-controls">
                  <label>정렬 기준:</label>
                  <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
                    <option value="revenue">매출액</option>
                    <option value="operating_margin">영업이익률</option>
                    <option value="roe">ROE</option>
                    <option value="employees">직원수</option>
                  </select>
                </div>
              </div>

              {companiesLoading ? (
                <div className="spinner-container">
                  <div className="spinner small"></div>
                </div>
              ) : (
                <div className="companies-table">
                  <table>
                    <thead>
                      <tr>
                        <th>기업명</th>
                        <th>대표</th>
                        <th className="text-right">매출액</th>
                        <th className="text-right">영업이익률</th>
                        <th className="text-right">ROE</th>
                        <th className="text-right">직원수</th>
                      </tr>
                    </thead>
                    <tbody>
                      {companies?.companies?.map((company) => (
                        <tr
                          key={company.id}
                          onClick={() => navigate(`/company/${company.id}`)}
                          className="clickable-row"
                        >
                          <td>
                            <div className="company-name-cell">
                              {company.company_name}
                              {company.venture_certification && (
                                <span className="badge badge-primary">벤처</span>
                              )}
                              {company.innovation_certification && (
                                <span className="badge badge-success">이노비즈</span>
                              )}
                            </div>
                          </td>
                          <td>{company.ceo_name}</td>
                          <td className="text-right">{formatCurrency(company.revenue)}</td>
                          <td className="text-right">{formatPercent(company.operating_margin)}</td>
                          <td className="text-right">{formatPercent(company.roe)}</td>
                          <td className="text-right">{company.employee_count?.toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default IndustryTab;

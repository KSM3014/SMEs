import { useState } from 'react';
import {
  ComposedChart,
  Line,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from 'recharts';
import './FinancialChart.css';

function FinancialChart({ data }) {
  const [timeRange, setTimeRange] = useState('all');

  if (!data || data.length === 0) {
    return (
      <div className="financial-chart empty">
        <p className="text-muted">재무 데이터가 없습니다.</p>
      </div>
    );
  }

  // Filter data based on time range
  const getFilteredData = () => {
    const sortedData = [...data].sort((a, b) => a.year - b.year);

    switch (timeRange) {
      case '1y':
        return sortedData.slice(-1);
      case '3y':
        return sortedData.slice(-3);
      case '5y':
        return sortedData.slice(-5);
      default:
        return sortedData;
    }
  };

  const filteredData = getFilteredData();

  // Format currency for display (억원)
  const formatCurrency = (value) => {
    return `${(value / 100000000).toFixed(0)}억`;
  };

  // Format percent for display
  const formatPercent = (value) => {
    return `${value.toFixed(1)}%`;
  };

  // Custom tooltip
  const CustomTooltip = ({ active, payload }) => {
    if (active && payload && payload.length) {
      return (
        <div className="custom-tooltip">
          <p className="tooltip-year">{payload[0].payload.year}년</p>
          <p className="tooltip-revenue">
            <span className="tooltip-label">매출액:</span>
            <span className="tooltip-value">{formatCurrency(payload[0].payload.revenue)}</span>
          </p>
          <p className="tooltip-margin">
            <span className="tooltip-label">영업이익률:</span>
            <span className="tooltip-value">{formatPercent(payload[0].payload.operating_margin)}</span>
          </p>
          <p className="tooltip-profit">
            <span className="tooltip-label">영업이익:</span>
            <span className="tooltip-value">{formatCurrency(payload[0].payload.operating_profit)}</span>
          </p>
        </div>
      );
    }
    return null;
  };

  const handleDownload = () => {
    // Download chart as image (would require additional library like html2canvas)
    alert('차트 다운로드 기능은 추후 구현 예정입니다.');
  };

  return (
    <div className="financial-chart">
      <div className="chart-controls">
        <div className="time-range-selector">
          <button
            className={`range-btn ${timeRange === '1y' ? 'active' : ''}`}
            onClick={() => setTimeRange('1y')}
          >
            1년
          </button>
          <button
            className={`range-btn ${timeRange === '3y' ? 'active' : ''}`}
            onClick={() => setTimeRange('3y')}
          >
            3년
          </button>
          <button
            className={`range-btn ${timeRange === '5y' ? 'active' : ''}`}
            onClick={() => setTimeRange('5y')}
          >
            5년
          </button>
          <button
            className={`range-btn ${timeRange === 'all' ? 'active' : ''}`}
            onClick={() => setTimeRange('all')}
          >
            전체
          </button>
        </div>

        <button className="download-btn" onClick={handleDownload}>
          💾 다운로드
        </button>
      </div>

      <ResponsiveContainer width="100%" height={400}>
        <ComposedChart data={filteredData} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis
            dataKey="year"
            tickFormatter={(year) => `${year}년`}
            stroke="#6b7280"
          />
          <YAxis
            yAxisId="left"
            tickFormatter={formatCurrency}
            stroke="#3b82f6"
            label={{ value: '매출액 (억원)', angle: -90, position: 'insideLeft' }}
          />
          <YAxis
            yAxisId="right"
            orientation="right"
            tickFormatter={formatPercent}
            stroke="#10b981"
            label={{ value: '영업이익률 (%)', angle: 90, position: 'insideRight' }}
          />
          <Tooltip content={<CustomTooltip />} />
          <Legend
            wrapperStyle={{ paddingTop: '20px' }}
            iconType="line"
          />
          <Bar
            yAxisId="left"
            dataKey="revenue"
            name="매출액"
            fill="#3b82f6"
            fillOpacity={0.6}
            radius={[8, 8, 0, 0]}
          />
          <Line
            yAxisId="right"
            type="monotone"
            dataKey="operating_margin"
            name="영업이익률"
            stroke="#10b981"
            strokeWidth={3}
            dot={{ r: 5, fill: '#10b981' }}
            activeDot={{ r: 7 }}
          />
        </ComposedChart>
      </ResponsiveContainer>

      <div className="chart-summary">
        <div className="summary-item">
          <span className="summary-label">최근 매출액</span>
          <span className="summary-value revenue">
            {formatCurrency(filteredData[filteredData.length - 1]?.revenue || 0)}
          </span>
        </div>
        <div className="summary-item">
          <span className="summary-label">최근 영업이익률</span>
          <span className="summary-value margin">
            {formatPercent(filteredData[filteredData.length - 1]?.operating_margin || 0)}
          </span>
        </div>
        <div className="summary-item">
          <span className="summary-label">평균 성장률</span>
          <span className="summary-value growth">
            {(() => {
              if (filteredData.length < 2) return '-';
              const firstYear = filteredData[0].revenue;
              const lastYear = filteredData[filteredData.length - 1].revenue;
              const years = filteredData.length - 1;
              const cagr = (Math.pow(lastYear / firstYear, 1 / years) - 1) * 100;
              return `${cagr.toFixed(1)}%`;
            })()}
          </span>
        </div>
      </div>
    </div>
  );
}

export default FinancialChart;

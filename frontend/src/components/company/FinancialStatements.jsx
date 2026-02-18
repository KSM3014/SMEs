import { useState } from 'react';
import './FinancialStatements.css';

function FinancialStatements({ statements }) {
  const [activeTab, setActiveTab] = useState('bs'); // bs, is, cf

  if (!statements) {
    return (
      <div className="financial-statements empty">
        <p className="text-muted">재무제표 데이터가 없습니다.</p>
      </div>
    );
  }

  const formatCurrency = (value) => {
    if (!value) return '-';
    return `${(value / 100000000).toFixed(0)}억`;
  };

  const renderBalanceSheet = () => {
    if (!statements.balance_sheet) {
      return <p className="text-muted">대차대조표 데이터가 없습니다.</p>;
    }

    const bs = statements.balance_sheet;

    return (
      <div className="statement-table">
        <table>
          <thead>
            <tr>
              <th>항목</th>
              <th className="text-right">금액</th>
            </tr>
          </thead>
          <tbody>
            <tr className="section-header">
              <td colSpan="2"><strong>자산</strong></td>
            </tr>
            <tr>
              <td className="indent">유동자산</td>
              <td className="text-right">{formatCurrency(bs.current_assets)}</td>
            </tr>
            <tr>
              <td className="indent">비유동자산</td>
              <td className="text-right">{formatCurrency(bs.non_current_assets)}</td>
            </tr>
            <tr className="total-row">
              <td><strong>자산총계</strong></td>
              <td className="text-right"><strong>{formatCurrency(bs.total_assets)}</strong></td>
            </tr>

            <tr className="section-header">
              <td colSpan="2"><strong>부채</strong></td>
            </tr>
            <tr>
              <td className="indent">유동부채</td>
              <td className="text-right">{formatCurrency(bs.current_liabilities)}</td>
            </tr>
            <tr>
              <td className="indent">비유동부채</td>
              <td className="text-right">{formatCurrency(bs.non_current_liabilities)}</td>
            </tr>
            <tr className="total-row">
              <td><strong>부채총계</strong></td>
              <td className="text-right"><strong>{formatCurrency(bs.total_liabilities)}</strong></td>
            </tr>

            <tr className="section-header">
              <td colSpan="2"><strong>자본</strong></td>
            </tr>
            <tr>
              <td className="indent">자본금</td>
              <td className="text-right">{formatCurrency(bs.capital_stock)}</td>
            </tr>
            <tr>
              <td className="indent">이익잉여금</td>
              <td className="text-right">{formatCurrency(bs.retained_earnings)}</td>
            </tr>
            <tr className="total-row">
              <td><strong>자본총계</strong></td>
              <td className="text-right"><strong>{formatCurrency(bs.total_equity)}</strong></td>
            </tr>
          </tbody>
        </table>
      </div>
    );
  };

  const renderIncomeStatement = () => {
    if (!statements.income_statement) {
      return <p className="text-muted">손익계산서 데이터가 없습니다.</p>;
    }

    const is = statements.income_statement;

    return (
      <div className="statement-table">
        <table>
          <thead>
            <tr>
              <th>항목</th>
              <th className="text-right">금액</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td><strong>매출액</strong></td>
              <td className="text-right"><strong>{formatCurrency(is.revenue)}</strong></td>
            </tr>
            <tr>
              <td className="indent">매출원가</td>
              <td className="text-right">{formatCurrency(is.cost_of_sales)}</td>
            </tr>
            <tr className="subtotal-row">
              <td><strong>매출총이익</strong></td>
              <td className="text-right"><strong>{formatCurrency(is.gross_profit)}</strong></td>
            </tr>
            <tr>
              <td className="indent">판매비와관리비</td>
              <td className="text-right">{formatCurrency(is.operating_expenses)}</td>
            </tr>
            <tr className="total-row">
              <td><strong>영업이익</strong></td>
              <td className="text-right"><strong>{formatCurrency(is.operating_profit)}</strong></td>
            </tr>
            <tr>
              <td className="indent">영업외수익</td>
              <td className="text-right">{formatCurrency(is.non_operating_income)}</td>
            </tr>
            <tr>
              <td className="indent">영업외비용</td>
              <td className="text-right">{formatCurrency(is.non_operating_expenses)}</td>
            </tr>
            <tr className="subtotal-row">
              <td><strong>법인세차감전순이익</strong></td>
              <td className="text-right"><strong>{formatCurrency(is.profit_before_tax)}</strong></td>
            </tr>
            <tr>
              <td className="indent">법인세비용</td>
              <td className="text-right">{formatCurrency(is.income_tax)}</td>
            </tr>
            <tr className="total-row highlight">
              <td><strong>당기순이익</strong></td>
              <td className="text-right"><strong>{formatCurrency(is.net_profit)}</strong></td>
            </tr>
          </tbody>
        </table>
      </div>
    );
  };

  const renderCashFlow = () => {
    if (!statements.cash_flow) {
      return <p className="text-muted">현금흐름표 데이터가 없습니다.</p>;
    }

    const cf = statements.cash_flow;

    return (
      <div className="statement-table">
        <table>
          <thead>
            <tr>
              <th>항목</th>
              <th className="text-right">금액</th>
            </tr>
          </thead>
          <tbody>
            <tr className="section-header">
              <td colSpan="2"><strong>영업활동 현금흐름</strong></td>
            </tr>
            <tr>
              <td className="indent">당기순이익</td>
              <td className="text-right">{formatCurrency(cf.net_profit)}</td>
            </tr>
            <tr>
              <td className="indent">조정</td>
              <td className="text-right">{formatCurrency(cf.operating_adjustments)}</td>
            </tr>
            <tr className="total-row">
              <td><strong>영업활동으로 인한 현금흐름</strong></td>
              <td className="text-right"><strong>{formatCurrency(cf.operating_cash_flow)}</strong></td>
            </tr>

            <tr className="section-header">
              <td colSpan="2"><strong>투자활동 현금흐름</strong></td>
            </tr>
            <tr className="total-row">
              <td><strong>투자활동으로 인한 현금흐름</strong></td>
              <td className="text-right"><strong>{formatCurrency(cf.investing_cash_flow)}</strong></td>
            </tr>

            <tr className="section-header">
              <td colSpan="2"><strong>재무활동 현금흐름</strong></td>
            </tr>
            <tr className="total-row">
              <td><strong>재무활동으로 인한 현금흐름</strong></td>
              <td className="text-right"><strong>{formatCurrency(cf.financing_cash_flow)}</strong></td>
            </tr>

            <tr className="total-row highlight">
              <td><strong>현금의 증가(감소)</strong></td>
              <td className="text-right"><strong>{formatCurrency(cf.net_cash_flow)}</strong></td>
            </tr>
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <div className="financial-statements">
      <div className="statement-tabs">
        <button
          className={`tab-btn ${activeTab === 'bs' ? 'active' : ''}`}
          onClick={() => setActiveTab('bs')}
        >
          재무상태표 (BS)
        </button>
        <button
          className={`tab-btn ${activeTab === 'is' ? 'active' : ''}`}
          onClick={() => setActiveTab('is')}
        >
          손익계산서 (IS)
        </button>
        <button
          className={`tab-btn ${activeTab === 'cf' ? 'active' : ''}`}
          onClick={() => setActiveTab('cf')}
        >
          현금흐름표 (CF)
        </button>
      </div>

      <div className="statement-content">
        {activeTab === 'bs' && renderBalanceSheet()}
        {activeTab === 'is' && renderIncomeStatement()}
        {activeTab === 'cf' && renderCashFlow()}
      </div>
    </div>
  );
}

export default FinancialStatements;

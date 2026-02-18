import './OfficersTable.css';

function OfficersTable({ officers }) {
  if (!officers || officers.length === 0) {
    return (
      <div className="officers-table empty">
        <p className="text-muted">임원 정보가 없습니다.</p>
      </div>
    );
  }

  const calculateTenure = (startDate) => {
    if (!startDate) return '-';

    const start = new Date(startDate);
    const now = new Date();
    const years = now.getFullYear() - start.getFullYear();
    const months = now.getMonth() - start.getMonth();

    const totalMonths = years * 12 + months;
    const tenureYears = Math.floor(totalMonths / 12);
    const tenureMonths = totalMonths % 12;

    if (tenureYears > 0) {
      return `${tenureYears}년 ${tenureMonths}개월`;
    }
    return `${tenureMonths}개월`;
  };

  const getRoleClass = (position) => {
    if (position.includes('대표이사') || position.includes('CEO')) {
      return 'ceo';
    } else if (position.includes('사외이사')) {
      return 'outside';
    } else if (position.includes('상근감사')) {
      return 'auditor';
    }
    return 'general';
  };

  return (
    <div className="officers-table">
      <div className="table-container">
        <table>
          <thead>
            <tr>
              <th>직책</th>
              <th>이름</th>
              <th>취임일</th>
              <th>재임기간</th>
              <th>주요경력</th>
              <th>비고</th>
            </tr>
          </thead>
          <tbody>
            {officers.map((officer, index) => (
              <tr key={index} className={getRoleClass(officer.position)}>
                <td>
                  <div className="position-cell">
                    <span className={`position-badge ${getRoleClass(officer.position)}`}>
                      {officer.position}
                    </span>
                  </div>
                </td>
                <td>
                  <strong>{officer.name}</strong>
                </td>
                <td>
                  {officer.appointment_date
                    ? new Date(officer.appointment_date).toLocaleDateString('ko-KR')
                    : '-'}
                </td>
                <td>{calculateTenure(officer.appointment_date)}</td>
                <td className="career-cell">{officer.career || '-'}</td>
                <td className="note-cell">{officer.note || '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="officers-summary">
        <div className="summary-item">
          <span className="summary-label">전체 임원</span>
          <span className="summary-value">{officers.length}명</span>
        </div>
        <div className="summary-item">
          <span className="summary-label">사외이사</span>
          <span className="summary-value">
            {officers.filter(o => o.position.includes('사외이사')).length}명
          </span>
        </div>
        <div className="summary-item">
          <span className="summary-label">평균 재임기간</span>
          <span className="summary-value">
            {(() => {
              const validOfficers = officers.filter(o => o.appointment_date);
              if (validOfficers.length === 0) return '-';

              const avgMonths = validOfficers.reduce((sum, officer) => {
                const start = new Date(officer.appointment_date);
                const now = new Date();
                const months = (now.getFullYear() - start.getFullYear()) * 12 +
                              (now.getMonth() - start.getMonth());
                return sum + months;
              }, 0) / validOfficers.length;

              const years = Math.floor(avgMonths / 12);
              const months = Math.floor(avgMonths % 12);
              return `${years}년 ${months}개월`;
            })()}
          </span>
        </div>
      </div>
    </div>
  );
}

export default OfficersTable;

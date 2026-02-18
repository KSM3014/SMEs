import { useState, useEffect } from 'react';
import { useQuery } from 'react-query';
import { getMapData } from '../../services/api';
import './MapTab.css';

function MapTab() {
  const [selectedRegion, setSelectedRegion] = useState(null);
  const [mapBounds, setMapBounds] = useState(null);

  const { data: mapData, isLoading } = useQuery(
    ['map-data', mapBounds],
    () => getMapData(mapBounds),
    { enabled: !!mapBounds }
  );

  useEffect(() => {
    // 초기 지도 범위 설정 (대한민국 전체)
    setMapBounds({
      minLat: 33.0,
      maxLat: 38.6,
      minLng: 124.5,
      maxLng: 131.9
    });
  }, []);

  const formatCurrency = (value) => {
    if (!value) return '-';
    return `${(value / 100000000).toFixed(0)}억원`;
  };

  const regions = [
    { id: 'seoul', name: '서울', icon: '🏙️' },
    { id: 'gyeonggi', name: '경기', icon: '🏘️' },
    { id: 'incheon', name: '인천', icon: '⚓' },
    { id: 'busan', name: '부산', icon: '🌊' },
    { id: 'daegu', name: '대구', icon: '🍎' },
    { id: 'gwangju', name: '광주', icon: '🌸' },
    { id: 'daejeon', name: '대전', icon: '🔬' },
    { id: 'ulsan', name: '울산', icon: '🏭' },
    { id: 'sejong', name: '세종', icon: '🏛️' },
    { id: 'gangwon', name: '강원', icon: '⛰️' },
    { id: 'chungbuk', name: '충북', icon: '🌾' },
    { id: 'chungnam', name: '충남', icon: '🌾' },
    { id: 'jeonbuk', name: '전북', icon: '🌾' },
    { id: 'jeonnam', name: '전남', icon: '🌾' },
    { id: 'gyeongbuk', name: '경북', icon: '🌳' },
    { id: 'gyeongnam', name: '경남', icon: '🌳' },
    { id: 'jeju', name: '제주', icon: '🍊' }
  ];

  const handleRegionClick = (region) => {
    setSelectedRegion(region);
    // 실제 구현 시: 지역별 좌표 범위 설정
  };

  return (
    <div className="map-tab">
      <div className="map-header">
        <h2>🗺️ 지역별 중소기업 분포</h2>
        <p className="text-muted">지역별로 기업을 탐색하고 비교하세요</p>
      </div>

      <div className="map-container">
        <div className="region-selector">
          <h3>지역 선택</h3>
          <div className="region-grid">
            {regions.map((region) => (
              <button
                key={region.id}
                className={`region-btn ${selectedRegion?.id === region.id ? 'active' : ''}`}
                onClick={() => handleRegionClick(region)}
              >
                <span className="region-icon">{region.icon}</span>
                <span className="region-name">{region.name}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="map-content">
          <div className="map-placeholder">
            <div className="map-notice">
              <p>🗺️</p>
              <h3>지도 기능 개발 예정</h3>
              <p className="text-muted">
                카카오맵 또는 네이버지도 API를 연동하여<br />
                지역별 기업 분포를 시각화할 예정입니다.
              </p>
            </div>
          </div>

          {selectedRegion && (
            <div className="region-stats">
              <h3>{selectedRegion.name} 지역 통계</h3>
              {isLoading ? (
                <div className="spinner-container">
                  <div className="spinner small"></div>
                </div>
              ) : (
                <div className="stats-grid">
                  <div className="stat-card">
                    <div className="stat-label">전체 기업</div>
                    <div className="stat-value">{mapData?.total_companies?.toLocaleString() || '-'}</div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-label">평균 매출</div>
                    <div className="stat-value">{formatCurrency(mapData?.avg_revenue)}</div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-label">벤처 기업</div>
                    <div className="stat-value">{mapData?.venture_count?.toLocaleString() || '-'}</div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-label">이노비즈</div>
                    <div className="stat-value">{mapData?.innobiz_count?.toLocaleString() || '-'}</div>
                  </div>
                </div>
              )}

              {mapData?.top_companies && (
                <div className="top-companies">
                  <h4>주요 기업</h4>
                  <ul>
                    {mapData.top_companies.map((company) => (
                      <li key={company.id}>
                        <span className="company-name">{company.company_name}</span>
                        <span className="company-revenue">{formatCurrency(company.revenue)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default MapTab;

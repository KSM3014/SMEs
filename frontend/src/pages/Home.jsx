import { useState } from 'react';
import SearchBar from '../components/search/SearchBar';
import TabNavigation from '../components/tabs/TabNavigation';
import IndustryTab from '../components/tabs/IndustryTab';
import RankingsTab from '../components/tabs/RankingsTab';
import RecommendationsTab from '../components/tabs/RecommendationsTab';
import MapTab from '../components/tabs/MapTab';
import './Home.css';

function Home() {
  const [activeTab, setActiveTab] = useState('search');

  const tabs = [
    { id: 'search', label: '검색', icon: '🔍' },
    { id: 'industry', label: '산업군별', icon: '🏭' },
    { id: 'rankings', label: '성과순위', icon: '🏆' },
    { id: 'recommendations', label: 'AI 추천', icon: '🤖' },
    { id: 'map', label: '지도', icon: '🗺️' }
  ];

  const renderTabContent = () => {
    switch (activeTab) {
      case 'search':
        return (
          <div className="search-tab">
            <div className="search-hero">
              <h2>중소기업 투자, 이제는 데이터로</h2>
              <p className="text-muted">
                96개 정부 API에서 실시간으로 수집한<br />
                재무제표, 임원정보, 신용등급을 한눈에
              </p>
            </div>
            <SearchBar />
          </div>
        );
      case 'industry':
        return <IndustryTab />;
      case 'rankings':
        return <RankingsTab />;
      case 'recommendations':
        return <RecommendationsTab />;
      case 'map':
        return <MapTab />;
      default:
        return null;
    }
  };

  return (
    <div className="home container">
      <TabNavigation
        tabs={tabs}
        activeTab={activeTab}
        onTabChange={setActiveTab}
      />
      <div className="tab-content">
        {renderTabContent()}
      </div>
    </div>
  );
}

export default Home;

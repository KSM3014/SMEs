import SearchBar from '../components/search/SearchBar';
import './Home.css';

function Home() {
  return (
    <div className="home container">
      <div className="search-hero">
        <h2>중소기업 투자, 이제는 데이터로</h2>
        <p>96개 정부 API에서 실시간으로 수집한 재무제표, 임원정보, 신용등급을 한눈에</p>
      </div>
      <SearchBar />
    </div>
  );
}

export default Home;

import { Link } from 'react-router-dom';
import './Header.css';

function Header() {
  return (
    <header className="header">
      <div className="container">
        <div className="header-content">
          <Link to="/" className="logo">
            <h1>SME 투자자 정보</h1>
            <p className="tagline">중소기업 재무 데이터 한눈에</p>
          </Link>
          <nav className="nav">
            <Link to="/search" className="nav-link">
              Entity Search
            </Link>
            <a href="https://www.data.go.kr/" target="_blank" rel="noopener noreferrer" className="nav-link">
              공공데이터포털
            </a>
            <a href="https://dart.fss.or.kr/" target="_blank" rel="noopener noreferrer" className="nav-link">
              DART
            </a>
          </nav>
        </div>
      </div>
    </header>
  );
}

export default Header;

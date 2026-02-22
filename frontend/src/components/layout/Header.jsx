import { Link } from 'react-router-dom';
import './Header.css';

function Header({ theme, onToggleTheme }) {
  return (
    <header className="header">
      <div className="container">
        <div className="header-content">
          <Link to="/" className="logo">
            <h1>SME 투자자 정보</h1>
            <p className="tagline">중소기업 재무 데이터 한눈에</p>
          </Link>
          <nav className="nav">
            <button className="theme-toggle" onClick={onToggleTheme} title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}>
              {theme === 'dark' ? 'Light' : 'Dark'}
            </button>
          </nav>
        </div>
      </div>
    </header>
  );
}

export default Header;

import { lazy, Suspense, useState, useEffect } from 'react';
import { Routes, Route } from 'react-router-dom';
import Header from './components/layout/Header';
import './App.css';

const Home = lazy(() => import('./pages/Home'));
const CompanyDetail = lazy(() => import('./pages/CompanyDetail'));
const CompanySearch = lazy(() => import('./pages/CompanySearch'));

function PageLoader() {
  return (
    <div className="page-loader">
      <div className="spinner"></div>
    </div>
  );
}

function App() {
  const [theme, setTheme] = useState(() => localStorage.getItem('sme-theme') || 'dark');

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('sme-theme', theme);
  }, [theme]);

  const toggleTheme = () => setTheme(t => t === 'dark' ? 'light' : 'dark');

  return (
    <div className="app">
      <Header theme={theme} onToggleTheme={toggleTheme} />
      <main className="main-content">
        <Suspense fallback={<PageLoader />}>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/search" element={<CompanySearch />} />
            <Route path="/company/:id" element={<CompanyDetail />} />
          </Routes>
        </Suspense>
      </main>
    </div>
  );
}

export default App;

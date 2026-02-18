import { Routes, Route } from 'react-router-dom';
import Header from './components/layout/Header';
import Home from './pages/Home';
import CompanyDetail from './pages/CompanyDetail';
import CompanySearch from './pages/CompanySearch';
import './App.css';

function App() {
  return (
    <div className="app">
      <Header />
      <main className="main-content">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/search" element={<CompanySearch />} />
          <Route path="/company/:id" element={<CompanyDetail />} />
        </Routes>
      </main>
    </div>
  );
}

export default App;

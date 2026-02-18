import axios from 'axios';

const api = axios.create({
  baseURL: '/api/company',
  timeout: 60000,
  headers: { 'Content-Type': 'application/json' }
});

api.interceptors.response.use(
  (response) => response.data,
  (error) => {
    console.error('Company API Error:', error.response || error);
    return Promise.reject(error.response?.data || error);
  }
);

/**
 * 기업 검색 (자동 판별: 사업자번호/법인번호/회사명) — 전체 86 API
 */
export const searchCompany = async (query) => {
  return api.get('/search', { params: { q: query } });
};

/**
 * 경량 후보 검색 (DB only) — 드롭다운용, 즉시 응답
 */
export const suggestCompany = async (query) => {
  return api.get('/suggest', { params: { q: query } });
};

/**
 * 기업 검색 (파라미터 직접 지정)
 */
export const searchCompanyAdvanced = async ({ brno, crno, name }) => {
  return api.get('/search', { params: { brno, crno, name } });
};

/**
 * 기업 상세 분석 (사업자번호)
 */
export const analyzeCompany = async (brno) => {
  return api.get(`/analyze/${brno}`);
};

/**
 * 빠른 조회 (사업자번호)
 */
export const quickLookup = async (brno) => {
  return api.get(`/quick/${brno}`);
};

/**
 * API 소스 목록
 */
export const getApiSources = async () => {
  return api.get('/sources');
};

/**
 * 캐시 클리어
 */
export const clearCache = async () => {
  return api.post('/cache/clear');
};

export default api;

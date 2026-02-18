import axios from 'axios';

// Use Mock API for testing without database
const api = axios.create({
  baseURL: '/api/mock',
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json'
  }
});

// Request interceptor
api.interceptors.request.use(
  (config) => {
    // Add authorization token if available
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor
api.interceptors.response.use(
  (response) => response.data,
  (error) => {
    console.error('API Error:', error.response || error);
    return Promise.reject(error.response?.data || error);
  }
);

// SME API Functions (using Mock endpoints)

export const searchCompanies = async (query, page = 1, limit = 20) => {
  return api.get('/search', { params: { q: query, page, limit } });
};

export const getCompanyDetail = async (id) => {
  return api.get(`/company/${id}`);
};

export const getIndustries = async () => {
  return api.get('/industries');
};

export const getIndustryCompanies = async (code, page = 1, limit = 20, sortBy = 'revenue') => {
  return api.get(`/industry/${code}`, { params: { page, limit, sortBy } });
};

export const getRankings = async (metric = 'revenue', limit = 50) => {
  return api.get('/rankings', { params: { metric, limit } });
};

export const getRecommendations = async () => {
  return api.get('/recommendations');
};

export const getMapData = async (bounds) => {
  return api.get('/map-data', { params: { bounds } });
};

export const collectCompanyData = async (businessNumber, forceRefresh = false) => {
  return api.post('/collect', { business_number: businessNumber, force_refresh: forceRefresh });
};

export default api;

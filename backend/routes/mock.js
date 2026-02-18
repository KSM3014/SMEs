// Mock data for frontend testing (without DB connection)
import express from 'express';

const router = express.Router();

// Mock company data
const mockCompanies = [
  {
    id: 1,
    company_name: '아이센스',
    business_number: '210-81-29428',
    ceo_name: '김성진',
    industry_name: '의료기기 제조업',
    employee_count: 450,
    establishment_date: '1996-03-15',
    address: '서울특별시 금천구 가산디지털1로 219',
    phone: '02-2109-8100',
    website: 'https://www.i-sens.com',
    revenue: 180000000000,
    operating_profit: 25000000000,
    operating_margin: 13.9,
    roe: 15.2,
    debt_ratio: 45.3,
    venture_certification: true,
    innovation_certification: true,
    main_biz_certification: false,
    listed: false
  },
  {
    id: 2,
    company_name: '카카오엔터프라이즈',
    business_number: '220-88-93764',
    ceo_name: '백상엽',
    industry_name: '소프트웨어 개발업',
    employee_count: 800,
    establishment_date: '2012-11-15',
    address: '경기도 성남시 분당구 판교역로 235',
    phone: '031-789-5000',
    website: 'https://www.kakaoenterprise.com',
    revenue: 350000000000,
    operating_profit: 42000000000,
    operating_margin: 12.0,
    roe: 18.5,
    debt_ratio: 38.2,
    venture_certification: false,
    innovation_certification: true,
    main_biz_certification: true,
    listed: false
  },
  {
    id: 3,
    company_name: '토스페이먼츠',
    business_number: '120-88-00295',
    ceo_name: '이승건',
    industry_name: '전자결제 서비스업',
    employee_count: 1200,
    establishment_date: '2013-09-10',
    address: '서울특별시 강남구 테헤란로 133',
    phone: '1644-8051',
    website: 'https://www.tosspayments.com',
    revenue: 520000000000,
    operating_profit: 65000000000,
    operating_margin: 12.5,
    roe: 22.3,
    debt_ratio: 42.1,
    venture_certification: true,
    innovation_certification: true,
    main_biz_certification: true,
    listed: false
  }
];

// Mock industries
const mockIndustries = [
  { code: 'C26', name: '의료기기 제조업', icon: '🏥', company_count: 156 },
  { code: 'J58', name: '소프트웨어 개발업', icon: '💻', company_count: 892 },
  { code: 'J63', name: '정보서비스업', icon: '📱', company_count: 534 },
  { code: 'C28', name: '전기장비 제조업', icon: '⚡', company_count: 234 },
  { code: 'M72', name: '연구개발업', icon: '🔬', company_count: 178 }
];

// GET /api/mock/search
router.get('/search', (req, res) => {
  const { q, page = 1, limit = 20 } = req.query;

  if (!q) {
    return res.json({ data: [], total: 0 });
  }

  const filtered = mockCompanies.filter(c =>
    c.company_name.includes(q) || c.business_number.includes(q)
  );

  res.json({
    data: filtered,  // 'companies' -> 'data' (프론트엔드가 기대하는 형식)
    total: filtered.length,
    page: parseInt(page),
    limit: parseInt(limit)
  });
});

// GET /api/mock/company/:id
router.get('/company/:id', (req, res) => {
  const { id } = req.params;

  // Support both numeric ID and business_number
  const company = mockCompanies.find(c =>
    c.id === parseInt(id) || c.business_number === id
  );

  if (!company) {
    return res.status(404).json({ error: 'Company not found' });
  }

  // Add mock detailed data
  const detailedCompany = {
    ...company,
    three_year_average: {
      revenue: 150000000000,
      operating_margin: 11.5,
      roe: 14.0,
      debt_ratio: 50.2
    },
    red_flags: [
      {
        title: '빈번한 대표이사 교체',
        description: '최근 3년간 대표이사가 2회 교체되었습니다.',
        severity: 'medium',
        details: '2021년, 2023년 교체'
      }
    ],
    financial_history: [
      { year: 2021, revenue: 120000000000, operating_profit: 15000000000, operating_margin: 12.5 },
      { year: 2022, revenue: 150000000000, operating_profit: 19000000000, operating_margin: 12.7 },
      { year: 2023, revenue: 180000000000, operating_profit: 25000000000, operating_margin: 13.9 }
    ],
    financial_statements: {
      balance_sheet: {
        current_assets: 95000000000,
        non_current_assets: 55000000000,
        total_assets: 150000000000,
        current_liabilities: 35000000000,
        non_current_liabilities: 25000000000,
        total_liabilities: 60000000000,
        capital_stock: 10000000000,
        retained_earnings: 80000000000,
        total_equity: 90000000000
      },
      income_statement: {
        revenue: 180000000000,
        cost_of_sales: 110000000000,
        gross_profit: 70000000000,
        operating_expenses: 45000000000,
        operating_profit: 25000000000,
        non_operating_income: 2000000000,
        non_operating_expenses: 1000000000,
        profit_before_tax: 26000000000,
        income_tax: 6000000000,
        net_profit: 20000000000
      },
      cash_flow: {
        net_profit: 20000000000,
        operating_adjustments: 5000000000,
        operating_cash_flow: 25000000000,
        investing_cash_flow: -10000000000,
        financing_cash_flow: -5000000000,
        net_cash_flow: 10000000000
      }
    },
    officers: [
      {
        name: '김성진',
        position: '대표이사',
        appointment_date: '2020-03-01',
        career: 'KAIST 의공학 박사, 前 삼성전자 연구원',
        note: '창업자'
      },
      {
        name: '이상훈',
        position: '부사장',
        appointment_date: '2018-06-15',
        career: '서울대 경영학 석사, 前 LG전자 임원',
        note: '영업총괄'
      },
      {
        name: '박미정',
        position: '사외이사',
        appointment_date: '2021-01-10',
        career: '연세대 법학 박사, 법무법인 대표',
        note: '독립이사'
      }
    ],
    shareholders: [
      {
        name: '김성진',
        type: 'founder',
        shares: 5000000,
        percentage: 35.5,
        relation: '대표이사',
        note: '최대주주'
      },
      {
        name: '국민연금공단',
        type: 'institutional',
        shares: 2000000,
        percentage: 14.2,
        relation: '기관투자자',
        note: ''
      },
      {
        name: 'BlackRock',
        type: 'foreign',
        shares: 1500000,
        percentage: 10.6,
        relation: '외국계펀드',
        note: ''
      }
    ]
  };

  res.json(detailedCompany);
});

// GET /api/mock/industries
router.get('/industries', (req, res) => {
  res.json(mockIndustries);
});

// GET /api/mock/industry/:code
router.get('/industry/:code', (req, res) => {
  const { page = 1, limit = 20, sortBy = 'revenue' } = req.query;

  const companies = mockCompanies.slice(0, 2); // Mock filtered by industry

  res.json({
    companies,
    total: companies.length,
    page: parseInt(page),
    limit: parseInt(limit)
  });
});

// GET /api/mock/rankings
router.get('/rankings', (req, res) => {
  const { metric = 'revenue', limit = 50 } = req.query;

  const sorted = [...mockCompanies].sort((a, b) => b[metric] - a[metric]);

  res.json(sorted.slice(0, parseInt(limit)));
});

// GET /api/mock/recommendations
router.get('/recommendations', (req, res) => {
  const recommendations = mockCompanies.map((company, index) => ({
    company,
    score: 85 - (index * 5),
    reason: '높은 수익성과 안정적인 재무구조를 보유하고 있으며, 지속적인 성장세를 보이고 있습니다.',
    strengths: [
      '3년 연속 매출 성장',
      '업계 평균 이상의 영업이익률',
      '낮은 부채비율'
    ],
    risks: index === 0 ? ['빈번한 대표이사 교체'] : []
  }));

  res.json(recommendations);
});

// GET /api/mock/map-data
router.get('/map-data', (req, res) => {
  res.json({
    total_companies: 156,
    avg_revenue: 180000000000,
    venture_count: 45,
    innobiz_count: 78,
    top_companies: mockCompanies.slice(0, 3)
  });
});

export default router;

import {
  normalizeCompanyName,
  calculateNameSimilarity,
  normalizeBrno,
  normalizeCrno,
  levenshteinDistance,
  MATCH_THRESHOLD
} from '../services/entityResolver.js';

describe('normalizeCompanyName', () => {
  test('removes (주) prefix', () => {
    expect(normalizeCompanyName('(주)삼성전자')).toBe('삼성전자');
  });

  test('removes 주식회사 suffix', () => {
    expect(normalizeCompanyName('삼성전자 주식회사')).toBe('삼성전자');
  });

  test('removes ㈜ prefix', () => {
    expect(normalizeCompanyName('㈜현대자동차')).toBe('현대자동차');
  });

  test('removes both prefix and suffix', () => {
    expect(normalizeCompanyName('(주)삼성전자 주식회사')).toBe('삼성전자');
  });

  test('handles empty/null input', () => {
    expect(normalizeCompanyName(null)).toBe('');
    expect(normalizeCompanyName('')).toBe('');
    expect(normalizeCompanyName(undefined)).toBe('');
  });

  test('trims whitespace', () => {
    expect(normalizeCompanyName('  삼성전자  ')).toBe('삼성전자');
  });
});

describe('normalizeBrno', () => {
  test('normalizes 10-digit with hyphens', () => {
    expect(normalizeBrno('124-81-00998')).toBe('1248100998');
  });

  test('normalizes clean 10-digit', () => {
    expect(normalizeBrno('1248100998')).toBe('1248100998');
  });

  test('returns null for empty/null', () => {
    expect(normalizeBrno(null)).toBeNull();
    expect(normalizeBrno('')).toBeNull();
  });

  test('strips non-numeric but keeps digits', () => {
    expect(normalizeBrno('12345')).toBe('12345');
  });
});

describe('normalizeCrno', () => {
  test('normalizes 13-digit with hyphens', () => {
    expect(normalizeCrno('130111-0006246')).toBe('1301110006246');
  });

  test('normalizes clean 13-digit', () => {
    expect(normalizeCrno('1301110006246')).toBe('1301110006246');
  });

  test('returns null for empty/null', () => {
    expect(normalizeCrno(null)).toBeNull();
    expect(normalizeCrno('')).toBeNull();
  });
});

describe('calculateNameSimilarity', () => {
  test('exact match returns 1.0', () => {
    expect(calculateNameSimilarity('삼성전자', '삼성전자')).toBe(1.0);
  });

  test('same after normalization returns 1.0', () => {
    expect(calculateNameSimilarity('(주)삼성전자', '삼성전자 주식회사')).toBe(1.0);
  });

  test('substring match returns >= 0.9', () => {
    const sim = calculateNameSimilarity('삼성전자', '삼성전자반도체');
    expect(sim).toBeGreaterThanOrEqual(0.9);
  });

  test('different names return low score', () => {
    const sim = calculateNameSimilarity('삼성전자', '현대자동차');
    expect(sim).toBeLessThan(MATCH_THRESHOLD);
  });
});

describe('levenshteinDistance', () => {
  test('same strings return 0', () => {
    expect(levenshteinDistance('abc', 'abc')).toBe(0);
  });

  test('single char difference', () => {
    expect(levenshteinDistance('abc', 'abd')).toBe(1);
  });

  test('empty string', () => {
    expect(levenshteinDistance('', 'abc')).toBe(3);
    expect(levenshteinDistance('abc', '')).toBe(3);
  });
});

import { safeErrorMessage } from '../middleware/safeError.js';

describe('safeErrorMessage', () => {
  const originalEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
  });

  test('returns detailed message in development', () => {
    process.env.NODE_ENV = 'development';
    const error = new Error('DB connection failed at port 5432');
    expect(safeErrorMessage(error)).toBe('DB connection failed at port 5432');
  });

  test('returns generic message in production', () => {
    process.env.NODE_ENV = 'production';
    const error = new Error('DB connection failed at port 5432');
    expect(safeErrorMessage(error)).toBe('Internal server error');
  });
});

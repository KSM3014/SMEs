module.exports = {
  root: true,
  env: { node: true, es2021: true, jest: true },
  extends: ['eslint:recommended'],
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module'
  },
  rules: {
    'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    'no-console': 'off'
  },
  ignorePatterns: ['node_modules/', 'scripts/', 'collectors/'],
  overrides: [
    {
      // Puppeteer services use page.evaluate() with browser-context code
      files: ['services/loginService.js', 'services/sminfoClient.js'],
      globals: { document: 'readonly', window: 'readonly' }
    }
  ]
};

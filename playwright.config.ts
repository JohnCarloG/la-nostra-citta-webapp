import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/browser',
  testMatch: '**/*.spec.ts',
  workers: 1,
  retries: 0,
  timeout: 180_000,
  expect: { timeout: 15_000 },
  reporter: [['list'], ['json', { outputFile: 'browser-evidence/results.json' }], ['html', { outputFolder: 'browser-evidence/report', open: 'never' }]],
  outputDir: 'browser-evidence/test-results',
  use: { baseURL: 'http://localhost:3100', viewport: { width: 1440, height: 1000 }, screenshot: 'only-on-failure', trace: 'retain-on-failure' },
  webServer: {
    command: 'npm run start -- --hostname localhost --port 3100',
    url: 'http://localhost:3100/login',
    reuseExistingServer: false,
    env: { NODE_ENV: 'production', AI_ADAPTER_MODE: 'cloud' }
  }
});

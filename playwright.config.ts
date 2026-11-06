import { defineConfig } from '@playwright/test';
const testBuild = process.env.PLAYWRIGHT_TEST_BUILD === '1';
const port = testBuild ? 4173 : 5173;
const baseURL = `http://127.0.0.1:${port}`;
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  workers: 2,
  timeout: 30000,
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
    ['json', { outputFile: 'artifacts/e2e-results.json' }],
  ],
  use: {
    baseURL,
    browserName: 'webkit',
    headless: true,
    viewport: { width: 1440, height: 1000 },
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: `npm run ${testBuild ? 'preview' : 'dev'} -- --port ${port} --strictPort`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 15000,
  },
});

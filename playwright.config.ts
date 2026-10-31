import {defineConfig, devices} from '@playwright/test';

/**
 * Two ways to run the suite:
 *
 * 1. Locally or in pull request CI: `npm run build && npm run test:e2e`.
 *    Playwright starts the production server itself.
 * 2. Against a deployed site: `BASE_URL=https://preview-url npm run test:e2e`.
 *    No local server is started.
 *
 * See https://playwright.dev/docs/test-configuration.
 */
const isCI = !!process.env.CI;
const port = Number(process.env.PORT || 3000);
const baseURL = process.env.BASE_URL || `http://127.0.0.1:${port}`;
const useLocalServer = !process.env.BASE_URL;

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  workers: isCI ? '50%' : undefined,
  reporter: isCI
    ? [['github'], ['html', {open: 'never'}]]
    : [['list'], ['html', {open: 'never'}]],

  expect: {
    // Opening a large shared link decodes and lays out up to 70 images.
    timeout: 10_000,
  },

  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    extraHTTPHeaders: {
      'x-vercel-skip-toolbar': '1',
      ...(process.env.VERCEL_AUTOMATION_BYPASS_SECRET
        ? {'x-vercel-protection-bypass': process.env.VERCEL_AUTOMATION_BYPASS_SECRET}
        : {}),
    },
  },

  projects: [
    // API tests (*.api.spec.ts) need no browser, so they run once.
    {name: 'api', testMatch: /\.api\.spec\.ts$/},
    {name: 'chromium', use: {...devices['Desktop Chrome']}, testIgnore: /\.api\.spec\.ts$/},
    {name: 'firefox', use: {...devices['Desktop Firefox']}, testIgnore: /\.api\.spec\.ts$/},
    {name: 'webkit', use: {...devices['Desktop Safari']}, testIgnore: /\.api\.spec\.ts$/},
    // Phones run the read-only journeys tagged @mobile. Mouse drag and right-click
    // do not apply to touch screens.
    {name: 'mobile-chrome', use: {...devices['Pixel 7']}, grep: /@mobile/, testIgnore: /\.api\.spec\.ts$/},
    {name: 'mobile-safari', use: {...devices['iPhone 15']}, grep: /@mobile/, testIgnore: /\.api\.spec\.ts$/},
  ],

  webServer: useLocalServer
    ? {
      command: `npm run start -- -p ${port}`,
      url: baseURL,
      reuseExistingServer: !isCI,
      timeout: 120_000,
    }
    : undefined,
});

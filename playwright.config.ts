import {defineConfig, devices} from '@playwright/test';
import {BYPASS_HEADER, bypassSecret} from './tests/support/vercel-bypass';

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

// Sent with every request: hides the Vercel toolbar on preview deployments.
const sharedHeaders = {'x-vercel-skip-toolbar': '1'};
// The Vercel bypass secret must reach only the site under test. Browser tests add it per
// request in tests/support/test.ts (pages also load images from other sites). API tests
// only call the site under test, so their requests carry it directly.
const secret = bypassSecret();
const apiHeaders = secret ? {...sharedHeaders, [BYPASS_HEADER]: secret} : sharedHeaders;

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
    // A trace records request headers. With the Vercel bypass secret set, no trace is kept,
    // so the secret cannot reach an uploaded report.
    trace: secret ? 'off' : 'on-first-retry',
    screenshot: 'only-on-failure',
    extraHTTPHeaders: sharedHeaders,
  },

  projects: [
    // API tests (*.api.spec.ts) need no browser, so they run once.
    {name: 'api', testMatch: /\.api\.spec\.ts$/, use: {extraHTTPHeaders: apiHeaders}},
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

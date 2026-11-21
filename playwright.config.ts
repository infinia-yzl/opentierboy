import {defineConfig, devices} from '@playwright/test';
import {BYPASS_HEADER, bypassSecret} from './tests/support/vercel-bypass';

const isCI = !!process.env.CI;
const port = Number(process.env.PORT || 3000);
const baseURL = process.env.BASE_URL || `http://127.0.0.1:${port}`;
const useLocalServer = !process.env.BASE_URL;

const sharedHeaders = {'x-vercel-skip-toolbar': '1'};
const secret = bypassSecret();
const apiHeaders = secret ? {...sharedHeaders, [BYPASS_HEADER]: secret} : sharedHeaders;

const DESKTOP_WINDOW = {width: 1280, height: 1440};

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  workers: isCI ? 4 : undefined,
  reporter: isCI
    ? [['github'], ['html', {open: 'never'}]]
    : [['list'], ['html', {open: 'never'}]],

  expect: {
    timeout: 10_000,
  },

  use: {
    baseURL,
    trace: secret ? 'off' : 'on-first-retry',
    screenshot: 'only-on-failure',
    extraHTTPHeaders: sharedHeaders,
    reducedMotion: 'reduce',
    navigationTimeout: 30_000,
    actionTimeout: 15_000,
  },

  projects: [
    {name: 'api', testMatch: /\.api\.spec\.ts$/, use: {extraHTTPHeaders: apiHeaders}},
    {name: 'chromium', use: {...devices['Desktop Chrome'], viewport: DESKTOP_WINDOW}, testIgnore: /\.api\.spec\.ts$/},
    {name: 'firefox', use: {...devices['Desktop Firefox'], viewport: DESKTOP_WINDOW}, testIgnore: /\.api\.spec\.ts$/},
    {name: 'webkit', use: {...devices['Desktop Safari'], viewport: DESKTOP_WINDOW}, testIgnore: /\.api\.spec\.ts$/},
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

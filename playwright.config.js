import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false, // Electron tests need to run sequentially
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1, // Single worker for Electron
  reporter: [
    ['html', { outputFolder: 'playwright-report' }],
    ['list']
  ],
  timeout: 60000,
  expect: {
    timeout: 10000
  },
  use: {
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure'
  },
  projects: [
    {
      name: 'electron',
      testMatch: '**/*.spec.js'
    }
  ]
});

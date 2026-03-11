// @ts-check
import { defineConfig } from '@playwright/test';
import 'dotenv/config';
import EmailReporter from './reporters/email-reporter.cjs';

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  timeout: 600000,
  expect: { timeout: 10000 },
  
  reporter: [['html', { open: 'never' }], ['list'], ['./reporters/email-reporter.cjs']],

  use: {
    baseURL: process.env.BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure', 
    viewport: null, // Full screen
    actionTimeout: 30000,
  },

  projects: [
    {
      name: 'chromium',
      use: {
        viewport: null, 
        launchOptions: { args: ['--start-maximized'] }
      },
    }
  ],
});

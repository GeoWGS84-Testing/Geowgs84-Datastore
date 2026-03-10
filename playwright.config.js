// @ts-check
import { defineConfig } from '@playwright/test'
import 'dotenv/config'

export default defineConfig({
  testDir: './tests',

  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,

  reporter: [
    ['list'],
    ['html'],
    ['./reporters/email-reporter.cjs']
  ],

  use: {
    headless: process.env.CI ? true : false,
    
    // ✅ ENABLE SCREENSHOTS ON FAILURE
    screenshot: 'only-on-failure', 
    
    // ✅ ENABLE VIDEO ON FAILURE
    video: 'retain-on-failure', 
    
    trace: 'on-first-retry',
    // Removed 'viewport: null' from here so project-level viewports take precedence
  },

  projects: [
    {
      name: 'chromium',
      use: {
        storageState: '.auth/user.json',
        viewport: { width: 1920, height: 1080 },
        launchOptions: { args: ['--start-maximized'] }
      } // <--- This closes 'use'
    }, // <--- FIX: This closing brace was missing in your code (closes the project object)
  ],
  
  timeout: 700000
})

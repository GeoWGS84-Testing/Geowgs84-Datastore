// tests/common.js
import { test as base } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { chromium } from 'playwright';
import { setContext, clearContext, clearWarnings, getWarnings, showTestFailure, extractErrorReason, formatArtifactFilename, CONFIG } from '../utils/helpers';

export const VIDEO_DIR = path.join(process.cwd(), 'test-results');

export const test = base.extend({
  page: async ({}, use, testInfo) => {
    // --- MANUAL BROWSER LAUNCH ---
    const browser = await chromium.launch({
      headless: process.env.CI ? true : false,
      slowMo: CONFIG.PW_SLOWMO,
      args: ['--start-maximized']
    });

    if (!fs.existsSync(VIDEO_DIR)) fs.mkdirSync(VIDEO_DIR, { recursive: true });

    const context = await browser.newContext({
      viewport: null,
      recordVideo: { dir: VIDEO_DIR },
      // FIX: Grant geolocation permission globally to suppress system prompts
      permissions: ['geolocation'] 
    });

    const page = await context.newPage();
    // ---------------------------------------------------------

    setContext({ testcase: testInfo.title, testFile: testInfo.file });
    clearWarnings();

    // Original code went to landing in beforeEach
    await page.goto(CONFIG.BASE_URL, { waitUntil: 'domcontentloaded' });

    await use(page);

    // --- TEARDOWN ---
    const needCapture = testInfo.status === 'failed' || testInfo.status === 'timedOut' || getWarnings().length > 0;

    if (needCapture && page && !page.isClosed()) {
      const error = testInfo.error;
      const reason = extractErrorReason(error);
      const errorMessage = error?.message || 'Test failed';
      
      await showTestFailure(page, errorMessage, testInfo.status === 'failed' ? 'FAILURE' : 'WARNING');
      await page.waitForTimeout(1000);

      try {
        await page.evaluate(() => { document.getElementById('pw-banner-container')?.remove(); document.getElementById('pw-layout-spacer')?.remove(); }).catch(() => {});
        const safeName = formatArtifactFilename(testInfo.file, testInfo.title, reason, 'png');
        const screenshotPath = path.join(VIDEO_DIR, safeName);
        await page.screenshot({ path: screenshotPath, fullPage: true });
        testInfo.attachments.push({ name: safeName, path: screenshotPath, contentType: 'image/png' });
      } catch (err) { console.warn('Screenshot capture failed:', err); }
    }

    let videoPath = null;
    try {
      const video = page.video();
      await context.close(); 
      if (video) videoPath = await video.path();
    } catch (e) {}

    if (needCapture && videoPath && fs.existsSync(videoPath)) {
      try {
        const safeName = formatArtifactFilename(testInfo.file, testInfo.title, testInfo.status || 'warning', 'webm');
        const finalVideoPath = path.join(VIDEO_DIR, safeName);
        fs.renameSync(videoPath, finalVideoPath);
        testInfo.attachments.push({ name: safeName, path: finalVideoPath, contentType: 'video/webm' });
      } catch (err) { console.warn('Video rename failed:', err); }
    } else if (!needCapture && videoPath && fs.existsSync(videoPath)) {
      try { fs.unlinkSync(videoPath); } catch (e) {}
    }

    try { await browser.close(); } catch (e) {}
    clearContext();
  }
});

export { expect } from '@playwright/test';
// tests/common.js
import { test as base, expect } from '@playwright/test';
import { 
    setContext, clearContext, getWarnings, clearWarnings, getErrors, clearErrors, 
    getArtifacts, clearArtifacts, persistDiagnosticsSummary 
} from '../utils/helpers';

// Re-export expect for spec files
export { expect }; 

export const test = base.extend({
  // Fixtures can be added here if needed
});

test.beforeEach(async ({ page }, testInfo) => {
  // Reset diagnostics at the start of every test
  clearWarnings();
  clearErrors();
  clearArtifacts();
  setContext({ testcase: testInfo.title, testFile: testInfo.file });
});

test.afterEach(async ({ page }, testInfo) => {
  const warnings = getWarnings();
  const errors = getErrors();
  
  // Determine if the test had issues
  const hasIssues = errors.length > 0 || warnings.length > 0;
  const isFailure = testInfo.status !== 'passed';

  // 1. Attach all saved screenshots (from helpers.js)
  const artifacts = getArtifacts();
  if (artifacts.length > 0) {
      for (const filePath of artifacts) {
          try {
              await testInfo.attach('screenshot', { path: filePath });
          } catch (e) { console.warn('Failed to attach artifact', filePath); }
      }
  }

  // 2. Attach Video ONLY if errors or warnings occurred OR if test failed
  if (hasIssues || isFailure) {
      const videoPath = testInfo.video;
      if (videoPath) {
          try {
              await testInfo.attach('video', { path: videoPath });
              console.log(`[VIDEO ATTACHED] For test: ${testInfo.title}`);
          } catch (e) { 
              console.warn('Failed to attach video', e.message); 
          }
      }
  }

  // 3. Persist summary for email reporting
  persistDiagnosticsSummary({ 
      status: testInfo.status, 
      duration: testInfo.duration,
      videoPath: testInfo.video
  });

  clearContext();
});
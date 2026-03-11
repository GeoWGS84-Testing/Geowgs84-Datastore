// pages/SatellitePage.js
import { expect } from '@playwright/test';
import { BasePage } from './BasePage';
import { 
  setContext, logInfo, addWarning, highlight, fastWait, clickWhenVisible, waitForAndHighlight, 
  getInnerTextSafe, saveMapScreenshot, saveOutlineData, waitForMapOverlayForScene, 
  annotateElementLabel, removeAnnotationLabels, OUTLINE_WAIT_MS, PREVIEW_WAIT_MS, 
  DETAILS_IMAGE_WAIT_MS, bboxIntersects 
} from '../utils/helpers';

export class SatellitePage extends BasePage {
  constructor(page) {
    super(page);
    // Locators matching original 'Locators' object
    this.sidebar = page.locator('nav.side-menu.sidebar');
    this.satelliteSection = page.locator('#satellite');
    this.tableSatellite = page.locator('#table_satellite');
    this.scenesTable = page.locator('#tbl_satellite_scenes');
    this.scenesRows = page.locator('#tbl_satellite_scenes tbody tr');
    this.sceneDetailModal = page.locator('#SceneDetailModal, .modal.show');
    this.sceneDetailImage = page.locator('#SceneDetailModal #img_scene, .modal.show #img_scene');
    this.sceneDetailDataTable = page.locator('#SceneDetailModal #tbl_details, .modal.show #tbl_details');
  }

  async openSatelliteSection() {
    const sidebar = this.sidebar;
    try { await expect(sidebar).toBeVisible({ timeout: 10000 }); } catch (e) { addWarning('Sidebar not visible'); return false; }
    await this.highlight(sidebar, { forceOutlineOnly: true });
    
    const sat = this.satelliteSection;
    try { await expect(sat).toBeVisible({ timeout: 10000 }); } catch (e) { addWarning('#satellite section not visible'); return false; }
    await this.highlight(sat);
    await this.annotate(sat, 'Open Satellite', 1000);
    await sat.click();
    await this.fastWait(500);
    return true;
  }

  async waitForSatelliteTable(timeout = 180000) {
    const table = this.tableSatellite;
    try { 
      await table.waitFor({ state: 'visible', timeout }); 
      await this.highlight(table); 
      return true; 
    } catch (err) { 
      addWarning(`table did not appear after ${Math.round(timeout/1000)}s`); 
      return false; 
    }
  }

  async selectProduct(productName) {
    setContext({ flow: 'productSelection', product: productName });
    const productCell = this.page.locator('#table_satellite td div', { hasText: productName }).first();
    if (await productCell.count() === 0) { addWarning(`Product "${productName}" not found`); return false; }
    await this.highlight(productCell);
    await productCell.click();
    return true;
  }

  async waitForScenesTable(timeout = 120000) {
    setContext({ flow: 'waitScenesTable' });
    logInfo(`Waiting for scenes table (timeout: ${timeout}ms)`);
    await this.scenesTable.waitFor({ state: 'visible', timeout }).catch(() => null);
    const start = Date.now();
    while (Date.now() - start < timeout) {
      const rowCount = await this.scenesRows.count().catch(() => 0);
      if (rowCount > 0) { logInfo(`Scenes table loaded with ${rowCount} row(s)`); return true; }
      await this.fastWait(500);
    }
    addWarning('Scenes table visible but no rows found within timeout');
    return false;
  }

  async getSceneIdFromRow(rowLocator) {
    try {
      const idAttrHandle = await rowLocator.locator('td input[type="image"]').first().elementHandle();
      if (idAttrHandle) {
        const idAttr = await idAttrHandle.getAttribute('id');
        if (idAttr) {
          const firstDash = idAttr.indexOf('-');
          if (firstDash === -1) return idAttr;
          return idAttr.slice(firstDash + 1);
        }
      }
      const txt = await getInnerTextSafe(rowLocator);
      const m = txt.match(/[A-Z0-9]{10,}/i);
      if (m) return m[0];
      return '';
    } catch (e) { return ''; }
  }

  async clickRowButtonRobust(row, buttonLocator) {
    try { 
      await buttonLocator.first().scrollIntoViewIfNeeded(); 
      await buttonLocator.first().click(); 
      return true; 
    } catch (err) {
      try { 
        await buttonLocator.first().click({ force: true }); 
        return true; 
      } catch (err2) {
        const clicked = await row.evaluate((r) => {
          const btn = r.querySelector('input[title="show scene outline"], input[title*="preview"], input[title*="Show scene details"], input[value="Details"], button[title*="outline"], button[title*="preview"], button[title*="details"], button:has-text("Details")');
          if (!btn) return false; 
          try { btn.click(); return true; } catch { return false; }
        });
        return !!clicked;
      }
    }
  }

  async processScene(row, sceneIndex = 0, opts = {}) {
    const rowText = await getInnerTextSafe(row);
    await this.showStep(`Processing scene: ${rowText}`);
    await this.highlight(row);
    const sceneId = await this.getSceneIdFromRow(row);
    if (!sceneId) addWarning(`Could not parse sceneId for scene row: ${rowText}`);

    setContext({ flow: 'sceneProcessing', scene: sceneId });

    // --- OUTLINE LOGIC (clickOutlineAndHandle) ---
    const outlineBtn = row.locator('input[title="show scene outline"], input[title*="show scene outline"], button[title*="outline"], button[title*="Show outline"]');
    let outlineResult = null;
    
    if (await outlineBtn.count() > 0) {
        await this.highlight(outlineBtn.first());
        const clicked = await this.clickRowButtonRobust(row, outlineBtn);
        if (clicked) {
            await this.showStep(`Waiting for outline overlay for ${sceneId || rowText}`);
            outlineResult = await waitForMapOverlayForScene(this.page, sceneId, OUTLINE_WAIT_MS);
            if (outlineResult) {
                await this.showStep(`Outline detected (${outlineResult.type}) for ${sceneId || rowText}`);
                try { await annotateElementLabel(this.page, outlineResult.locator, 'OUTLINE', { border: '2px solid rgba(0,120,255,0.95)' }); } catch {}
                await this.page.waitForTimeout(10000); // Stabilization
                await saveOutlineData(this.page, sceneId || `row${sceneIndex+1}`, outlineResult);
                await saveMapScreenshot(this.page, sceneId || `row${sceneIndex+1}`, 'outline_stabilized', false);
                try { await this.page.waitForTimeout(1200); await removeAnnotationLabels(this.page); } catch {}
            } else {
                addWarning(`No map change detected after clicking outline for ${sceneId || rowText}`);
                await saveMapScreenshot(this.page, sceneId || `row${sceneIndex+1}`, 'outline_missing', true);
            }
        } else {
            addWarning(`Failed to click outline button for ${sceneId || rowText}`);
        }
    }

    // --- PREVIEW LOGIC (clickPreviewAndHandle) ---
    const previewBtn = row.locator('input[title="Show scene preveiw"], input[title*="preview"], input[title*="preveiw"], button[title*="preview"], button[title*="Show preview"]');
    let previewImageSrc = '';
    
    if (await previewBtn.count() > 0) {
        await this.highlight(previewBtn.first());
        const clickedPreview = await this.clickRowButtonRobust(row, previewBtn);
        if (clickedPreview) {
            await this.page.waitForTimeout(10000); // Wait for image load
            const previewShown = await waitForMapOverlayForScene(this.page, sceneId, PREVIEW_WAIT_MS);
            if (previewShown) {
                 // Extract src
                 try {
                    const tag = await previewShown.locator.evaluate(e => e.tagName && e.tagName.toLowerCase());
                    if (tag === 'img') previewImageSrc = await previewShown.locator.getAttribute('src') || '';
                    else {
                        const nested = previewShown.locator.locator('img').first();
                        if (await nested.count() > 0) previewImageSrc = await nested.getAttribute('src') || '';
                    }
                 } catch {}

                 await this.highlight(previewShown.locator, { borderColor: 'rgba(0,200,120,0.95)', pause: 700 });
                 await annotateElementLabel(this.page, previewShown.locator, 'PREVIEW', { border: '2px solid rgba(0,200,120,0.95)' });
                 await saveMapScreenshot(this.page, sceneId || `row${sceneIndex+1}`, 'preview_success', false);

                 // Validation (Simple vs Normal)
                 if (opts.simpleVerify) {
                    try {
                        let imgEl = previewShown.locator;
                        const tag = await imgEl.evaluate(e => e.tagName && e.tagName.toLowerCase()).catch(() => null);
                        if (tag !== 'img') imgEl = imgEl.locator('img').first();
                        if (await imgEl.count() > 0) {
                             const loaded = await imgEl.evaluate(i => !!(i.complete && i.naturalWidth && i.naturalWidth > 0)).catch(() => false);
                             if (!loaded) addWarning(`Preview image not fully loaded for ${sceneId}`);
                        }
                    } catch {}
                 } else {
                    // Normal validation: Check bbox overlap
                    if (outlineResult && outlineResult.bbox && previewShown.bbox) {
                         const intersects = bboxIntersects(outlineResult.bbox, previewShown.bbox, 0.05);
                         if (!intersects) addWarning(`Preview overlay bbox does NOT overlap outline bbox for ${sceneId || rowText}`);
                    }
                 }
                 try { await this.page.waitForTimeout(900); await removeAnnotationLabels(this.page); } catch {}
            } else {
                addWarning(`No preview overlay detected for ${sceneId || rowText}`);
                await saveMapScreenshot(this.page, sceneId || `row${sceneIndex+1}`, 'preview_missing', true);
            }
        } else {
             addWarning(`Failed to click preview button for ${sceneId || rowText}`);
        }
    }

    // --- DETAILS LOGIC (clickDetailsAndHandle) ---
    const detailsBtn = row.locator('input[title="Show scene details"], input[value="Details"], button[title*="details"], button:has-text("Details")');
    if (await detailsBtn.count() > 0) {
        await this.highlight(detailsBtn.first());
        const clickedDetails = await this.clickRowButtonRobust(row, detailsBtn);
        if (clickedDetails) {
            const modal = this.sceneDetailModal;
            try {
                await modal.waitFor({ state: 'visible', timeout: 25000 });
                await this.highlight(modal, { borderColor: 'rgba(0,120,255,0.95)', pause: 900 });
                await this.page.waitForTimeout(10000); // Wait for images
                const img = this.sceneDetailImage;
                
                await expect(img).toBeVisible({ timeout: DETAILS_IMAGE_WAIT_MS });
                const src = (await img.getAttribute('src')) || '';
                await this.showStep(`Details image validated for ${sceneId}`);
                
                // Simple verify check
                if (opts.simpleVerify) {
                     const loaded = await img.evaluate(i => !!(i.complete && i.naturalWidth && i.naturalWidth > 0)).catch(() => false);
                     if (!loaded) addWarning(`Detail image not fully loaded for ${sceneId}`);
                } else {
                     // Normal: Check SceneId in src
                     if (sceneId && src && !src.includes(sceneId)) addWarning(`Detail img src does not contain sceneId`);
                     
                     // Check match with preview
                     if (previewImageSrc && src) {
                         const pBase = previewImageSrc.split('/').pop();
                         const dBase = src.split('/').pop();
                         if (pBase !== dBase) addWarning(`Preview and Detail image filenames mismatch`);
                     }
                }

                // Data table check
                try {
                    const dataTable = this.sceneDetailDataTable;
                    await expect(dataTable).toBeVisible({ timeout: 8000 });
                    await this.highlight(dataTable, { borderColor: 'rgba(200,120,0,0.95)', pause: 700 });
                } catch { addWarning('Details data table missing'); }

                // Close
                await modal.locator('button:has-text("Close"), .btn-danger, button.close').first().click();
                await modal.waitFor({ state: 'hidden', timeout: 8000 });
            } catch (e) { 
                addWarning(`SceneDetailModal did not appear for ${sceneId || rowText}`); 
            }
        } else {
            addWarning(`Failed to click details button for ${sceneId || rowText}`);
        }
    }

    // --- CLEANUP UI OVERLAYS (From original processScene wrapper) ---
    try {
        // Toggle preview/outline buttons to remove overlays from map
        const pBtn = row.locator('input[title="Show scene preveiw"], input[title*="preview"], input[title*="preveiw"], button[title*="preview"], button[title*="Show preview"]');
        const oBtn = row.locator('input[title="show scene outline"], input[title*="show scene outline"], button[title*="outline"], button[title*="Show outline"]');
        if (await pBtn.count() > 0) { await this.clickRowButtonRobust(row, pBtn); await this.page.waitForTimeout(900); }
        if (await oBtn.count() > 0) { await this.clickRowButtonRobust(row, oBtn); await this.page.waitForTimeout(900); }
    } catch (e) {}
  }
}
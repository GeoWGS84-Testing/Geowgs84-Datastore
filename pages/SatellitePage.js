// pages/SatellitePage.js
import { expect } from '@playwright/test';
import { BasePage } from './BasePage';
import { 
  setContext, logInfo, addWarning, highlight, fastWait, clickWhenVisible, waitForAndHighlight, 
  getInnerTextSafe, saveMapScreenshot, annotateElementLabel, removeAnnotationLabels, 
  OUTLINE_WAIT_MS, PREVIEW_WAIT_MS, DETAILS_IMAGE_WAIT_MS, waitForPreviewImageOnMap 
} from '../utils/helpers';

export class SatellitePage extends BasePage {
  constructor(page) {
    super(page);
    
    // --- Main Containers ---
    this.satelliteSectionWrapper = page.locator('#div_satellite');
    
    // --- Product List Selectors ---
    this.productTable = page.locator('#table_satellite');
    
    // --- Scenes Table Selectors ---
    this.scenesTableWrapper = page.locator('#tbl_satellite_scenes_wrapper.dataTables_wrapper');
    this.scenesTable = page.locator('#tbl_satellite_scenes');
    this.scenesRows = this.scenesTable.locator('tbody tr');

    // --- Detail Modal Selectors ---
    this.sceneDetailModal = page.locator('.modal-content:has(#img_scene)');
    this.sceneDetailImage = page.locator('#img_scene');
    this.sceneDetailDataTable = page.locator('#tbl_details');
  }

  // --- Satellite Section ---

 async openSatelliteSection() {
    setContext({ flow: 'openSatellite' });
    
    // 1. Highlight Sidebar
    const sidebar = this.page.locator('nav.side-menu');
    try {
      if (await sidebar.count() > 0) {
        await highlight(this.page, sidebar);
      }
    } catch (e) {
      // Ignore if sidebar highlight fails
    }

    // 2. Open Satellite Section
    const satelliteHeader = this.page.locator('#satellite');
    
    await satelliteHeader.waitFor({ state: 'visible', timeout: 10000 });
    await highlight(this.page, satelliteHeader);
    
    await satelliteHeader.click();
    await fastWait(this.page, 500);
    
    await this.productTable.waitFor({ state: 'visible', timeout: 10000 });
    logInfo('Satellite section opened and product table visible');
  }

  async waitForSatelliteTable() {
    try {
      // 180s timeout as per requirements
      await this.productTable.waitFor({ state: 'visible', timeout: 180000 });
      logInfo('Product table loaded');
    } catch (e) {
      addWarning('Product table did not appear within 180 seconds.');
      throw e;
    }
  }

  // --- Product Selection ---
 async selectProduct(productName) {
    setContext({ flow: 'selectProduct', details: { product: productName } });
    
    const productCell = this.productTable.locator(`div[id="${productName}"]`).first();
    const productCellByText = this.productTable.locator(`div`, { hasText: productName }).first();

    try {
        if (await productCell.count() > 0) {
            await highlight(this.page, productCell);
            await productCell.click();
        } else if (await productCellByText.count() > 0) {
            await highlight(this.page, productCellByText);
            await productCellByText.click();
        } else {
            addWarning(`Product "${productName}" not found in product table.`);
            return false;
        }
    } catch (e) {
        addWarning(`Failed to click product "${productName}": ${e.message}`);
        return false;
    }

    logInfo(`Clicked product: ${productName}`);
    
    await this.scenesTableWrapper.waitFor({ state: 'visible', timeout: 15000 }).catch(() => {
        addWarning('Scenes table wrapper did not become visible after selecting product');
    });
    
    return true;
  }

  // --- Scenes Table ---
  async waitForScenesTable() {
    setContext({ flow: 'waitScenesTable' });
    logInfo('Waiting for scenes table to populate...');

    await this.scenesTableWrapper.waitFor({ state: 'visible', timeout: 120000 });

    try {
        await this.scenesRows.first().waitFor({ state: 'visible', timeout: 10000 });
        const count = await this.scenesRows.count();
        logInfo(`Scenes table loaded with ${count} row(s)`);
        return true;
    } catch (e) {
        addWarning('Scenes table visible but no rows found.');
        return false;
    }
  }

  // --- Robust Helper Methods ---
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

  // --- Scene Processing ---
 async processScene(row, sceneIndex = 0, opts = {}) {
    const rowText = await getInnerTextSafe(row);
    await this.showStep(`Processing scene: ${rowText}`);
    await highlight(this.page, row);

    const sceneId = await this.getSceneIdFromRow(row);
    if (!sceneId) addWarning(`Could not parse sceneId for scene row: ${rowText}`);

    setContext({ flow: 'sceneProcessing', scene: sceneId });

    // ==========================================================
    // 1. OUTLINE LOGIC (Click Only, No Validation)
    // ==========================================================
    
    const outlineBtn = row.locator('input[title="show scene outline"]');
    
    if (await outlineBtn.count() > 0) {
        await highlight(this.page, outlineBtn.first());
        const currentState = await outlineBtn.first().getAttribute('value');
        logInfo(`Outline button found. Current state: ${currentState}`);

        // If value is "Show", click to show outline. 
        // If "Hide", assume it's already showing.
        if (currentState === 'Show') {
            await this.showStep(`Clicking 'Show' outline for ${sceneId || rowText}`);
            await this.clickRowButtonRobust(row, outlineBtn);
            // We click, but we do NOT wait for the map overlay to appear or validate it.
            // Small pause to ensure click is registered
            await this.page.waitForTimeout(500);
        } else {
            logInfo(`Outline already active (state: ${currentState}) for ${sceneId || rowText}`);
        }
    }

    // ==========================================================
    // 2. PREVIEW LOGIC
    // ==========================================================
    const previewBtn = row.locator('input[title="Show scene preveiw"], input[title*="preview"], input[title*="preveiw"]');
    let previewImageSrc = '';
    
    if (await previewBtn.count() > 0) {
        await highlight(this.page, previewBtn.first());
        const clickedPreview = await this.clickRowButtonRobust(row, previewBtn);
        if (clickedPreview) {
            await this.showStep(`Waiting 15s for preview image to appear...`);
            await this.page.waitForTimeout(15000);
            
            const previewImgLocator = await waitForPreviewImageOnMap(this.page, sceneId, PREVIEW_WAIT_MS);
            
            if (previewImgLocator) {
                 try {
                    previewImageSrc = await previewImgLocator.getAttribute('src') || '';
                    logInfo(`Preview image found: ${previewImageSrc}`);
                 } catch {}

                 try {
                    await highlight(this.page, previewImgLocator, { borderColor: 'rgba(0, 200, 120, 0.95)', pause: 1500 });
                    await annotateElementLabel(this.page, previewImgLocator, 'PREVIEW');
                 } catch {}

                 await saveMapScreenshot(this.page, sceneId || `row${sceneIndex+1}`, 'preview_highlighted', false);
                 try { await removeAnnotationLabels(this.page); } catch {}
            } else {
                addWarning(`No preview image detected for ${sceneId || rowText}`);
                await saveMapScreenshot(this.page, sceneId || `row${sceneIndex+1}`, 'preview_missing', true);
            }
        }
    }

    // ==========================================================
    // 3. DETAILS LOGIC (Wait & Compare)
    // ==========================================================
    const detailsBtn = row.locator('input[title="Show scene details"], input[value="Details"]');
    if (await detailsBtn.count() > 0) {
        await highlight(this.page, detailsBtn.first());
        const clickedDetails = await this.clickRowButtonRobust(row, detailsBtn);
        if (clickedDetails) {
            const modal = this.sceneDetailModal;
            try {
                await modal.waitFor({ state: 'visible', timeout: 25000 });
                
                await this.showStep(`Waiting 5s for details data to load...`);
                await this.page.waitForTimeout(5000);

                await highlight(this.page, modal, { borderColor: 'rgba(255, 165, 0, 0.95)', pause: 500 });
                
                const img = this.sceneDetailImage;
                await expect(img).toBeVisible({ timeout: DETAILS_IMAGE_WAIT_MS });
                
                await highlight(this.page, img, { borderColor: 'orange', pause: 500 });
                const detailSrc = (await img.getAttribute('src')) || '';
                logInfo(`Detail image src: ${detailSrc}`);

                // --- VALIDATION: Compare Detail vs Preview ---
                if (previewImageSrc && detailSrc) {
                    const previewFile = previewImageSrc.split('/').pop().split('?')[0];
                    const detailFile = detailSrc.split('/').pop().split('?')[0];
                    
                    const idInPreview = previewImageSrc.includes(sceneId);
                    const idInDetail = detailSrc.includes(sceneId);

                    if (sceneId && idInPreview && idInDetail) {
                        logInfo(`PASS: Both Preview and Detail images match Scene ID ${sceneId}`);
                    } else if (previewFile === detailFile) {
                        logInfo(`PASS: Preview and Detail filenames match exactly.`);
                    } else {
                        addWarning(`MISMATCH: Preview (${previewFile}) vs Detail (${detailFile}) for ${sceneId}`);
                    }
                } else {
                    addWarning(`Could not compare images: Preview src missing or Detail src missing.`);
                }

                await modal.locator('button.close, button.btn-danger').first().click();
                await modal.waitFor({ state: 'hidden', timeout: 8000 });
            } catch (e) { 
                addWarning(`SceneDetailModal did not appear for ${sceneId || rowText}`); 
            }
        }
    }
  }


}
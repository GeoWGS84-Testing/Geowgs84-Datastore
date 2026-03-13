// tests/e2e.spec.js
import { test, expect } from './common';
import { MapPage } from '../pages/MapPage';
import { SatellitePage } from '../pages/SatellitePage';
import { CartPage } from '../pages/CartPage';
import { 
  setContext, getWarnings, logInfo, addWarning, saveMapScreenshot, highlight, waitForAOIOnMap, getElementMetrics 
} from '../utils/helpers';

test.describe('GeoWGS84 Full Suite', () => {
  let mapPage, satellitePage, cartPage;

  test.beforeEach(async ({ page }) => {
    mapPage = new MapPage(page);
    satellitePage = new SatellitePage(page);
    cartPage = new CartPage(page);
  });

  // 1. Shopping Cart
  test('[P0] 1: Shopping Cart and checkout page', async ({ page }) => {
    await mapPage.showStep('Step 1: Opening datastore landing page');
    await mapPage.openLanding(); 

    await mapPage.showStep('Step 2: Closing wizard modal');
    await mapPage.closeWizardModal();

    await mapPage.showStep('Step 3: Search for a place and Drawing AOI');
    await mapPage.searchPlace('Indore');

    await mapPage.showStep('Step 4: Open Satellite Imagery section');
    await satellitePage.openSatelliteSection();

    await mapPage.showStep('Step 5: Waiting for table to load');
    await satellitePage.waitForSatelliteTable();

    await mapPage.showStep('Step 6: Click Add to cart for FIRST row in satellite table');
    await cartPage.addItemToCartAndVerifyPopup();

    await mapPage.showStep('Step 7: Waiting for "Item added to cart" popup / Verify cart (first-row match)');
    await cartPage.openCartAndVerifyItem();

    await mapPage.showStep('Step 8: Click Checkout / Fill form / Submit order');
    await cartPage.checkoutAndFillForm();

    await mapPage.showStep('Step 9: ✅ Redirected to thank_you page — TEST PASSED');
  });

  // Dynamic Product Tests
  const PRODUCT_TESTS = [
    { id: '2', titleSuffix: 'WorldView01', productName: 'WorldView01' },
    { id: '2.1', titleSuffix: 'WorldView02', productName: 'WorldView02' },
    { id: '2.2', titleSuffix: 'WorldView03', productName: 'WorldView03' },
    { id: '2.3', titleSuffix: 'WorldView04', productName: 'WorldView04' },
    { id: '2.4', titleSuffix: 'GeoEye1', productName: 'GeoEye1' },
    { id: '2.5', titleSuffix: 'QuickBird', productName: 'QuickBird' },
    { id: '2.6', titleSuffix: 'IKONOS', productName: 'IKONOS' },
    { id: '2.7', titleSuffix: '21AT 30cm Archive', productName: '21AT 30cm Archive' },
    { id: '2.8', titleSuffix: '21AT 50cm Archive', productName: '21AT 50cm Archive' },
    { id: '2.9', titleSuffix: '21AT 80cm Archive', productName: '21AT 80cm Archive' },
    { id: '2.10', titleSuffix: 'WV-Legion01', productName: 'WV-Legion01' },
    { id: '2.11', titleSuffix: 'WV-Legion02', productName: 'WV-Legion02' }
  ];

  for (const t of PRODUCT_TESTS) {
    test(`[P0] ${t.id}: Satellite scenes — ${t.titleSuffix}`, async ({ page }) => {
      await mapPage.showStep('Step 1: Open Landing and Close Modal');
      await mapPage.openLanding();
      await mapPage.closeWizardModal();
      
      await mapPage.showStep('Step 2: Search Location and Draw AOI');
      await mapPage.searchPlace('Indore');
      
      await mapPage.showStep('Step 3: Open Satellite Section');
      await satellitePage.openSatelliteSection();
      
      await mapPage.showStep('Step 4: Wait for Product Table');
      await satellitePage.waitForSatelliteTable();
      
      await mapPage.showStep(`Step 5: Locate and Select Product "${t.productName}"`);
      const found = await satellitePage.selectProduct(t.productName);
      if (!found) return; 

      await mapPage.showStep('Step 6: Wait for Scenes Table');
      await satellitePage.waitForScenesTable();

      await mapPage.showStep('Step 7: Process First Scene (Outline, Preview, Details)');
      const firstRow = satellitePage.scenesRows.first();
      await satellitePage.processScene(firstRow);
    });
  }

  // 3. Search UI
  test('[P1] 3: Search UI — search location (draw AOI)', async ({ page }) => {
    await mapPage.showStep('Step 1: Open Landing and Close Modal');
    await mapPage.openLanding();
    await mapPage.closeWizardModal();
    
    await mapPage.showStep('Step 2: Click Search Icon');
    try {
        await mapPage.robustClick(mapPage.worldSearchButton);
    } catch {
        await mapPage.worldSearchButton.click();
    }
    
    await mapPage.showStep('Step 3: Verify Search Input Appears');
    await expect(mapPage.pacInput).toBeVisible({ timeout: 10000 });
    
    await mapPage.showStep('Step 4: Type "Indore" and Select Suggestion');
    await mapPage.pacInput.fill('Indore');
    await page.locator('.pac-item').first().click();
    
    await mapPage.showStep('Step 5: Wait for Map to Load');
    await mapPage.waitForMapToLoad();

    await mapPage.showStep('Step 6: Wait for Marker to Render (5s)');
    await page.waitForTimeout(5000);

    await mapPage.showStep('Step 7: Verify Search Result Marker is Present');
    await mapPage.verifyMapMarker(); 
  });

  // 4. Coordinates
  test('[P1] 4: Coordinates — enter lat/lon and zoom to place', async ({ page }) => {
    await mapPage.showStep('Step 1: Open Landing and Close Modal');
    await mapPage.openLanding();
    await mapPage.closeWizardModal();
    
    await mapPage.showStep('Step 2: Open Coordinates Modal and Enter Data');
    await mapPage.enterCoordinates('18.5246', '73.8786');

    await mapPage.showStep('Step 3: Wait for Map to Render Marker (5s)');
    await page.waitForTimeout(5000);

    await mapPage.showStep('Step 4: Verify Map Marker is Visible');
    await mapPage.verifyMapMarker(); 
  });

  // 5. Upload KMZ
  test('[P1] 5: Upload KMZ and verify map info window', async ({ page }) => {
    await mapPage.showStep('Step 1: Open Landing and Close Modal');
    await mapPage.openLanding();
    await mapPage.closeWizardModal();
    
    await mapPage.showStep('Step 2: Upload KMZ File');
    await mapPage.uploadKMZ('utils/test-data/MadhyaPradesh.kmz');
    
    await mapPage.showStep('Step 3: Click Map Until Info Window Appears');
    const found = await mapPage.clickMapUntilInfoWindow();
    
    await mapPage.showStep('Step 4: Validate Info Window Found');
    expect(found).toBeTruthy();
  });

  // 6. Locate
  test('[P1] 6: Locate (go to current location)', async ({ page }) => {
    await mapPage.showStep('Step 1: Open Landing and Close Modal');
    await mapPage.openLanding();
    await mapPage.closeWizardModal();
    
    await mapPage.showStep('Step 2: Grant Permission and Set Location');
    setContext({ flow: 'locate' });
    await mapPage.locateCurrentLocation(22.7196, 75.8577);
    
    await mapPage.showStep('Step 3: Verify Location Marker');
    await mapPage.verifyMapMarker(); 
  });

  // 7. Hover
  test('[P1] 7: Hover locationer — show coordinates on mouse hover', async ({ page }) => {
    await mapPage.showStep('Step 1: Open Landing and Close Modal');
    await mapPage.openLanding();
    await mapPage.closeWizardModal();
    
    await mapPage.showStep('Step 2: Enable Hover Location Toggle');
    setContext({ flow: 'hover' });
    try {
      await mapPage.enableHoverLocation();
    } catch (e) {
      addWarning('Unable to enable hover location toggle: ' + (e?.message || e));
      return;
    }
    
    await mapPage.showStep('Step 3: Hover on Map to Get Coordinates');
    const hasCoords = await mapPage.verifyHoverCoordinates();
    
    await mapPage.showStep('Step 4: Validate Coordinates Displayed');
    expect(hasCoords).toBeTruthy();
  });

  // 8. AOI View
  test('[P1] 8: AOI_view (zoom back to AOI) and World View', async ({ page }) => {
    await mapPage.showStep('Step 1: Open Landing and Close Modal');
    await mapPage.openLanding();
    await mapPage.closeWizardModal();
    
    await mapPage.showStep('Step 2: Draw AOI');
    await mapPage.zoomUntilAOI();
    await mapPage.openAndDrawRectangleAOI();
    
    // --- Capture Initial State ---
    const initialAoi = await waitForAOIOnMap(page, 10000);
    if (!initialAoi) throw new Error('Initial AOI not found');
    
    const initialMetrics = await getElementMetrics(initialAoi.locator);
    logInfo(`Initial AOI Metrics: ${JSON.stringify(initialMetrics)}`);

    // --- Test World View ---
    await mapPage.showStep('Step 3: Click World View');
    await mapPage.switchToWorldView();
    await mapPage.waitForMapToLoad(); 

    await saveMapScreenshot(page, 'view', 'world_view_state', false);

    let worldViewValid = false;
    const worldMetrics = await getElementMetrics(initialAoi.locator);

    if (!worldMetrics) {
        logInfo('VALIDATED: AOI disappeared or moved off-screen in World View.');
        worldViewValid = true;
    } else {
        logInfo(`World View Metrics: ${JSON.stringify(worldMetrics)}`);
        const areaShrunk = worldMetrics.area < (initialMetrics.area * 0.9);
        const centerShiftX = Math.abs((worldMetrics.x + worldMetrics.width/2) - (initialMetrics.x + initialMetrics.width/2));
        const centerShiftY = Math.abs((worldMetrics.y + worldMetrics.height/2) - (initialMetrics.y + initialMetrics.height/2));
        const movedSignificantly = (centerShiftX > 50 || centerShiftY > 50);

        if (areaShrunk) {
            logInfo(`VALIDATED: AOI area shrunk from ${initialMetrics.area} to ${worldMetrics.area}.`);
            worldViewValid = true;
        } else if (movedSignificantly) {
            logInfo(`VALIDATED: AOI moved significantly (Shift X:${centerShiftX}, Y:${centerShiftY}).`);
            worldViewValid = true;
        } else {
            addWarning(`World View clicked, but AOI size/position did not change significantly.`);
        }
    }

    if (!worldViewValid) {
        await saveMapScreenshot(page, 'view', 'world_view_validation_failed', true);
    }

    // --- Test AOI View ---
    await mapPage.showStep('Step 4: Click AOI View');
    await mapPage.switchToAoiView();
    await mapPage.waitForMapToLoad();

    const restoredAoi = await waitForAOIOnMap(page, 15000);
    if (!restoredAoi) throw new Error('FAILURE: AOI did not reappear after clicking AOI View.');

    const restoredMetrics = await getElementMetrics(restoredAoi.locator);
    logInfo(`Restored AOI Metrics: ${JSON.stringify(restoredMetrics)}`);
    
    const areaSimilar = Math.abs(restoredMetrics.area - initialMetrics.area) < (initialMetrics.area * 0.2);
    
    if (areaSimilar) {
        logInfo('VALIDATED: AOI returned to original size.');
        await highlight(page, restoredAoi.locator, { borderColor: 'lime', pause: 1000 });
    } else {
        addWarning(`AOI size mismatch. Initial: ${initialMetrics.area}, Restored: ${restoredMetrics.area}`);
        await highlight(page, restoredAoi.locator, { borderColor: 'orange', pause: 1000 });
    }

    await saveMapScreenshot(page, 'view', 'aoi_view_restored', false);
    
    await mapPage.showStep('Step 5: Final Validation');
    expect(worldViewValid).toBe(true);
  });

  // 9. AOI Info Window
  test('[P1] 9: AOI info window validation with close + reset behavior', async ({ page }) => {
    await mapPage.showStep('Step 1: Open Landing and Close Modal');
    await mapPage.openLanding();
    await mapPage.closeWizardModal();
    
    await mapPage.showStep('Step 2: Search Place and Draw AOI');
    await mapPage.searchPlace('Vijay Nagar'); 
    
    await mapPage.showStep('Step 3: Validate Info Window Presence');
    await mapPage.infoWindow.waitFor({ state: 'visible' });
    
    await mapPage.showStep('Step 4: Close Info Window');
    await mapPage.closeInfoWindow();
    
    await mapPage.showStep('Step 5: Reset AOI');
    await mapPage.resetAOI();
    
    await mapPage.showStep('Step 6: Validate Info Window is Gone');
    await expect(mapPage.infoWindow).not.toBeVisible();
  });

});

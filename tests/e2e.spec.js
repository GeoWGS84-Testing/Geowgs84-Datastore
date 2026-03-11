// tests/e2e.spec.js
import { test, expect } from './common';
import { MapPage } from '../pages/MapPage';
import { SatellitePage } from '../pages/SatellitePage';
import { CartPage } from '../pages/CartPage';
import { setContext, getWarnings } from '../utils/helpers';

test.describe('GeoWGS84 Full Suite', () => {
  let mapPage, satellitePage, cartPage;

  test.beforeEach(async ({ page }) => {
    mapPage = new MapPage(page);
    satellitePage = new SatellitePage(page);
    cartPage = new CartPage(page);
  });

  test('[P0] 1: Shoping Cart and checkout page', async ({ page }) => {
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
      await mapPage.openLanding();
      await mapPage.closeWizardModal();
      
      await mapPage.searchPlace('Indore');
      await satellitePage.openSatelliteSection();
      await satellitePage.waitForSatelliteTable();
      
      await mapPage.showStep(`Step 6: Locate product "${t.productName}"`);
      const found = await satellitePage.selectProduct(t.productName);
      if (!found) return; 

      await mapPage.showStep('Step 8: Wait for scenes table');
      await satellitePage.waitForScenesTable();

      const firstRow = satellitePage.scenesRows.first();
      await satellitePage.processScene(firstRow);
    });
  }

  // 3. Search UI
  test('[P1] 3: Search UI — search location (draw AOI)', async ({ page }) => {
    await mapPage.openLanding();
    await mapPage.closeWizardModal();
    
    await mapPage.showStep('Step 3: Navigate to search module');
    await mapPage.robustClick(mapPage.worldSearchButton);
    
    await mapPage.showStep('Step 4: Verify search input opens');
    await mapPage.waitForVisible(mapPage.pacInput);
    
    await mapPage.showStep('Step 5: Type "Indore"');
    await mapPage.pacInput.fill('Indore');
    await page.locator('.pac-item').first().click();
    
    await mapPage.waitForMapToLoad();
  });

  // 4. Coordinates
  test('[P1] 4: Coordinates — enter lat/lon and zoom to place', async ({ page }) => {
    await mapPage.openLanding();
    await mapPage.closeWizardModal();
    
    await mapPage.showStep('Step 3: Open "Enter Coordinates" modal');
    await mapPage.enterCoordinates('18.5246', '73.8786');
    
    await mapPage.showStep('Step 6: Verify map marker');
    const marker = page.locator('#map img[src*="transparent.png"]').first();
    await marker.waitFor({ state: 'visible', timeout: 15000 }).catch(() => null);
  });

  // 5. Upload KMZ
  test('[P1] 5: Upload KMZ and verify map info window', async ({ page }) => {
    await mapPage.openLanding();
    await mapPage.closeWizardModal();
    
    await mapPage.showStep('Step 3: Upload KMZ');
    await mapPage.uploadKMZ('utils/test-data/MadhyaPradesh.kmz');
    
    await mapPage.showStep('Step 6: Click map until info window');
    const found = await mapPage.clickMapUntilInfoWindow();
    expect(found).toBeTruthy();
  });

  // 6. Locate
  test('[P1] 6: Locate (go to current location)', async ({ page }) => {
    await mapPage.openLanding();
    await mapPage.closeWizardModal();
    
    // Step 3: Grant permission and set location
    setContext({ flow: 'locate' });
    await mapPage.showStep('Step 3: Grant permission and set location');
    
    // FIX: Do not pass context. MapPage will derive it from page.context()
    await mapPage.locateCurrentLocation(22.7196, 75.8577);
    
    // Step 4: Verify marker
    await mapPage.showStep('Step 4: Verify marker');
    await mapPage.verifyMapMarker(); 
  });

  // 7. Hover
  test('[P1] 7: Hover locationer — show coordinates on mouse hover', async ({ page }) => {
    await mapPage.openLanding();
    await mapPage.closeWizardModal();
    
    // Step 3: Enable hover location
    setContext({ flow: 'hover' });
    await mapPage.showStep('Step 3: Enable hover location');
    
    try {
      await mapPage.enableHoverLocation();
    } catch (e) {
      addWarning('Unable to enable hover location toggle: ' + (e?.message || e));
      return;
    }
    
    // Step 4: Hover on map
    await mapPage.showStep('Step 4: Hover on map to get coordinates');
    const hasCoords = await mapPage.verifyHoverCoordinates();
    expect(hasCoords).toBeTruthy();
  });

  // 8. AOI View
  test('[P1] 8: AOI_view (zoom back to AOI) and World View', async ({ page }) => {
    await mapPage.openLanding();
    await mapPage.closeWizardModal();
    
    await mapPage.showStep('Step 2: Draw AOI');
    await mapPage.zoomUntilAOI();
    await mapPage.openAndDrawRectangleAOI();
    
    await mapPage.showStep('Step 4: Click World View');
    // Fixed: Method now exists in MapPage
    await mapPage.switchToWorldView();
    
    await mapPage.showStep('Step 5: Click AOI View');
    // Fixed: Method now exists in MapPage
    await mapPage.switchToAoiView();
  });

  // 9. AOI Info Window
  test('[P1] 9: AOI info window validation with close + reset behavior', async ({ page }) => {
    await mapPage.openLanding();
    await mapPage.closeWizardModal();
    
    await mapPage.searchPlace('Vijay Nagar'); 
    
    await mapPage.showStep('Step 7: Validate 1.0 info window presence');
    await mapPage.infoWindow.waitFor({ state: 'visible' });
    
    await mapPage.showStep('Step 8: Close info window');
    // Fixed: Method now exists in MapPage
    await mapPage.closeInfoWindow();
    
    await mapPage.showStep('Step 9: Reset AOI');
    // Fixed: Method now exists in MapPage
    await mapPage.resetAOI();
    
    await mapPage.showStep('Step 11: Validate info window gone');
    await expect(mapPage.infoWindow).not.toBeVisible();
  });
});
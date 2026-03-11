// pages/MapPage.js
import { expect } from '@playwright/test';
import { BasePage } from './BasePage';
import { 
  setContext, logInfo, addWarning, fastWait, highlight, clickWhenVisible, waitForAndHighlight, 
  annotateTemporary, waitForAOIOnMap, saveMapScreenshot, getInnerTextSafe, CONFIG, robustClick 
} from '../utils/helpers';

export class MapPage extends BasePage {
  constructor(page) {
    super(page);
    this.mapContainer = page.locator('#map');
    this.rightNav = page.locator('nav.right-nav');
    this.worldSearchButton = page.locator('#world_search');
    this.pacInput = page.locator('#pac-input');
    this.pacFirstOption = page.locator('.pac-container .pac-item').first();
    this.aoiToolbar = page.locator('[role="menubar"]').filter({
      has: page.locator('img[src*="drawing.png"], img[src*="mapfiles/drawing.png"], img[src*="mapfiles/drawing"]')
    }).first();
    this.sideNavToggle = page.locator('#expandNavbar');
    this.infoWindow = page.locator('.gm-style-iw');
    this.infoWindowContainer = page.locator('.gm-style-iw-chr');
    this.infoWindowCloseButton = page.locator('.gm-style-iw-chr button.gm-ui-hover-effect');
    this.worldViewBtn = page.locator('#world_view');
    this.aoiViewBtn = page.locator('#AOI_view');
    this.deleteAllBtn = page.locator('#delete_all');
    this.uploadNav = page.locator('[data-target="#uploadFilesModal"]');
    this.uploadModal = page.locator('.modal-content:has-text("Upload File")');
    this.fileInput = page.locator('#kml_file_upload');
    this.uploadBtn = page.locator('#kml-upload-btn');
    this.coordsBtn = page.locator('a[data-target="#enterCoordinatesModal"], a[data-toggle="modal"][data-target="#enterCoordinatesModal"]');
    this.coordsModalTitle = page.locator('.modal-content .modal-title, .modal .modal-title').filter({ hasText: 'Enter Coordinates' });
    this.latInput = page.locator('#user_lat, input.lat_coord');
    this.lonInput = page.locator('#user_lon, input.lon_coord');
    this.takeMeBtn = page.locator('#submitCoordinates, button#submitCoordinates, button:has-text("Take Me")');
    this.locateNav = page.locator('#locate');
    this.hoverAnchor = page.locator('#hover_location');
    this.hoverCheckbox = page.locator('#show_hoverLocation');
    this.positionOnHover = page.locator('#position_on_hover');
    this.modalContent = page.locator('.modal.show .modal-content');
    this.closeModalButton = page.locator('.modal.show button.close, .modal.show .close');
  }

  // --- Core Navigation Methods ---

  async openLanding() {
    setContext({ flow: 'landing' });
    try {
      await this.page.goto(CONFIG.BASE_URL, { waitUntil: 'domcontentloaded' });
      await expect(this.page).toHaveURL(/datastore\.geowgs84\.com/i);
      logInfo('Landing page opened');
      return true;
    } catch (e) { 
      addWarning('Failed to open landing: ' + (e?.message || e)); 
      return false; 
    }
  }

  async closeWizardModal() {
    setContext({ flow: 'closeWizard' });
    const modal = await waitForAndHighlight(this.page, () => this.modalContent, 12000);
    if (!modal) return false;
    try {
      await this.highlight(this.closeModalButton, { borderColor: 'red' });
      await this.annotate(this.closeModalButton, 'Close wizard', 900, { border: '2px solid red' });
      await this.closeModalButton.click();
      await expect(this.modalContent).toBeHidden({ timeout: 8000 });
      await this.fastWait(800);
      return true;
    } catch (e) {
      addWarning('Failed to close wizard modal: ' + (e?.message || e));
      try { await this.closeModalButton.click({ force: true }); } catch {}
      return false;
    }
  }

  async ensureSideNavClosed() {
    try {
      const toggle = this.sideNavToggle;
      const visible = await toggle.isVisible().catch(() => false);
      if (!visible) return;
      await this.highlight(toggle, { forceOutlineOnly: true });
      try {
        await this.annotate(toggle, 'Toggle SideNav', 900);
        await toggle.click();
        await this.fastWait(500);
        logInfo('Side navigation toggle clicked once to ensure closure');
      } catch (clickErr) {
        addWarning('SideNav toggle click failed: ' + (clickErr?.message || clickErr));
      }
    } catch (e) {
      addWarning('ensureSideNavClosed failed: ' + (e?.message || e));
    }
  }

  // --- Map Interaction Methods ---

  async waitForMapToLoad(timeout = 20000) {
    const map = this.mapContainer;
    try { await expect(map).toBeVisible({ timeout: Math.min(timeout, 10000) }); } catch { addWarning('Map container not visible'); }

    const waitedForApi = await this.page.evaluate(() => {
      try {
        if (window.map && typeof window.map.once === 'function') return 'leaflet';
        if (window.map && typeof window.map.addListener === 'function') return 'google';
      } catch (e) {}
      return null;
    });

    if (waitedForApi === 'leaflet') { await this.page.evaluate(() => new Promise(resolve => window.map.once('moveend', resolve))).catch(() => {}); await this.fastWait(600); return true; }
    if (waitedForApi === 'google') { await this.page.evaluate(() => new Promise(resolve => window.map.addListener('idle', resolve))).catch(() => {}); await this.fastWait(600); return true; }
    try { await this.page.locator('img[src*="marker"], .map-marker, .leaflet-marker-icon').first().waitFor({ state: 'visible', timeout: Math.min(8000, timeout) }); await this.fastWait(500); return true; } catch (e) {
      await this.page.waitForLoadState('networkidle').catch(() => {});
      await this.fastWait(1000);
      return true;
    }
  }

  async zoomMapNTimes(times = 6) {
    await this.showStep(`Zooming map ${times} times using double-click`);
    const map = this.mapContainer;
    await expect(map).toBeVisible();
    const box = await map.boundingBox();
    if (!box) throw new Error('Map bounding box not found');
    
    for (let i = 0; i < times; i++) {
      const x = box.x + box.width * (0.45 + Math.random() * 0.1);
      const y = box.y + box.height * (0.45 + Math.random() * 0.1);
      await this.page.mouse.dblclick(x, y);
      await this.fastWait(550);
    }
    await this.waitForMapToLoad();
  }

  async zoomUntilAOI(maxAttempts = 12) {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try { await this.aoiToolbar.waitFor({ state: 'visible', timeout: 800 }); return; } catch {}
      await this.zoomMapNTimes(1);
      try { await this.aoiToolbar.waitFor({ state: 'visible', timeout: 1200 }); return; } catch {}
    }
    throw new Error('AOI toolbar never appeared after zooming.');
  }

  async clickDrawRectangleInToolbar(toolbarLocator) {
    await toolbarLocator.waitFor({ state: 'visible', timeout: 30000 });
    const rectBtn = toolbarLocator.locator('button[aria-label="Draw a rectangle"], button[title="Draw a rectangle"], button[aria-label*="rect"], button[title*="rect"]').first();
    
    if (await rectBtn.count() === 0) {
      const html = await toolbarLocator.evaluate(el => el.innerHTML);
      throw new Error('Draw-rectangle button not found inside toolbar. Toolbar HTML (truncated):\n' + html.substring(0, 3000));
    }
    
    try { await rectBtn.scrollIntoViewIfNeeded(); } catch {}
    
    try {
      await this.annotate(rectBtn, 'Draw rectangle', 1000);
      await rectBtn.click({ timeout: 4000 });
    } catch (err) {
      try { 
        await rectBtn.click({ force: true, timeout: 3000 }); 
      } catch (err2) {
        // Final fallback: evaluate direct click
        const clicked = await toolbarLocator.evaluate((toolbarEl) => {
          const btn = toolbarEl.querySelector('button[aria-label="Draw a rectangle"], button[title="Draw a rectangle"], button[aria-label*="rect"], button[title*="rect"]');
          if (!btn) return false;
          try { btn.click(); return true; } catch { return false; }
        });
        if (!clicked) throw new Error('Unable to click draw-rectangle button: ' + (err2 && err2.message ? err2.message : String(err2)));
      }
    }
  }

  async openAndDrawRectangleAOI() {
    setContext({ flow: 'drawAOI' });
    await this.showStep('Waiting for AOI toolbar to appear');
    const toolbar = this.aoiToolbar;
    await toolbar.waitFor({ state: 'visible', timeout: 30000 });
    await this.highlight(toolbar, { forceOutlineOnly: true });
    
    await this.clickDrawRectangleInToolbar(toolbar);
    await this.fastWait(400);
    
    await this.showStep('Drawing rectangle AOI on map');
    const map = this.mapContainer;
    await expect(map).toBeVisible();
    await this.highlight(map);
    
    const box = await map.boundingBox();
    if (!box) {
      addWarning('Map bounding box not found — cannot draw AOI');
      return;
    }
    
    const startX = box.x + Math.round(box.width * 0.25);
    const startY = box.y + Math.round(box.height * 0.30);
    const endX   = box.x + Math.round(box.width * 0.65);
    const endY   = box.y + Math.round(box.height * 0.60);
    
    await this.page.mouse.move(startX, startY);
    await this.page.mouse.down();
    await this.page.mouse.move(endX, endY, { steps: 12 });
    await this.page.mouse.up();
    await this.fastWait(1000);

    // Validate AOI
    await this.showStep('Validating drawn AOI is present on the map');
    const aoi = await waitForAOIOnMap(this.page, 25000);
    if (!aoi) {
      addWarning('Drawn AOI not detected on map after drawing.');
      await saveMapScreenshot(this.page, 'aoi', 'aoi_missing', true);
    } else {
      await this.showStep(`AOI detected (selector: ${aoi.selector || 'unknown'})`);
      logInfo(`AOI detected (selector: ${aoi.selector || 'unknown'})`, { selector: aoi.selector });
      try { await this.highlight(aoi.locator, { borderColor: 'rgba(0,200,120,0.95)', pause: 800 }); } catch {}
    }
  }

  async searchPlace(placeName) {
    setContext({ flow: 'searchPlace', details: { place: placeName } });
    
    const nav = await waitForAndHighlight(this.page, () => this.rightNav, 10000, { forceOutlineOnly: true });
    if (!nav) { addWarning('right nav not visible'); return false; }

    await this.showStep('Selecting search icon');
    if (!await clickWhenVisible(this.page, () => this.worldSearchButton, { timeout: 8000, force: true, annotate: true, label: 'Search' })) return false;

    await this.showStep('Waiting for search input');
    const input = await waitForAndHighlight(this.page, () => this.pacInput, 12000, { label: 'Search input' });
    if (!input) { addWarning('pac-input not visible'); return false; }
    
    await this.showStep(`Typing location: ${placeName}`);
    await input.fill(placeName);

    const match = this.page.locator('.pac-container .pac-item', { hasText: placeName }).first();
    try {
      await expect(match).toBeVisible({ timeout: 12000 });
    } catch (e) {
      addWarning(`Search suggestion for "${placeName}" didn't appear`);
      return false;
    }

    await this.highlight(match);
    try { await this.annotate(match, `Select: ${placeName}`, 1100); } catch {}
    await match.click();
    
    await this.waitForMapToLoad();
    
    try { 
      await this.zoomUntilAOI(); 
    } catch (err) { 
      const msg = 'AOI toolbar never appeared after zoom attempts'; 
      addWarning(msg); 
      return false; 
    }
    
    try { 
      await this.openAndDrawRectangleAOI(); 
    } catch (err) { 
      addWarning(`Unable to draw AOI rectangle: ${err?.message || err}`); 
      return false; 
    }
    
    return true;
  }

  async clickMapUntilInfoWindow() {
    await this.showStep('Attempting clicks on the map until info window appears');
    const infoWindowLocator = this.infoWindow;
    const mapLocator = this.mapContainer;

    try {
      await this.fastWait(800);
      await expect(mapLocator).toBeVisible({ timeout: 15000 });
      await mapLocator.scrollIntoViewIfNeeded();
      try { await this.page.bringToFront(); } catch {} // focusPage replacement

      const box = await mapLocator.boundingBox();
      if (!box) {
        addWarning('Map container bounding box not found');
        return false;
      }

      const maxAttempts = 15;
      let found = false;
      const baseOffsetX = 40;
      const baseOffsetY = 80;

      for (let i = 0; i < maxAttempts; i++) {
        const randomOffsetX = (Math.random() - 0.5) * 150;
        const randomOffsetY = (Math.random() - 0.5) * 120;
        let clickX = Math.round(box.x + box.width / 2 + baseOffsetX + randomOffsetX);
        let clickY = Math.round(box.y + box.height / 2 + baseOffsetY + randomOffsetY);
        clickX = Math.max(2, clickX);
        clickY = Math.max(2, clickY);

        // Mouse movement with steps
        try {
          await this.page.mouse.move(Math.max(0, clickX - 60), Math.max(0, clickY - 60), { steps: 12 });
          await this.page.mouse.move(clickX, clickY, { steps: 8 });
        } catch {}

        // Inject Red Dot Visual
        await this.page.evaluate(({ x, y }) => {
          const dot = document.createElement('div');
          dot.style.position = 'absolute';
          dot.style.left = `${x}px`;
          dot.style.top = `${y}px`;
          dot.style.width = '14px';
          dot.style.height = '14px';
          dot.style.background = 'red';
          dot.style.border = '2px solid white';
          dot.style.borderRadius = '50%';
          dot.style.zIndex = '999999';
          dot.style.pointerEvents = 'none';
          dot.style.boxShadow = '0 4px 12px rgba(0,0,0,0.35)';
          document.body.appendChild(dot);
          setTimeout(() => dot.remove(), 1400);
        }, { x: clickX, y: clickY });

        await this.fastWait(300);

        // Perform Click
        try {
          await this.page.mouse.down();
          await this.fastWait(80);
          await this.page.mouse.up();
        } catch {
          try { await this.page.mouse.click(clickX, clickY); } catch {}
        }

        await this.fastWait(900);

        // SideNav Toggle Check
        try {
          if (await this.sideNavToggle.isVisible().catch(() => false)) {
            await this.highlight(this.sideNavToggle);
            await this.sideNavToggle.click().catch(() => {});
            await this.fastWait(600);
          }
        } catch {}

        // Check for Info Window
        try {
          await infoWindowLocator.waitFor({ state: 'visible', timeout: 1500 });
          found = true;
          await this.highlight(infoWindowLocator);
          break;
        } catch {}
      }

      if (!found) {
        addWarning('Info window (.gm-style-iw) did not appear after multiple clicks');
        return false;
      }
      return true;
    } catch (e) {
      addWarning('Error while trying to trigger info window by clicking map: ' + (e?.message || e));
      return false;
    }
  }

  // --- Helper Methods ---

  async enterCoordinates(lat, lon) {
    setContext({ flow: 'enterCoordinates' });
    await robustClick(this.page, this.coordsBtn);
    
    const modal = this.page.locator('.modal-content:has-text("Enter Coordinates")');
    await modal.waitFor({ state: 'visible' });
    
    await this.latInput.fill(lat);
    await this.lonInput.fill(lon);
    
    await robustClick(this.page, this.takeMeBtn);
    await this.page.waitForTimeout(2000);
  }

  async uploadKMZ(filePath) {
    setContext({ flow: 'upload' });
    await robustClick(this.page, this.uploadNav);
    await this.uploadModal.waitFor({ state: 'visible' });
    await this.fileInput.setInputFiles(filePath);
    await this.uploadBtn.click();
    await this.uploadModal.waitFor({ state: 'hidden', timeout: 20000 }).catch(() => {});
  }

  // --- Methods for Test 6: Locate ---

  async locateCurrentLocation(lat, lon) {
    // FIX: Get context directly from the page object to ensure we are modifying the correct one.
    const context = this.page.context();

    // 1. Grant Permissions (Force it before any interaction)
    try {
      await context.grantPermissions(['geolocation'], { origin: CONFIG.BASE_URL });
    } catch (e) {
      try { await context.grantPermissions(['geolocation']); } catch {}
    }

    // 2. Set Geolocation (The "Dummy" Location)
    try { 
        await context.setGeolocation({ latitude: lat, longitude: lon, accuracy: 50 }); 
    } catch (e) { 
        addWarning('Could not set geolocation on context: ' + (e?.message || e)); 
    }

    // Safety: Ensure side nav is not blocking the locate button
    await this.ensureSideNavClosed();

    // 3. Click Locate Button
    setContext({ flow: 'locateFlow', details: { type: 'currentLocation' } });

    const locateNav = this.locateNav;
    await expect(locateNav).toBeVisible({ timeout: 10000 });
    await this.highlight(locateNav);

    const locateLink = locateNav.locator('a').first();
    await expect(locateLink).toBeVisible({ timeout: 5000 });
    await this.highlight(locateLink);

    // Click the locate button
    await Promise.all([
      locateLink.click(),
      fastWait(this.page, 600)
    ]);
    
    // Wait for the map to settle after panning to the new location
    await this.page.waitForLoadState('networkidle').catch(() => {});
  }

  async verifyMapMarker() {
    // Give the map extra time to pan to the dummy location (India) and render the marker
    await this.page.waitForTimeout(3000);
    await this.waitForMapToLoad();

    // Robust selector for the Blue Dot / Current Location Marker
    // We target the image SRC specifically because styles can vary.
    // The HTML provided was: <img src="https://maps.gstatic.com/mapfiles/transparent.png" ...>
    const marker = this.page.locator(
      `#map img[src*="mapfiles/transparent.png"], ` + // Specific source for blue dot
      `#map img[src*="transparent.png"]`              // Fallback
    ).first();

    // Wait for the marker to appear (allow extra time for location acquisition)
    await marker.waitFor({ state: 'visible', timeout: 30000 });
    await this.highlight(marker);
  }

  async enableHoverLocation() {
    // Logic matching original: check anchor first, then checkbox
    const hoverAnchor = this.hoverAnchor;
    const hoverCheckbox = this.hoverCheckbox;

    if (await hoverAnchor.count() > 0 && await hoverAnchor.isVisible().catch(() => false)) {
      await this.highlight(hoverAnchor);
      await robustClick(this.page, hoverAnchor);
      await this.fastWait(300);
    } else if (await hoverCheckbox.count() > 0) {
      await this.highlight(hoverCheckbox);
      try { await hoverCheckbox.check(); } catch { await hoverCheckbox.click(); }
      await this.fastWait(300);
    } else {
      throw new Error('Neither hover anchor nor checkbox found');
    }
  }

 async verifyHoverCoordinates() {
    const mapLocator = this.mapContainer;
    const posLocator = this.positionOnHover;
    
    await expect(mapLocator).toBeVisible({ timeout: 15000 });
    await mapLocator.scrollIntoViewIfNeeded();
    
    const box = await mapLocator.boundingBox();
    if (!box) { addWarning('Map bounding box not found — cannot perform hover test'); return false; }

    // Exact grid offsets from original script
    const gridOffsets = [
      { dx: 0, dy: 0 }, { dx: -100, dy: -60 }, { dx: 100, dy: -60 }, { dx: -100, dy: 60 }, { dx: 100, dy: 60 },
      { dx: -40, dy: 0 }, { dx: 40, dy: 0 }, { dx: 0, dy: -120 }, { dx: 0, dy: 120 }
    ];
    
    let found = false;

    // 1. Grid search
    for (const off of gridOffsets) {
      const targetX = Math.round(box.x + box.width / 2 + off.dx);
      const targetY = Math.round(box.y + box.height / 2 + off.dy);
      try {
        await this.page.mouse.move(Math.max(0, targetX - 30), Math.max(0, targetY - 30), { steps: 10 });
        await this.page.mouse.move(targetX, targetY, { steps: 6 });
      } catch {}
      await this.fastWait(600);
      
      if (await posLocator.count() > 0 && await posLocator.isVisible().catch(() => false)) {
        const txt = (await getInnerTextSafe(posLocator)) || '';
        if (/latitude[:\s]*\d+/i.test(txt) && /longitude[:\s]*\d+/i.test(txt)) {
          found = true;
          await this.highlight(posLocator);
          logInfo('Hover position detected', { text: txt });
          break;
        }
      }
    }

    // 2. Random fallback (from original)
    for (let i = 0; i < 6 && !found; i++) {
      const rx = Math.round(box.x + box.width * (0.3 + Math.random() * 0.4));
      const ry = Math.round(box.y + box.height * (0.3 + Math.random() * 0.4));
      try { await this.page.mouse.move(rx, ry, { steps: 6 }); } catch {}
      await this.fastWait(450);
      
      if (await posLocator.count() > 0 && await posLocator.isVisible().catch(() => false)) {
        const txt = (await getInnerTextSafe(posLocator)) || '';
        if (/latitude[:\s]*\d+/i.test(txt) && /longitude[:\s]*\d+/i.test(txt)) {
          found = true;
          await this.highlight(posLocator);
          logInfo('Hover position detected (random fallback)', { text: txt });
          break;
        }
      }
    }

    if (!found) {
      addWarning('Hover position element (#position_on_hover) did not appear or did not contain coordinates');
      await saveMapScreenshot(this.page, 'hover', 'position_missing', true);
      return false;
    }
    return true;
  }

  async switchToWorldView() {
    await robustClick(this.page, this.worldViewBtn);
    await this.fastWait(1500);
  }

  async switchToAoiView() {
    await robustClick(this.page, this.aoiViewBtn);
    await this.fastWait(1500);
  }

  async closeInfoWindow() {
    if (await this.infoWindowCloseButton.isVisible().catch(() => false)) {
      await robustClick(this.page, this.infoWindowCloseButton);
    }
  }

  async resetAOI() {
    await robustClick(this.page, this.deleteAllBtn);
    await this.fastWait(1500);
  }
}
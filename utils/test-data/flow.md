Here is the detailed breakdown of every test case flow, logic, and condition based on the provided code.

---

### **Global Test Setup & Flow**
Before any test runs, the framework in `tests/common.js` executes a robust setup sequence:
1.  **Browser Launch**: Launches Chromium (Headless in CI, Headed locally) with `--start-maximized`.
2.  **Context Creation**: Creates a browser context with:
    *   **Viewport**: `null` (maximized).
    *   **Video Recording**: Enabled, saving to `test-results`.
    *   **Permissions**: Geolocation permission granted globally to prevent browser permission prompts.
3.  **Pre-Test Navigation**: Navigates to `CONFIG.BASE_URL` (`https://datastore.geowgs84.com`) automatically before passing the `page` object to the test.
4.  **Post-Test Teardown**:
    *   Checks if the test failed or generated warnings.
    *   If failed: Captures a full-page screenshot and renames the video file with the test name/error reason.
    *   If passed: Deletes the video file to save space.

---

### **Test Case 1: `[P0] 1: Shopping Cart and checkout page`**
**Objective**: Validate the end-to-end flow of searching, adding a product to the cart, and checking out.

**Detailed Flow**:
1.  **Landing & Wizard Handling**:
    *   Calls `mapPage.openLanding()` (verifies URL).
    *   Calls `mapPage.closeWizardModal()`: Waits for `.modal-content`, highlights the close button in red, clicks it, and waits for it to disappear.
2.  **Search & AOI Drawing**:
    *   Calls `mapPage.searchPlace('Indore')`.
    *   **Flow**: Clicks Search Icon -> Fills 'Indore' -> Selects Suggestion -> Waits for Map Load -> **Zoom Loop** (Zooms repeatedly until the AOI toolbar appears) -> **Draw Rectangle** (Calculates coordinates relative to map size, performs mouse down/move/up sequence).
3.  **Satellite Section**:
    *   Opens the satellite sidebar.
    *   Waits for the product table to load (up to 180s timeout).
4.  **Add to Cart Logic (`addItemToCartAndVerifyPopup`)**:
    *   Locates the first row in the satellite table.
    *   **Product Name Extraction**: Attempts to find the name in `td:nth-child(2) div`. If not found, it parses the `value` attribute of the input button (handling JSON with single quotes or Regex fallback).
    *   **Interaction**: Highlights row -> Hovers "Add" button -> Annotates "Add to cart" -> Clicks.
    *   **Verification**: Waits for `#popup` -> Checks text contains "Item added to cart" -> Asserts CSS `display: block`.
5.  **Verify Cart Item (`openCartAndVerifyItem`)**:
    *   Asserts Cart Badge text equals "1".
    *   Opens Cart Modal.
    *   Extracts text from the first row of the cart table.
    *   **Validation**: Compares the extracted text with the product name captured in step 4 (`getLastAddedProduct`). Fails if they don't match.
6.  **Checkout (`checkoutAndFillForm`)**:
    *   Clicks Checkout -> Fills form fields (First Name, Last Name, Email, Company, Phone, Street, City, State, Zip, Country, Industry, Description).
    *   **Submission Logic**: Uses `Promise.race` to handle two scenarios simultaneously:
        *   Scenario A: Order opens in a **New Tab** (`context.waitForEvent('page')`).
        *   Scenario B: Order navigates in the **Same Tab** (`page.waitForNavigation`).
    *   **Final Assertion**: Checks if the resulting page URL contains `/thank_you/`.

---

### **Test Case 2 (Loop): `[P0] 2.x: Satellite scenes — [Product Name]`**
**Objective**: Verify satellite imagery scene processing (Outline, Preview, Details) for multiple products (WorldView01, WorldView02, etc.).

**Detailed Flow**:
1.  **Setup**: Standard Landing, Wizard close, Search 'Indore', Open Satellite section.
2.  **Product Selection**:
    *   Locates the product div by ID or Text (e.g., `div[id="WorldView01"]`).
    *   Clicks to load the scenes table.
    *   Waits for the scenes table wrapper to appear.
3.  **Scene Processing (`processScene`)**:
    *   Selects the **first row** of the scenes table.
    *   **Extracts Scene ID**: Parses the ID attribute of the input button or uses Regex on row text.
    *   **1. Outline Logic**:
        *   Finds "Show scene outline" button.
        *   **Action**: Clicks -> **Hard Wait 10s** (Explicit requirement).
        *   **Validation**: Calls `waitForMapOverlayForScene`. Checks if an SVG Path or Canvas appeared on the map.
        *   **Strict Check**: If found, calculates BBox and saves outline data to JSON.
    *   **2. Preview Logic**:
        *   Finds "Show scene preview" button (handles typo "preveiw").
        *   **Action**: Clicks -> **Hard Wait 15s** (Explicit requirement).
        *   **Validation**:
            *   Checks if overlay exists.
            *   Checks if Image is fully loaded (`naturalWidth > 0`).
            *   **Overlap Check**: Calculates BBox of Preview Image vs. Outline BBox. Asserts they intersect by at least 5%.
            *   Saves screenshot of the preview on the map.
    *   **3. Details Logic**:
        *   Finds "Show scene details" button.
        *   **Action**: Clicks -> Waits for Modal.
        *   **Validation**:
            *   Checks Image `src` contains the Scene ID.
            *   **Filename Match**: Compares the filename of the Preview image vs the Detail image (must match).
            *   Checks for Metadata Table presence.
        *   **Cleanup**: Closes the modal.

---

### **Test Case 3: `[P1] 3: Search UI — search location`**
**Objective**: Verify the search input mechanism works correctly.

**Detailed Flow**:
1.  **Setup**: Landing & Wizard close.
2.  **Interaction**:
    *   Clicks the Search Icon (`#world_search`).
    *   Waits for the search input (`#pac-input`) to be visible.
    *   Types "Indore".
    *   Clicks the first suggestion (`.pac-item`).
3.  **Verification**: Waits for the map to finish loading (`waitForMapToLoad`).

---

### **Test Case 4: `[P1] 4: Coordinates — enter lat/lon`**
**Objective**: Verify manual coordinate entry navigates the map.

**Detailed Flow**:
1.  **Setup**: Landing & Wizard close.
2.  **Interaction (`enterCoordinates`)**:
    *   Clicks the "Enter Coordinates" nav button.
    *   Waits for the modal.
    *   Fills Lat: `18.5246`, Lon: `73.8786`.
    *   Clicks "Take Me" button.
3.  **Verification**: Waits for the specific marker image (`img[src*="transparent.png"]`) to appear on the map.

---

### **Test Case 5: `[P1] 5: Upload KMZ and verify map info window`**
**Objective**: Verify file upload triggers map markers and info windows.

**Detailed Flow**:
1.  **Setup**: Landing & Wizard close.
2.  **Upload (`uploadKMZ`)**:
    *   Clicks Upload nav button.
    *   Sets input files to `utils/test-data/MadhyaPradesh.kmz`.
    *   Clicks Upload button.
    *   Waits for modal to close.
3.  **Interaction (`clickMapUntilInfoWindow`)**:
    *   Enters a loop (Max 15 attempts).
    *   **Logic**: Calculates a random click position near the center of the map.
    *   **Visual Debug**: Injects a Red Dot div at the click coordinates to show where the click happened.
    *   **Action**: Mouse down -> Mouse up.
    *   **Check**: Looks for Info Window (`.gm-style-iw`).
    *   **Exit Condition**: If Info Window appears, returns `true`. If loop finishes without Info Window, returns `false`.
4.  **Assertion**: Expects the result of the click loop to be `true`.

---

### **Test Case 6: `[P1] 6: Locate (go to current location)`**
**Objective**: Test the "My Location" functionality using mocked geolocation.

**Detailed Flow**:
1.  **Setup**: Landing & Wizard close.
2.  **Mock Geolocation (`locateCurrentLocation`)**:
    *   **Permissions**: Explicitly grants `geolocation` permission on the browser context.
    *   **Set Location**: Sets the context geolocation to coordinates in India (Lat: 22.7196, Lon: 75.8577).
    *   **Safety**: Closes the side navigation if it blocks the locate button.
    *   **Action**: Clicks the Locate button (`#locate`).
3.  **Verification (`verifyMapMarker`)**:
    *   Waits 3s for map pan.
    *   Waits for map load.
    *   Locates the "Blue Dot" marker using specific selector `img[src*="mapfiles/transparent.png"]`.

---

### **Test Case 7: `[P1] 7: Hover locationer — show coordinates on hover`**
**Objective**: Verify that hovering over the map displays coordinates.

**Detailed Flow**:
1.  **Setup**: Landing & Wizard close.
2.  **Enable Hover (`enableHoverLocation`)**:
    *   Checks if a hover anchor/checkbox exists.
    *   Clicks/Checks it to enable the feature.
3.  **Verification (`verifyHoverCoordinates`)**:
    *   **Grid Search**: Performs a loop of mouse movements across a grid pattern (Center, Corners, Offsets) over the map.
    *   **Check**: After each move, checks if `#position_on_hover` element exists and contains text matching `latitude` and `longitude`.
    *   **Fallback**: If grid fails, performs 6 random hover movements.
    *   **Result**: Returns `true` if coordinates are detected, `false` otherwise.
    *   **Failure Handling**: Takes a screenshot if coordinates are missing.

---

### **Test Case 8: `[P1] 8: AOI_view (zoom back to AOI) and World View`**
**Objective**: Test view switching controls.

**Detailed Flow**:
1.  **Setup**: Landing & Wizard close.
2.  **Draw AOI**:
    *   Zooms until the AOI toolbar appears.
    *   Draws a rectangle AOI.
3.  **World View (`switchToWorldView`)**:
    *   Clicks `#world_view` button.
    *   Waits 1.5s (assumes map zooms out to global view).
4.  **AOI View (`switchToAoiView`)**:
    *   Clicks `#AOI_view` button.
    *   Waits 1.5s (assumes map zooms back to the drawn rectangle).

---

### **Test Case 9: `[P1] 9: AOI info window validation`**
**Objective**: Verify the info window associated with an AOI and the reset functionality.

**Detailed Flow**:
1.  **Setup**: Landing & Wizard close.
2.  **Search**: Searches for "Vijay Nagar" (this draws an AOI and zooms in).
3.  **Validation 1**: Waits for the Info Window (`.gm-style-iw`) to be visible.
4.  **Close Info Window (`closeInfoWindow`)**:
    *   Checks if the close button is visible.
    *   Clicks the close button.
5.  **Reset AOI (`resetAOI`)**:
    *   Clicks the "Delete All" (`#delete_all`) button.
    *   Waits 1.5s.
6.  **Validation 2**: Asserts that the Info Window is now **not visible**.
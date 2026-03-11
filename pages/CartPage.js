// pages/CartPage.js
import { expect } from '@playwright/test';
import { BasePage } from './BasePage';
import { 
  setContext, logInfo, addWarning, setLastAddedProduct, getLastAddedProduct, 
  saveMapScreenshot, getInnerTextSafe 
} from '../utils/helpers';

export class CartPage extends BasePage {
  constructor(page) {
    super(page);
    // Locators matching original 'Locators' object structure
    this.firstSatelliteRow = page.locator('#table_satellite tr').nth(1);
    this.addToCartPopup = page.locator('#popup');
    this.cartBadge = page.locator('#lblCartCount');
    this.cartTrigger = page.locator('a[data-target="#cartModal"]');
    this.cartModal = page.locator('.modal.show, #cartModal');
    this.shoppingCartTable = page.locator('#shopping_cart');
    this.checkoutBtn = page.locator('#checkout_a');
    this.submitBtn = page.locator('input[type="submit"]');
    
    // Form Field Locators
    this.firstName = page.locator('#first_name');
    this.lastName = page.locator('#last_name');
    this.email = page.locator('#email');
    this.company = page.locator('#company');
    this.phone = page.locator('#phone');
    this.street = page.locator('textarea[name="street"]');
    this.city = page.locator('#city');
    this.state = page.locator('#state');
    this.zip = page.locator('#zip');
    this.country = page.locator('#country');
    this.industry = page.locator('#industry');
    this.description = page.locator('textarea[name="description"]');
  }

  // Replicates addItemToCartAndVerifyPopup(p) from original
  async addItemToCartAndVerifyPopup() {
    setContext({ flow: 'addToCart' });
    const firstRow = this.firstSatelliteRow;
    
    try { 
      await expect(firstRow).toBeVisible({ timeout: 10000 }); 
    } catch (e) { 
      addWarning('First satellite row not visible in table'); 
      return false; 
    }

    // --- Product Name Extraction Logic (From Original) ---
    let productName = '';
    try {
      const productDiv = firstRow.locator('td:nth-child(2) div');
      if (await productDiv.count() > 0) {
        productName = (await productDiv.first().innerText()).trim();
      }
    } catch (e) { productName = ''; }

    if (!productName) {
      try {
        const inputEl = firstRow.locator('input[type="image"]').first();
        const raw = await inputEl.getAttribute('value');
        if (raw) {
          try {
            // Attempt JSON parse with single quote replacement
            const parsed = JSON.parse(raw.replace(/'/g, '"'));
            if (parsed && parsed[0]) productName = String(parsed[0]);
          } catch (err) {
            // Fallback: Regex match
            const m = raw.match(/^\s*\['?([^',\]]+)/);
            if (m) productName = (m[1] || '').trim();
          }
        }
      } catch (e) {}
    }

    if (!productName) { 
      addWarning('Unable to parse product name from first satellite row'); 
      productName = ''; 
    }

    // --- Interaction (Highlights/Annotate/Click) ---
    await this.highlight(firstRow, { forceOutlineOnly: true });
    const addBtn = firstRow.locator('input[type="image"]').first();
    
    try { await this.highlight(addBtn, { borderColor: 'rgba(0,200,120,0.95)', pause: 500 }); } catch {}

    try {
      await this.annotate(addBtn, 'Add to cart', 1000);
      await addBtn.click();
    } catch (e) {
      try { await addBtn.click({ force: true }); } 
      catch (err) { addWarning('Failed to click add-to-cart button on first row'); return false; }
    }

    await this.fastWait(600);

    // Update global state
    setLastAddedProduct((productName || '').trim());
    logInfo('Added to cart (captured product)', { product: getLastAddedProduct() });

    // --- Verification ---
    const popup = this.addToCartPopup;
    try { await popup.waitFor({ state: 'visible', timeout: 15000 }); } 
    catch (e) { addWarning('popup did not appear within 15s after adding to cart'); return false; }
    
    await this.highlight(popup);
    try { await expect(popup).toContainText('Item added to cart'); } 
    catch (e) { addWarning('Add-to-cart popup did not contain expected "Item added to cart" text'); }
    
    const popupDisplay = await popup.evaluate(el => window.getComputedStyle(el).display);
    if (popupDisplay !== 'block') { 
      addWarning(`popup display is "${popupDisplay}" (expected "block")`); 
      return false; 
    }
    await expect(popup).toHaveCSS('display', 'block');
    
    return true;
  }

  // Replicates openCartAndVerifyItem(p) from original
  async openCartAndVerifyItem() {
    setContext({ flow: 'verifyCart' });
    const badge = this.cartBadge;
    let badgeText = '';
    try { badgeText = (await badge.innerText()).trim(); } 
    catch (e) { addWarning('Unable to read cart badge'); return false; }

    if (badgeText !== '1') { addWarning(`Expected cart count "1" but found "${badgeText}"`); return false; }
    await this.highlight(badge);

    const trigger = this.cartTrigger;
    await this.highlight(trigger);
    await this.annotate(trigger, 'Open Cart', 900);
    await trigger.click();

    const cartTable = this.shoppingCartTable;
    try { await cartTable.waitFor({ state: 'visible', timeout: 15000 }); } 
    catch (e) { addWarning('Shopping cart table did not appear in modal'); return false; }

    try {
      const modal = this.cartModal;
      if (await modal.count() > 0) await this.highlight(modal.first(), { borderColor: 'rgba(0,120,255,0.95)' });
    } catch (e) {}

    try {
      const firstRow = cartTable.locator('tr').nth(1);
      await firstRow.waitFor({ state: 'visible', timeout: 8000 });
      await this.highlight(firstRow, { borderColor: 'rgba(0,200,120,0.95)', pause: 700 });
      
      const productCell = firstRow.locator('td').nth(0);
      const actualProduct = (await getInnerTextSafe(productCell)).trim();

      logInfo('Cart first row product', { actualProduct, expected: getLastAddedProduct() });

      if (getLastAddedProduct()) {
        if (!actualProduct.includes(getLastAddedProduct())) {
          const msg = `${getLastAddedProduct()} not found in first cart row. Found: ${actualProduct}`;
          addWarning(msg);
          await saveMapScreenshot(this.page, getLastAddedProduct() || 'cart_mismatch', 'cart_first_row_mismatch', true);
          return false;
        }
      } else {
        // Fallback check if global product name wasn't set
        if (!actualProduct.includes('WorldView03')) {
           const msg = `WorldView03 not found in first cart row (fallback). Found: ${actualProduct}`;
           addWarning(msg);
           await saveMapScreenshot(this.page, 'cart', 'cart_first_row_missing_worldview03', true);
           return false;
        }
      }
      return true;
    } catch (e) {
      addWarning('Failed to validate first cart row');
      await saveMapScreenshot(this.page, 'cart', 'cart_validation_error', true);
      return false;
    }
  }

  // Replicates checkoutAndFillForm(p) from original
  async checkoutAndFillForm() {
    setContext({ flow: 'checkout' });
    const checkout = this.checkoutBtn;
    
    try { await expect(checkout).toBeVisible({ timeout: 10000 }); } 
    catch (e) { addWarning('Checkout button not visible'); return false; }
    
    await this.highlight(checkout);
    await this.annotate(checkout, 'Checkout', 900);
    await checkout.click();
    await this.fastWait(600);
    
    try { await this.firstName.waitFor({ state: 'visible', timeout: 15000 }); } 
    catch (e) { addWarning('Checkout form did not appear'); return false; }
    
    // --- Form Filling Logic (Preserving original highlight sequence) ---
    try {
      await this.highlight(this.firstName); await this.page.fill('#first_name', 'Test');
      await this.highlight(this.lastName); await this.page.fill('#last_name', 'testing');
      await this.highlight(this.email); await this.page.fill('#email', 'kapil@test.com');
      await this.highlight(this.company); await this.page.fill('#company', 'GeoWGS');
      await this.highlight(this.phone); await this.page.fill('#phone', '9999999999');
      await this.highlight(this.street); await this.page.fill('textarea[name="street"]', 'MG Road');
      await this.highlight(this.city); await this.page.fill('#city', 'Bangalore');
      await this.highlight(this.state); await this.page.fill('#state', 'Karnataka');
      await this.highlight(this.zip); await this.page.fill('#zip', '560001');
      await this.highlight(this.country); await this.page.fill('#country', 'India');
      await this.highlight(this.industry); await this.page.selectOption('#industry', 'Technology');
      await this.highlight(this.description); await this.page.fill('textarea[name="description"]', 'Automated test submission');
    } catch (e) { addWarning('Unable to fill checkout form'); return false; }

    const submitBtn = this.submitBtn;
    await this.highlight(submitBtn);
    
    // --- Navigation Logic (Original: Promise.race) ---
    let newPageOrNavigationResult = null;
    try {
      const waitForEither = Promise.race([
        this.page.context().waitForEvent('page', { timeout: 30000 }).then(pg => ({ type: 'newPage', page: pg })),
        this.page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 30000 }).then(() => ({ type: 'samePage' }))
      ]);
      // Destructuring result to ignore the return value of click, keeping only the race result
      const [ , result ] = await Promise.all([ submitBtn.click(), waitForEither ]);
      newPageOrNavigationResult = result;
    } catch (e) { addWarning('Submit failed or no navigation/new tab within timeout'); return false; }

    // --- Post-Submit Validation ---
    if (newPageOrNavigationResult && newPageOrNavigationResult.type === 'newPage') {
      const thankYouPage = newPageOrNavigationResult.page;
      try { 
        await thankYouPage.waitForLoadState('domcontentloaded', { timeout: 30000 }); 
        await expect(thankYouPage).toHaveURL(/thank_you/); 
      } catch (e) { 
        addWarning('Thank-you page (new tab) did not load or URL mismatch'); 
        return false; 
      }
    } else {
      try { 
        await this.page.waitForLoadState('domcontentloaded', { timeout: 30000 }); 
        const url = this.page.url(); 
        if (!/thank_you/.test(url)) { 
          addWarning(`After submit current page URL is "${url}" (expected /thank_you/)`); 
          return false; 
        } 
      } catch (e) { 
        addWarning('Navigation after submit failed or timed out'); 
        return false; 
      }
    }
    return true;
  }
}
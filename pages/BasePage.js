// pages/BasePage.js
import { showStep, highlight, fastWait, robustClick, annotateTemporary, setContext, clearContext, logInfo, addWarning, waitForVisible } from '../utils/helpers';

export class BasePage {
  constructor(page) {
    this.page = page;
  }

  async showStep(text) { return showStep(this.page, text); }
  async highlight(locator, options) { return highlight(this.page, locator, options); }
  async fastWait(ms) { return fastWait(this.page, ms); }
  async robustClick(locator, opts) { return robustClick(this.page, locator, opts); }
  async annotate(locator, text, ms, opts) { return annotateTemporary(this.page, locator, text, ms, opts); }
  async waitForVisible(locator, timeout) { return waitForVisible(locator, timeout); }
  
  setFlow(flow) { setContext({ flow }); }
  clearFlow() { clearContext(); }
}
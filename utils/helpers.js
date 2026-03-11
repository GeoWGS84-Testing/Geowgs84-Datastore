// utils/helpers.js
import { expect } from '@playwright/test';
import fs from 'fs';
import fsPromises from 'fs/promises';
import path from 'path';

// --- Config & Constants ---
export const CONFIG = {
  BASE_URL: process.env.BASE_URL || 'https://datastore.geowgs84.com',
  HEADLESS: process.env.HEADLESS === 'true',
  PW_SLOWMO: Number(process.env.PW_SLOWMO || 0)
};
export const PAUSE_MULTIPLIER = Number(process.env.PAUSE_MULTIPLIER || 0.55);
export const VISUAL_MIN_PAUSE = 25;
export const DIAG_DIR = 'diagnostics';
export const VIDEO_DIR = path.join(process.cwd(), 'test-results');
export const SOFT_ASSERT = (process.env.SOFT_ASSERT || 'false').toLowerCase() === 'true';
export const DEFAULT_WAIT = Number(process.env.DEFAULT_WAIT || 15000);

export const OUTLINE_WAIT_MS = Number(process.env.OUTLINE_WAIT_MS || 90000);
export const PREVIEW_WAIT_MS = Number(process.env.PREVIEW_WAIT_MS || 90000);
export const DETAILS_IMAGE_WAIT_MS = Number(process.env.DETAILS_IMAGE_WAIT_MS || 120000);

// --- Context & State ---
let CURRENT_TEST_FILE = '';
let CURRENT_TESTCASE = '';
let CURRENT_FLOW = '';
let CURRENT_CONTEXT = { testcase: '', flow: '', testFile: '', product: '', scene: '', details: null };
export let LAST_ADDED_PRODUCT = '';

// CHANGE: Use 'let' instead of 'const' because we reassign them in clear functions
let INFOS = [];
let WARNINGS = [];
let ERRORS = [];
const ARTIFACTS = [];

let lastErrorCount = 0;
let lastWarningCount = 0;

// Ensure directories exist
;(function ensureDirExists() {
  [DIAG_DIR, VIDEO_DIR].forEach(dir => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }
  })
})();

export function setContext({ testcase, flow, testFile } = {}) {
  if (testcase !== undefined) CURRENT_TESTCASE = testcase;
  if (flow !== undefined) CURRENT_FLOW = flow;
  if (testFile !== undefined) CURRENT_TEST_FILE = testFile;
  logInfo(`Context set`, { testcase: CURRENT_TESTCASE, flow: CURRENT_FLOW, testFile: CURRENT_TEST_FILE });
}

export function clearContext() {
  CURRENT_TESTCASE = '';
  CURRENT_FLOW = '';
  CURRENT_TEST_FILE = '';
}

export function setContextFromObject(ctx) {
  CURRENT_CONTEXT = { ...CURRENT_CONTEXT, ...ctx };
}

export function clearContextObject() {
  CURRENT_CONTEXT = { testcase: '', flow: '', testFile: '', product: '', scene: '', details: null };
}

export function setLastAddedProduct(val) {
  LAST_ADDED_PRODUCT = val;
}

export function getLastAddedProduct() {
  return LAST_ADDED_PRODUCT;
}

export function contextSnapshot() {
  return {
    test: CURRENT_TESTCASE || CURRENT_CONTEXT.testcase || null,
    flow: CURRENT_FLOW || CURRENT_CONTEXT.flow || null,
    product: CURRENT_CONTEXT.product || null,
    scene: CURRENT_CONTEXT.scene || null,
    details: CURRENT_CONTEXT.details || null,
    time: new Date().toISOString()
  };
}

// --- Logging ---
export function logInfo(message, meta = {}) {
  const entry = Object.assign({}, contextSnapshot(), { level: 'info', message, meta });
  INFOS.push(entry);
  console.log(`[INFO] ${entry.time} ${entry.test ? `(${entry.test})` : ''} ${entry.flow ? `[${entry.flow}]` : ''} - ${message}`);
}

export function addWarning(message, meta = {}) {
  const entry = Object.assign({}, contextSnapshot(), { level: 'warning', message, meta });
  WARNINGS.push(entry);
  console.warn(`[WARNING] ${entry.time} ${entry.test ? `(${entry.test})` : ''} ${entry.flow ? `[${entry.flow}]` : ''} - ${message}`);
}

export function addError(message, meta = {}) {
  const entry = Object.assign({}, contextSnapshot(), { level: 'error', message, meta });
  ERRORS.push(entry);
  console.error(`[ERROR] ${entry.time} ${entry.test ? `(${entry.test})` : ''} ${entry.flow ? `[${entry.flow}]` : ''} - ${message}`);
}

export function getWarnings() { return WARNINGS; }
export function clearWarnings() { WARNINGS = []; }
export function getInfos() { return INFOS; }
export function clearInfos() { INFOS = []; }
export function getErrors() { return ERRORS; }
export function clearErrors() { ERRORS = []; }
export function getArtifacts() { return [...ARTIFACTS]; }
export function clearArtifacts() { ARTIFACTS.length = 0; }

export function clearDiagnostics() {
  INFOS.length = 0;
  WARNINGS.length = 0;
  ERRORS.length = 0;
  lastErrorCount = 0;
  lastWarningCount = 0;
}

export function clearDiagnosticsFolder() {
  if (fs.existsSync(DIAG_DIR)) {
    try {
      const files = fs.readdirSync(DIAG_DIR)
      for (const file of files) {
        const filePath = path.join(DIAG_DIR, file)
        if (fs.lstatSync(filePath).isDirectory()) {
           fs.rmSync(filePath, { recursive: true, force: true })
        } else {
           fs.unlinkSync(filePath)
        }
      }
      logInfo('Diagnostics folder cleared')
    } catch (err) {
      console.error('Failed to clear diagnostics folder', err)
    }
  }
}

export async function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

// --- Utils ---
export function sanitizeFilename(s) {
  return s.replace(/[:\/\\<>?"|]/g, '-').replace(/[^\w\-\.]/g, '_').substring(0, 220);
}

export async function fastWait(pageArg, ms = 300) {
  const t = Math.max(VISUAL_MIN_PAUSE, Math.round(ms * PAUSE_MULTIPLIER));
  return pageArg.waitForTimeout(t);
}

export async function focusPage(pageArg) {
  try { await pageArg.bringToFront(); } catch {}
  await pageArg.waitForTimeout(300);
}

export async function getInnerTextSafe(locatorOrHandle) {
  try {
    if (!locatorOrHandle) return '';
    if (typeof locatorOrHandle.innerText === 'function') {
      return (await locatorOrHandle.innerText()).trim();
    }
    if (locatorOrHandle.evaluate) {
      return (await locatorOrHandle.evaluate(el => el.innerText || '')).trim();
    }
    return '';
  } catch { return ''; }
}

function _timestamp() { return new Date().toISOString(); }

/* ===============================
   Artifact Naming Strategy
================================ */
export function getTestFileName() {
  return CURRENT_TEST_FILE;
}

function cleanForFilename(str) {
  if (!str) return '';
  return str
    .replace(/[\[\]]/g, '')           
    .replace(/[:\/\\|?*]/g, '_')      
    .replace(/\s+/g, '_')              
    .replace(/_+/g, '_')               
    .replace(/^_|_$/g, '')             
    .substring(0, 50);                 
}

export function formatArtifactFilename(testFile, testTitle, reason, ext) {
  const baseFileName = testFile ? path.basename(testFile, path.extname(testFile)) : 'test';
  const cleanTitle = cleanForFilename(testTitle);
  const cleanReason = cleanForFilename(reason) || 'FAILED';
  
  return `${baseFileName}_${cleanTitle}_${cleanReason}.${ext}`;
}

export function extractErrorReason(error) {
  if (!error) return 'FAILED';
  
  const msg = error.message || String(error);
  
  if (msg.includes('TimeoutError') || msg.toLowerCase().includes('timeout')) return 'TIMEOUT';
  if (msg.includes('AssertionError')) return 'ASSERTION_FAIL';
  if (msg.includes('not visible') || msg.includes('not found')) return 'ELEMENT_NOT_FOUND';
  if (msg.includes('selector')) return 'SELECTOR_ERROR';
  if (msg.includes('stale')) return 'STALE_ELEMENT';
  if (msg.includes('count') && (msg.includes('mismatch') || msg.includes('found'))) return 'COUNT_MISMATCH';
  if (msg.includes('navigate')) return 'NAVIGATION_ERROR';
  
  return 'FAILED';
}

/* ===============================
   Assertion & Interaction Helpers
================================ */
export async function waitForVisible(locator, timeout = DEFAULT_WAIT) {
  try {
    await locator.waitFor({ state: 'visible', timeout })
    return true
  } catch (err) {
    addWarning('waitForVisible timed out', { locator: locator?.toString?.() || String(locator), timeout, error: err.message, testcase: CURRENT_TESTCASE })
    return false
  }
}

export async function assertVisible(locator, label) {
  try {
    await expect(locator).toBeVisible({ timeout: DEFAULT_WAIT })
    return true
  } catch (err) {
    const meta = { label, error: err.message, testcase: CURRENT_TESTCASE }
    if (SOFT_ASSERT) {
      addWarning(`Soft-assert failed: ${label}`, meta)
      return false
    }
    addError(`Assertion failed: ${label}`, meta)
    throw err
  }
}

export async function robustClick(page, locator, opts = {}) {
  const { timeout = DEFAULT_WAIT, highlightBorder, retry = 1 } = opts
  try {
    const visible = await waitForVisible(locator, timeout)
    if (!visible) throw new Error('Element not visible to click')

    try {
      await locator.scrollIntoViewIfNeeded({ timeout: 5000 })
      await locator.evaluate(el => el.scrollIntoView({ block: 'center', inline: 'center' }))
    } catch (e) { }

    try {
      await highlight(page, locator, { borderColor: highlightBorder, pause: 200 })
    } catch (e) { }

    for (let attempt = 0; attempt <= retry; attempt++) {
      try {
        await locator.click({ timeout: 5000, force: false })
        logInfo('robustClick succeeded', { attempt, testcase: CURRENT_TESTCASE })
        return true
      } catch (err) {
        addWarning('robustClick attempt failed', { attempt, error: err.message })
        if (attempt === retry) {
            try {
                await locator.click({ force: true })
                logInfo('robustClick succeeded with force: true', { testcase: CURRENT_TESTCASE })
                return true
            } catch (finalErr) {
                throw finalErr
            }
        }
        await new Promise(r => setTimeout(r, 250))
      }
    }
  } catch (err) {
    addError('robustClick failed', { error: err.message, testcase: CURRENT_TESTCASE })
    throw err
  }
}

export async function waitAndFill(page, locator, value, opts = {}) {
  const { timeout = DEFAULT_WAIT, highlightBorder } = opts
  try {
    const visible = await waitForVisible(locator, timeout)
    if (!visible) throw new Error('Element not visible to fill')
    try {
      await highlight(page, locator, { borderColor: highlightBorder, pause: 200 })
    } catch (e) { }
    await locator.fill(value, { timeout: 5000 })
    logInfo('Filled input', { value: typeof value === 'string' ? `${value.slice(0, 20)}${value.length > 20 ? '...' : ''}` : typeof value, testcase: CURRENT_TESTCASE })
    return true
  } catch (err) {
    addError('waitAndFill failed', { error: err.message, testcase: CURRENT_TESTCASE })
    throw err
  }
}

/* ===============================
   Visual Helpers
================================ */
const HIGHLIGHT_COLORS = [
  'rgba(255, 99, 71, 0.18)', 'rgba(135, 206, 235, 0.18)', 'rgba(144, 238, 144, 0.18)',
  'rgba(255, 215, 0, 0.18)', 'rgba(221, 160, 221, 0.18)', 'rgba(255, 182, 193, 0.18)'
];
let lastColorIndex = -1;

function _getRandomRGBA(alpha = 1) {
  const r = Math.floor(Math.random() * 256);
  const g = Math.floor(Math.random() * 256);
  const b = Math.floor(Math.random() * 256);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export async function highlight(page, locator, options = {}) {
  const { pause = 800, forceOutlineOnly = false } = options
  const bgColor = options.color || _getRandomRGBA(0.3);
  const effectiveBorder = options.borderColor || _getRandomRGBA(1);

  try {
    const handle = await locator.elementHandle()
    if (!handle) return
    await page.evaluate(({ el, border, bg, forceOutlineOnly }) => {
      el.style.outline = `3px solid ${border}`
      el.style.outlineOffset = '3px'
      if (bg) el.style.backgroundColor = bg
      if (!forceOutlineOnly) {
        el.scrollIntoView({ block: 'center', inline: 'center' })
      }
    }, { el: handle, border: effectiveBorder, bg: bgColor, forceOutlineOnly })
    await page.waitForTimeout(pause)
  } catch (err) { }
}

export async function showStep(page, text) {
  logInfo(`${text}`, { testcase: CURRENT_TESTCASE })

  const currentErrorCount = ERRORS.length;
  const currentWarningCount = WARNINGS.length;
  const hasNewErrors = currentErrorCount > lastErrorCount;
  const hasNewWarnings = currentWarningCount > lastWarningCount;
  
  lastErrorCount = currentErrorCount;
  lastWarningCount = currentWarningCount;

  if (hasNewErrors || hasNewWarnings) {
    try {
      if (!page.isClosed()) {
        const msgType = hasNewErrors ? 'ERROR' : 'WARNING';
        const msgText = hasNewErrors 
          ? (ERRORS[ERRORS.length - 1]?.message || 'Error occurred') 
          : (WARNINGS[WARNINGS.length - 1]?.message || 'Warning occurred');
        
        await showTestFailure(page, msgText, msgType);
        await fastWait(page, 2000); 

        const reason = hasNewErrors ? 'ERROR_DETECTED' : 'WARNING_DETECTED';
        const filePath = await captureScreenshot(page, CURRENT_TESTCASE, reason);
        if (filePath) ARTIFACTS.push(filePath);
      }
    } catch (e) { console.warn('Failed immediate capture:', e.message); }
  }

  try {
    if (!page.isClosed()) {
      await page.evaluate(({ stepText, testCase }) => {
        let spacer = document.getElementById('pw-layout-spacer')
        if (!spacer) {
          spacer = document.createElement('div')
          spacer.id = 'pw-layout-spacer'
          spacer.style.width = '100%'; spacer.style.pointerEvents = 'none'
          document.body.prepend(spacer)
        }
        let bar = document.getElementById('pw-banner-container')
        if (!bar) {
          bar = document.createElement('div')
          bar.id = 'pw-banner-container'
          Object.assign(bar.style, {
            position: 'fixed', top: '0', left: '0', width: '100%', zIndex: '99999',
            display: 'flex', alignItems: 'center', gap: '12px',
            padding: '6px 12px', boxSizing: 'border-box', pointerEvents: 'none',
            fontFamily: 'Segoe UI, sans-serif',
            background: 'linear-gradient(90deg, rgba(115,102,255,0.85), rgba(58,199,147,0.85))',
            borderBottom: '2px solid rgba(255,255,255,0.12)'
          })
          const tc = document.createElement('div')
          tc.id = 'pw-testcase-header'
          Object.assign(tc.style, { padding: '6px 12px', fontSize: '14px', fontWeight: '700', color: '#fff', whiteSpace: 'nowrap', background: 'rgba(0,0,0,0.2)', borderRadius: '4px' })
          const step = document.createElement('div')
          step.id = 'pw-step-banner'
          Object.assign(step.style, { padding: '6px 10px', fontSize: '13px', fontWeight: '600', color: 'rgba(10,10,30,0.95)', background: 'rgba(255,255,255,0.9)', borderRadius: '6px', minWidth: '160px', maxWidth: '40%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' })
          bar.appendChild(tc); bar.appendChild(step)
          document.body.appendChild(bar)
        }
        const tcEl = document.getElementById('pw-testcase-header')
        const stepEl = document.getElementById('pw-step-banner')
        if (testCase) { tcEl.textContent = `TEST CASE : ${testCase}`; tcEl.style.display = 'block' } else { tcEl.style.display = 'none' }
        stepEl.textContent = stepText
        spacer.style.height = `${bar.offsetHeight}px`
      }, { stepText: text, testCase: CURRENT_TESTCASE })
    }
  } catch (err) { }
  await fastWait(page, 300)
}

export async function annotateElementLabel(pageArg, locator, labelText = '', opts = {}) {
  try {
    const handle = await locator.elementHandle();
    if (!handle) return null;

    const id = `pw-annot-${Math.random().toString(36).slice(2,9)}`;
    await pageArg.evaluate(({ el, id, labelText, opts }) => {
      try {
        const rect = el.getBoundingClientRect();
        const div = document.createElement('div');
        div.id = id; div.dataset.pwAnnot = '1'; div.textContent = labelText;
        Object.assign(div.style, {
          position: 'absolute', left: `${Math.max(4, rect.left + window.scrollX)}px`,
          top: `${Math.max(4, rect.top + window.scrollY - 24)}px`,
          zIndex: 9999999, pointerEvents: 'none', fontSize: '12px',
          background: 'rgba(0,0,0,0.72)', color: '#fff', padding: '4px 8px', borderRadius: '4px',
          boxShadow: '0 6px 20px rgba(0,0,0,0.38)'
        });
        if (opts.border) div.style.border = opts.border;
        document.body.appendChild(div);

        const dot = document.createElement('div');
        dot.id = `${id}-dot`; dot.dataset.pwAnnot = '1';
        Object.assign(dot.style, {
          position: 'absolute', left: `${Math.round(rect.left + window.scrollX + rect.width/2)}px`,
          top: `${Math.round(rect.top + window.scrollY + rect.height/2)}px`, width: '8px', height: '8px',
          borderRadius: '50%', background: 'rgba(255,0,0,0.85)', transform: 'translate(-50%,-50%)', zIndex: 9999999, pointerEvents: 'none'
        });
        document.body.appendChild(dot);
      } catch (e) {}
    }, { el: handle, id, labelText, opts });

    await pageArg.waitForTimeout(300);
    return id;
  } catch (e) { return null; }
}

export async function removeAnnotationLabels(pageArg) {
  try { await pageArg.evaluate(() => { document.querySelectorAll('[data-pwAnnot]').forEach(el => el.remove()); }); } catch (e) {}
}

export async function annotateTemporary(pageArg, locator, labelText = '', ms = 1200, opts = {}) {
  try {
    if (!locator) return null;
    const id = await annotateElementLabel(pageArg, locator, labelText, opts);
    if (!id) return null;
    await pageArg.waitForTimeout(ms);
    try { await pageArg.evaluate((id) => { const el = document.getElementById(id); if (el) el.remove(); const dot = document.getElementById(id + '-dot'); if (dot) dot.remove(); }, id); } catch (e) {}
    return id;
  } catch (e) { return null; }
}

export async function waitForAndHighlight(p, locatorFactoryOrLocator, timeout = 10000, options = {}) {
  try {
    const locator = typeof locatorFactoryOrLocator === 'function' ? locatorFactoryOrLocator(p) : locatorFactoryOrLocator;
    await expect(locator).toBeVisible({ timeout });
    await highlight(p, locator, options);
    if (options.label) { try { await annotateTemporary(p, locator, options.label, options.labelMs || 1200, { border: options.border }); } catch {} }
    else if (options.annotate) { try { await annotateTemporary(p, locator, 'Visible', options.labelMs || 900); } catch {} }
    return locator;
  } catch (e) { return null; }
}

export async function clickWhenVisible(p, locatorFactoryOrLocator, opts = {}) {
  const { timeout = 10000, force = false, annotate = true, label = null } = opts;
  const locator = typeof locatorFactoryOrLocator === 'function' ? locatorFactoryOrLocator(p) : locatorFactoryOrLocator;
  try {
    await expect(locator).toBeVisible({ timeout });
    await highlight(p, locator, { pause: 400 });
    if (annotate) {
      const derivedLabel = label || 'Click';
      try { await annotateTemporary(p, locator, derivedLabel, 1000, { border: '2px solid rgba(0,200,120,0.95)' }); } catch {}
    }
    if (annotate && label) await fastWait(p, 180);
    try { await locator.click({ timeout: 8000 }); }
    catch { if (force) await locator.click({ force: true }); else throw new Error('Click failed and force not set'); }
    if (annotate) { try { await annotateTemporary(p, locator, 'Clicked', 700); } catch {} }
    await fastWait(p, 300);
    return true;
  } catch (e) { addWarning(`clickWhenVisible failed: ${e?.message || e}`); return false; }
}

// --- Artifact & Failure Helpers ---
export async function showTestFailure(page, message, type = 'FAILURE') {
  try {
    await page.evaluate(({ message, type }) => {
      const banner = document.createElement('div');
      banner.style.cssText = `position:fixed; top:0; left:0; width:100%; background:${type === 'FAILURE' ? '#dc3545' : '#ffc107'}; color:#fff; padding:10px; z-index:9999999; font-family:sans-serif; font-size:14px; text-align:center;`;
      banner.textContent = `${type}: ${message}`;
      document.body.appendChild(banner);
    }, { message, type });
  } catch (e) {}
}

export async function showFailureMessage(page, message, type = 'FAILURE', waitMs = 5000) {
  const colors = {
    'FAILURE': { bg: 'rgba(180, 0, 0, 0.95)', border: '#ff0000' },
    'ERROR': { bg: 'rgba(200, 50, 50, 0.95)', border: '#ff4444' },
    'WARNING': { bg: 'rgba(200, 150, 0, 0.95)', border: '#ffaa00' }
  };
  const color = colors[type] || colors['FAILURE'];
  
  const displayMsg = message.length > 300 ? message.substring(0, 300) + '...' : message;
  
  console.error(`\n${'='.repeat(70)}`);
  console.error(`[${type}] ${displayMsg}`);
  console.error(`${'='.repeat(70)}\n`);
  
  try {
    if (!page.isClosed()) {
      await page.evaluate(({ msg, type, bgColor, borderColor }) => {
        const existing = document.getElementById('pw-fatal-failure-banner');
        if (existing) existing.remove();
        
        const banner = document.createElement('div');
        banner.id = 'pw-fatal-failure-banner';
        Object.assign(banner.style, {
          position: 'fixed', top: '0', left: '0', width: '100%', height: '100%', 
          zIndex: '9999999', 
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          background: bgColor, color: '#ffffff', fontFamily: 'Segoe UI, sans-serif', 
          fontSize: '16px', fontWeight: 'bold', padding: '30px', boxSizing: 'border-box', 
          textAlign: 'center'
        });
        
        const title = document.createElement('div');
        title.innerText = type === 'FAILURE' ? '❌ TEST FAILED' : type === 'ERROR' ? '⚠️ ERROR DETECTED' : '⚠️ WARNING';
        title.style.fontSize = '32px';
        title.style.marginBottom = '20px';
        title.style.textShadow = '2px 2px 4px rgba(0,0,0,0.5)';
        
        const details = document.createElement('div');
        details.innerText = msg;
        details.style.fontSize = '14px'; 
        details.style.fontWeight = 'normal';
        details.style.maxWidth = '80%';
        details.style.lineHeight = '1.6';
        details.style.background = 'rgba(0,0,0,0.3)';
        details.style.padding = '20px';
        details.style.borderRadius = '10px';
        details.style.border = `2px solid ${borderColor}`;
        
        const info = document.createElement('div');
        info.innerText = '📸 Capturing screenshot and video...';
        info.style.fontSize = '12px';
        info.style.marginTop = '20px';
        info.style.opacity = '0.8';
        
        banner.appendChild(title);
        banner.appendChild(details);
        banner.appendChild(info);
        document.body.appendChild(banner);
      }, { msg: displayMsg, type, bgColor: color.bg, borderColor: color.border });
      
      if (waitMs > 0) {
        await fastWait(page, waitMs);
      }
    }
  } catch (err) { 
    console.warn('Could not show failure message on screen:', err.message); 
  }
}

export async function showFailure(page, error) {
  const message = error?.message || String(error);
  const stack = error?.stack || '';
  
  console.error(`\n${'='.repeat(70)}`);
  console.error(`[FAILURE] TEST FAILED`);
  console.error(`${'='.repeat(70)}`);
  console.error(`Message: ${message}`);
  if (stack) {
    console.error(`\nStack Trace:`);
    console.error(stack);
  }
  console.error(`${'='.repeat(70)}\n`);
  
  await showFailureMessage(page, message, 'FAILURE', 5000);
}

export async function captureScreenshot(page, testTitle, reason, testFile = null) {
  try {
    const dir = VIDEO_DIR; 
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    
    const actualTestFile = testFile || CURRENT_TEST_FILE || 'test.spec.js';
    const filename = formatArtifactFilename(actualTestFile, testTitle, reason, 'png');
    const filePath = path.join(dir, filename);
    
    await page.screenshot({ path: filePath, fullPage: true })
    logInfo('Screenshot captured', { path: filePath, filename })
    return filePath
  } catch (err) {
    console.warn('captureScreenshot failed', err.message)
    return null
  }
}

export function generateVideoFilename(testFile, testTitle, reason) {
  return formatArtifactFilename(testFile, testTitle, reason, 'webm');
}

export async function saveMapScreenshot(p, sceneId, suffix = 'overlay', markWarning = false) {
  try {
    const dir = path.join(process.cwd(), 'test-results');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const safe = sanitizeFilename(`scene_${sceneId || 'noid'}_${suffix}_${new Date().toISOString()}`);
    const filePath = path.join(dir, `${safe}.png`);
    await p.screenshot({ path: filePath, fullPage: true });
    if (markWarning) addWarning(`screenshot saved: ${filePath}`, { sceneId, suffix });
    else logInfo(`screenshot saved: ${filePath}`, { sceneId, suffix });
    return filePath;
  } catch (e) { addWarning(`Failed to save screenshot for ${sceneId}: ${e?.message || e}`); return null; }
}

export async function saveOutlineData(pageArg, sceneId, outlineResult) {
  try {
    const dir = path.join(process.cwd(), 'test-results');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const data = { sceneId: sceneId || null, time: new Date().toISOString(), type: outlineResult?.type || null, bbox: outlineResult?.bbox || null };
    try {
      if (outlineResult && outlineResult.locator) {
        const handle = await outlineResult.locator.elementHandle();
        if (handle) {
          const outer = await handle.evaluate(el => {
            try {
              if (el.tagName && el.tagName.toLowerCase() === 'path') return { tag: 'path', d: el.getAttribute('d') || null, outerHTML: el.outerHTML || null };
              return { tag: el.tagName ? el.tagName.toLowerCase() : null, outerHTML: el.outerHTML || null };
            } catch (e) { return { error: String(e) }; }
          });
          data.element = outer;
        }
      }
    } catch (e) { data.elementCaptureError = String(e); }
    const safe = sanitizeFilename(`scene_${sceneId || 'noid'}_outline_${new Date().toISOString()}`);
    const filePath = path.join(dir, `${safe}.json`);
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
    logInfo(`outline data saved: ${filePath}`, { sceneId });
    return filePath;
  } catch (e) { addWarning(`Failed to save outline data for ${sceneId}: ${e?.message || e}`); return null; }
}

// --- BBox & Overlay Detection ---
export async function getBoundingBoxForLocator(page, locator) {
  try {
    if (!locator) return null;
    const handle = await locator.elementHandle();
    if (!handle) return null;
    const bb = await handle.boundingBox().catch(() => null);
    if (bb && typeof bb.x === 'number') return bb;
    try {
      const bb2 = await page.evaluate(el => {
        try {
          if (el.getBBox) { const b = el.getBBox(); return { x: b.x, y: b.y, width: b.width, height: b.height }; }
          const r = el.getBoundingClientRect();
          return { x: r.x, y: r.y, width: r.width, height: r.height };
        } catch (e) { return null; }
      }, handle);
      return bb2;
    } catch (e) { return null; }
  } catch (e) { return null; }
}

export function bboxIntersects(a, b, minOverlapRatio = 0.1) {
  if (!a || !b) return false;
  const ax1 = a.x, ay1 = a.y, ax2 = a.x + a.width, ay2 = a.y + a.height;
  const bx1 = b.x, by1 = b.y, bx2 = b.x + b.width, by2 = b.y + b.height;
  const ix1 = Math.max(ax1, bx1), iy1 = Math.max(ay1, by1);
  const ix2 = Math.min(ax2, bx2), iy2 = Math.min(ay2, by2);
  const iw = Math.max(0, ix2 - ix1), ih = Math.max(0, iy2 - iy1);
  if (iw === 0 || ih === 0) return false;
  const interArea = iw * ih;
  const aArea = Math.max(1, a.width * a.height);
  const bArea = Math.max(1, b.width * b.height);
  const overlapRatio = interArea / Math.min(aArea, bArea);
  return overlapRatio >= minOverlapRatio;
}

export async function detectMapOverlayWithBBox(page, sceneId) {
  try {
    const mapLocator = page.locator('#map');
    const mapBB = await getBoundingBoxForLocator(page, mapLocator);

    if (sceneId) {
      const imgById = page.locator(`#map img[src*="${sceneId}"]`);
      if (await imgById.count() > 0) {
        const candidate = imgById.first();
        const src = await candidate.getAttribute('src') || '';
        if (!/marker|icon|static/i.test(src)) {
          const bb = await getBoundingBoxForLocator(page, candidate);
          if (bb && (!mapBB || bboxIntersects(bb, mapBB, 0.05))) return { type: 'preview', locator: candidate, bbox: bb };
        }
      }
    }
    const svgPath = page.locator('#map svg path, #map svg g path');
    if (await svgPath.count() > 0) {
      const candidate = svgPath.first();
      const bb = await getBoundingBoxForLocator(page, candidate);
      if (bb && (!mapBB || bboxIntersects(bb, mapBB, 0.03))) return { type: 'outline', locator: candidate, bbox: bb };
    }
    const canvas = page.locator('#map canvas');
    if (await canvas.count() > 0) {
      const candidate = canvas.first();
      const bb = await getBoundingBoxForLocator(page, candidate);
      if (bb && (!mapBB || bboxIntersects(bb, mapBB, 0.05))) return { type: 'canvas', locator: candidate, bbox: bb };
    }
  } catch (e) {}
  return null;
}

export async function waitForMapOverlayForScene(page, sceneId, timeout = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const found = await detectMapOverlayWithBBox(page, sceneId);
    if (found) return found;
    await page.waitForTimeout(500);
  }
  return null;
}

// --- AOI Detection ---
export async function detectAOIOnMap(page) {
  try {
    const candidates = ['#map svg rect', '#map svg path', '#map .leaflet-editing', '#map .leaflet-draw', '#map .drawn-rect', '#map .aoi', '#map .gm-rect', '#map .google-maps-aoi', '#map .gm-style'];
    for (const sel of candidates) {
      const loc = page.locator(sel);
      if (await loc.count() > 0) {
        const first = loc.first();
        const bb = await getBoundingBoxForLocator(page, first);
        if (bb && bb.width > 6 && bb.height > 6) return { type: 'aoi', locator: first, bbox: bb, selector: sel };
      }
    }
  } catch (e) {}
  return null;
}

export async function waitForAOIOnMap(page, timeout = 12000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const found = await detectAOIOnMap(page);
    if (found) return found;
    await page.waitForTimeout(400);
  }
  return null;
}

export function persistDiagnosticsSummary(extra = {}) {
  const summaryPath = `${DIAG_DIR}/summary.json`
  const summary = {
    timestamp: new Date().toISOString(),
    testcase: CURRENT_TESTCASE,
    testFile: CURRENT_TEST_FILE,
    infos: INFOS,
    warnings: WARNINGS,
    errors: ERRORS,
    extra
  }
  let data = []
  if (fs.existsSync(summaryPath)) {
    try {
      data = JSON.parse(fs.readFileSync(summaryPath, 'utf-8'))
      if (!Array.isArray(data)) data = []
    } catch (e) { data = [] }
  }
  data.push(summary)
  fs.writeFileSync(summaryPath, JSON.stringify(data, null, 2))
}

export default {
  setContext, clearContext, setContextFromObject, clearContextObject, setLastAddedProduct, getLastAddedProduct,
  logInfo, addWarning, addError, getWarnings, clearWarnings, getInfos, clearInfos, getErrors, clearErrors,
  getArtifacts, clearArtifacts, clearDiagnostics, clearDiagnosticsFolder,
  sanitizeFilename, fastWait, focusPage, getInnerTextSafe,
  highlight, showStep, annotateElementLabel, removeAnnotationLabels, annotateTemporary,
  waitForAndHighlight, clickWhenVisible, waitForVisible, robustClick,
  showTestFailure, showFailureMessage, showFailure, captureScreenshot, generateVideoFilename,
  saveMapScreenshot, saveOutlineData,
  getBoundingBoxForLocator, bboxIntersects, detectMapOverlayWithBBox, waitForMapOverlayForScene,
  detectAOIOnMap, waitForAOIOnMap,
  persistDiagnosticsSummary, sleep, getTestFileName, extractErrorReason, formatArtifactFilename
}
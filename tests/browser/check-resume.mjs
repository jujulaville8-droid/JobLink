import assert from 'node:assert/strict';
import { readFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

// Run the test-only Vite server first. A separately installed Playwright module
// may be supplied without adding browser dependencies to the production app.
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const output = process.env.RESUME_TEST_OUTPUT;
if (!output) throw new Error('Set RESUME_TEST_OUTPUT to an artifact directory.');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const errors = [];
try {
  for (const width of [1440, 1024, 768, 390, 320]) {
    const page = await browser.newPage({ viewport: { width, height: 1000 }, reducedMotion: 'reduce' });
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('http://127.0.0.1:4180/tests/browser/resume-studio.html');
    await page.getByRole('textbox', { name: 'Professional summary', exact: true }).waitFor();
    await page.getByRole('button', { name: /^Work experience/ }).click();
    await page.getByRole('textbox', { name: 'Details and achievements', exact: true }).fill('Coordinate guest requests.\nSupport new team members with service standards.');
    assert.match(await page.getByRole('status').innerText(), /Unsaved changes/);
    await page.getByRole('button', { name: 'Save changes', exact: true }).click();
    await page.getByRole('status').filter({ hasText: 'All changes saved' }).waitFor();
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Overflow at ${width}`);
    await page.evaluate(() => scrollTo(0, 0));
    await page.screenshot({ path: path.join(output, `resume-${width}-edit.png`), fullPage: true });
    if (width <= 950) await page.getByRole('button', { name: 'Preview', exact: true }).click();
    await page.getByRole('region', { name: 'Live resume preview' }).waitFor({ state: 'visible' });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Preview overflow at ${width}`);
    await page.screenshot({ path: path.join(output, `resume-${width}-preview.png`), fullPage: true });
    if (width === 1440 || width === 390) {
      const downloadPromise = page.waitForEvent('download', { timeout: 60000 });
      await page.getByRole('button', { name: 'Export PDF', exact: true }).click();
      const download = await downloadPromise;
      const target = path.join(output, `resume-${width}.pdf`);
      await download.saveAs(target);
      const bytes = await readFile(target);
      assert.equal(bytes.subarray(0, 5).toString(), '%PDF-');
      assert.ok(bytes.length > 3000, 'PDF should contain actual content');
      await page.getByRole('button', { name: 'View PDF', exact: true }).click();
      await page.getByRole('dialog').waitFor({ state: 'visible' });
      await page.getByRole('button', { name: 'Close preview', exact: true }).click();
    }
    console.log(`PASS ${width}px edit, save, preview, no overflow${width === 1440 || width === 390 ? ', PDF download and dialog' : ''}`);
    await page.close();
  }
  assert.deepEqual(errors, [], 'No browser runtime errors');
} finally { await browser.close(); }

const { chromium } = require('playwright');
const assert = require('node:assert/strict');
(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    for (const width of [390, 1440, 320]) {
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      page.setDefaultTimeout(15000);
      // Next Link's compile-time env references need a test-only shim under Vite.
      await page.addInitScript(() => { window.process = { env: { NODE_ENV: 'development' } }; });
      const errors = []; page.on('pageerror', e => errors.push(e.message));
      let rows = []; let failSave = false;
      await page.route('**/api/alerts', async route => {
        const request = route.request();
        if (request.method() === 'GET') return route.fulfill({ json: { alerts: rows, email: 'julianlaville@gmail.com' } });
        if (failSave) return route.fulfill({ status: 503, json: { error: 'Unable to save. Try again.' } });
        const body = request.postDataJSON();
        if (request.method() === 'DELETE') { rows = rows.filter(row => row.id !== body.id); return route.fulfill({ json: { success: true } }); }
        const alert = { ...body, id: body.id || '11111111-1111-4111-8111-111111111111', created_at: '2026-09-24T12:00:00Z' };
        rows = [...rows.filter(row => row.id !== alert.id), alert];
        return route.fulfill({ json: { alert } });
      });
      await page.goto('http://127.0.0.1:4182/tests/browser/alerts.html');
      await page.getByRole('button', { name: 'New alert', exact: true }).click();
      await page.getByLabel('Keywords', { exact: true }).fill(' Chef, chef, Cook ');
      await page.getByLabel('Industry', { exact: true }).selectOption('Food & Beverage');
      await page.getByRole('button', { name: 'Save alert', exact: true }).click();
      await page.getByRole('heading', { name: 'chef or cook', exact: true }).waitFor();
      assert.deepEqual(rows[0].keywords, ['chef', 'cook']);
      await page.reload();
      await page.getByRole('button', { name: /Edit alert/ }).click();
      await page.getByLabel('Keywords', { exact: true }).fill('receptionist');
      failSave = true;
      await page.getByRole('button', { name: 'Save changes', exact: true }).click();
      await page.getByRole('alert').waitFor();
      assert.equal(await page.getByLabel('Keywords', { exact: true }).inputValue(), 'receptionist');
      failSave = false;
      await page.getByRole('button', { name: 'Save changes', exact: true }).click();
      await page.getByRole('heading', { name: 'receptionist', exact: true }).waitFor();
      assert.equal(rows.length, 1);
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'No horizontal overflow');
      await page.screenshot({ path: `/tmp/joblink-alerts-${width}.png`, fullPage: true });
      await page.getByRole('button', { name: /Delete alert/ }).click();
      assert.equal(rows.length, 1);
      await page.getByRole('button', { name: 'Confirm delete', exact: true }).click();
      await page.getByText('Tell us what you’re looking for').waitFor();
      assert.equal(rows.length, 0); assert.deepEqual(errors, []);
      console.log(`PASS ${width}px: create, reload, edit, error/retry, delete, no overflow or browser errors`);
      await page.close();
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });

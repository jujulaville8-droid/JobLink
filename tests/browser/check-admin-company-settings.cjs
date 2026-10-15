const { chromium } = require('playwright');
const assert = require('node:assert/strict');

(async () => {
  const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:4194';
  const browser = await chromium.launch({ headless: true, executablePath: process.env.TEST_BROWSER_EXECUTABLE || undefined });
  const companyId = '9fde7fc7-70b3-4354-9d11-d520f4ec09f9';
  const otherId = '6dde0e9d-e04a-4d95-a9d3-50fa9ffcc961';
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j9l8AAAAASUVORK5CYII=', 'base64');
  try {
    for (const width of [320, 390, 1440]) {
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      page.setDefaultTimeout(15000);
      const errors = [];
      const writes = [];
      let failSave = false;
      let logoVersion = 0;
      const companies = [
        { id: companyId, company_name: 'Example Hotel', industry: 'Hospitality & Tourism', location: 'Barbuda', logo_url: null, contact_email: 'hiring@example.com' },
        { id: otherId, company_name: 'Example Cafe', industry: 'Food & Beverage', location: 'St. John’s', logo_url: null, contact_email: 'cafe@example.com' },
      ];
      page.on('pageerror', error => errors.push(error.message));
      await page.route('**/fixture-logo-*.png', route => route.fulfill({ contentType: 'image/png', body: png }));
      await page.route('**/api/admin/post-job/companies', route => route.fulfill({ json: { companies } }));
      await page.route('**/api/admin/companies', route => {
        const body = route.request().postDataJSON(); writes.push({ type: 'contact', body });
        if (failSave) return route.fulfill({ status: 503, json: { error: 'Unable to save. Try again.' } });
        const company = companies.find(row => row.id === body.company_id);
        company.contact_email = body.contact_email;
        return route.fulfill({ json: { success: true, company } });
      });
      await page.route('**/api/admin/companies/logo', route => {
        const req = route.request();
        const uploaded = req.headers()['content-type'].includes('multipart/form-data');
        const body = uploaded ? null : req.postDataJSON();
        const id = uploaded ? /name="company_id"\r\n\r\n([^\r]+)/.exec(req.postDataBuffer().toString())[1] : body.company_id;
        const company = companies.find(row => row.id === id);
        const next = uploaded ? `${base}/fixture-logo-${++logoVersion}.png` : body.logo_url || null;
        writes.push({ type: 'logo', id, uploaded, next });
        company.logo_url = next;
        return route.fulfill({ json: { success: true, company } });
      });
      await page.goto(`${base}/tests/browser/admin-company-settings.html`);
      await page.getByRole('heading', { name: 'Companies', exact: true }).waitFor();
      await page.getByLabel('Find a company').fill('HOTEL');
      await page.getByRole('button', { name: /Example Hotel/ }).click();
      const contact = page.getByLabel('Employer notification email');
      assert.equal(await contact.inputValue(), 'hiring@example.com');
      await contact.fill('  OWNER@EXAMPLE.COM  ');
      const contactDraft = await contact.inputValue();
      failSave = true;
      await page.getByRole('button', { name: 'Save notification email', exact: true }).click();
      await page.getByRole('alert').waitFor();
      assert.equal(await contact.inputValue(), contactDraft);
      failSave = false;
      await page.getByRole('button', { name: 'Save notification email', exact: true }).click();
      await page.getByText('Employer notification email saved.', { exact: true }).waitFor();
      assert.equal(companies[0].contact_email, 'owner@example.com');
      await page.getByRole('button', { name: 'Clear notification email', exact: true }).click();
      await page.getByText('Employer notification email cleared.', { exact: true }).waitFor();
      assert.equal(companies[0].contact_email, null);
      await page.getByLabel('Choose company logo').setInputFiles({ name: 'logo.png', mimeType: 'image/png', buffer: png });
      await page.getByText('Logo uploaded and saved.', { exact: true }).waitFor();
      const firstLogo = companies[0].logo_url;
      await page.getByLabel('Choose company logo').setInputFiles({ name: 'replacement.png', mimeType: 'image/png', buffer: png });
      await page.getByText('Logo uploaded and saved.', { exact: true }).waitFor();
      assert.notEqual(companies[0].logo_url, firstLogo);
      await page.getByRole('button', { name: 'Clear logo', exact: true }).click();
      await page.getByText('Logo cleared.', { exact: true }).waitFor();
      assert.equal(companies[0].logo_url, null);
      await page.getByLabel('Find a company').fill('cafe');
      await page.getByRole('button', { name: /Example Cafe/ }).click();
      assert.equal(await contact.inputValue(), 'cafe@example.com');
      assert.equal(companies[1].contact_email, 'cafe@example.com');
      assert.equal(writes.filter(write => write.type === 'contact').every(write => write.body.company_id === companyId), true);
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'company page has no horizontal overflow');
      await page.screenshot({ path: `/tmp/joblink-admin-companies-${width}.png`, fullPage: true, animations: 'disabled' });

      let postFailure = true;
      const postings = [];
      await page.route('**/api/admin/post-job', route => {
        const body = route.request().postDataJSON(); postings.push(body);
        return route.fulfill(postFailure ? { status: 503, json: { error: 'Posting unavailable. Try again.' } } : { json: { success: true, listingId: 'fixture-listing' } });
      });
      await page.goto(`${base}/tests/browser/admin-company-settings.html?view=post-job`);
      await page.getByRole('heading', { name: 'Post a Job', exact: true }).waitFor();
      await page.getByPlaceholder('Search companies...').fill('CAFE');
      await page.getByRole('button', { name: /Example Cafe/ }).click();
      assert.equal(await page.getByLabel('Employer notification email').inputValue(), 'cafe@example.com');
      await page.getByLabel('Employer notification email').fill('updated@example.com');
      await page.getByPlaceholder('Job title *', { exact: true }).fill('Cook');
      await page.getByPlaceholder('Job description *', { exact: true }).fill('Fixture vacancy description with employer-approved duties.');
      await page.locator('select').filter({ has: page.locator('option[value="Food & Beverage"]') }).first().selectOption('Food & Beverage');
      await page.getByRole('button', { name: 'Post Job — Go Live Now', exact: true }).click();
      await page.getByText('Posting unavailable. Try again.', { exact: true }).waitFor();
      assert.equal(postings[0].contact_email, 'updated@example.com');
      assert.equal(postings[0].company_id, otherId);
      assert.equal(await page.getByLabel('Employer notification email').inputValue(), 'updated@example.com');
      await page.getByRole('button', { name: 'New Company', exact: true }).click();
      await page.getByPlaceholder('Company name *', { exact: true }).fill('New Example Company');
      await page.getByLabel('Employer notification email').fill('new@example.com');
      await page.getByRole('button', { name: 'Post Job — Go Live Now', exact: true }).click();
      await page.getByText('Posting unavailable. Try again.', { exact: true }).waitFor();
      assert.equal(postings[1].new_company.contact_email, 'new@example.com');
      assert.equal(postings[1].new_company.company_name, 'New Example Company');
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'post page has no horizontal overflow');
      await page.screenshot({ path: `/tmp/joblink-admin-post-job-${width}.png`, fullPage: true, animations: 'disabled' });
      postFailure = false;
      await page.getByRole('button', { name: 'Post Job — Go Live Now', exact: true }).click();
      await page.getByText('Job posted successfully!', { exact: true }).waitFor();
      assert.deepEqual(errors, []);
      assert.equal(await page.locator('vite-error-overlay,[data-nextjs-dialog]').count(), 0);
      console.log(`PASS ${width}px: company search/select, contact save/error/retry/clear/preservation, logo upload/replace/clear, existing/new posting contact/error/retry, no overflow or browser errors`);
      await page.close();
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });

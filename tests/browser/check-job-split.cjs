/* Actual Next /jobs regression checks. Use an isolated local synthetic backend;
   never point this runner at production. Accepts a Playwright Page. */
module.exports = async function checkJobSplit(page, origin = 'http://127.0.0.1:4300') {
  if (!['127.0.0.1', 'localhost'].includes(new URL(origin).hostname)) throw new Error('Local QA only');
  const check = (condition, message) => { if (!condition) throw new Error(message); };
  const selected = id => page.waitForURL(url => url.searchParams.get('job') === id);
  const heading = () => page.locator('#job-detail-heading:visible');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${origin}/jobs`);
  const cards = page.locator('[data-job-select]:visible');
  await cards.first().waitFor();
  const first = await cards.nth(0).getAttribute('data-job-select');
  const second = await cards.nth(1).getAttribute('data-job-select');
  await cards.nth(0).click();
  await selected(first);
  await heading().waitFor();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.locator(`[data-job-select="${second}"]:visible`).click();
  await selected(second);
  await heading().waitFor();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('link', { name: 'Back to results' }).click();
  await page.waitForURL(url => !url.searchParams.has('job'));
  await cards.first().waitFor();
  const backUrl = page.url();

  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`${origin}/jobs?job=${first}`);
  await heading().waitFor();
  const top = await heading().evaluate(element => {
    const pane = element.closest('section').parentElement;
    pane.scrollTop = 300;
    return pane.scrollTop;
  });
  check(top > 0, 'Fixture needs a scrollable detail description');
  await page.locator(`[data-job-select="${second}"]:visible`).click();
  await selected(second);
  await page.waitForFunction(id => document.querySelector(`a[href="/jobs/${id}"]`) &&
    Array.from(document.querySelectorAll('#job-detail-heading')).some(element => element.checkVisibility()), second);
  const scrollTop = await heading().evaluate(element => element.closest('section').parentElement.scrollTop);
  check(scrollTop === 0, 'Changing jobs retained the old detail scroll');
  check(await heading().evaluate(element => parseFloat(getComputedStyle(element.closest('section')).borderRadius)) > 0,
    'Detail panel lost its rounded corners');
  await page.setViewportSize({ width: 768, height: 900 });
  await page.waitForTimeout(300);
  const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  check(scrollWidth <= 768, 'Tablet header causes horizontal overflow');
  return { backUrl, priorScrollTop: top, selectedScrollTop: scrollTop, tabletScrollWidth: scrollWidth };
};

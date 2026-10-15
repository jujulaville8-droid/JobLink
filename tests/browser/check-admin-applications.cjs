// Real React UI, synthetic data and API adapter. No genuine Supabase or login is used.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {execFileSync} = require('node:child_process');
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const repo = path.resolve(__dirname, '../..');
const output = path.resolve(process.env.ADMIN_APPLICATIONS_QA_OUTPUT || path.join(repo, '.playwright-mcp/admin-applications'));
const origin = 'http://127.0.0.1:4212';
const base = '/admin/applications';
const dates = 'from=2026-09-09&to=2026-10-08';
const jobId = '20000000-0000-4000-8000-000000000001';
const companyId = '10000000-0000-4000-8000-000000000001';
const detailPath = `${base}/${jobId}`;
const axePath = path.join(repo, 'node_modules/axe-core/axe.min.js');
fs.mkdirSync(output, {recursive:true});
function sha(file) { return crypto.createHash('sha256').update(fs.readFileSync(path.join(repo, file))).digest('hex'); }
function sourceSnapshot() {
  const files = ['src/components/DashboardCanvas.tsx', 'src/components/SidebarNav.tsx', 'src/components/Navbar.tsx', 'src/components/DashboardPageTransition.tsx', 'src/app/globals.css', 'src/lib/admin-applications.ts'];
  for(const file of fs.readdirSync(path.join(repo,'src/components/admin-applications'))) if(/\.(tsx?|css)$/.test(file)) files.push(`src/components/admin-applications/${file}`);
  return Object.fromEntries(files.sort().map(file => [file,sha(file)]));
}
const report = { startedAt:new Date().toISOString(), scope:'Standalone Vite harness imports actual UI, drawer, Navbar, DashboardCanvas, SidebarNav, fonts and global CSS. Synthetic administrator, 65 synthetic jobs and 1,205 synthetic applications. API GET responses are in-memory fixtures; no genuine backend or auth coverage and no claim of fidelity to the approved image.', gitHead:execFileSync('git',['rev-parse','HEAD'],{cwd:repo,encoding:'utf8'}).trim(), sourceBefore:sourceSnapshot(), checks:[], scenarios:[], errors:[], console:[], blocked:[], requests:[], axe:[], screenshots:[] };
function check(name, callback) {
  try { callback(); report.checks.push({name,passed:true}); console.log(`PASS ${name}`); }
  catch(e) { report.checks.push({name,passed:false,error:e.message}); console.log(`FAIL ${name}: ${e.message}`); }
}
async function shot(page,name) { await page.waitForTimeout(300); await page.evaluate(async()=>{await Promise.all(document.getAnimations().filter(a=>{const t=a.effect?.getComputedTiming();return t&&Number.isFinite(t.endTime)&&t.endTime<2000;}).map(a=>a.finished.catch(()=>{})));}); await page.screenshot({path:path.join(output,`${name}.png`),fullPage:false}); report.screenshots.push(`${name}.png`); }
async function noOverflow(page,name) { const metrics = await page.evaluate(() => ({width:innerWidth,scroll:document.documentElement.scrollWidth})); check(`${name}: no document overflow`,()=>assert.ok(metrics.scroll<=metrics.width,JSON.stringify(metrics))); }
async function audit(page,name) {
  await page.addScriptTag({path:axePath});
  const result=await page.evaluate(async()=>window.axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21a','wcag21aa']}}));
  const violations=result.violations.map(v=>({id:v.id,impact:v.impact,help:v.help,nodes:v.nodes.map(n=>({target:n.target,html:n.html,failureSummary:n.failureSummary}))}));
  const chartContrast=await page.evaluate(()=>{
    const parse=c=>{const m=c.match(/[\d.]+/g);return m?m.slice(0,3).map(Number):[0,0,0];};
    const luminance=c=>c.map(v=>{const n=v/255;return n<=.04045?n/12.92:((n+.055)/1.055)**2.4;}).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);
    const seen=new Set();return [...document.querySelectorAll('svg[role="img"] text')].filter(el=>{const c=getComputedStyle(el);const k=c.fill+'|'+c.fontSize;if(seen.has(k))return false;seen.add(k);return true;}).map(el=>{
      const style=getComputedStyle(el);let ancestor=el.parentElement,bg='rgb(255, 255, 255)',opacity=Number(style.opacity);
      while(ancestor){const a=getComputedStyle(ancestor);opacity*=Number(a.opacity);if(a.backgroundColor!=='rgba(0, 0, 0, 0)'&&a.backgroundColor!=='transparent'){bg=a.backgroundColor;break;}ancestor=ancestor.parentElement;}
      const foreground=parse(style.fill),background=parse(bg),front=luminance(foreground),back=luminance(background);
      const region=el.closest('[role="region"]');return {text:el.textContent,fill:style.fill,background:bg,fontSize:style.fontSize,opacity,contrast:(Math.max(front,back)+.05)/(Math.min(front,back)+.05),scrollable:region?region.scrollWidth>region.clientWidth:false,keyboardReachable:region?.tabIndex===0};
    });
  });
  if(chartContrast.length)check(`${name}: manual SVG text contrast on actual card background`,()=>assert.ok(chartContrast.every(c=>c.opacity===1&&c.contrast>=4.5),JSON.stringify(chartContrast)));
  report.axe.push({name,chartContrast,violations,incomplete:result.incomplete.map(v=>({id:v.id,impact:v.impact,nodes:v.nodes}))});
  check(`${name}: axe WCAG has no violations`,()=>assert.equal(violations.length,0,violations.map(v=>`${v.id} (${v.nodes.length})`).join(', ')));
}
async function settleOverview(page) { await page.locator('[aria-label="Application summary"]').waitFor(); await page.locator('table tbody tr').last().waitFor({state:'attached'}); }
async function settleApplicants(page) { await page.getByRole('navigation',{name:'Applicants pagination',exact:true}).waitFor(); }
async function visit(page,url,kind='overview') { await page.goto(origin+url,{waitUntil:'load'}); await page.evaluate(()=>document.fonts.ready); if(kind==='overview') await settleOverview(page); if(kind==='applicants') await settleApplicants(page); }
const overviewTable = page => page.locator('table').filter({has:page.locator('th').filter({hasText:'Job / Company'})});
async function summary(page) { return page.locator('[aria-label="Application summary"] strong').allTextContents(); }
async function openFirst(page) { const button=page.getByRole('button',{name:/^View application from /}).first(); const name=await button.getAttribute('aria-label'); await button.click(); const dialog=page.getByRole('dialog',{name:'Application details'}); await dialog.getByRole('heading',{name:'Current résumé',exact:true}).waitFor(); return {dialog,name}; }
async function fixture(page,options) { await page.evaluate(options=>window.__adminApplicationsFixture.configure(options),options); }

(async()=>{
  const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_EXECUTABLE_PATH ? {executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH} : {})});
  async function contextFor(label,width,{reducedMotion='no-preference',deviceScaleFactor=1,height=1000}={}) {
    const context=await browser.newContext({viewport:{width,height},deviceScaleFactor,reducedMotion,serviceWorkers:'block'});
    await context.route('**/*',route=>{
      const req=route.request(), u=new URL(req.url());
      if(req.method()==='GET'&&u.origin===origin&&!u.pathname.startsWith('/api/')&&!u.pathname.startsWith('/auth/')) return route.continue();
      report.blocked.push({label,method:req.method(),url:u.href}); return route.abort();
    });
    await context.routeWebSocket('**/*',socket=>new URL(socket.url()).origin==='ws://127.0.0.1:4212'?socket.connectToServer():socket.close());
    const page=await context.newPage(); page.setDefaultTimeout(10000);
    await page.clock.setFixedTime(new Date('2026-10-08T16:00:00Z'));
    page.on('pageerror',e=>report.errors.push({label,url:page.url(),message:e.message,stack:e.stack}));
    page.on('console',m=>{if(m.type()==='error'||m.type()==='warning')report.console.push({label,url:page.url(),type:m.type(),message:m.text()});});
    return {context,page};
  }
  async function scenario(name,width,work,options) {
    const {context,page}=await contextFor(name,width,options);
    try { await work(page); report.scenarios.push({name,completed:true}); }
    catch(e) { report.scenarios.push({name,completed:false,error:e.stack}); check(`${name}: completed`,()=>{throw e;}); await shot(page,`failure-${name}`).catch(()=>{}); }
    finally {
      const state=await page.evaluate(()=>window.__adminApplicationsFixture?.snapshot()).catch(()=>null);
      if(state)report.requests.push({name,requests:state.requests});
      await context.close();
    }
  }
  try {
    for(const width of [320,375,390,768,1440]) await scenario(`responsive-${width}`,width,async page=>{
      await visit(page,`${base}?${dates}&sort=applications_desc`);
      const stats=await summary(page);
      check(`${width}: global counts beyond 1,000 and zero-count jobs`,()=>assert.deepEqual(stats,['1,205','64','1']));
      const rowCount=await overviewTable(page).locator('tbody tr').count(); check(`${width}: exactly 20 rendered job rows`,()=>assert.equal(rowCount,20));
      await noOverflow(page,`${width} overview`); await shot(page,`${width}-overview`);
      const longLink=page.getByRole('link',{name:'Guest Experience and Community Programme Coordinator',exact:true});
      const longBounds=await longLink.boundingBox();check(`${width}: long job title remains within viewport`,()=>assert.ok(longBounds && longBounds.x>=0 && longBounds.x+longBounds.width<=width+1));
      const chart=page.getByRole('region',{name:'Daily applications chart',exact:true});
      const chartSize=await chart.evaluate(el=>({client:el.clientWidth,scroll:el.scrollWidth}));
      if(chartSize.scroll>chartSize.client) { await chart.focus();await page.keyboard.press('ArrowRight');await page.waitForTimeout(180);const offset=await chart.evaluate(el=>el.scrollLeft);check(`${width}: chart scrolls by keyboard without page overflow`,()=>assert.ok(offset>0)); }

      await audit(page,`${width} overview`);
      if(width===1440||width===390) { const first=overviewTable(page).locator('tbody tr').first();await first.evaluate(el=>el.scrollIntoView({block:'start',behavior:'instant'}));await page.evaluate(()=>window.scrollBy(0,-160));await shot(page,`${width}-overview-jobs`); }


      await page.getByRole('link',{name:'Guest Services Associate',exact:true}).click(); await settleApplicants(page);
      const total=await page.getByRole('navigation',{name:'Applicants pagination',exact:true}).innerText();
      check(`${width}: full applicant count before pagination`,()=>assert.match(total,/1,005/));
      const contacts=await page.locator('main').innerText(); check(`${width}: list omits private contacts`,()=>assert.ok(!contacts.includes('@example.test')));
      if(width===390) { const row=page.getByRole('button',{name:/^View application from /}).first();await row.evaluate(el=>el.scrollIntoView({block:'start',behavior:'instant'}));await page.evaluate(()=>window.scrollBy(0,-90));await shot(page,'390-applicant-list'); }
      const {dialog,name}=await openFirst(page);
      const resumeHref=await dialog.getByRole('link',{name:'View current résumé',exact:true}).getAttribute('href');
      check(`${width}: current résumé uses protected route`,()=>assert.match(resumeHref,/^\/api\/cv-download\?profileId=[a-f0-9-]{36}$/));
      await noOverflow(page,`${width} detail`); await shot(page,`${width}-detail`); await audit(page,`${width} detail`);
      const focusStart=await page.evaluate(()=>document.activeElement?.getAttribute('aria-label'));
      check(`${width}: modal autofocus`,()=>assert.equal(focusStart,'Close application details'));
      for(let n=0;n<9;n++) {
        await page.keyboard.press('Tab');
        const focus=await page.evaluate(()=>({inDialog:!!document.activeElement?.closest('dialog'),tag:document.activeElement?.tagName,documentFocused:document.hasFocus()}));
        check(`${width}: modal excludes background keyboard targets ${n+1}`,()=>assert.ok(focus.inDialog || (focus.tag==='BODY'&&!focus.documentFocused),JSON.stringify(focus)));
      }
      await dialog.getByRole('button',{name:'Close application details'}).focus();
      await page.evaluate(()=>document.querySelector('header a[href="/"]').focus());
      const backgroundBlocked=await page.evaluate(()=>!!document.activeElement?.closest('dialog'));
      check(`${width}: native modal makes background inert`,()=>assert.equal(backgroundBlocked,true));
      await page.keyboard.press('Escape'); await dialog.waitFor({state:'detached'});
      check(`${width}: Escape clears selected application`,()=>assert.equal(new URL(page.url()).searchParams.has('application'),false));
      const focusAfter=await page.evaluate(()=>document.activeElement?.getAttribute('aria-label')); check(`${width}: focus returns to opener`,()=>assert.equal(focusAfter,name));
      await openFirst(page); await page.goBack(); await page.getByRole('dialog').waitFor({state:'detached'});
      await page.goForward(); await page.getByRole('dialog').getByRole('heading',{name:'Current résumé',exact:true}).waitFor();
      check(`${width}: Back closes and Forward restores selection`,()=>assert.ok(new URL(page.url()).searchParams.has('application')));
      await page.getByRole('button',{name:'Close application details'}).click();
      await page.getByRole('link',{name:'Back to applications',exact:true}).click(); await settleOverview(page);
      check(`${width}: back link preserves overview sort/date`,()=>{const p=new URL(page.url()).searchParams;assert.equal(p.get('sort'),'applications_desc');assert.equal(p.get('from'),'2026-09-09');assert.equal(p.get('to'),'2026-10-08');});
    });

    await scenario('filters-pagination-history',1440,async page=>{
      await visit(page,`${base}?${dates}&sort=applications_desc`);
      await page.getByRole('navigation',{name:'Jobs pagination'}).getByRole('button',{name:'Next page'}).click(); await settleOverview(page);
      check('Overview pagination preserves global totals',()=>assert.equal(new URL(page.url()).searchParams.get('page'),'2'));
      const stats=await summary(page);check('Page 2 summary remains global',()=>assert.deepEqual(stats,['1,205','64','1']));
      await page.getByLabel('Sort jobs',{exact:true}).selectOption('applications_asc');await settleOverview(page);
      const first=await overviewTable(page).locator('tbody tr').first().innerText(); check('Global ascending sort puts zero-applicant job first',()=>assert.match(first,/Zero applications role/));
      await page.getByRole('link',{name:'Zero applications role',exact:true}).click();await settleApplicants(page);
      await page.getByRole('heading',{name:'No applicants in this view'}).waitFor(); check('Zero-count job has explicit empty applicant state',()=>assert.ok(true));
      await visit(page,`${base}?${dates}`);
      await page.getByLabel('Search jobs or companies',{exact:true}).fill('Guest Services');await page.getByRole('button',{name:'Apply search',exact:true}).click();await settleOverview(page);
      const searched=await summary(page);check('Job/company search updates URL and counts',()=>{assert.equal(new URL(page.url()).searchParams.get('q'),'Guest Services');assert.equal(searched[0],'1,005');});
      await page.getByRole('button',{name:'Reset filters',exact:true}).first().click();await settleOverview(page);
      const company=page.locator('details').filter({has:page.locator('summary').filter({hasText:/^Company/})});
      await company.locator('summary').click();await company.getByRole('button',{name:'Example Harbour Resort',exact:true}).click();await settleOverview(page);
      check('Company lookup applies exact identifier',()=>assert.equal(new URL(page.url()).searchParams.get('companyId'),companyId));
      const job=page.locator('details').filter({has:page.locator('summary').filter({hasText:/^Job(?: ·|$)/})});
      await job.locator('summary').click();await job.getByRole('searchbox',{name:'Search jobs',exact:true}).fill('Guest Services');await job.getByRole('button',{name:'Search jobs',exact:true}).click();
      await job.getByRole('button',{name:'Guest Services Associate',exact:true}).click();await settleOverview(page);
      check('Job lookup preserves company and exact job ID',()=>{const p=new URL(page.url()).searchParams;assert.equal(p.get('companyId'),companyId);assert.equal(p.get('jobId'),jobId);});
      await page.getByLabel('Current application status',{exact:true}).selectOption('interview');await settleOverview(page);
      const interviewed=await summary(page);check('Current-status filter applies to full aggregate',()=>assert.equal(interviewed[0],'251'));
      await page.getByLabel('Job status',{exact:true}).selectOption('closed');await page.getByRole('heading',{name:'No jobs match these filters'}).waitFor();check('Job status intersects selected job',()=>assert.equal(new URL(page.url()).searchParams.get('jobStatus'),'closed'));
      await page.getByRole('button',{name:'Reset filters',exact:true}).first().click();await settleOverview(page);
      await page.getByLabel('Application dates',{exact:true}).selectOption('7');await settleOverview(page);
      const recent=await summary(page);check('Date preset filters seven inclusive days',()=>{assert.equal(new URL(page.url()).searchParams.get('from'),'2026-10-02');assert.equal(recent[0],'280');});
      await page.getByLabel('Application dates',{exact:true}).selectOption('custom');await page.getByLabel('From',{exact:true}).fill('2026-10-08');await page.getByLabel('To',{exact:true}).fill('2026-10-08');await page.getByRole('button',{name:'Apply dates',exact:true}).click();await settleOverview(page);
      const day=await summary(page);check('Custom inclusive single day',()=>assert.equal(day[0],'40'));

      await visit(page,`${detailPath}?${dates}&q=Guest&sort=company_asc&page=3&limit=10&applicantPage=2`, 'applicants');
      await page.getByLabel('Sort applicants',{exact:true}).selectOption('name');await settleApplicants(page);
      check('Applicant sorting resets only applicant page',()=>{const p=new URL(page.url()).searchParams;assert.equal(p.get('page'),'3');assert.equal(p.get('sort'),'company_asc');assert.equal(p.has('applicantPage'),false);});
      await page.getByRole('navigation',{name:'Applicants pagination'}).getByRole('button',{name:'Next page'}).click();await settleApplicants(page);
      const before=new URL(page.url()).search;
      await openFirst(page);await page.getByRole('button',{name:'Close application details'}).click();
      check('Closing detail preserves all list filters/pages',()=>assert.equal(new URL(page.url()).search,before));
      await page.getByRole('link',{name:'Back to applications',exact:true}).click();await settleOverview(page);
      check('Back to overview preserves its original page/search/sort',()=>{const p=new URL(page.url()).searchParams;assert.equal(p.get('page'),'3');assert.equal(p.get('q'),'Guest');assert.equal(p.get('sort'),'company_asc');assert.equal(p.has('applicantSort'),false);});
    });

    await scenario('error-empty-private-detail',390,async page=>{
      await visit(page,`${base}?${dates}`);await fixture(page,{overviewError:true});await page.reload();
      await page.getByRole('alert').waitFor();check('Overview service failure is explicit',()=>assert.ok(true));await shot(page,'390-overview-error');
      await fixture(page,{overviewError:false});await page.getByRole('button',{name:'Try again',exact:true}).click();await settleOverview(page);check('Overview error retry recovers',()=>assert.ok(true));
      await fixture(page,{empty:true});await page.reload();await page.getByRole('heading',{name:'No jobs match these filters'}).waitFor();await shot(page,'390-overview-empty');
      const empty=await summary(page);check('Empty dataset reports real zeros',()=>assert.deepEqual(empty,['0','0','0']));await fixture(page,{empty:false});
      await visit(page,`${detailPath}?${dates}`,'applicants');await fixture(page,{resumeUnavailable:true});let current=await openFirst(page);
      await current.dialog.getByText('No current résumé available.',{exact:true}).waitFor();const resumeLinks=await current.dialog.locator('a[href^="/api/cv"]').count();check('No résumé state provides no resume links',()=>assert.equal(resumeLinks,0));await shot(page,'390-detail-no-resume');
      await current.dialog.getByRole('button',{name:'Close application details'}).click();await fixture(page,{resumeUnavailable:false,detailError:true});await page.getByRole('button',{name:/^View application from /}).first().click();await page.getByRole('dialog').getByRole('alert').waitFor();await shot(page,'390-detail-error');
      await fixture(page,{detailError:false});await page.getByRole('dialog').getByRole('button',{name:'Try again'}).click();await page.getByRole('dialog').getByRole('heading',{name:'Current résumé',exact:true}).waitFor();check('Detail service failure retry recovers',()=>assert.ok(true));
    });
    await scenario('invalid-out-of-range',375,async page=>{
      await visit(page,`${base}?${dates}&page=10000`);await page.getByRole('heading',{name:'No jobs on this page'}).waitFor();
      const stats=await summary(page);check('Out-of-range page retains complete aggregate',()=>assert.deepEqual(stats,['1,205','64','1']));
      await page.getByRole('button',{name:'First page',exact:true}).click();await settleOverview(page);check('Out-of-range first-page recovery',()=>assert.equal(new URL(page.url()).searchParams.get('page'),'1'));
      await visit(page,`${base}?from=2026-02-30&to=2026-10-08`,'none');await page.getByRole('alert').waitFor();
      const invalidState=await page.evaluate(()=>window.__adminApplicationsFixture.snapshot());
      check('Invalid dates do not trigger an API read',()=>assert.ok(!invalidState.requests.some(r=>r.search.includes('2026-02-30'))));
      await page.getByRole('button',{name:'Reset filters',exact:true}).first().click();await settleOverview(page);
      await visit(page,`${detailPath}?${dates}&application=not-a-uuid`,'applicants');await page.getByText('This application link is invalid.',{exact:false}).waitFor();
      const invalidDialog=await page.getByRole('dialog').count();check('Invalid selected application cannot open detail',()=>assert.equal(invalidDialog,0));
      await visit(page,`${detailPath}?${dates}&application=40000000-0000-4000-8000-000000001006`,'applicants');
      await page.getByRole('dialog').getByRole('alert').waitFor();const wrongDetail=await page.getByRole('dialog').innerText();
      check('Mismatched application/job cannot expose private details',()=>assert.ok(!wrongDetail.includes('@example.test')&&!wrongDetail.includes('+1 268')));
      await shot(page,'375-invalid-job-application');
    });
    await scenario('account-transitions',390,async page=>{
      await visit(page,`${detailPath}?${dates}`,'applicants');let selected=await openFirst(page);
      const privateEmail=await selected.dialog.locator('a[href^="mailto:"]').innerText();
      await fixture(page,{authUserId:null});await page.getByRole('alert').filter({hasText:'Your session has ended.'}).waitFor();
      const signedOut=await page.locator('main').innerText();const dialogs=await page.getByRole('dialog').count();
      check('Cross-tab signout removes open private drawer and list',()=>{assert.equal(dialogs,0);assert.ok(!signedOut.includes(privateEmail)&&!signedOut.includes('View application from'));});
      const afterLogout=await page.evaluate(()=>({overflow:document.body.style.overflow,requests:window.__adminApplicationsFixture.snapshot().requests.length}));
      check('Signout releases native modal scroll lock',()=>assert.notEqual(afterLogout.overflow,'hidden'));
      await fixture(page,{authUserId:'90000000-0000-4000-8000-000000000001'});await settleApplicants(page);await page.getByRole('dialog').getByRole('heading',{name:'Current résumé',exact:true}).waitFor();
      await fixture(page,{authUserId:'90000000-0000-4000-8000-000000000002',authDenied:true});
      await page.getByRole('dialog').getByRole('alert').waitFor();
      const switched=await page.locator('main').innerText();check('Account switch cannot retain prior applicant contact',()=>assert.ok(!switched.includes(privateEmail)&&!switched.includes('+1 268 555 0100')));
      await fixture(page,{authUserId:'90000000-0000-4000-8000-000000000001',authDenied:false});
      await visit(page,`${base}?fixtureView=preview`,'none');await page.getByRole('heading',{name:'Recent application activity'}).waitFor();await page.getByRole('link',{name:/Guest Services Associate/}).waitFor();
      await fixture(page,{authLoading:true});await page.getByRole('status').filter({hasText:'Checking your admin session'}).waitFor();
      const pending=await page.locator('main').innerText();check('Preview clears cached data while authentication reloads',()=>assert.ok(!pending.includes('Guest Services Associate')));
      await fixture(page,{authLoading:false,authUserId:null});await page.getByRole('alert').filter({hasText:'Your session has ended.'}).waitFor();
      const previewOut=await page.locator('main').innerText();check('Preview signout removes all private activity',()=>assert.ok(!previewOut.includes('Guest Services Associate')));
    });
    await scenario('reduced-motion',390,async page=>{await visit(page,`${base}?${dates}`);const reduced=await page.evaluate(()=>matchMedia('(prefers-reduced-motion: reduce)').matches);check('Reduced motion preference is active',()=>assert.equal(reduced,true));await noOverflow(page,'reduced motion');await page.getByRole('link',{name:'Guest Services Associate',exact:true}).click();await settleApplicants(page);await openFirst(page);await shot(page,'390-detail-reduced-motion');},{reducedMotion:'reduce'});
    await scenario('zoom-equivalent-200-percent',720,async page=>{await visit(page,`${base}?${dates}`);await noOverflow(page,'200% zoom-equivalent overview');await page.getByRole('link',{name:'Guest Services Associate',exact:true}).click();await settleApplicants(page);await openFirst(page);await noOverflow(page,'200% zoom-equivalent detail');await shot(page,'200-percent-zoom-equivalent-detail');await audit(page,'200% zoom-equivalent detail');},{deviceScaleFactor:2,height:500});
    report.sourceAfter=sourceSnapshot();check('Source snapshot remained unchanged during QA',()=>assert.deepEqual(report.sourceAfter,report.sourceBefore));
    check('All intercepted API interactions were GET only',()=>assert.ok(report.requests.every(s=>s.requests.every(r=>r.method==='GET'))));
    check('No browser network reached API or external services',()=>assert.equal(report.blocked.length,0));
    check('No browser JavaScript errors',()=>assert.equal(report.errors.length,0,JSON.stringify(report.errors)));
    report.passed=report.checks.every(c=>c.passed)&&report.scenarios.every(s=>s.completed);
  } finally {
    await browser.close();report.browserClosed=true;report.completedAt=new Date().toISOString();
    report.fixtureHashes=Object.fromEntries(fs.readdirSync(__dirname).filter(f=>f.startsWith('admin-applications')||f==='check-admin-applications.cjs').map(f=>[`tests/browser/${f}`,sha(`tests/browser/${f}`)]));
    fs.writeFileSync(path.join(output,'browser-report.json'),JSON.stringify(report,null,2));
    console.log(JSON.stringify({passed:report.passed,checks:report.checks.length,failures:report.checks.filter(c=>!c.passed),scenarios:report.scenarios,errors:report.errors,report:path.join(output,'browser-report.json')},null,2));
  }
})().catch(e=>{console.error(e);process.exitCode=1;});

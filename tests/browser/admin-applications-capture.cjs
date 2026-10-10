// Supplemental, local-only captures and complete Axe manual-review evidence.
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root=path.resolve(__dirname,'../..');
const output=path.resolve(process.env.ADMIN_APPLICATIONS_QA_OUTPUT || path.join(root,'.playwright-mcp/admin-applications'));
const origin='http://127.0.0.1:4212';
const base='/admin/applications';
const query='?from=2026-09-09&to=2026-10-08&sort=applications_desc';
const prior=JSON.parse(fs.readFileSync(path.join(output,'browser-report.json'),'utf8'));
const hash=file=>crypto.createHash('sha256').update(fs.readFileSync(path.join(root,file))).digest('hex');
const report={startedAt:new Date().toISOString(),scope:'Supplemental real UI captures with synthetic GET-only fixture; no real backend/auth. Complete Axe incomplete results retained.',buildId:fs.readFileSync(path.join(root,'.next/BUILD_ID'),'utf8').trim(),sourceHashes:Object.fromEntries(Object.keys(prior.sourceAfter).map(file=>[file,hash(file)])),screenshots:[],axe:[],errors:[],blocked:[]};
const settle=async page=>{await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(350);};
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_EXECUTABLE_PATH ? {executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH} : {})});
 try{
  for(const width of [1440,390]){
   const context=await browser.newContext({viewport:{width,height:1000},serviceWorkers:'block'});
   await context.route('**/*',route=>{const req=route.request(),u=new URL(req.url());if(req.method()==='GET'&&u.origin===origin&&!u.pathname.startsWith('/api/')&&!u.pathname.startsWith('/auth/'))return route.continue();report.blocked.push({method:req.method(),url:u.href});return route.abort();});
   await context.routeWebSocket('**/*',socket=>new URL(socket.url()).host==='127.0.0.1:4212'?socket.connectToServer():socket.close());
   const page=await context.newPage();page.setDefaultTimeout(10000);await page.clock.setFixedTime(new Date('2026-10-08T16:00:00Z'));
   page.on('pageerror',error=>report.errors.push({width,message:error.message,stack:error.stack}));
   await page.goto(origin+base+query,{waitUntil:'load'});await page.locator('[aria-label="Application summary"] strong').first().waitFor();await settle(page);
   await page.addScriptTag({path:path.join(root,'node_modules/axe-core/axe.min.js')});
   const axe=await page.evaluate(()=>window.axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21a','wcag21aa']}}));
   report.axe.push({width,violations:axe.violations,incomplete:axe.incomplete});
   const table=page.locator('table').filter({has:page.locator('th').filter({hasText:'Job / Company'})});
   const first=table.locator('tbody tr').first();await first.evaluate(el=>el.scrollIntoView({block:'start',behavior:'instant'}));await page.evaluate(()=>window.scrollBy(0,-160));await settle(page);
   const filename=`${width}-overview-jobs.png`;await page.screenshot({path:path.join(output,filename)});
   report.screenshots.push({file:filename,scrollY:await page.evaluate(()=>scrollY),rowBounds:await first.boundingBox()});
   if(width===390){
    await page.goto(`${origin}${base}/20000000-0000-4000-8000-000000000001${query}`,{waitUntil:'load'});
    const row=page.getByRole('button',{name:/^View application from /}).first();await row.waitFor();await row.evaluate(el=>el.scrollIntoView({block:'start',behavior:'instant'}));await page.evaluate(()=>window.scrollBy(0,-90));await settle(page);
    const file='390-applicant-list.png';await page.screenshot({path:path.join(output,file)});report.screenshots.push({file,scrollY:await page.evaluate(()=>scrollY),rowBounds:await row.boundingBox()});
   }
   await context.close();
  }
 }finally{await browser.close();report.browserClosed=true;report.completedAt=new Date().toISOString();fs.writeFileSync(path.join(output,'supplemental-capture-report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({report:path.join(output,'supplemental-capture-report.json'),screenshots:report.screenshots,errors:report.errors,incomplete:report.axe.map(a=>({width:a.width,rules:a.incomplete.map(v=>({id:v.id,nodeCount:v.nodes.length}))}))},null,2));}
})().catch(error=>{console.error(error);process.exitCode=1;});

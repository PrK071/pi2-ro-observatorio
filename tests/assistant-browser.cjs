const {test,before,after}=require('node:test'),assert=require('node:assert/strict');
const{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
let browser,page;const errors=[];
before(async()=>{browser=await chromium.launch({headless:true,...(process.env.BROWSER_EXECUTABLE?{executablePath:process.env.BROWSER_EXECUTABLE}:{})});page=await browser.newPage({viewport:{width:1440,height:1000}});page.on('pageerror',e=>errors.push(e.message));await page.goto(process.env.DASHBOARD_URL||'http://127.0.0.1:8879/');await page.waitForFunction(()=>window.dashboardReady);});
after(async()=>{await browser?.close();});
async function ask(question){await page.locator('#chatInput').fill(question);await page.locator('#chatSend').click();await page.waitForFunction(()=>!chatBusy);return page.locator('#chatMessages .message.bot').last().innerText();}
test('message and follow-up use the requested city/year without modifying panel filters',async()=>{
 const before=await page.evaluate(()=>window.dashboardState.filters);
 assert.match(await ask('Quantos acidentes aconteceram em Santos em 2023?'),/2[.\s]?137/);
 assert.match(await ask('e em 2024?'),/2[.\s]?162/);
 assert.deepEqual(await page.evaluate(()=>chatPlan.cities),['SANTOS']);assert.deepEqual(await page.evaluate(()=>chatPlan.years),[2024]);
 await ask('compare com São Vicente');assert.equal(await page.evaluate(()=>chatPlan.groupBy),'city');
 assert.deepEqual(await page.evaluate(()=>window.dashboardState.filters),before);
});
test('new conversation clears context, changing filters restarts context, user text is inert',async()=>{
 await page.locator('#chatClear').click();assert.equal(await page.locator('#chatMessages .message.user').count(),0);assert.equal(await page.evaluate(()=>chatPlan),null);
 await ask('Quantos acidentes em Santos em 2023?');await page.selectOption('#municipio','CUBATAO');
 await ask('e em 2024?');assert.equal(await page.evaluate(()=>chatPlan.cities?.length||0),0);assert.match(await page.locator('#chatMessages .message.bot').last().innerText(),/CUBATAO|Cubatão/);
 await ask('Quantos acidentes em Santos em 2023? <img src=x onerror=alert(1)>');assert.equal(await page.locator('#chatMessages img').count(),0);
});
test('pending query can be cancelled and mobile chat stays inside the viewport',async()=>{
 await page.route('**/api/chat',async route=>{await new Promise(resolve=>setTimeout(resolve,1500));await route.abort().catch(()=>{});});
 await page.locator('#chatInput').fill('Explique os dados');await page.locator('#chatSend').click();await page.locator('#chatStop').click();
 await page.waitForFunction(()=>!chatBusy);assert.match(await page.locator('#assistantStatus').innerText(),/interrompida/);await page.unroute('**/api/chat');
 await page.setViewportSize({width:390,height:844});await page.locator('#assistant').scrollIntoViewIfNeeded();await page.waitForTimeout(700);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
 await page.screenshot({path:'work/assistant-mobile.png'});assert.deepEqual(errors,[]);
});

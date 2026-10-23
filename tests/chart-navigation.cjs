// Browser regression checks: use actual canvas/button clicks, not callbacks.
// Requires Playwright and a server for dist/. Optional env vars:
// PLAYWRIGHT_MODULE, BROWSER_EXECUTABLE, DASHBOARD_URL.
const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
let browser,page;const errors=[];
before(async()=>{
 browser=await chromium.launch({headless:true,...(process.env.BROWSER_EXECUTABLE?{executablePath:process.env.BROWSER_EXECUTABLE}:{})});
 page=await browser.newPage({viewport:{width:1440,height:1000}});
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto(process.env.DASHBOARD_URL||'http://127.0.0.1:8879/',{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>window.dashboardReady);
});
after(async()=>{await browser?.close();});
const state=()=>page.evaluate(()=>window.dashboardState);
async function reset(){await page.locator('#reset').click();}
async function clickPlot(id,index=0,dataset=0){
 await page.locator('#'+id).scrollIntoViewIfNeeded();
 const box=await page.locator('#'+id).boundingBox();
 const point=await page.evaluate(({id,index,dataset})=>charts[id].getDatasetMeta(dataset).data[index].getCenterPoint(),{id,index,dataset});
 await page.mouse.click(box.x+point.x,box.y+point.y);await page.waitForTimeout(80);
}
async function clickLegend(id,index){
 await page.locator('#'+id).scrollIntoViewIfNeeded();
 const box=await page.locator('#'+id).boundingBox();
 const point=await page.evaluate(({id,index})=>{const b=charts[id].legend.legendHitBoxes[index];return{x:b.left+b.width/2,y:b.top+b.height/2};},{id,index});
 await page.mouse.click(box.x+point.x,box.y+point.y);await page.waitForTimeout(80);
}
test('monthly chart: repeat click, chip removal and local reset preserve prior year/month',async()=>{
 await page.selectOption('#ano','2023');const original=(await state()).filters;
 await clickPlot('temporal',0);assert.equal((await state()).filters.periodo,'2023-01');
 assert.equal((await state()).filters.mes,null);assert.equal((await state()).filters.ano,'2023');
 assert.equal(await page.evaluate(()=>charts.temporal.data.labels.length),12);
 await clickPlot('temporal',0);assert.deepEqual((await state()).filters,original);
 await clickPlot('temporal',1);await page.getByRole('button',{name:/Remover filtro Período:/}).click();assert.deepEqual((await state()).filters,original);
 await clickPlot('temporal',2);await page.locator('#clear-temporal').click();assert.deepEqual((await state()).filters,original);
 await page.locator('#undoFilter').click();assert.equal((await state()).filters.periodo,'2023-03');
 await page.locator('#redoFilter').click();assert.deepEqual((await state()).filters,original);
});
test('types: donut, legend and local clear toggle without discarding other filters',async()=>{
 await reset();await page.selectOption('#municipio','SANTOS');
 const before=(await state()).filters,labels=await page.evaluate(()=>charts.types.data.labels.length);
 await clickPlot('types',0);assert.ok((await state()).filters.tipo_acidente);assert.equal(await page.evaluate(()=>charts.types.data.labels.length),labels);
 await clickPlot('types',0);assert.deepEqual((await state()).filters,before);
 await page.locator('#typeLegend button').first().click();assert.ok((await state()).filters.tipo_acidente);
 await page.locator('#typeLegend [aria-pressed="true"]').click();assert.deepEqual((await state()).filters,before);
 await page.locator('#typeLegend button').first().click();await page.locator('#clear-types').click();assert.deepEqual((await state()).filters,before);
});
test('municipality and road bars remain reversible and keep alternatives visible',async()=>{
 await reset();await page.selectOption('#ano','2023');
 await page.locator('#cities .barrow').first().click();assert.ok((await state()).filters.municipio);
 assert.equal(await page.locator('#cities .barrow').count(),9);
 await page.locator('#cities [aria-pressed="true"]').click();assert.equal((await state()).filters.municipio,null);
 await page.locator('#cities .barrow').first().click();await page.locator('#clear-cities').click();assert.equal((await state()).filters.ano,'2023');assert.equal((await state()).filters.municipio,null);
 await page.locator('#roads .barrow').first().click();assert.ok((await state()).filters.logradouro);
 await page.locator('#roads [aria-pressed="true"]').click();assert.equal((await state()).filters.logradouro,null);
 await page.locator('#roads .barrow').first().click();await page.locator('#clear-roads').click();assert.equal((await state()).filters.logradouro,null);assert.equal((await state()).filters.ano,'2023');
});
test('severity: canvas and condition buttons toggle and local reset restores both groups',async()=>{
 await reset();await page.selectOption('#ano','2023');
 await clickPlot('severity',0);assert.equal((await state()).filters.risco_pista_molhada,'0');
 assert.ok(await page.evaluate(()=>charts.severity.data.datasets[0].data[1]>0));
 await clickPlot('severity',0);assert.equal((await state()).filters.risco_pista_molhada,null);
 await page.locator('[data-wet="1"]').click();assert.equal((await state()).filters.risco_pista_molhada,'1');
 await page.locator('[data-wet="1"]').click();assert.equal((await state()).filters.risco_pista_molhada,null);
 await page.locator('[data-wet="0"]').click();await page.locator('#clear-severity').click();assert.equal((await state()).filters.risco_pista_molhada,null);
});
test('series legends: hiding, undo, redo and restore remain consistent',async()=>{
 await reset();await clickLegend('temporal',0);
 assert.deepEqual((await state()).view.hiddenDatasets.temporal,[0]);
 assert.equal(await page.evaluate(()=>charts.temporal.isDatasetVisible(0)),false);
 await page.locator('#undoFilter').click();assert.equal(await page.evaluate(()=>charts.temporal.isDatasetVisible(0)),true);
 await page.locator('#redoFilter').click();assert.equal(await page.evaluate(()=>charts.temporal.isDatasetVisible(0)),false);
 await page.locator('#clear-temporal').click();assert.equal(await page.evaluate(()=>charts.temporal.isDatasetVisible(0)),true);
 await clickLegend('severity',1);assert.equal(await page.evaluate(()=>charts.severity.isDatasetVisible(1)),false);
 await page.locator('#clear-severity').click();assert.equal(await page.evaluate(()=>charts.severity.isDatasetVisible(1)),true);
 await clickLegend('calibration',0);assert.equal(await page.evaluate(()=>charts.calibration.isDatasetVisible(0)),false);
 await page.locator('#clear-calibration').click();assert.equal(await page.evaluate(()=>charts.calibration.isDatasetVisible(0)),true);
});
test('model experiment can be undone, redone and restored locally',async()=>{
 await reset();await page.selectOption('#modelExperiment','climate');
 assert.equal((await state()).view.experiment,'climate');assert.ok((await page.locator('#modelSummary').innerText()).includes('2023-10-01'));
 await page.locator('#undoFilter').click();assert.equal(await page.locator('#modelExperiment').inputValue(),'primary');assert.ok((await page.locator('#modelSummary').innerText()).includes('2025-01-01'));
 await page.locator('#redoFilter').click();assert.ok((await page.locator('#modelSummary').innerText()).includes('2023-10-01'));
 await page.locator('#clear-calibration').click();assert.equal((await state()).view.experiment,'primary');
});
test('map layer and spatial selections have undo and a local clear',async()=>{
 await reset();await page.locator('#mapFatal').click();assert.equal((await state()).view.mapFatal,true);assert.equal((await state()).stats.total,31493);
 await page.locator('#undoFilter').click();assert.equal((await state()).view.mapFatal,false);
 await page.locator('#redoFilter').click();assert.equal((await state()).view.mapFatal,true);
 await page.locator('#clear-map').click();assert.equal((await state()).view.mapFatal,false);
 await page.locator('#probeLat').fill('-23.96');await page.locator('#probeLng').fill('-46.33');await page.locator('#radiusKm').fill('3');await page.locator('#probeApply').click();
 assert.equal((await state()).filters.radius_km,3);assert.ok((await state()).stats.total<31493);
 await page.locator('#clear-map').click();assert.equal((await state()).filters.lat,null);assert.equal((await state()).stats.total,31493);
 await page.locator('#undoFilter').click();assert.equal((await state()).filters.radius_km,3);assert.equal((await state()).filters.lat,-23.96);
});
test('combined filters undo exactly; new action clears redo; empty selections can recover',async()=>{
 await reset();await page.selectOption('#ano','2023');const a=(await state()).filters;
 await clickPlot('temporal',1);const b=(await state()).filters;
 await clickPlot('types',0);const c=(await state()).filters;
 await page.locator('#cities .barrow').first().click();
 await page.locator('#undoFilter').click();assert.deepEqual((await state()).filters,c);
 await page.locator('#undoFilter').click();assert.deepEqual((await state()).filters,b);
 await page.locator('#undoFilter').click();assert.deepEqual((await state()).filters,a);
 await page.selectOption('#mes','2');assert.equal((await state()).history.redo,0);assert.equal(await page.locator('#redoFilter').isDisabled(),true);
 const prior=(await state()).filters;
 await page.locator('.extra-filters summary').click();await page.locator('#logradouro').fill('VIA INEXISTENTE PARA CONFERENCIA');await page.locator('#applyLocation').click();assert.equal((await state()).stats.total,0);
 await page.locator('#undoFilter').click();assert.deepEqual((await state()).filters,prior);assert.ok((await state()).stats.total>0);
 await page.locator('#clearFilters').click();assert.equal((await state()).stats.total,31493);
 await page.locator('#undoFilter').click();assert.deepEqual((await state()).filters,prior);
});
test('map popup: selecting the same area twice removes its filter',async()=>{
 await reset();
 async function openAreaPopup(selected=false){
  await page.locator('#map').scrollIntoViewIfNeeded();const box=await page.locator('#map').boundingBox();
  const point=await page.evaluate(selected=>{
   const size=map.getSize(),layers=markers.getLayers();
   let layer=selected?layers.find(l=>l.getLatLng().lat===activeFilters.lat&&l.getLatLng().lng===activeFilters.lng):null;
   if(!layer)layer=layers.map(l=>({l,p:map.latLngToContainerPoint(l.getLatLng())})).filter(({p})=>p.x>30&&p.y>50&&p.x<size.x-30&&p.y<size.y-30).sort((a,b)=>Math.hypot(a.p.x-size.x/2,a.p.y-size.y/2)-Math.hypot(b.p.x-size.x/2,b.p.y-size.y/2))[0].l;
   const p=map.latLngToContainerPoint(layer.getLatLng());return {x:p.x,y:p.y};
  },selected);
  await page.mouse.click(box.x+point.x,box.y+point.y);await page.locator('.leaflet-popup-content [data-area]').click();
 }
 await openAreaPopup();assert.notEqual((await state()).filters.lat,null);assert.equal((await state()).filters.radius_km,2);
 await page.waitForFunction(()=>!document.querySelector('.leaflet-popup'));
 // Reopen the selected point directly when Canvas markers overlap. The actual
 // popup button is still clicked; its handler must toggle the same coordinates.
 await page.evaluate(()=>markers.getLayers().find(l=>l.getLatLng().lat===activeFilters.lat&&l.getLatLng().lng===activeFilters.lng).openPopup());
 await page.locator('.leaflet-popup-content [data-area]').click();assert.equal((await state()).filters.lat,null);assert.equal((await state()).stats.total,31493);
});
test('mobile: monthly and type clicks recover and sticky controls remain reachable',async()=>{
 await reset();await page.setViewportSize({width:390,height:844});await page.selectOption('#ano','2023');
 await clickPlot('temporal',0);assert.equal((await state()).filters.periodo,'2023-01');
 await page.locator('#clear-temporal').click();assert.equal((await state()).filters.periodo,null);
 await clickPlot('types',0);assert.ok((await state()).filters.tipo_acidente);
 await clickPlot('types',0);assert.equal((await state()).filters.tipo_acidente,null);
 await page.locator('#typeLegend button').first().click();await page.locator('#undoFilter').click();assert.equal((await state()).filters.tipo_acidente,null);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
 await page.screenshot({path:'work/chart-navigation-mobile.png'});
 await page.setViewportSize({width:1440,height:1000});await page.locator('#temporal').scrollIntoViewIfNeeded();await page.screenshot({path:'work/chart-navigation-desktop.png'});
 assert.deepEqual(errors,[]);
});

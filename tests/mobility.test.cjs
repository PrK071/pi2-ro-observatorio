const{test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),zlib=require('node:zlib');
const Analytics=require('../dist/analysis.js'),Assistant=require('../dist/assistant.js'),Mobility=require('../dist/mobility.js');
const base=JSON.parse(zlib.gunzipSync(fs.readFileSync('dist/research.json.gz'))),mobility=JSON.parse(zlib.gunzipSync(fs.readFileSync('dist/mobility.json.gz'))),report=JSON.parse(fs.readFileSync('dist/modelos.json','utf8'));
const rows=base.records.map(r=>Object.fromEntries(base.fields.map((f,i)=>[f,r[i]]))),hydrated=Mobility.hydrate(rows,mobility),engine=Assistant.create({rows,report,period:base.period,analytics:Analytics,mobility});
const audit=JSON.parse(fs.readFileSync('dist/auditoria-mobilidade.json','utf8')),oracle=audit.independentAudit.cases;
function check(e,expected){assert.equal(e.total.total,expected.n);assert.equal(e.total.fatal,expected.fatal);assert.equal(e.total.nonfatal,expected.nonfatal);assert.equal(e.total.deaths,expected.deathsInEvents);}
test('profile hydration preserves all base event counts, person quantities and prediction metrics',()=>{
 for(const k of ['n','fatal','deaths','involved'])assert.equal(Analytics.sum(hydrated,k),Analytics.sum(rows,k));
 const stats=Mobility.summary(hydrated);assert.equal(stats.vehicles,46125);assert.equal(stats.peopleRecorded,10391);assert.equal(stats.personDeaths,961);
 for(const [field,threshold] of [['fatalScore',report.primary.threshold],['climateScore',report.climate.threshold],['climateControlScore',report.climateControl.threshold]]){
  const a=Analytics.prediction(hydrated,field,threshold),b=Analytics.prediction(rows,field,threshold);assert.equal(a.n,b.n);assert.equal(a.positive,b.positive);assert.deepEqual(a.confusion,b.confusion);
  for(const key of ['mean','auc','ap','brier','precision','recall','prevalence'])assert.ok(Math.abs(a[key]-b[key])<1e-12,key+' differs');
  assert.equal(a.calibration.length,b.calibration.length);a.calibration.forEach((bin,i)=>{assert.equal(bin.n,b.calibration[i].n);assert.equal(bin.observed,b.calibration[i].observed);assert.ok(Math.abs(bin.mean-b.calibration[i].mean)<1e-12);});
 }
 assert.equal(audit.independentAudit.allPassed,true);assert.ok(audit.independentAudit.vehicleCellsCompared>23000);
});
test('exact screenshot question filters bicycles/carts and identifies ambulant carts as unavailable',()=>{
 const a=engine.localAnswer('qual o numero de acidentes fatais e nao fatais envolvendo ciclistas ou outros como carroças e carrinhos de lanche de ambulantes no periodo de março de 2024?');
 check(a.evidence,oracle.march2024_bicycle);assert.deepEqual(new Set(a.plan.vehicles),new Set(['BICICLETA','CARROCA']));assert.equal(a.evidence.mobility.partial,true);assert.deepEqual(a.plan.months,[3]);
 assert.match(a.text,/Bicicleta: 1 sinistro: 0 fatais e 1 não fatal/);assert.match(a.text,/Carroça: 0 sinistros/);assert.match(a.text,/Carrinhos de lanche\/ambulantes não têm categoria própria/);assert.doesNotMatch(a.text,/760 sinistros|23 eventos fatais/);
});
test('bus and motorcycle fatal/nonfatal counts agree with independent original table joins',()=>{
 check(engine.localAnswer('acidentes de ônibus fatais e não fatais em março de 2024?').evidence,oracle.march2024_bus);
 const m=engine.localAnswer('quantos acidentes fatais e não fatais de moto em março de 2024?');assert.equal(m.evidence.total.total,353);assert.equal(m.evidence.total.fatal,10);assert.equal(m.evidence.total.nonfatal,343);
 const n=engine.localAnswer('e somente os não fatais?',{},m.plan);assert.equal(n.evidence.total.total,343);assert.equal(n.evidence.total.fatal,0);
});
test('vehicle unions deduplicate events and intersections require both vehicles',()=>{
 check(engine.query({vehicles:['AUTOMOVEL','MOTOCICLETA'],vehicleMatch:'any',years:[2024],months:[3]}),oracle.march2024_car_or_motorcycle);
 check(engine.query({vehicles:['AUTOMOVEL','MOTOCICLETA'],vehicleMatch:'all',years:[2024],months:[3]}),oracle.march2024_car_and_motorcycle);
 const a=engine.localAnswer('compare carro e moto em março de 2024');assert.equal(a.plan.groupBy,'vehicle');assert.equal(a.evidence.total.total,490);assert.equal(a.evidence.groups.reduce((n,g)=>n+g.n,0),688);assert.match(a.text,/mais de uma categoria/);
});
test('multiple units of one vehicle category do not multiply event counts',()=>{
 const e=engine.query({vehicles:['AUTOMOVEL'],years:[2024],months:[3]});assert.equal(e.total.total,335);assert.equal(e.total.vehicles,343);
});
test('vehicle exclusion keeps accidents with motorcycles and without a car',()=>{
 const e=engine.localAnswer('acidentes de moto sem carro em março de 2024').evidence;assert.equal(e.total.total,155);assert.deepEqual(e.plan.excludeVehicles,['AUTOMOVEL']);
});
test('drivers are counted from people and are not assigned to a vehicle by an unsafe join',()=>{
 const a=engine.localAnswer('quantos motoristas de carro morreram em março de 2024?');assert.deepEqual(a.plan.roles,['MOTORISTA']);assert.equal(a.evidence.total.total,335);assert.match(a.text,/não liga cada motorista/);assert.match(a.text,/outro veículo/);
 const drivers=engine.query({roles:['MOTORISTA']});assert.equal(drivers.total.people,7217);assert.equal(drivers.total.personDeaths,572);
});
test('bicycle-involved deaths are not presented as identified cyclist deaths',()=>{
 const a=engine.localAnswer('quantos ciclistas morreram em 2024?');assert.equal(a.plan.roadUser,'cyclist');assert.match(a.text,/não identifica separadamente pessoas ciclistas/);assert.match(a.text,/sinistros envolvendo o veículo/);
});
test('unsupported individual vehicles fail closed instead of returning the general total',()=>{
 for(const q of ['quantos acidentes com carrinhos de lanche de ambulantes em março de 2024?','acidentes com patinete em 2024','quantos acidentes com cadeira de rodas?','quantos acidentes envolvendo tuk tuk em 2024?','quantos acidentes com carrinhos de feira?']){const a=engine.localAnswer(q);assert.equal(a.evidence.available,false);assert.doesNotMatch(a.text,/31.493|760|911/);}
 const previous=engine.localAnswer('acidentes de bicicleta em março de 2024').plan;
 assert.equal(engine.localAnswer('e os carrinhos de ambulantes?',{},previous).evidence.available,false);
 assert.equal(engine.localAnswer('e de tuk tuk?',{},previous).evidence.available,false);
});
test('unknown/missing vehicle classifications are not treated as carts or bicycles',()=>{
 const cart=engine.query({vehicles:['CARROCA']});assert.equal(cart.total.total,1);
 const a=engine.localAnswer('quantos acidentes de charrete?');assert.equal(a.evidence.total.total,3);
 assert.equal(engine.query({vehicles:['BICICLETA']}).total.total,375);
 assert.equal(Mobility.summary(hydrated).eventsWithoutVehicleRows,922);
});
test('microbus and tractor truck requests do not include their shorter parent categories',()=>{
 assert.deepEqual(engine.infer('acidentes de micro-ônibus').vehicles,['MICRO-ONIBUS']);assert.deepEqual(engine.infer('acidentes de caminhão-trator').vehicles,['CAMINHAO-TRATOR']);
});
test('following a vehicle query retains vehicle/year when only month changes',()=>{
 const a=engine.localAnswer('acidentes de bicicleta em março de 2024');const b=engine.localAnswer('e em abril?',{},a.plan);assert.deepEqual(b.plan.vehicles,['BICICLETA']);assert.deepEqual(b.plan.years,[2024]);assert.deepEqual(b.plan.months,[4]);
});
test('vehicle-free general queries still reconcile with the main dashboard',()=>{
 assert.equal(engine.localAnswer('quantos acidentes em março de 2024?').evidence.total.total,760);
 assert.equal(engine.query({}).total.total,31493);assert.equal(engine.query({groupBy:'vehicle',limit:25}).groups.length,25);
});
test('missing or incompatible mobility input never silently removes vehicle predicates',()=>{
 const basic=Assistant.create({rows,report,period:base.period,analytics:Analytics});const a=basic.localAnswer('acidentes de bicicleta em março de 2024');assert.equal(a.evidence.available,false);assert.doesNotMatch(a.text,/760/);
 assert.throws(()=>Mobility.hydrate(rows,{...mobility,baseGroups:1}),/não corresponde/);
});

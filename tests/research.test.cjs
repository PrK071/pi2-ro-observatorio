const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),zlib=require('node:zlib');
const A=require('../dist/analysis.js');
const d=JSON.parse(zlib.gunzipSync(fs.readFileSync('dist/research.json.gz'))),report=JSON.parse(fs.readFileSync('dist/modelos.json','utf8'));
const rows=d.records.map(r=>Object.fromEntries(d.fields.map((f,i)=>[f,r[i]])));
const near=(a,b,tol=1e-7)=>assert.ok(Math.abs(a-b)<=tol,`${a} != ${b}`);
test('Haversine known arcs, radians, antimeridian and symmetry',()=>{
  near(A.distance(0,0,0,0),0);near(A.distance(0,0,0,90),Math.PI*6371/2);
  near(A.distance(0,179,0,-179),6371*Math.PI/90);near(A.distance(-23.96,-46.33,-24.8,-47.1),A.distance(-24.8,-47.1,-23.96,-46.33));
});
test('central 5 mm exposure and fatal EVENT denominators reconcile with SciPy',()=>{
  const h=A.central(rows),reference=report.hypotheses.central;assert.equal(h.eligible,8688);assert.equal(h.high,381);
  for(const k of ['road','fatality']){for(const c of ['a','b','c','d','n'])assert.equal(h[k][c],reference[k][c]);near(h[k].odds,reference[k].odds);near(h[k].p,reference[k].p);}
  const threshold=A.central([{rain3h:5,n:1,road:1,fatal:0},{rain3h:5.001,n:1,road:0,fatal:1},{rain3h:null,n:8,road:1,fatal:7}]);assert.equal(threshold.eligible,2);assert.equal(threshold.high,1);
});
test('sparse municipality Fisher test agrees with SciPy, including zero fatality cells',()=>{
  for(const [city,ref] of Object.entries(report.hypotheses.byCity)){
    const h=A.central(rows.filter(r=>r.city===city));for(const k of ['road','fatality'])if(ref.central[k].p!==null)near(h[k].p,ref.central[k].p,1e-7);
  }
});
test('browser held-out metrics agree with sklearn, including tied weighted scores',()=>{
  for(const key of ['primary','climate']){
    const r=report[key],s=A.prediction(rows,key==='primary'?'fatalScore':'climateScore',r.threshold),ref=r.models[r.selected].test;
    assert.equal(s.n,ref.n);assert.equal(s.positive,ref.positive);near(s.auc,ref.rocAuc,1e-6);near(s.ap,ref.averagePrecision,1e-6);near(s.brier,ref.brier,1e-7);
    for(const k of ['tp','fp','fn','tn'])assert.equal(s.confusion[k],ref.confusion[k]);
  }
});
test('test scores are never published in train/validation records',()=>{
  assert.ok(rows.every(r=>r.fatalScore===null||(r.date>'2024-12-31'&&r.date<='2025-08-31')));
  assert.ok(rows.every(r=>r.climateScore===null||(r.date>'2023-09-30'&&r.date<='2023-12-31'&&r.rain!==null)));
  const no=A.prediction(rows.filter(r=>r.date.startsWith('2022')),'fatalScore',.1);assert.equal(no.n,0);assert.equal(no.auc,null);
});
test('high rainfall filter uses measured 3h rain and keeps missingness explicit',()=>{
  const high=A.filter(rows,{chuva3h:'high'}),unknown=A.filter(rows,{chuva3h:'unknown'});assert.equal(A.sum(high,'n'),381);assert.ok(high.every(r=>r.rain3h>5));assert.ok(unknown.every(r=>r.rain3h===null));
});

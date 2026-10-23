const {test}=require('node:test');
const assert=require('node:assert/strict');
const A=require('../dist/analysis.js');
const fs=require('node:fs'),zlib=require('node:zlib');
const d=JSON.parse(zlib.gunzipSync(fs.readFileSync(require('node:path').join(__dirname,'../dist/research.json.gz'))));
const rows=d.records.map(a=>Object.fromEntries(d.fields.map((f,i)=>[f,a[i]])));

test('2×2 reference: OR, CI and Pearson p-value',()=>{
  const r=[{wet:1,victim:1,n:30},{wet:1,victim:0,n:70},{wet:0,victim:1,n:20},{wet:0,victim:0,n:80}];
  const h=A.contingency(r,'victim');assert.equal(h.odds,12/7);assert.ok(Math.abs(h.chi-2.666666666666667)<1e-12);assert.ok(Math.abs(h.p-.102470434859749)<1e-7);assert.ok(h.ci[0]<1&&h.ci[1]>1);assert.equal(h.positive,false);
});
test('unknown conditions and outcomes do not enter either control group',()=>{
  const h=A.contingency([{wet:null,victim:1,n:80},{wet:0,victim:null,n:50},{wet:1,victim:1,n:3}],'victim');assert.equal(h.n,3);assert.equal(h.odds,null);assert.equal(h.p,null);assert.equal(h.positive,false);
});
test('single-condition and empty selections remain inconclusive',()=>{
  for(const r of [[],rows.filter(r=>r.wet===1)]){const h=A.contingency(r,'victim');assert.equal(h.odds,null);assert.equal(h.p,null);assert.equal(h.positive,false);}
});
test('published RMBS totals reconcile with national source extraction',()=>{
  const s=A.stats(rows);assert.equal(d.scope,'RMBS');assert.equal(Object.keys(d.cities).length,9);assert.equal(s.total,31493);assert.equal(s.deaths,961);assert.equal(s.fatal,911);assert.equal(A.group(rows,'city').length,9);assert.equal(s.total,d.audit.accidents);
});
test('municipality, month, type, street and condition filters intersect',()=>{
  const seed=rows.find(r=>r.wet===1&&r.city==='SANTOS');const f={municipio:seed.city,ano:seed.date.slice(0,4),mes:seed.date.slice(5,7),tipo_acidente:seed.type,logradouro:seed.street,risco_pista_molhada:'1'};
  const selection=A.filter(rows,f);assert.ok(selection.length);assert.ok(selection.every(r=>r.city==='SANTOS'&&r.date.slice(0,4)===f.ano&&r.date.slice(5,7)===f.mes&&r.type===f.tipo_acidente&&r.street===f.logradouro&&r.wet===1));
  const spatial=A.filter(rows,{lat:-23.96,lng:-46.33,radius_km:2});assert.ok(spatial.length);assert.ok(spatial.every(r=>r.lat!==null&&A.distance(-23.96,-46.33,r.lat,r.lng)<=2));
});
test('September and October 2025 are not zero-filled source records',()=>{
  assert.equal(A.filter(rows,{ano:'2025',mes:'9'}).length,0);assert.equal(A.stats([]).fatalRate,null);assert.equal(d.period[1],'2025-08-31');assert.equal(d.requestedPeriod[1],'2025-10-31');
});
test('calendar exposure counts days rather than distinct accident dates',()=>{
  const s=A.seasons([],{ano:'2024',mes:'2'},d.period);assert.equal(s.days[0]+s.days[1],29);assert.deepEqual(s.rates,[0,0]);
});
test('published cube contains no individual accident identifiers',()=>{
  assert.ok(!d.fields.some(f=>/id|num_acidente|cpf/.test(f)));assert.ok(rows.every(r=>r.lat===null||Math.abs(r.lat*100-Math.round(r.lat*100))<1e-6));
});
test('CSV preserves numbers, accents and quoted fields, neutralizing textual formulas',()=>{
  const csv=A.csv([{city:'São Vicente',lat:-23.96,street:'=SUM(A1)',district:'Vila "A"; Centro',rain:null}],['city','lat','street','district','rain']);
  assert.ok(csv.startsWith('\ufeff'));assert.ok(csv.includes('"-23.96"'));assert.ok(csv.includes('"\'=SUM(A1)"'));assert.ok(csv.includes('"São Vicente"'));assert.ok(csv.includes('"Vila ""A""; Centro"'));assert.ok(csv.includes('"NAO_INFORMADO"'));
});

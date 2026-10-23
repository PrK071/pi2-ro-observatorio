const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),zlib=require('node:zlib');
const Analytics=require('../dist/analysis.js'),Assistant=require('../dist/assistant.js');
const data=JSON.parse(zlib.gunzipSync(fs.readFileSync('dist/research.json.gz')));
const rows=data.records.map(row=>Object.fromEntries(data.fields.map((field,i)=>[field,row[i]])));
const report=JSON.parse(fs.readFileSync('dist/modelos.json','utf8'));
const engine=Assistant.create({rows,report,period:data.period,analytics:Analytics});
const sum=(rr,field='n')=>rr.reduce((v,r)=>v+r[field],0);
test('free-form city and year override only those dashboard dimensions',()=>{
 const a=engine.localAnswer('me diz quantos acidentes aconteceram em Santos em 2023?',{municipio:'CUBATAO',ano:'2024',tipo_acidente:'ATROPELAMENTO COM PEDESTRE'});
 assert.deepEqual(a.plan.cities,['SANTOS']);assert.deepEqual(a.plan.years,[2023]);
 assert.equal(a.evidence.total.total,sum(rows.filter(r=>r.city==='SANTOS'&&r.date.startsWith('2023')&&r.type==='ATROPELAMENTO COM PEDESTRE')));
 assert.match(a.scope,/Santos/);assert.match(a.scope,/2023/);
});
test('follow-up questions preserve city and compare against another city',()=>{
 let a=engine.localAnswer('Quantos acidentes teve em Santos em 2023?');
 a=engine.localAnswer('e em 2024?',{},a.plan);assert.deepEqual(a.plan.cities,['SANTOS']);assert.deepEqual(a.plan.years,[2024]);
 a=engine.localAnswer('compare com São Vicente',{},a.plan);
 assert.deepEqual(a.plan.cities,['SANTOS','SAO VICENTE']);assert.equal(a.plan.groupBy,'city');
 assert.equal(a.evidence.groups.length,2);assert.equal(a.evidence.total.total,sum(rows.filter(r=>['SANTOS','SAO VICENTE'].includes(r.city)&&r.date.startsWith('2024'))));
});
test('ranking of deaths uses people, not events and not cube row counts',()=>{
 const a=engine.localAnswer('quais 3 cidades tiveram mais mortes em 2024?');
 assert.equal(a.plan.metric,'deaths');assert.equal(a.evidence.groups.length,3);assert.match(a.text,/óbitos em pessoas/);
 const independent=new Map();for(const r of rows.filter(r=>r.date.startsWith('2024')))independent.set(r.city,(independent.get(r.city)||0)+r.deaths);
 assert.deepEqual(a.evidence.groups.map(g=>[g.key,g.value]),[...independent].sort((a,b)=>b[1]-a[1]).slice(0,3));
});
test('rain question no longer throws and preserves unknowns',()=>{
 const a=engine.localAnswer('quantos acidentes aconteceram na chuva em Santos?');
 assert.equal(a.plan.wet,1);assert.equal(a.evidence.total.total,sum(rows.filter(r=>r.city==='SANTOS'&&r.wet===1)));assert.match(a.text,/Apenas 2023/);
 const dry=engine.localAnswer('e sem chuva?',{},a.plan);assert.equal(dry.plan.wet,0);
});
test('conclusion returns the original hypothesis, not complementary wet proxy',()=>{
 const a=engine.localAnswer('o que o estudo concluiu sobre a chuva e rodovias?');
 assert.equal(a.plan.topic,'central');assert.equal(a.plan.road,undefined);assert.equal(a.evidence.central.eligible,8688);assert.equal(a.evidence.central.high,381);assert.match(a.text,/não sustentam/);
});
test('typos and accents are accepted without conflating municipalities',()=>{
 assert.deepEqual(engine.infer('quantos acidentes em Santoss em 2023?').cities,['SANTOS']);
 assert.deepEqual(engine.infer('São Vicente e Guarujá em março de 2023').cities,['GUARUJA','SAO VICENTE']);
 assert.deepEqual(engine.infer('São Vicente e Guarujá em março de 2023').months,[3]);
});
test('requested period outside coverage is distinguished from zero',()=>{
 const a=engine.localAnswer('quantos acidentes em Santos em 2026?');assert.equal(a.evidence.total.total,0);assert.match(a.text,/falta de cobertura/);assert.match(a.text,/não tem cobertura fora/);
});
test('explicitly clearing query dimensions removes corresponding dashboard filters',()=>{
 const e=engine.query({cities:[],years:[],wet:null},{municipio:'SANTOS',ano:'2023',risco_pista_molhada:'1'});assert.equal(e.total.total,31493);
});
test('definitions, models, ETL and methodology can be explained',()=>{
 assert.match(engine.localAnswer('qual a diferença entre óbitos e sinistros fatais?').text,/contam pessoas/);
 assert.match(engine.localAnswer('o que é ETL?').text,/SHA-256/);
 assert.match(engine.localAnswer('como funciona a fórmula de Haversine?').text,/radianos/);
 assert.match(engine.localAnswer('qual foi a AUC do modelo?').text,/0,765/);
 assert.equal(engine.study('models').primary.models.logistic.test.rocAuc,report.primary.models.logistic.test.rocAuc);
});
test('unknown categorical query inputs and injected fields cannot run code',()=>{
 assert.throws(()=>engine.query({cities:['SAO PAULO']}),/Categoria desconhecida/);
 assert.throws(()=>engine.query({years:'2023'}),/Lista inválida/);
 assert.throws(()=>engine.cleanFilters({lat:200,lng:0,radius_km:1}),/Área inválida/);
 assert.equal(engine.query({sql:'DROP TABLE',scope:'region'}).total.total,31493);
});
test('AI uses the validated data tool and retains computed conversation scope',async()=>{
 const {runConversation}=await import('../lib/chat-agent.mjs');let turns=0,toolResult;
 const complete=async body=>{
  turns++;if(turns===1)return {role:'assistant',content:null,tool_calls:[{id:'city_query',type:'function',function:{name:'consultar_dados',arguments:JSON.stringify({cities:['SANTOS'],years:[2023],metric:'n'})}}]};
  toolResult=JSON.parse(body.messages.at(-1).content);return {role:'assistant',content:'Encontrei '+toolResult.total.total+' sinistros em Santos em 2023.'};
 };
 const result=await runConversation({message:'Me conte o total de Santos em 2023',filters:{}},{engine,token:'test-not-a-real-key',complete});
 assert.equal(result.mode,'ai');assert.equal(toolResult.total.total,2137);assert.match(result.text,/2137/);assert.equal(result.plan.cities[0],'SANTOS');assert.equal(turns,2);
});
test('no AI credentials returns a useful and explicitly local answer',async()=>{
 const {runConversation}=await import('../lib/chat-agent.mjs');
 const a=await runConversation({message:'Quantos acidentes em Santos em 2023?',filters:{}},{engine,token:null});assert.equal(a.mode,'local');assert.equal(a.reason,'not_configured');assert.match(a.text,/2.137/);
});
test('API rejects invalid messages and returns a local result when gateway is unavailable',async()=>{
 const {POST}=await import('../api/chat.mjs');
 let response=await POST(new Request('http://localhost/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({message:''})}));assert.equal(response.status,400);
 response=await POST(new Request('http://localhost/api/chat',{method:'POST',headers:{'Content-Type':'application/json','Sec-Fetch-Site':'cross-site'},body:'{}'}));assert.equal(response.status,403);
 response=await POST(new Request('http://localhost/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({message:'Santos em 2023',filters:{}})}));assert.equal(response.status,200);const answer=await response.json();assert.match(answer.text,/2.137/);assert.equal(answer.mode,'local');
});

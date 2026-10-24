'use strict';
// Shared, deterministic access to the public analytical cube. No generated code or SQL.
const AnalyticalAssistant = (() => {
  const M=typeof module!=='undefined'?require('./mobility.js'):MobilityAnalytics;
  const norm = text => String(text ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
  const number = (n,d=0) => n == null || !Number.isFinite(n) ? 'indisponível' : n.toLocaleString('pt-BR',{minimumFractionDigits:d,maximumFractionDigits:d});
  const pretty = value => ({'SAO VICENTE':'São Vicente','GUARUJA':'Guarujá','CUBATAO':'Cubatão','ITANHAEM':'Itanhaém','PERUIBE':'Peruíbe','MONGAGUA':'Mongaguá','NAO_INFORMADO':'Não informado','MANHA':'Manhã','AUTOMOVEL':'Automóvel','ONIBUS':'Ônibus','MICRO-ONIBUS':'Micro-ônibus','CAMINHAO':'Caminhão','CAMINHAO-TRATOR':'Caminhão-trator','CARROCA':'Carroça','UTILITARIO':'Utilitário','VEICULO ARTICULADO':'Veículo articulado','VEICULO DE SERVICO':'Veículo de serviço'}[value] || String(value).toLocaleLowerCase('pt-BR').replace(/(^|\s)\S/g,c=>c.toUpperCase()));
  const knowledge = {
    coverage:'O observatório reúne os nove municípios da Baixada Santista. A fonte recebida cobre 01/01/2022 a 31/08/2025. INMET está disponível apenas em 2023, nas estações A765 Bertioga e A712 Iguape. Ausência de informação não vira zero. O cubo agrega eventos: use a soma de n, nunca a contagem de linhas.',
    definitions:'Sinistro fatal é um evento com pelo menos um óbito; óbitos contam pessoas. Um evento pode ter várias mortes. Letalidade por evento = 100 × sinistros fatais / total de sinistros. Com vítimas considera somente eventos com gravidade classificável. Não há fluxo de tráfego para calcular risco por viagem ou por km percorrido.',
    rain:'A hipótese original compara chuva medida nas três horas estritamente anteriores > 5 mm com ≤ 5 mm. O indicador de pista molhada é complementar: pista MOLHADA, chuva horária > 0,2 mm ou chuva anterior > 0,5 mm. Os dois indicadores não são equivalentes. Apenas 2023 tem clima vinculado; nos outros anos, o indicador depende do registro de pista. Não se infere causalidade nem deslocamento de hotspots pelo teste de tipo de via.',
    statistics:'Odds Ratio = (a × d)/(b × c); IC95% pelo log do OR, quando todas as células são positivas. Qui-quadrado de Pearson usa Σ[(O−E)²/E]. Fisher bilateral nas tabelas esparsas. p < 0,05 avalia evidência estatística, não comprova causalidade. Ausência de significância não prova ausência de efeito. Comparações exploratórias repetidas exigem cautela.',
    haversine:'Haversine calcula distância de arco: a = sen²(Δφ/2) + cos(φ₁)cos(φ₂)sen²(Δλ/2); d = 2R asin(√a), com R = 6.371 km e ângulos em radianos. Não é distância rodoviária. No ETL seleciona a mais próxima das duas estações fornecidas, limitada a 100 km. No mapa, o filtro usa coordenadas arredondadas a 0,01°.',
    etl:'A reprodução segue: preservar ZIPs e hashes SHA-256; extrair e normalizar; selecionar nove códigos IBGE; deduplicar eventos e classificar vítimas; vincular estação por Haversine; converter UTC para BRT; somar t−1h, t−2h e t−3h exigindo três medições; testar hipóteses e treinar com partições cronológicas; publicar cubo, métricas, artigo e manifesto. Hora ausente usa fase do dia de forma determinística.',
    models:'Os classificadores estimam fatalidade condicionada a um sinistro já registrado, não a ocorrência futura de acidentes. Há prevalência constante, regressão logística e Random Forest. Seleção por Average Precision na validação; avaliação em teste posterior, sem reajustar no teste. AUC mede ordenação; AP é útil no desbalanceamento; Brier mede erro probabilístico. Escores experimentais não são probabilidades operacionais calibradas.',
    references:'O artigo apresenta as referências e o protocolo completo: artigo.html e artigo-baixada-santista.pdf. Fundamentos: Breiman (2001), Random Forests; Saito e Rehmsmeier (2015), precision–recall; Roberts et al. (2017), validação de dados estruturados; Wasserstein e Lazar (2016), interpretação de p; Kimball e Caserta (2004), ETL; Theofilatos e Yannis (2014), clima e segurança viária. Fontes dos registros: RENAEST, INMET e IBGE.',
    mobility:'A tabela TipoVeiculo é agregada por sinistro antes da junção com Acidentes e Vitimas. Quantidades de veículos e pessoas não são contagens de acidentes. Há 25 categorias de veículos na edição regional. Ciclista é consultado por eventos envolvendo BICICLETA; não existe papel CICLISTA na tabela de pessoas recebida. A fonte não liga cada motorista ou passageiro ao veículo, logo não identifica qual veículo teve o óbito em eventos mistos. Não fatal = sinistro sem óbito, podendo haver feridos. Carrinhos de ambulantes não têm categoria própria; não são inferidos de CARROCA nem de DESCONHECIDO.'
  };
  const groups=['city','type','year','month','street','district','phase','weekday','wet','road','vehicle'];
  const metrics=['n','fatal','nonfatal','deaths','victims','fatalRate','vehicles','people','personDeaths'];
  const months=['janeiro','fevereiro','marco','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
  function create({rows,report,period,analytics,mobility=null}) {
    const A=analytics;
    if(mobility)rows=M.hydrate(rows,mobility);
    const catalog=Object.fromEntries(['city','type','street','district','phase','weekday'].map(field=>[field,[...new Set(rows.map(r=>r[field]))].filter(Boolean).sort()]));
    catalog.vehicle=mobility?.vehicleTypes||M.vehicleTypes;catalog.role=mobility?.personRoles||Object.keys(M.roleLabel);
    const filterKeys=['ano','mes','municipio','tipo_acidente','risco_pista_molhada','logradouro','bairro','lat','lng','radius_km','periodo','chuva3h'];
    function cleanFilters(input={}) {
      const f={};for(const key of filterKeys){const v=input[key];if(v!=null&&v!==''&&(typeof v==='string'||typeof v==='number'))f[key]=v;}
      for(const [k,field] of [['municipio','city'],['tipo_acidente','type']])if(f[k]&&!catalog[field].includes(f[k]))throw Error('Filtro desconhecido: '+k);
      for(const k of ['logradouro','bairro'])if(f[k]&&String(f[k]).length>200)throw Error('Filtro muito longo: '+k);
      if(f.ano&&!/^20\d{2}$/.test(f.ano))throw Error('Ano inválido');
      if(f.mes&&(!Number.isInteger(Number(f.mes))||+f.mes<1||+f.mes>12))throw Error('Mês inválido');
      if(f.periodo&&!/^20\d{2}-(0[1-9]|1[0-2])$/.test(f.periodo))throw Error('Período inválido');
      if(f.risco_pista_molhada!=null&&!['0','1','unknown'].includes(String(f.risco_pista_molhada)))throw Error('Condição inválida');
      if(f.risco_pista_molhada!=null)f.risco_pista_molhada=String(f.risco_pista_molhada);
      if(f.chuva3h&&!['high','low','unknown'].includes(f.chuva3h))throw Error('Chuva inválida');
      if(f.lat!=null&&(!Number.isFinite(+f.lat)||Math.abs(+f.lat)>90||!Number.isFinite(+f.lng)||Math.abs(+f.lng)>180||!Number.isFinite(+f.radius_km)||+f.radius_km<=0||+f.radius_km>20000))throw Error('Área inválida');
      return f;
    }
    function validate(input={}) {
      const p={scope:input.scope==='region'?'region':'current',groupBy:groups.includes(input.groupBy)?input.groupBy:null,metric:metrics.includes(input.metric)?input.metric:'n',limit:Math.max(1,Math.min(25,Math.floor(Number(input.limit)||5))),ascending:input.ascending===true};
      for(const [key,field,max] of [['cities','city',9],['types','type',15],['streets','street',15],['districts','district',15],['phases','phase',10],['weekdays','weekday',7],['vehicles','vehicle',25],['excludeVehicles','vehicle',25],['roles','role',5]]){
        if(input[key]!=null&&!Array.isArray(input[key]))throw Error('Lista inválida: '+key);
        if(Array.isArray(input[key])){p[key]=[...new Set(input[key])];if(p[key].length>max||p[key].some(x=>!catalog[field].includes(x)))throw Error('Categoria desconhecida: '+key);}
      }
      for(const [key,min,max] of [['years',2000,2100],['months',1,12]])if(input[key]!=null){if(!Array.isArray(input[key])||input[key].length>20)throw Error('Lista inválida: '+key);p[key]=[...new Set(input[key].map(Number))];if(p[key].some(x=>!Number.isInteger(x)||x<min||x>max))throw Error('Período inválido');}
      for(const key of ['wet','road'])if(Object.hasOwn(input,key)){if(![0,1,'unknown',null].includes(input[key]))throw Error('Condição inválida: '+key);p[key]=input[key];}
      if(Object.hasOwn(input,'rain3h')){if(!['high','low','unknown',null].includes(input.rain3h))throw Error('Chuva inválida');p.rain3h=input.rain3h;}
      if(input.vehicleMatch!=null){if(!['any','all'].includes(input.vehicleMatch))throw Error('Combinação de veículos inválida');p.vehicleMatch=input.vehicleMatch;}
      if(input.outcome!=null){if(!['all','fatal','nonfatal'].includes(input.outcome))throw Error('Desfecho inválido');p.outcome=input.outcome;}
      if(input.roadUser!=null){if(!['cyclist','motorcyclist'].includes(input.roadUser))throw Error('Usuário da via inválido');p.roadUser=input.roadUser;}
      if(input.peopleRequested===true)p.peopleRequested=true;
      if(input.unsupportedVehicles!=null){if(!Array.isArray(input.unsupportedVehicles)||input.unsupportedVehicles.some(k=>!Object.hasOwn(M.unsupported,k)))throw Error('Categoria não resolvida inválida');p.unsupportedVehicles=[...new Set(input.unsupportedVehicles)];}
      if(input.topic)p.topic=String(input.topic).slice(0,30);
      return p;
    }
    function query(input={},dashboardFilters={}) {
      const p=validate(input),f=p.scope==='region'?{}:cleanFilters(dashboardFilters);
      const needsMobility=p.vehicles?.length||p.excludeVehicles?.length||p.roles?.length||p.roadUser||p.groupBy==='vehicle'||['vehicles','people','personDeaths'].includes(p.metric)||p.outcome&&p.outcome!=='all';
      const sources=['metodologia.json','artigo.html',...(needsMobility||p.unsupportedVehicles?.length?['auditoria-mobilidade.json']:[])];
      if(needsMobility&&!mobility)return {available:false,plan:p,scope:'Consulta específica por veículos/pessoas',limitations:['A base de veículos/pessoas não foi carregada. Não é possível responder especificamente; os totais gerais não substituem essa seleção.'],sourceLinks:sources};
      if(p.unsupportedVehicles?.length&&!p.vehicles?.length&&!p.roles?.length)return {available:false,plan:p,scope:'Categoria não discriminada na fonte',limitations:M.limitations(p),sourceLinks:sources};
      for(const [key,filter] of [['cities','municipio'],['types','tipo_acidente'],['streets','logradouro'],['districts','bairro']])if(p[key])delete f[filter];
      if(p.years){delete f.ano;delete f.periodo;}if(p.months){delete f.mes;delete f.periodo;}
      if(Object.hasOwn(p,'wet'))delete f.risco_pista_molhada;if(Object.hasOwn(p,'rain3h'))delete f.chuva3h;
      let selected=A.filter(rows,f);
      const lists=[['cities','city'],['types','type'],['streets','street'],['districts','district'],['phases','phase'],['weekdays','weekday']];
      selected=selected.filter(r=>lists.every(([key,field])=>!p[key]?.length||p[key].includes(r[field]))&&(!p.years?.length||p.years.includes(+r.date.slice(0,4)))&&(!p.months?.length||p.months.includes(+r.date.slice(5,7)))&&(['wet','road'].every(k=>p[k]==null||(p[k]==='unknown'?r[k]===null:r[k]===p[k])))&&(!p.rain3h||(p.rain3h==='unknown'?r.rain3h===null:r.rain3h!==null&&(p.rain3h==='high'?r.rain3h>5:r.rain3h<=5))));
      const beforeMobility=selected;
      if(mobility)selected=M.select(selected,p);
      const total=A.stats(selected),baseBy=new Map();
      total.nonfatal=total.total-total.fatal;
      const mobilitySummary=mobility?M.summary(selected,p.roles||[],p.vehicles||[]):null;
      if(mobilitySummary){total.vehicles=mobilitySummary.selectedVehicles;total.people=mobilitySummary.peopleRecorded;total.personDeaths=mobilitySummary.personDeaths;}
      if(p.groupBy==='vehicle'){
        const types=p.vehicles?.length?p.vehicles:catalog.vehicle;
        for(const t of types)baseBy.set(t,selected.filter(r=>r.vehicles[t]>0));
      }else if(p.groupBy)for(const r of selected){const key=p.groupBy==='year'?r.date.slice(0,4):p.groupBy==='month'?r.date.slice(0,7):r[p.groupBy]??'NAO_INFORMADO';if(!baseBy.has(key))baseBy.set(key,[]);baseBy.get(key).push(r);}
      const table=[...baseBy].map(([key,rr])=>{const s=A.stats(rr);s.nonfatal=s.total-s.fatal;const m=mobility?M.summary(rr,p.roles||[],p.groupBy==='vehicle'?[key]:p.vehicles||[]):null;if(m){s.vehicles=m.selectedVehicles;s.people=m.peopleRecorded;s.personDeaths=m.personDeaths;}const label=p.groupBy==='wet'?({0:'Seca / sem indício',1:'Molhada / indício de chuva'}[key]||'Sem classificação'):p.groupBy==='road'?({0:'Outras vias',1:'Rodovias'}[key]||'Sem classificação'):pretty(key);return {key,label,n:s.total,fatal:s.fatal,nonfatal:s.nonfatal,deaths:s.deaths,victims:s.victims,victimKnown:s.victimKnown,fatalRate:s.fatalRate,vehicles:s.vehicles,people:s.people,personDeaths:s.personDeaths,value:p.metric==='n'?s.total:s[p.metric]};}).sort((a,b)=>(p.ascending?1:-1)*((a.value??-1)-(b.value??-1))||String(a.key).localeCompare(String(b.key))).slice(0,p.limit);
      const dates=selected.map(r=>r.date).sort(),notes=[];
      if((p.years||[]).includes(2025)||f.ano==='2025'||!p.years&&!f.ano)notes.push('2025 cobre somente janeiro a agosto; totais anuais brutos não são comparáveis a anos completos.');
      if(p.wet!=null||p.rain3h||f.risco_pista_molhada!=null||f.chuva3h)notes.push(knowledge.rain);
      if(p.years?.some(y=>y<2022||y>2025))notes.push('A base não tem cobertura fora de 2022–agosto/2025; ausência de registros nesse período não significa ausência de acidentes.');
      const labels={ano:'Ano',years:'Anos',mes:'Mês',months:'Meses',municipio:'Município',cities:'Municípios',tipo_acidente:'Tipo',types:'Tipos',logradouro:'Via',streets:'Vias',bairro:'Bairro',districts:'Bairros',phases:'Fases do dia',weekdays:'Dias da semana',periodo:'Período',lat:'Latitude',lng:'Longitude',risco_pista_molhada:'Pista',wet:'Pista',road:'Via',rain3h:'Chuva 3h',chuva3h:'Chuva 3h',vehicles:'Veículos',excludeVehicles:'Excluir veículos',roles:'Pessoas',outcome:'Desfecho',vehicleMatch:'Combinação'};
      const valueLabel=(k,v)=>['wet','risco_pista_molhada'].includes(k)?({0:'seca / sem indício',1:'molhada / indício de chuva',unknown:'sem classificação'}[v]):k==='road'?({0:'outras vias',1:'rodovias',unknown:'sem classificação'}[v]):['rain3h','chuva3h'].includes(k)?({high:'> 5 mm',low:'≤ 5 mm',unknown:'sem janela completa'}[v]):k==='months'?v.map(m=>pretty(months[m-1])).join(', '):Array.isArray(v)?v.map(pretty).join(', '):v;
      const context=[];for(const [k,v] of Object.entries(f))if(k!=='radius_km')context.push((labels[k]||k)+': '+valueLabel(k,v));
      for(const [k,v] of Object.entries(p))if(v!=null&&(!Array.isArray(v)||v.length)&&!['scope','groupBy','metric','limit','ascending','topic','unsupportedVehicles','roadUser','peopleRequested'].includes(k))context.push((labels[k]||k)+': '+(k==='outcome'?{all:'todos',fatal:'fatais',nonfatal:'não fatais'}[v]:k==='vehicleMatch'?{any:'qualquer categoria (união)',all:'todas na mesma ocorrência'}[v]:valueLabel(k,v)));
      if(f.lat!=null)context.push('Raio: '+f.radius_km+' km');
      const weighted=field=>{const rr=selected.filter(r=>r[field]!=null),n=A.sum(rr,'n');return {n,mean:n?rr.reduce((v,r)=>v+r[field]*r.n,0)/n:null};};
      return {available:true,plan:p,scope:context.length?context.join(' · '):'Toda a Baixada Santista · período disponível',coverage:{sourcePeriod:period,observedStart:dates[0]||null,observedEnd:dates.at(-1)||null},total,groups:table,central:A.central(selected),weather:{hourlyRainMm:weighted('rain'),previous3hRainMm:weighted('rain3h'),temperatureC:weighted('temp'),interpretation:'Médias ponderadas por sinistros com observações válidas associadas; não são médias climáticas regionais nem precipitação mensal acumulada.'},mobility:needsMobility&&mobility?{...mobilitySummary,coverageBeforeVehicleFilter:M.summary(beforeMobility),partial:!!p.unsupportedVehicles?.length,limitations:M.limitations(p),methodology:mobility.methodology}:null,notes,sources:['RENAEST','INMET','IBGE'],sourceLinks:sources};
    }
    function study(topic='overview') {
      const common={knowledge,links:['artigo.html','artigo-baixada-santista.pdf','auditoria-formulas.html','reproducibilidade.json']};
      const experiment=r=>r?{status:r.status,selected:r.selected,threshold:r.threshold,splits:r.splits,models:Object.fromEntries(Object.entries(r.models||{}).map(([name,m])=>[name,{validation:{rocAuc:m.validation.rocAuc,averagePrecision:m.validation.averagePrecision,brier:m.validation.brier},test:{rocAuc:m.test.rocAuc,averagePrecision:m.test.averagePrecision,brier:m.test.brier,precision:m.test.precision,recall:m.test.recall,confusion:m.test.confusion}}]))}:null;
      if(topic==='models')return {...common,primary:experiment(report?.primary),climate:experiment(report?.climate),climateControl:experiment(report?.climateControl)};
      if(topic==='count')return {...common,countModel:report?.countModel};
      return {...common,geography:report?.geography,hypotheses:report?.hypotheses};
    }
    function infer(question,previous=null) {
      const q=norm(question),follow=/^(e |mas |agora |ness|iss|compara com|compare com|por que|porque|explique|detalh|so |apenas )/.test(q),p=follow&&previous?{...validate(previous)}:{scope:'current',metric:'n',limit:5};
      p.topic=follow&&previous?.topic||'data';
      if(/sem filtros|toda a baixada|toda baixada|regiao inteira/.test(q)){p.scope='region';for(const k of ['cities','years','months','types','streets','districts','phases','weekdays','wet','rain3h','road','vehicles','excludeVehicles','roles','outcome','roadUser','unsupportedVehicles','peopleRequested'])delete p[k];}
      const hits=field=>catalog[field].filter(value=>value!=='NAO_INFORMADO'&&(' '+q+' ').includes(' '+norm(value)+' '));
      const cities=hits('city');
      // Accept a small typo in an otherwise unambiguous city name.
      if(!cities.length)for(const city of catalog.city){const c=norm(city);if(c.includes(' '))continue;for(const word of q.split(' ')){if(word.length<5||Math.abs(word.length-c.length)>1)continue;let a=word,b=c;if(a.length>b.length)[a,b]=[b,a];let i=0,j=0,edits=0;while(i<a.length&&j<b.length){if(a[i]===b[j]){i++;j++;}else{edits++;if(a.length===b.length)i++;j++;}}edits+=b.length-j+a.length-i;if(edits===1&&!['dados','chuva','fatais','mortes','todos','menos'].includes(word)){cities.push(city);break;}}}
      if(cities.length)p.cities=/compar[ae].*com|comparar.*com/.test(q)&&previous?.cities?[...new Set([...previous.cities,...cities])]:cities;
      const years=[...new Set((q.match(/\b20\d{2}\b/g)||[]).map(Number))];if(years.length){p.years=years;delete p.months;}
      const mm=months.flatMap((name,i)=>new RegExp('\\b'+name+'\\b').test(q)?[i+1]:[]);if(mm.length)p.months=mm;
      const ts=hits('type');if(ts.length)p.types=ts;else if(/atropel/.test(q))p.types=catalog.type.filter(v=>/ATROPEL/.test(v));else if(/colisoes|colisao/.test(q)&&!/tipo|quais/.test(q))p.types=catalog.type.filter(v=>/COLIS/.test(v));
      const phases=hits('phase');if(phases.length)p.phases=phases;
      if(/sem chuva|sem chover|pista seca|tempo seco/.test(q))p.wet=0;else if(/na chuva|com chuva|quando chove|chovendo|pista molhada|molhado|molhada/.test(q))p.wet=1;
      if(/mais de 5 mm|acima de 5 mm/.test(q)&&!/hipotese|comprov|confirma|teste|efeito/.test(q))p.rain3h='high';
      if(/rodovia|estrada|anchieta|imigrantes|sp 150|sp 160/.test(q))p.road=1;
      if(/anchieta|sp 150|imigrantes|sp 160/.test(q)){p.streets=catalog.street.filter(v=>(/anchieta|sp 150/.test(q)&&/\bSP[ -]?150\b|^(?:RODOVIA\s+)?ANCHIETA\b/.test(v))||(/imigrantes|sp 160/.test(q)&&/\bSP[ -]?160\b|^(?:RODOVIA\s+)?IMIGRANTES\b/.test(v)));}
      if(/mort|obito/.test(q))p.metric='deaths';else if(/fatal|fatais|letal/.test(q))p.metric=/taxa|percent|propor|letalidade|perigos/.test(q)?'fatalRate':'fatal';else if(/vitima|ferid/.test(q))p.metric='victims';else if(!follow||/sinistro|acidente|ocorrencia/.test(q))p.metric='n';
      if(/turno|fase do dia|horario/.test(q))p.groupBy='phase';else if(/dia da semana|dias da semana/.test(q))p.groupBy='weekday';else if(/bairro/.test(q))p.groupBy='district';else if(/tipo|como.*acontece/.test(q))p.groupBy='type';else if(/rodovias|vias|eixo|anchieta.*imigrantes|imigrantes.*anchieta/.test(q))p.groupBy='street';else if((/cidade|municipio|onde|lugar/.test(q)&&!cities.length)||p.cities?.length>1)p.groupBy='city';else if(/por mes|mensal|meses|qual mes/.test(q))p.groupBy='month';else if(/por ano|anual/.test(q)||years.length>1)p.groupBy='year';
      if(/menos|menor/.test(q))p.ascending=true;
      const top=q.match(/(?:top|primeir[oa]s?|quais|mostr[ae]|list[ae])\s+(\d{1,2})/);if(top)p.limit=Math.min(15,+top[1]);
      if(/haversine|distancia|estacao/.test(q))p.topic='haversine';
      else if(/etl|pipeline|engenharia de dados|reprodu|metodolog|tratamento/.test(q))p.topic='etl';
      else if(/random forest|regressao|modelo|auc|brier|previs|prever|predi|probabilidade/.test(q))p.topic='models';
      else if(/odds|qui quadrado|p valor|signific|fisher/.test(q))p.topic='statistics';
      else if(/hipotese|conclu|comprov|causa|efeito.*chuva|chuva.*efeito|chuva.*aument|aument.*chuva/.test(q))p.topic='central';
      else if(/diferenca.*(fatal|obito)|fatal.*obito|o que.*letal|o que.*vitima/.test(q))p.topic='definitions';
      else if(/fonte|referencia|bibliograf/.test(q))p.topic='references';
      else if(/cobertura|dados disponiveis|periodo disponivel/.test(q))p.topic='coverage';
      const vehiclePlan=M.infer(question,catalog.vehicle);
      if(vehiclePlan.vehicles?.length){delete p.roadUser;delete p.unsupportedVehicles;delete p.excludeVehicles;}
      if(vehiclePlan.unsupportedVehicles?.length&&!vehiclePlan.vehicles?.length){delete p.vehicles;delete p.excludeVehicles;delete p.roles;delete p.roadUser;delete p.vehicleMatch;if(p.groupBy==='vehicle')p.groupBy=null;}
      Object.assign(p,vehiclePlan);
      if(p.topic!=='data')delete p.outcome;
      if(p.outcome==='all'&&/nao fata/.test(q))p.metric='n';else if(p.outcome==='nonfatal')p.metric='nonfatal';
      if(p.topic==='central'){delete p.wet;delete p.rain3h;delete p.road;}
      return validate(p);
    }
    function localAnswer(question,filters={},previous=null) {
      const q=norm(question),p=infer(question,previous),e=query(p,filters),s=e.total;
      if(!e.available)return {text:e.limitations.join('. ')+'. Essa edição não permite calcular esse número específico.',plan:p,scope:e.scope,evidence:e};
      if(/^(oi|ola|bom dia|boa tarde|boa noite|tudo bem|e ai)$/.test(q))return {text:'Olá! Pode perguntar do seu jeito. Posso comparar cidades e anos, consultar acidentes e mortes, explicar os testes e conversar sobre o estudo. Por exemplo: “quantos acidentes aconteceram em Santos em 2023?”',plan:p,scope:'Conversa',evidence:e};
      let text='';
      if(e.mobility&&p.topic==='data'){
        const m=e.mobility,lines=[];
        if(m.partial)lines.push('Consulta parcial: consigo identificar '+(p.vehicles||[]).map(pretty).join(', ')+'. As demais categorias solicitadas não podem ser isoladas na fonte.');
        if(p.peopleRequested&&p.roadUser)lines.push('A fonte não identifica separadamente pessoas '+(p.roadUser==='cyclist'?'ciclistas':'motociclistas')+' nem seus óbitos/ferimentos. Os números abaixo são de sinistros envolvendo o veículo.');
        const describe=g=>number(g.n)+(g.n===1?' sinistro':' sinistros')+': '+number(g.fatal)+(g.fatal===1?' fatal':' fatais')+' e '+number(g.nonfatal)+(g.nonfatal===1?' não fatal':' não fatais')+(g.deaths?' · '+number(g.deaths)+(g.deaths===1?' óbito':' óbitos')+' nas ocorrências':'')+'.';
        if(e.groups.length)for(const g of e.groups)lines.push(g.label+': '+describe(g));
        else lines.push(describe({n:s.total,...s}));
        if(e.groups.length)lines.push('Total de ocorrências distintas no conjunto identificado: '+number(s.total)+' ('+number(s.fatal)+' fatais e '+number(s.nonfatal)+' não fatais).');
        if(p.vehicles?.length)lines.push('Quantidade de veículos das categorias selecionadas registrada nesses eventos: '+number(m.selectedVehicles)+'.');
        if(p.roles?.length){for(const v of Object.values(m.byRole))lines.push(v.label+' registrados nesses sinistros: '+number(v.people)+' pessoa(s), '+number(v.deaths)+' óbito(s) e '+number(v.injured)+' ferido(s) leves/graves.');if(!Object.keys(m.byRole).length)lines.push('Não há pessoas com o papel solicitado identificado neste recorte; ausência de classificação não é ausência de motoristas/passageiros.');}
        const c=m.coverageBeforeVehicleFilter;lines.push('Cobertura do recorte antes do filtro de veículo: '+number(c.eventsWithKnownVehicleType)+' sinistros com categoria conhecida; '+number(c.eventsWithUnknownVehicleType)+' com alguma categoria desconhecida (podem coexistir na mesma ocorrência) e '+number(c.eventsWithoutVehicleRows)+' sem detalhe de veículo.');
        if(m.limitations.length)lines.push(m.limitations.map(s=>s.endsWith('.')?s:s+'.').join(' '));
        lines.push('Não fatal significa sem óbito; pode haver feridos.');text=lines.join('\n\n');
      }else if(['haversine','etl','definitions','references','coverage'].includes(p.topic)){
        text=knowledge[p.topic];
        if(p.topic==='definitions'&&e.groups.length&&/compar|quant|numero|total/.test(q))text=e.groups.map(g=>g.label+': '+number(g.n)+' sinistros, '+number(g.fatal)+' eventos fatais e '+number(g.deaths)+' óbitos em pessoas.').join('\n')+'\n\n'+text;
      }
      else if(p.topic==='models'){
        const t=report?.primary?.models[report.primary.selected]?.test;
        text=knowledge.models+(t?' No teste de jan–ago/2025, a regressão logística alcançou AUC '+number(t.rocAuc,3)+', AP '+number(t.averagePrecision,3)+' e Brier '+number(t.brier,5)+'. O Brier da referência constante foi '+number(report.primary.models.baseline.test.brier,5)+', menor e portanto melhor.':'');
      } else if(p.topic==='central'||p.topic==='statistics'){
        const h=e.central,desc=(x,name)=>name+': OR '+number(x.odds,3)+(x.ci?' (IC95% '+number(x.ci[0],3)+'–'+number(x.ci[1],3)+')':'')+'; p = '+number(x.p,4)+', n = '+number(x.n)+'.';
        text=(p.topic==='statistics'?knowledge.statistics+'\n\n':'')+'Na comparação original de chuva anterior > 5 mm versus ≤ 5 mm: '+desc(h.road,'Proporção rodoviária')+' '+desc(h.fatality,'Fatalidade por evento')+' '+(h.road.positive&&h.fatality.positive?'Os dois componentes apresentam associação positiva neste recorte.':'Os dois componentes exigidos não sustentam a hipótese composta neste recorte.')+' Ausência de significância não prova ausência de efeito; não se demonstra causalidade.';
      } else {
        if(!s.total)text='Não encontrei sinistros que correspondam à combinação solicitada. Isso pode representar falta de cobertura ou uma seleção sem registros; não demonstra que não houve acidentes.';
        else if(e.groups.length){
          const metricNames={n:'sinistros',fatal:'sinistros fatais',deaths:'óbitos em pessoas',victims:'sinistros com vítimas identificadas',fatalRate:'% de letalidade por evento'};
          text=e.groups.map((g,i)=>(i+1)+'. '+g.label+': '+number(g.value,p.metric==='fatalRate'?2:0)+' '+metricNames[p.metric]+(p.metric==='fatalRate'?' ('+number(g.fatal)+' fatais em '+number(g.n)+' sinistros)':p.metric==='deaths'?' ('+number(g.fatal)+' eventos fatais)':'')+'.').join('\n');
        }else text='Encontrei '+number(s.total)+' sinistros, '+number(s.fatal)+' eventos fatais e '+number(s.deaths)+' óbitos em pessoas. A letalidade por evento foi '+number(s.fatalRate,2)+'%. Há '+number(s.victims)+' eventos com vítimas identificadas entre '+number(s.victimKnown)+' classificáveis.';
        if(p.metric==='fatalRate')text+=' A letalidade é entre eventos registrados: não mede risco por viagem e proporções em amostras pequenas são instáveis.';
        if(/chuva|chove|molhad|precip/.test(q)&&p.wet==null&&p.rain3h==null)text+=' Foram '+number(s.wet)+' eventos com pista molhada/indício de chuva entre '+number(s.wetKnown)+' classificáveis; '+number(s.total-s.wetKnown)+' têm condição desconhecida.';
        if(/\b(idade|idades|sexo|genero|velocidade|alcool|marca|placa)\b|embriag/.test(q))text='Esse atributo não está disponível no cubo público. '+knowledge.coverage;
        if(!/quant|acident|sinistr|mort|fatal|fatais|obito|vitima|chuva|chov|molhad|cidade|municip|onde|tipo|compara|ano|mes|bairro|via|turno|fase|resum|mostr|list|total|202\d/.test(q)&&!previous)text='Na consulta local, não consegui identificar o recorte ou a medida da sua pergunta. Pode escrever, por exemplo, “compare Santos e São Vicente em 2024 por número de mortes”. A conversa aberta usa IA quando o serviço está disponível.';
      }
      if(e.notes.length&&p.topic==='data')text+='\n\n'+e.notes.join(' ');
      return {text,plan:p,scope:e.scope,evidence:e};
    }
    return {catalog,cleanFilters,validate,query,study,infer,localAnswer};
  }
  return {create,norm,knowledge};
})();
if(typeof module!=='undefined')module.exports=AnalyticalAssistant;

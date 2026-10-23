'use strict';
const $=id=>document.getElementById(id),A=Analytics;
const fmt=(n,d=0)=>n==null||!Number.isFinite(n)?'—':Number(n).toLocaleString('pt-BR',{minimumFractionDigits:d,maximumFractionDigits:d});
const pct=n=>n==null?'—':fmt(n,2)+'%';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const names={'SAO VICENTE':'São Vicente','GUARUJA':'Guarujá','CUBATAO':'Cubatão','ITANHAEM':'Itanhaém','PERUIBE':'Peruíbe','MONGAGUA':'Mongaguá','NAO_INFORMADO':'Não informado','DESCONHECIDO':'Desconhecido'};
const pretty=s=>names[s]||String(s).toLocaleLowerCase('pt-BR').replace(/(^|\s)\S/g,c=>c.toUpperCase());
const months=['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
const palette=['#e7ee73','#8bc9c5','#dfa067','#a4b983','#c9a4ca','#779f84','#e1cda4','#5b6650'];
const emptyFilters=()=>({ano:null,mes:null,municipio:null,tipo_acidente:null,risco_pista_molhada:null,logradouro:null,bairro:null,lat:null,lng:null,radius_km:2,periodo:null,chuva3h:null});
let activeFilters=emptyFilters(),D,rows=[],chosen=[],currentStats,map,markers,selectionCircle,mapFatal=false,mapPoints=[];
const charts={};
function setFilter(key,value){const label={ano:'ano',mes:'mês',municipio:'município',tipo_acidente:'tipo de sinistro',risco_pista_molhada:'pista',logradouro:'via',bairro:'bairro',periodo:'período',chuva3h:'chuva anterior'}[key]||key;changeInteraction(value==null||value===''?'Remover filtro de '+label:'Selecionar '+label+': '+pretty(value),()=>{activeFilters[key]=value===''?null:value;if(key==='ano'||key==='mes')activeFilters.periodo=null;});}
function selectOptions(id,values){for(const v of values){const option=document.createElement('option');option.value=v;option.textContent=pretty(v);$(id).append(option);}}
function filterChips(){
  for(const id of ['ano','mes','municipio','tipo_acidente','risco_pista_molhada','chuva3h','logradouro','bairro'])$(id).value=activeFilters[id]??'';
  const labels={ano:'Ano',mes:'Mês',municipio:'Município',tipo_acidente:'Tipo',risco_pista_molhada:'Pista',logradouro:'Via',bairro:'Bairro',periodo:'Período',chuva3h:'Chuva 3h'};
  $('filterChips').replaceChildren();
  for(const [key,label] of Object.entries(labels))if(activeFilters[key]!=null){let value=pretty(activeFilters[key]);if(key==='mes')value=months[Number(activeFilters[key])-1];if(key==='risco_pista_molhada')value={'0':'Seca / sem indício','1':'Molhada / indício de chuva',unknown:'Sem classificação'}[activeFilters[key]];const b=document.createElement('button');b.className='chip';b.type='button';b.textContent=label+': '+value+' ×';b.setAttribute('aria-label','Remover filtro '+label+': '+value);b.onclick=()=>setFilter(key,null);$('filterChips').append(b);}
  if(activeFilters.lat!=null){const b=document.createElement('button');b.type='button';b.className='chip';b.textContent='Área: raio de '+fmt(activeFilters.radius_km,1)+' km ×';b.setAttribute('aria-label','Remover filtro de área');b.onclick=()=>changeInteraction('Remover filtro de área',()=>{activeFilters.lat=activeFilters.lng=null;});$('filterChips').append(b);}
}
function kpis(s){
  const cards=[['Total de sinistros',fmt(s.total),'Registros únicos do recorte'],['Sinistros fatais',fmt(s.fatal),fmt(s.deaths)+' óbitos registrados'],['Taxa de letalidade',pct(s.fatalRate),'Sinistros fatais / total'],['Com vítimas',fmt(s.victims),pct(s.victimRate)+' dos '+fmt(s.victimKnown)+' classificáveis'],['Pista molhada / chuva',pct(s.wetRate),fmt(s.wetKnown)+' com condição classificável'],['Em rodovias',pct(s.roadRate),fmt(s.roadKnown)+' com via classificável']];
  $('kpis').innerHTML=cards.map(([l,v,n])=>`<article class="kpi"><span class="label">${esc(l)}</span><strong>${esc(v)}</strong><small>${esc(n)}</small></article>`).join('');
}
function drawChart(id,type,data,options={}){
  if(!window.Chart){$(id).parentElement.innerHTML='<p class="empty">Gráfico indisponível. Os indicadores e filtros permanecem acessíveis.</p>';return;}
  if(charts[id])charts[id].destroy();
  data.datasets.forEach((dataset,index)=>{dataset.hidden=(hiddenDatasets[id]||[]).includes(index);});
  if(options.plugins?.legend?.display)options.plugins.legend.onClick=(event,item)=>chartLegendClick(id,item);
  charts[id]=new Chart($(id),{type,data,options:{responsive:true,maintainAspectRatio:false,animation:false,color:'#adb79c',plugins:{legend:{display:false},tooltip:{backgroundColor:'#28321f',titleColor:'#e7ee73',bodyColor:'#e1e7d5',padding:12}},scales:type==='doughnut'?{}:{x:{grid:{display:false},ticks:{color:'#98a887',font:{size:9},maxRotation:0}},y:{beginAtZero:true,grid:{color:'#303b26'},ticks:{color:'#98a887',font:{size:9}}}},...options}});
}
function temporal(){
  const grouped=new Map();for(const r of contextRows('periodo')){const key=r.date.slice(0,7),v=grouped.get(key)||{n:0,rain:0,rainN:0};v.n+=r.n;if(r.rain!==null){v.rain+=r.rain*r.n;v.rainN+=r.n;}grouped.set(key,v);}
  const keys=[];for(let y=2022;y<=2025;y++)for(let m=1;m<=12;m++){if(y===2025&&m>10)continue;if(activeFilters.ano&&y!==Number(activeFilters.ano))continue;if(activeFilters.mes&&m!==Number(activeFilters.mes))continue;const key=y+'-'+String(m).padStart(2,'0');keys.push(key);}
  drawChart('temporal','bar',{labels:keys.map(k=>k.slice(5)+'/'+k.slice(2,4)),datasets:[{label:'Sinistros',data:keys.map(k=>k>D.period[1].slice(0,7)?null:grouped.get(k)?.n||0),backgroundColor:keys.map(key=>activeFilters.periodo&&key!==activeFilters.periodo?'#667344':'#e7ee73'),borderColor:keys.map(key=>key===activeFilters.periodo?'#ffffff':'transparent'),borderWidth:1,borderRadius:3,maxBarThickness:20,yAxisID:'y'},{label:'Chuva horária média associada (mm)',type:'line',data:keys.map(k=>{const v=grouped.get(k);return v?.rainN?v.rain/v.rainN:null;}),borderColor:'#8bc9c5',backgroundColor:'#8bc9c5',borderWidth:2,pointRadius:2,yAxisID:'rain',spanGaps:false}]},{onClick:(e,elements)=>{if(elements.length){const key=keys[elements[0].index];selectPeriod(key);}},plugins:{legend:{display:true,labels:{boxWidth:7,boxHeight:7,font:{size:8},color:'#b8c6a4'}}},scales:{x:{grid:{display:false},ticks:{color:'#98a887',font:{size:8},maxRotation:0,maxTicksLimit:8}},y:{beginAtZero:true,grid:{color:'#303b26'},ticks:{color:'#98a887',font:{size:8}}},rain:{position:'right',beginAtZero:true,grid:{display:false},ticks:{color:'#8bc9c5',font:{size:8}},title:{display:true,text:'mm',color:'#8bc9c5',font:{size:8}}}}});
  $('temporalNote').textContent='Chuva: média das observações horárias associadas aos sinistros, apenas em 2023; não é precipitação mensal acumulada. Set/out de 2025 sem dados. A série mantém os meses do contexto; clique novamente no mês selecionado para voltar.';
}
function bars(id,items,onClick,limit=9,details,selected=null){
  const el=$(id);el.replaceChildren();const max=Math.max(1,...items.map(x=>x[1])),total=items.reduce((n,x)=>n+x[1],0);
  if(!items.length){el.innerHTML='<p class="empty">Nenhum registro neste recorte.</p>';return;}
  const visible=items.slice(0,limit),selectedItem=items.find(x=>x[0]===selected);if(selectedItem&&!visible.some(x=>x[0]===selected)){if(visible.length===limit)visible.pop();visible.push(selectedItem);}
  for(const [key,n] of visible){const b=document.createElement('button');b.type='button';b.className='barrow';b.classList.toggle('selected',key===selected);b.setAttribute('aria-pressed',String(key===selected));b.title=key===selected?'Clique novamente para remover este filtro':'Filtrar por '+pretty(key);b.innerHTML=`<span class="barlabel"><span>${esc(pretty(key))}</span><b>${fmt(n)} <small>· ${pct(A.percent(n,total))}${details?' · '+esc(details(key)):''}</small></b></span><span class="bartrack" style="display:block"><span class="barfill" style="display:block;width:${n/max*100}%"></span></span>`;b.onclick=()=>onClick(key);el.append(b);}
}
function severity(){
  const base=contextRows('risco_pista_molhada'),baseStats=A.stats(base),states=[0,1].map(w=>A.stats(base.filter(r=>r.wet===w)));
  drawChart('severity','bar',{labels:['Seca / sem indício','Molhada / chuva'],datasets:[{label:'Com vítimas (% dos classificáveis)',data:states.map(x=>x.victimRate),backgroundColor:'#e7ee73',borderRadius:4,maxBarThickness:45},{label:'Fatais (% do grupo)',data:states.map(x=>x.fatalRate),backgroundColor:'#8bc9c5',borderRadius:4,maxBarThickness:45}]},{onClick:(e,els)=>{if(els.length)toggleFilter('risco_pista_molhada',String(els[0].index));},plugins:{legend:{display:true,labels:{color:'#b8c6a4',boxWidth:8,font:{size:9}}}}});
  $('severityNote').textContent=`${fmt(baseStats.total-baseStats.wetKnown)} sinistros sem classificação de pista/chuva. Vítimas classificáveis: ${fmt(states[0].victimKnown)} no grupo seco; ${fmt(states[1].victimKnown)} no molhado. Distribuição antes do filtro de pista deste gráfico. Classificação climática é uma aproximação, não observação da pista.`;
}
function types(){
  const items=A.group(contextRows('tipo_acidente'),'type'),top=items.slice(0,7);
  // A type selected in the dropdown must remain removable in the legend even
  // if it would otherwise be hidden inside the aggregate "other types" slice.
  if(activeFilters.tipo_acidente&&!top.some(x=>x[0]===activeFilters.tipo_acidente)){
    const selected=items.find(x=>x[0]===activeFilters.tipo_acidente);if(selected){if(top.length===7)top.pop();top.push(selected);}
  }
  const visible=new Set(top.map(x=>x[0])),rest=items.filter(x=>!visible.has(x[0])).reduce((n,x)=>n+x[1],0);if(rest)top.push(['OUTROS TIPOS',rest]);
  drawChart('types','doughnut',{labels:top.map(x=>pretty(x[0])),datasets:[{data:top.map(x=>x[1]),backgroundColor:palette,borderColor:'#171d13',borderWidth:4,hoverOffset:5}]},{cutout:'73%',onClick:(e,els)=>{if(els.length&&top[els[0].index][0]!=='OUTROS TIPOS')toggleFilter('tipo_acidente',top[els[0].index][0]);}});
  $('typeLegend').replaceChildren();top.forEach(([key,n],i)=>{const b=document.createElement('button');b.type='button';b.className='type-item';b.classList.toggle('selected',activeFilters.tipo_acidente===key);b.setAttribute('aria-pressed',String(activeFilters.tipo_acidente===key));b.title=activeFilters.tipo_acidente===key?'Clique novamente para remover este filtro':'Filtrar por '+pretty(key);b.innerHTML=`<i style="background:${palette[i]}"></i><span>${esc(pretty(key))}</span><b>${fmt(n)}</b>`;b.disabled=key==='OUTROS TIPOS';b.onclick=()=>toggleFilter('tipo_acidente',key);$('typeLegend').append(b);});
  if(!top.length)$('typeLegend').innerHTML='<p class="empty">Sem registros.</p>';
}
function initMap(){
  if(!window.L){$('map').innerHTML='<p class="empty">Mapa indisponível. Explore os municípios pelos filtros.</p>';return;}
  map=L.map('map',{preferCanvas:true,scrollWheelZoom:false}).setView([-24.05,-46.6],9);
  const tiles=L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}',{attribution:'Tiles © Esri — Esri, HERE, Garmin, USGS, NGA',maxZoom:18});let failed=false;
  tiles.on('tileerror',()=>{if(!failed){failed=true;$('mapNote').textContent+=' Cartografia de fundo indisponível; os pontos continuam representando as coordenadas da base.';}});tiles.addTo(map);markers=L.layerGroup().addTo(map);
  map.on('popupopen',e=>{const root=e.popup.getElement(),button=root.querySelector('[data-area]');if(button)button.onclick=()=>{setArea(Number(button.dataset.lat),Number(button.dataset.lng),2,true);};const street=root.querySelector('[data-street]');if(street)street.onclick=()=>toggleFilter('logradouro',street.dataset.street);const district=root.querySelector('[data-district]');if(district)district.onclick=()=>toggleFilter('bairro',district.dataset.district);});
}
function renderMap(){
  if(!map)return;map.closePopup();markers.clearLayers();if(selectionCircle){map.removeLayer(selectionCircle);selectionCircle=null;}
  const points=new Map();for(const r of chosen){if(r.lat===null||r.lng===null)continue;const key=r.lat+','+r.lng;const p=points.get(key)||{lat:r.lat,lng:r.lng,n:0,fatal:0,deaths:0,street:r.street,district:r.district,largest:0};p.n+=r.n;p.fatal+=r.fatal;p.deaths+=r.deaths;if(r.n>p.largest){p.street=r.street;p.district=r.district;p.largest=r.n;}points.set(key,p);}
  mapPoints=[...points.values()].filter(p=>!mapFatal||p.fatal>0);
  for(const p of mapPoints){const value=mapFatal?p.fatal:p.n;L.circleMarker([p.lat,p.lng],{radius:Math.min(22,3+Math.sqrt(value)*1.15),color:p.fatal?'#f18179':'#e7ee73',weight:1,fillColor:p.fatal?'#f18179':'#e7ee73',fillOpacity:.32}).bindPopup(`<b>Área aproximada · ${p.lat}, ${p.lng}</b><br>${fmt(p.n)} sinistros · ${fmt(p.fatal)} fatais<br>${fmt(p.deaths)} óbitos<br><button type="button" data-area data-lat="${p.lat}" data-lng="${p.lng}">Filtrar raio de 2 km</button>${p.street!=='NAO_INFORMADO'?`<br><button type="button" data-street="${esc(p.street)}">Via: ${esc(pretty(p.street))}</button>`:''}${p.district!=='NAO_INFORMADO'?`<br><button type="button" data-district="${esc(p.district)}">Bairro: ${esc(pretty(p.district))}</button>`:''}`).addTo(markers);}
  if(activeFilters.lat!=null)selectionCircle=L.circle([activeFilters.lat,activeFilters.lng],{radius:activeFilters.radius_km*1000,color:'#8bc9c5',weight:2,fillOpacity:.05}).addTo(map);
  const geo=A.sum(chosen.filter(r=>r.lat!==null&&r.lng!==null),'n');$('mapNote').textContent=`${fmt(geo)} de ${fmt(currentStats.total)} sinistros com coordenadas válidas. ${fmt(mapPoints.length)} áreas ${mapFatal?'com sinistros fatais':'no mapa'}. Clique em uma área para aplicar filtro espacial.`;
}
function fitMap(){if(map&&mapPoints.length){const bounds=L.latLngBounds(mapPoints.map(p=>[p.lat,p.lng]));map.fitBounds(bounds,{padding:[25,25],maxZoom:12,animate:false});}else if(map)map.setView([-24.05,-46.6],9);}
function science(s){
  const h=s.h1;
  $('hypothesis').textContent=h.positive?'H1 · Associação positiva no recorte':h.reliable?'H1 · Sem evidência de aumento':'H1 · Evidência insuficiente';$('hypothesis').classList.toggle('inconclusive',!h.positive);
  $('diagnosis').textContent=`Este recorte reúne ${fmt(s.total)} sinistros e ${fmt(s.fatal)} eventos fatais (${fmt(s.deaths)} óbitos). A letalidade por evento é ${pct(s.fatalRate)}. Há ${fmt(s.victims)} sinistros com vítimas identificados entre ${fmt(s.victimKnown)} classificáveis. A análise H1 usa ${fmt(h.n)} registros com condição da pista/chuva e desfecho conhecidos.`;
  const pText=p=>p==null?'Indisponível':p<.0001?p.toExponential(2).replace('.',','):fmt(p,4);
  $('scienceMetrics').innerHTML=[['Odds Ratio',fmt(h.odds,3),h.ci?`IC95% ${fmt(h.ci[0],3)}–${fmt(h.ci[1],3)}`:'Comparação requer ambos os grupos'],['Variação das chances',h.odds==null?'—':(h.odds>=1?'+':'')+pct((h.odds-1)*100),'Entre sinistros registrados'],['Letalidade',pct(s.fatalRate),'Eventos fatais / sinistros'],['Amostra para H1',fmt(h.n),pct(A.percent(h.n,s.total))+' do recorte']].map(([l,v,n])=>`<div class="science-metric"><span>${esc(l)}</span><strong>${esc(v)}</strong><small>${esc(n)}</small></div>`).join('');
  $('h1Text').textContent=h.odds===null?'Não é possível estimar o OR neste recorte: falta um dos grupos ou há célula zero na tabela. Amplie os filtros.':`OR ${fmt(h.odds,3)}, IC95% ${fmt(h.ci[0],3)}–${fmt(h.ci[1],3)}. ${h.reliable?h.test+'; χ² '+fmt(h.chi,2)+'; p = '+pText(h.p)+'. '+significance(h):'Frequências insuficientes para a aproximação qui-quadrado; OR e intervalo são apenas descritivos.'} A amostra classificada pode diferir dos registros sem informação; este resultado não demonstra causalidade nem risco por viagem.`;
  const h2=s.h2;$('h2Text').textContent=h2.n?`Na amostra com condição e via conhecidas (${fmt(h2.n)} sinistros), rodovias representam ${pct(h2.wetRate)} no grupo molhado e ${pct(h2.dryRate)} no seco. ${h2.reliable?'p = '+pText(h2.p)+'. '+(h2.positive?'Há maior proporção de sinistros rodoviários sob condição molhada.':'Não há evidência de maior proporção rodoviária sob condição molhada.'):'A inferência é inconclusiva por falta de frequência nos grupos.'} O teste não mede deslocamento de tráfego entre vias.`:'Sem grupos comparáveis para testar a distribuição entre rodovias e vias urbanas.';
  const season=A.seasons(chosen,activeFilters,D.period);$('h3Text').textContent=`Foram registrados ${fmt(season.counts[1])} sinistros nas sextas e fins de semana de verão e ${fmt(season.counts[0])} nos demais dias. Médias por dia de calendário: ${fmt(season.rates[1],2)} e ${fmt(season.rates[0],2)}, respectivamente. Esta é a descrição dos filtros; o modelo regional ajustado de contagem está na seção da hipótese central. A exposição ao tráfego permanece indisponível.`;
  const recs=[];if(s.wet)recs.push('Avaliar drenagem, aderência e sinalização nos pontos com sinistros sob chuva.');if(s.road)recs.push('Priorizar fiscalização de velocidade e revisão de defensas nos eixos rodoviários identificados.');if(s.fatal)recs.push('Inspecionar os hotspots fatais e os conflitos entre pedestres, ciclistas e veículos.');recs.push('Ampliar o preenchimento da gravidade e da condição da pista antes de generalizar os resultados.');$('recommendations').innerHTML=recs.map(x=>'<li>'+esc(x)+'</li>').join('');
  $('contingency').innerHTML=`<table><thead><tr><th>H1 · condição</th><th>Com vítimas</th><th>Sem vítimas</th><th>Total classificável</th></tr></thead><tbody><tr><td>Molhada / indício de chuva</td><td>a = ${fmt(h.a)}</td><td>b = ${fmt(h.b)}</td><td>${fmt(h.a+h.b)}</td></tr><tr><td>Seca / sem indício</td><td>c = ${fmt(h.c)}</td><td>d = ${fmt(h.d)}</td><td>${fmt(h.c+h.d)}</td></tr></tbody></table>`;
  $('seasonality').innerHTML=[['Dias de verão turístico',fmt(season.days[1])+' dias · '+fmt(season.counts[1])+' sinistros'],['Média por dia de verão turístico',fmt(season.rates[1],2)],['Demais dias do calendário',fmt(season.days[0])+' dias · '+fmt(season.counts[0])+' sinistros'],['Média por dia nos demais períodos',fmt(season.rates[0],2)]].map(([k,v])=>`<div class="seasonrow"><span>${esc(k)}</span><b>${esc(v)}</b></div>`).join('');
}
function refreshDashboard(){
  $('modelExperiment').value=selectedExperiment;
  if(activeFilters.lat!=null){$('probeLat').value=activeFilters.lat;$('probeLng').value=activeFilters.lng;$('radiusKm').value=activeFilters.radius_km;}
  chosen=A.filter(rows,activeFilters);currentStats=A.stats(chosen);filterChips();kpis(currentStats);temporal();bars('cities',A.group(contextRows('municipio'),'city'),k=>toggleFilter('municipio',k),9,null,activeFilters.municipio);severity(currentStats);types();renderMap();science(currentStats);renderResearch();
  const roadRows=contextRows('logradouro').filter(r=>r.road===1&&r.street!=='NAO_INFORMADO');bars('roads',A.group(roadRows,'street'),k=>toggleFilter('logradouro',k),6,k=>fmt(A.sum(roadRows.filter(r=>r.street===k),'fatal'))+' fatais',activeFilters.logradouro);
  $('status').hidden=false;$('status').textContent=chosen.length?'': 'Nenhum sinistro corresponde aos filtros. Remova um filtro ou use Limpar.';$('status').hidden=chosen.length>0;
  window.dashboardState={filters:{...activeFilters},stats:currentStats};
  updateInteractionControls();
}
function answer(message){
  const q=message.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase(),s=currentStats;
  if(!s.total)return 'Não há registros neste recorte. Remova um filtro para explorar os dados.';
  if(/probabilidade|prever|previsao|random forest|modelo|auc/.test(q))return $('modelSummary').textContent+' '+$('modelCaution').textContent;
  if(/haversine|distancia|estacao/.test(q))return $('haversineResult').textContent+' '+$('stationCoverage').textContent;
  if(/5 mm|hipotese central|chuva acumulada|fatalidade.*chuva/.test(q))return $('centralSummary').textContent+' '+$('centralResults').textContent+' '+$('centralDecision').textContent;
  if(/odds|hipotese|h1|chance|risco|p.valor/.test(q))return $('h1Text').textContent+' Amostra utilizada: '+fmt(s.h1.n)+' de '+fmt(s.total)+' sinistros.';
  if(/anchieta|imigrantes/.test(q)){
    const rainOnly=/chuva|molhad|precip/.test(q),base=chosen.filter(r=>r.road===1&&(!rainOnly||r.wet===1));
    const corridors=[['Anchieta (SP-150)',/\bSP[ -]?150\b|^(?:RODOVIA\s+)?ANCHIETA\b/],['Imigrantes (SP-160)',/\bSP[ -]?160\b|^(?:RODOVIA\s+)?IMIGRANTES\b/]];
    return 'Comparação dos eixos no recorte'+(rainOnly?' molhado/com indício de chuva':'')+': '+corridors.map(([name,re])=>{const s=A.stats(base.filter(r=>re.test(r.street)));return name+': '+fmt(s.total)+' sinistros, '+fmt(s.fatal)+' fatais e '+fmt(s.deaths)+' óbitos';}).join('; ')+'. Os eixos são reconhecidos pelo nome informado e código da rodovia; ausência de nome pode limitar a cobertura.';
  }
  if(/rodovia|h2/.test(q))return $('h2Text').textContent+'\nVias rodoviárias com mais eventos fatais: '+A.group(chosen.filter(r=>r.road===1&&r.street!=='NAO_INFORMADO'),'street','fatal').filter(x=>x[1]>0).slice(0,4).map(([k,v])=>pretty(k)+' ('+fmt(v)+')').join('; ')+'.';
  if(/sazon|verao|feriado|turis|h3/.test(q))return $('h3Text').textContent;
  if(/fatal|fatais|obito|letal|hotspot/.test(q))return `${fmt(s.fatal)} sinistros fatais e ${fmt(s.deaths)} óbitos, com letalidade de ${pct(s.fatalRate)}. Municípios com mais eventos fatais: `+A.group(chosen,'city','fatal').slice(0,5).map(([k,v])=>pretty(k)+' ('+fmt(v)+')').join('; ')+'.';
  if(/tipo|colis|atropel|tombamento/.test(q))return 'Tipos mais frequentes neste recorte: '+A.group(chosen,'type').slice(0,5).map(([k,v])=>pretty(k)+' ('+fmt(v)+')').join('; ')+'. Para examinar apenas chuva, selecione Molhada / indício de chuva.';
  if(/chuva|precip|molhada|seca/.test(q))return `${fmt(s.wet)} sinistros classificados como molhados/com indício de chuva, entre ${fmt(s.wetKnown)} com condição conhecida. ${fmt(A.stats(base).total-A.stats(base).wetKnown)} permanecem desconhecidos. O clima associado cobre somente 2023; os demais anos dependem do registro da pista. `+$('h1Text').textContent;
  if(/municip|cidade|onde/.test(q))return 'Municípios com mais sinistros neste recorte: '+A.group(chosen,'city').slice(0,5).map(([k,v])=>pretty(k)+' ('+fmt(v)+')').join('; ')+'.';
  if(/cobertura|dado|fonte|periodo|metodo/.test(q))return $('methodCoverage').textContent+' As fontes e os critérios estão em Dados e método.';
  return `${fmt(s.total)} sinistros, ${fmt(s.fatal)} fatais e ${fmt(s.victims)} com vítimas identificadas no recorte atual. Posso responder sobre Odds Ratio, chuva, rodovias, municípios, tipos e sazonalidade. Para relações adicionais, exporte a seleção para análise.`;
}
function chat(message){
  for(const [cls,body] of [['user',message],['bot',answer(message)]]){const el=document.createElement('div');el.className='message '+cls;if(cls==='bot'){const label=document.createElement('small');label.textContent='RECORTE: '+(activeFilters.municipio?pretty(activeFilters.municipio):'Baixada Santista')+' · '+(activeFilters.ano||'2022–2025')+' · '+fmt(currentStats.total)+' sinistros';el.append(label);}el.append(document.createTextNode(body));$('chatMessages').append(el);}$('chatMessages').scrollTop=$('chatMessages').scrollHeight;
}
function download(){
  const csv=A.csv(chosen,D.fields);
  const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'})),a=document.createElement('a');a.href=url;a.download='baixada-santista-recorte.csv';a.hidden=true;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);
}
for(const id of ['ano','mes','municipio','tipo_acidente','risco_pista_molhada','chuva3h'])$(id).addEventListener('change',()=>setFilter(id,$(id).value));
$('applyLocation').onclick=()=>changeInteraction('Aplicar via e bairro',()=>{activeFilters.logradouro=$('logradouro').value.trim()||null;activeFilters.bairro=$('bairro').value.trim()||null;});
document.querySelectorAll('[data-wet]').forEach(b=>b.onclick=()=>toggleFilter('risco_pista_molhada',b.dataset.wet));
$('reset').onclick=clearDashboard;$('download').onclick=download;
for(const [id,fatal] of [['mapAll',false],['mapFatal',true]])$(id).onclick=()=>changeInteraction(fatal?'Mostrar camada de fatais':'Mostrar todos no mapa',()=>{mapFatal=fatal;});$('mapFit').onclick=fitMap;
$('chatForm').addEventListener('submit',e=>{e.preventDefault();const message=$('chatInput').value.trim();if(message&&currentStats){chat(message);$('chatInput').value='';}});document.querySelectorAll('.suggestions button').forEach(b=>b.onclick=()=>{if(currentStats)chat(b.textContent);});
document.querySelectorAll('nav a').forEach(a=>a.onclick=()=>{document.querySelectorAll('nav a').forEach(x=>x.classList.remove('active'));a.classList.add('active');});
(async()=>{try{
  const response=await fetch('research.json.gz');if(!response.ok)throw Error('HTTP '+response.status);if(!window.DecompressionStream)throw Error('Este navegador precisa de suporte à descompressão gzip.');D=await new Response(response.body.pipeThrough(new DecompressionStream('gzip'))).json();if(D.scope!=='RMBS')throw Error('A base não corresponde à Baixada Santista.');
  rows=D.records.map(a=>Object.fromEntries(D.fields.map((f,i)=>[f,a[i]])));
  for(let m=1;m<=12;m++){const o=document.createElement('option');o.value=String(m);o.textContent=months[m-1];$('mes').append(o);}selectOptions('municipio',Object.values(D.cities).sort());selectOptions('tipo_acidente',[...new Set(rows.map(r=>r.type))].sort());
  for(const [id,key] of [['streetOptions','street'],['districtOptions','district']])for(const value of [...new Set(rows.map(r=>r[key]))].sort()){if(value==='NAO_INFORMADO')continue;const o=document.createElement('option');o.value=value;$(id).append(o);}
  $('coverageText').textContent=`Base observada: jan/2022–ago/2025 · ${fmt(D.audit.accidents)} sinistros · 9 municípios. Set/out de 2025 não recebidos. INMET: somente 2023.`;
  $('methodCoverage').textContent=`${fmt(D.audit.accidents)} sinistros no recorte dos nove códigos IBGE, de 01/01/2022 a 31/08/2025. O escopo solicitado termina em outubro de 2025, mas a fonte recebida termina em agosto. O código de Mongaguá é 3531100. A contagem de 508.575 do relatório de referência não foi reproduzida nesta base.`;
  await initResearch();installInteractionControls();$('app').hidden=false;initMap();refreshDashboard();fitMap();window.dashboardReady=true;
}catch(e){$('status').hidden=false;$('status').textContent='Não foi possível carregar o painel: '+e.message+' Recarregue a página ou confira a base publicada.';console.error(e);}})();

'use strict';
// One history for filters and chart views. Hover and map pan never add entries.
const undoActions=[],redoActions=[];
let hiddenDatasets={},selectedExperiment='primary',lastInteraction='Clique em um gráfico para explorar os dados.';
function interactionSnapshot(){
  return {filters:{...activeFilters},mapFatal,experiment:selectedExperiment,hidden:JSON.parse(JSON.stringify(hiddenDatasets))};
}
function restoreInteraction(s){
  activeFilters={...emptyFilters(),...s.filters};mapFatal=s.mapFatal;
  selectedExperiment=s.experiment;hiddenDatasets=JSON.parse(JSON.stringify(s.hidden));
}
function changeInteraction(label,change){
  const before=interactionSnapshot();change();
  if(JSON.stringify(before)===JSON.stringify(interactionSnapshot()))return;
  undoActions.push({state:before,label});if(undoActions.length>100)undoActions.shift();
  redoActions.length=0;lastInteraction=label;refreshDashboard();
  if(before.filters.municipio!==activeFilters.municipio||before.filters.lat!==activeFilters.lat||before.filters.lng!==activeFilters.lng)fitMap();
}
function moveInteraction(source,target,verb){
  const action=source.pop();if(!action)return;
  target.push({state:interactionSnapshot(),label:action.label});restoreInteraction(action.state);
  lastInteraction=verb+': '+action.label;refreshDashboard();fitMap();
}
function toggleFilter(key,value){setFilter(key,activeFilters[key]===value?null:value);}
function selectPeriod(value){
  // Keep manually chosen year/month intact. Removing this drill-down restores
  // that exact time context, rather than leaving hidden year/month filters.
  changeInteraction(activeFilters.periodo===value?'Remover mês do gráfico':'Selecionar mês '+value,()=>{
    activeFilters.periodo=activeFilters.periodo===value?null:value;
  });
}
function setArea(lat,lng,radius=2,toggle=false){
  const same=activeFilters.lat===lat&&activeFilters.lng===lng&&activeFilters.radius_km===radius;
  changeInteraction(toggle&&same?'Remover seleção de área':'Selecionar área de '+fmt(radius,1)+' km',()=>{
    activeFilters.lat=toggle&&same?null:lat;activeFilters.lng=toggle&&same?null:lng;
    activeFilters.radius_km=radius;
  });
}
function contextRows(...ignored){
  const filters={...activeFilters};for(const key of ignored)filters[key]=null;
  return A.filter(rows,filters);
}
function clearChart(id){
  changeInteraction('Limpar seleção do gráfico',()=>{
    if(id==='temporal'){
      if(activeFilters.periodo)activeFilters.periodo=null;
      else activeFilters.ano=activeFilters.mes=null;
    }else{
      const key={types:'tipo_acidente',cities:'municipio',severity:'risco_pista_molhada',roads:'logradouro'}[id];
      if(key)activeFilters[key]=null;
    }
    if(id==='map'){activeFilters.lat=activeFilters.lng=null;mapFatal=false;}
    if(id==='calibration')selectedExperiment='primary';
    delete hiddenDatasets[id];
  });
}
function clearDashboard(){
  changeInteraction('Limpar todos os filtros',()=>{
    activeFilters=emptyFilters();mapFatal=false;hiddenDatasets={};selectedExperiment='primary';
  });
}
function chartLegendClick(id,item){
  const index=item.datasetIndex;if(index==null)return;
  changeInteraction('Alternar série do gráfico',()=>{
    const indices=new Set(hiddenDatasets[id]||[]);
    if(indices.has(index))indices.delete(index);else indices.add(index);
    if(indices.size)hiddenDatasets[id]=[...indices].sort();else delete hiddenDatasets[id];
  });
}
function installInteractionControls(){
  const bar=document.createElement('section');bar.id='filterNavigation';bar.className='filter-navigation';
  bar.setAttribute('aria-label','Histórico da exploração dos gráficos');
  bar.innerHTML='<button class="quiet" id="undoFilter" type="button" disabled>← Voltar</button><button class="quiet" id="redoFilter" type="button" disabled>Refazer →</button><button class="quiet" id="clearFilters" type="button" disabled>Limpar filtros</button><span id="navigationStatus" role="status" aria-live="polite"></span>';
  $('filterChips').before(bar);
  $('undoFilter').onclick=()=>moveInteraction(undoActions,redoActions,'Desfeito');
  $('redoFilter').onclick=()=>moveInteraction(redoActions,undoActions,'Refeito');
  $('clearFilters').onclick=clearDashboard;
  const chartLabels={temporal:'Limpar período',types:'Limpar tipo',cities:'Limpar município',severity:'Limpar pista',roads:'Limpar via',map:'Restaurar mapa',calibration:'Restaurar gráfico'};
  for(const [id,label] of Object.entries(chartLabels)){
    const panel=$(id).closest('article,section.panel'),head=panel.querySelector('.panelhead')||panel.querySelector('h2');
    const controls=document.createElement('div');controls.className='chart-actions';
    const button=document.createElement('button');button.id='clear-'+id;button.className='quiet';button.type='button';button.textContent=label;button.disabled=true;
    button.setAttribute('aria-label',label+' neste gráfico');button.onclick=()=>clearChart(id);
    const status=document.createElement('span');status.id='selection-'+id;status.className='chart-selection';
    controls.append(button,status);head.after(controls);
  }
}
function updateInteractionControls(){
  $('undoFilter').disabled=!undoActions.length;$('redoFilter').disabled=!redoActions.length;
  $('undoFilter').title=undoActions.length?'Desfazer: '+undoActions.at(-1).label:'Nenhuma ação para desfazer';
  $('redoFilter').title=redoActions.length?'Refazer: '+redoActions.at(-1).label:'Nenhuma ação para refazer';
  const anyFilter=Object.entries(activeFilters).some(([key,value])=>key!=='radius_km'&&value!=null);
  $('clearFilters').disabled=!anyFilter&&!mapFatal&&!Object.keys(hiddenDatasets).length&&selectedExperiment==='primary';
  $('navigationStatus').textContent=lastInteraction;
  $('modelExperiment').value=selectedExperiment;
  $('mapAll').classList.toggle('active',!mapFatal);$('mapFatal').classList.toggle('active',mapFatal);
  $('mapAll').setAttribute('aria-pressed',String(!mapFatal));$('mapFatal').setAttribute('aria-pressed',String(mapFatal));
  const selections={temporal:activeFilters.periodo||(activeFilters.ano||activeFilters.mes? 'Período dos filtros acima':null),
    types:activeFilters.tipo_acidente,cities:activeFilters.municipio,severity:activeFilters.risco_pista_molhada,
    roads:activeFilters.logradouro,map:activeFilters.lat!=null?'Área de '+fmt(activeFilters.radius_km,1)+' km':mapFatal?'Camada de fatais':null,
    calibration:selectedExperiment==='climate'?'Experimento climático de 2023':null};
  for(const [id,value] of Object.entries(selections)){
    const hidden=hiddenDatasets[id]?.length||0;
    $('clear-'+id).disabled=value==null&&!hidden;
    let text=value==null?'':id==='severity'?({'0':'Seca / sem indício','1':'Molhada / chuva',unknown:'Sem classificação'}[value]):pretty(value);
    $('selection-'+id).textContent=(text?'Selecionado: '+text+'. ':'')+(hidden?'Há séries ocultas. ':'')+(['temporal','types','cities','severity','roads'].includes(id)?'Clique novamente para remover a seleção.':'');
  }
  document.querySelectorAll('[data-wet]').forEach(button=>{
    const pressed=activeFilters.risco_pista_molhada===button.dataset.wet;
    button.setAttribute('aria-pressed',String(pressed));button.classList.toggle('selected',pressed);
  });
  if(activeFilters.lat!=null){$('probeLat').value=activeFilters.lat;$('probeLng').value=activeFilters.lng;$('radiusKm').value=activeFilters.radius_km;}
  window.dashboardState={...window.dashboardState,history:{undo:undoActions.length,redo:redoActions.length},view:{mapFatal,experiment:selectedExperiment,hiddenDatasets:JSON.parse(JSON.stringify(hiddenDatasets))}};
}

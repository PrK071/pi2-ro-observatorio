'use strict';
let StudyReport=null;
const modelNames={baseline:'Prevalência do treino',logistic:'Regressão logística L2',random_forest:'Random Forest'};
function significance(h){
  if(h.p===null)return 'Comparação indisponível: faltam grupos ou desfechos.';
  if(h.positive)return 'Associação positiva neste recorte.';
  if(h.ci&&h.ci[1]<1&&h.p<.05)return 'Associação inversa neste recorte.';
  return 'Sem evidência suficiente de associação; não demonstra equivalência.';
}
function pformat(p){return p==null?'—':p<.0001?p.toExponential(3).replace('.',','):fmt(p,4);}
function hypothesisTable(h,label){
  return `<div><h3>${esc(label)}</h3><p><b>${esc(significance(h))}</b> OR ${fmt(h.odds,3)}${h.ci?' · IC95% '+fmt(h.ci[0],3)+'–'+fmt(h.ci[1],3):''} · ${esc(h.test||'Teste indisponível')} · p = ${pformat(h.p)} · n = ${fmt(h.n)}.</p><div class="tablewrap"><table><thead><tr><th>Chuva anterior</th><th>Desfecho sim</th><th>Desfecho não</th><th>Proporção</th></tr></thead><tbody><tr><td>&gt; 5 mm / 3h</td><td>${fmt(h.a)}</td><td>${fmt(h.b)}</td><td>${pct(h.wetRate)}</td></tr><tr><td>≤ 5 mm / 3h</td><td>${fmt(h.c)}</td><td>${fmt(h.d)}</td><td>${pct(h.dryRate)}</td></tr></tbody></table></div></div>`;
}
function renderCentral(){
  const h=A.central(chosen);
  $('centralSummary').textContent=`${fmt(h.eligible)} de ${fmt(currentStats.total)} sinistros têm janela anterior completa; ${fmt(h.high)} ocorreram após mais de 5 mm em três horas. Esta comparação usa precipitação medida em 2023. O filtro “Pista / indício de chuva” representa outra exposição.`;
  $('centralResults').innerHTML=hypothesisTable(h.road,'H-R · Maior proporção de sinistros em rodovias')+hypothesisTable(h.fatality,'H-F · Maior proporção de sinistros fatais');
  $('centralDecision').textContent=(h.road.positive&&h.fatality.positive?'Há associações positivas nos dois componentes; ainda não demonstram causalidade nem deslocamento espacial.':'A hipótese composta não é sustentada neste recorte pelos dois componentes exigidos. Ausência de significância não prova ausência de efeito.')+' Os testes são retrospectivos, sem ajuste de confundidores; filtros sucessivos constituem exploração. P-valores bilaterais; ajuste de Holm dos dois testes disponível no relatório completo.';
  if(StudyReport){
    const c=StudyReport.countModel,t=c.effects.tourist,i=c.effects.tourist_x_lograin;
    $('countModelText').textContent=`Modelo regional fixo de 2023, sem reestimar pelos filtros: ${fmt(c.nCityDays)} município-dias, ${fmt(c.zeroCityDays)} sem sinistro registrado e ${fmt(c.excludedIncompleteWeatherCityDays)} excluídos por chuva incompleta. Poisson, ajuste por município, mês, dia da semana, tendência e log(1 + chuva diária), com interação verão turístico × chuva. Erros agrupados em ${c.clustersWeeks} semanas. Verão em dia sem chuva: IRR ${fmt(t.irr,3)} (IC95% ${fmt(t.ci[0],3)}–${fmt(t.ci[1],3)}), p = ${pformat(t.p)}. Interação: multiplicador ${fmt(i.irr,3)} (IC95% ${fmt(i.ci[0],3)}–${fmt(i.ci[1],3)}), p = ${pformat(i.p)}. Não há evidência suficiente de amplificação sazonal por chuva. Sem volume de tráfego, a comparação é de contagens por dia; turismo é uma aproximação de calendário.`;
  }
}
function renderModels(){
  if(!StudyReport){$('modelSummary').textContent='Relatório de modelos indisponível. Os demais cálculos permanecem acessíveis.';return;}
  const climate=$('modelExperiment').value==='climate',key=climate?'climate':'primary',report=StudyReport[key],field=climate?'climateScore':'fatalScore';
  if(report.status!=='trained'){$('modelSummary').textContent='Amostra insuficiente para treinamento e teste.';return;}
  const s=A.prediction(chosen,field,report.threshold),train=report.splits.train,val=report.splits.validation,test=report.splits.test;
  $('modelSummary').textContent=`Modelo escolhido na validação: ${modelNames[report.selected]}. Treino ${train.start}–${train.end} (${fmt(train.n)}); validação ${val.start}–${val.end} (${fmt(val.n)}); teste ${test.start}–${test.end} (${fmt(test.n)}). Os filtros apenas selecionam previsões do teste já calculadas; não treinam o modelo novamente. Alvo: fatalidade condicionada a um sinistro registrado. Não prevê ocorrência futura de acidentes.`;
  $('modelMetrics').innerHTML=[['Eventos do teste no recorte',fmt(s.n),fmt(s.positive)+' fatais'],['ROC-AUC',fmt(s.auc,3),'Discriminação no recorte'],['Average Precision',fmt(s.ap,3),'Referência: '+fmt(s.prevalence,3)],['Brier',fmt(s.brier,4),'Menor é melhor']].map(([a,b,c])=>`<div class="science-metric"><span>${esc(a)}</span><strong>${esc(b)}</strong><small>${esc(c)}</small></div>`).join('');
  $('modelComparison').innerHTML='<table><caption>Teste completo deste experimento · valores fixos, sem os filtros locais</caption><thead><tr><th>Modelo</th><th>AP validação</th><th>AUC teste</th><th>AP teste</th><th>Brier teste</th></tr></thead><tbody>'+Object.entries(report.models).map(([name,values])=>`<tr><td>${esc(modelNames[name])}${name===report.selected?' · selecionado':''}</td><td>${fmt(values.validation.averagePrecision,3)}</td><td>${fmt(values.test.rocAuc,3)}</td><td>${fmt(values.test.averagePrecision,3)}</td><td>${fmt(values.test.brier,4)}</td></tr>`).join('')+'</tbody></table>';
  const full=report.models[report.selected].test,ci=full.ci95DayBootstrap;
  $('modelCaution').textContent=`Teste completo: IC95% da AUC ${fmt(ci.rocAuc[0],3)}–${fmt(ci.rocAuc[1],3)}, bootstrap de 200 amostras por dia. Não é intervalo do recorte filtrado. `+(full.brier>report.models.baseline.test.brier?'O Brier do modelo selecionado é pior que o da prevalência constante: os escores não devem ser interpretados como probabilidades calibradas para decisões operacionais. ':'Avaliar a curva de confiabilidade e a baixa sensibilidade antes de qualquer uso operacional. ')+(s.n?`No recorte, limiar fixo ${fmt(report.threshold,4)}: precisão ${pct(s.precision==null?null:s.precision*100)}, sensibilidade ${pct(s.recall==null?null:s.recall*100)}. VP ${fmt(s.confusion.tp)}, FP ${fmt(s.confusion.fp)}, FN ${fmt(s.confusion.fn)}, VN ${fmt(s.confusion.tn)}. `:'Nenhuma previsão de teste coincide com os filtros. ')+(climate?'A ablação sobre a mesma amostra está no artigo; AUC alta não demonstra efeito causal da chuva.':'A queda entre validação e teste indica fragilidade temporal; não houve reajuste no teste.');
  drawChart('calibration','scatter',{datasets:[{label:'Confiabilidade do recorte',data:s.calibration.map(b=>({x:b.mean,y:b.observed})),pointRadius:5,backgroundColor:'#c4c5ca'},{label:'Referência y = x',data:[{x:0,y:0},{x:1,y:1}],showLine:true,pointRadius:0,borderColor:'#9b9ca5',borderDash:[5,5],borderWidth:1}]},{plugins:{legend:{display:true,labels:{color:'#b4b5bc',boxWidth:8}}},scales:{x:{type:'linear',min:0,max:1,title:{display:true,text:'Escore médio',color:'#b4b5bc'},ticks:{color:'#b4b5bc'}},y:{min:0,max:1,title:{display:true,text:'Frequência observada',color:'#b4b5bc'},ticks:{color:'#b4b5bc'}}}});
}
function renderHaversine(){
  if(!StudyReport)return;
  const lat=Number($('probeLat').value),lng=Number($('probeLng').value);
  if(!Number.isFinite(lat)||!Number.isFinite(lng)||Math.abs(lat)>90||Math.abs(lng)>180){$('haversineResult').textContent='Informe latitude e longitude válidas em graus decimais.';return;}
  const stations=Object.entries(StudyReport.geography.stations).map(([code,pos])=>({code,km:A.distance(lat,lng,pos.lat,pos.lng)})).sort((a,b)=>a.km-b.km);
  $('haversineResult').textContent=stations.map(s=>`${s.code}: ${fmt(s.km,3)} km`).join(' · ')+`. Mais próxima entre as duas fornecidas: ${stations[0].code}${stations[0].km>100?' (fora do limite de 100 km)':''}.`;
  const rr=chosen.filter(r=>r.stationDistanceKm!==null&&r.stationDistanceKm!==undefined),n=A.sum(rr,'n');
  $('stationCoverage').textContent=`No recorte: ${fmt(n)} sinistros com estação selecionada dentro de 100 km; ${fmt(A.sum(rr.filter(r=>r.rain!==null),'n'))} com chuva horária medida. Distância média ponderada ${fmt(n?rr.reduce((v,r)=>v+r.stationDistanceKm*r.n,0)/n:null,2)} km. A atribuição do ETL usa coordenadas originais; o filtro público usa coordenadas arredondadas a 0,01°, com incerteza perto do limite do raio.`;
}
async function initResearch(){
  try{const response=await fetch('modelos.json');if(!response.ok)throw Error('HTTP '+response.status);StudyReport=await response.json();}
  catch(e){console.warn('Model report unavailable',e);}
  $('modelExperiment').onchange=event=>{const value=event.target.value;changeInteraction('Trocar experimento preditivo',()=>{selectedExperiment=value;});};
  for(const id of ['probeLat','probeLng'])$(id).oninput=renderHaversine;
  $('probeApply').onclick=()=>{const lat=Number($('probeLat').value),lng=Number($('probeLng').value),radius=Number($('radiusKm').value);if(!$('probeLat').value||!$('probeLng').value||Math.abs(lat)>90||Math.abs(lng)>180||!Number.isFinite(lat)||!Number.isFinite(lng)||!Number.isFinite(radius)||radius<=0){$('haversineResult').textContent='Confira as coordenadas e o raio positivo.';return;}setArea(lat,lng,radius);};
}
function renderResearch(){renderCentral();renderModels();renderHaversine();}

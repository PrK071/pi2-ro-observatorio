'use strict';
let chatEngine,MobilityData=null,chatHistory=[],chatPlan=null,chatFilterSignature=null,chatController=null,chatBusy=false;
async function initAssistantData(){
  try{const response=await fetch('mobility.json.gz');if(!response.ok)throw Error('Mobility unavailable');const data=await new Response(response.body.pipeThrough(new DecompressionStream('gzip'))).json();if(JSON.stringify(data.baseFields)!==JSON.stringify(D.fields))throw Error('Dataset mismatch');MobilityAnalytics.hydrate(rows,data);MobilityData=data;}
  catch{MobilityData=null;}
}
function getChatEngine(){return chatEngine ||= AnalyticalAssistant.create({rows,report:StudyReport,period:D.period,analytics:A,mobility:MobilityData});}
function appendChatMessage(cls,text,label){
  const el=document.createElement('div');el.className='message '+cls;
  if(label){const small=document.createElement('small');small.textContent=label;el.append(small);}
  const content=document.createElement('div');content.className='message-content';content.textContent=text;el.append(content);
  $('chatMessages').append(el);$('chatMessages').scrollTop=$('chatMessages').scrollHeight;return el;
}
function setChatBusy(busy){
  chatBusy=busy;$('chatMessages').setAttribute('aria-busy',String(busy));
  $('chatSend').disabled=busy;$('chatClear').disabled=busy;$('chatStop').hidden=!busy;
  document.querySelectorAll('.suggestions button').forEach(b=>b.disabled=busy);
}
function answer(message){return getChatEngine().localAnswer(message,activeFilters,chatPlan).text;}
async function chat(message){
  if(chatBusy||!message.trim())return;
  const filters={...activeFilters},signature=JSON.stringify(filters);
  if(signature!==chatFilterSignature){chatPlan=null;chatHistory=[];chatFilterSignature=signature;}
  const engine=getChatEngine(),fallback=()=>engine.localAnswer(message,filters,chatPlan);
  appendChatMessage('user',message);setChatBusy(true);
  $('assistantStatus').textContent='Interpretando sua pergunta e consultando os dados…';
  chatController=new AbortController();
  let result;
  try{
    const response=await fetch('/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({message,filters,previousPlan:chatPlan,history:chatHistory.slice(-6)}),signal:AbortSignal.any([chatController.signal,AbortSignal.timeout(50000)])});
    result=await response.json();
    if(!response.ok){if(response.status===429)throw Object.assign(Error(result.error),{limited:true});throw Error('Service unavailable');}
    if(typeof result.text!=='string'||!result.text.trim())throw Error('Empty response');
  }catch(error){
    if(chatController.signal.aborted){$('assistantStatus').textContent='Consulta interrompida. Você pode escrever outra pergunta.';setChatBusy(false);return;}
    if(error.limited){$('assistantStatus').textContent=error.message;setChatBusy(false);return;}
    result={...fallback(),mode:'local',reason:'temporarily_unavailable'};
  }
  const mode=result.mode==='ai'?'IA':'CONSULTA LOCAL';
  $('assistantMode').textContent=mode;
  $('assistantStatus').textContent=result.mode==='ai'?'Resposta baseada na conversa e nas consultas ao observatório.':'A IA está indisponível agora. Resposta pela consulta local, com interpretação limitada.';
  const bot=appendChatMessage('bot',result.text.slice(0,8000),mode+' · '+(result.scope||'Recorte atual'));
  const allowed={'metodologia.json':'Dados e método','artigo.html':'Artigo do estudo','modelos.json':'Experimentos','auditoria-mobilidade.json':'Veículos e pessoas'};
  const sources=document.createElement('div');sources.className='chat-sources';
  for(const path of new Set(result.sources||['metodologia.json','artigo.html']))if(Object.hasOwn(allowed,path)){const a=document.createElement('a');a.href=path;a.textContent=allowed[path]+' ↗';a.target='_blank';a.rel='noopener';sources.append(a);}
  bot.append(sources);$('chatMessages').scrollTop=$('chatMessages').scrollHeight;
  chatPlan=result.plan||null;chatHistory.push({role:'user',content:message},{role:'assistant',content:result.text.slice(0,4500)});chatHistory=chatHistory.slice(-6);
  setChatBusy(false);chatController=null;
}
document.getElementById('chatStop').onclick=()=>chatController?.abort();
document.getElementById('chatClear').onclick=()=>{
  chatHistory=[];chatPlan=null;chatFilterSignature=null;$('chatMessages').replaceChildren();
  appendChatMessage('bot','Conversa reiniciada. O que você quer saber sobre os dados ou o estudo?');
  $('assistantStatus').textContent='Escreva livremente; cidades e períodos podem ser informados na pergunta.';$('chatInput').focus();
};
document.getElementById('chatInput').addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();if(!chatBusy)$('chatForm').requestSubmit();}});

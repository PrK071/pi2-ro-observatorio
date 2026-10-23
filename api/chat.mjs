import {loadEngine,runConversation} from '../lib/chat-agent.mjs';

const json=(body,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
// Vercel Function OIDC rotates per request; deployment/build env alone is insufficient.
// Outside Vercel, a caller-supplied header must never become application credentials.
const gatewayToken=request=>process.env.AI_GATEWAY_API_KEY||(process.env.VERCEL==='1'?request?.headers.get('x-vercel-oidc-token'):null)||process.env.VERCEL_OIDC_TOKEN;
// A short-lived burst guard, not a durable per-user quota. No chat history is stored here.
const bursts=new Map();
function limited(request){
  const now=Date.now(),key=request.headers.get('x-real-ip')||request.headers.get('x-forwarded-for')?.split(',')[0]||'local';
  for(const [k,v] of bursts)if(v.until<now)bursts.delete(k);
  if(bursts.size>2000)return true;
  const entry=bursts.get(key)||{until:now+60000,n:0};entry.n++;bursts.set(key,entry);return entry.n>15;
}
export function GET(request){return json({service:'observatorio-assistant',status:'ready',mode:gatewayToken(request)?'ai-available':'local'});}
export async function POST(request){
  if(request.headers.get('sec-fetch-site')==='cross-site')return json({error:'Abra a conversa pelo dashboard.'},403);
  const origin=request.headers.get('origin');
  if(origin&&origin!==new URL(request.url).origin)return json({error:'Origem inválida.'},403);
  if(!request.headers.get('content-type')?.includes('application/json'))return json({error:'Envie uma pergunta em JSON.'},415);
  if(Number(request.headers.get('content-length'))>24000)return json({error:'A conversa ficou muito longa. Inicie uma nova conversa.'},413);
  if(limited(request))return json({error:'Muitas mensagens em sequência. Aguarde um minuto para continuar.'},429);
  let body,engine,local;
  try{
    const raw=await request.text();if(raw.length>24000)return json({error:'A conversa ficou muito longa. Inicie uma nova conversa.'},413);
    body=JSON.parse(raw);
    if(typeof body.message!=='string'||!body.message.trim()||body.message.length>2000)return json({error:'Escreva uma pergunta com até 2.000 caracteres.'},400);
    const history=body.history??[];
    if(!Array.isArray(history)||history.length>10||history.some(m=>!['user','assistant'].includes(m?.role)||typeof m.content!=='string'||m.content.length>5000))return json({error:'Histórico inválido. Inicie uma nova conversa.'},400);
    engine=await loadEngine();
    const filters=engine.cleanFilters(body.filters||{}),previousPlan=body.previousPlan?engine.validate(body.previousPlan):null;
    local=engine.localAnswer(body.message,filters,previousPlan);
    const result=await runConversation({message:body.message.trim(),history,filters,previousPlan,signal:AbortSignal.any([request.signal,AbortSignal.timeout(45000)])},{engine,token:gatewayToken(request)});
    return json({text:result.text,mode:result.mode,reason:result.reason,scope:result.scope,plan:result.plan,sources:result.sources||['metodologia.json','artigo.html']});
  }catch(error){
    if(local){
      const reason=[401,402,403].includes(error.status)?'activation_required':error.name==='TimeoutError'?'timeout':'temporarily_unavailable';
      // Only status/code are logged; never headers, tokens or conversation contents.
      console.warn('analytical_assistant_fallback',{status:error.status||0,code:error.code||error.name});
      return json({text:local.text,mode:'local',reason,scope:local.scope,plan:local.plan,sources:['metodologia.json','artigo.html']});
    }
    return json({error:error instanceof SyntaxError?'Mensagem inválida.':engine?'A seleção enviada é inválida. Inicie uma nova conversa.':'Os dados estão indisponíveis agora. Tente novamente.'},engine?400:503);
  }
}

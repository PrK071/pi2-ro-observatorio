'use strict';
const MobilityAnalytics=(()=>{
  const unknown=new Set(['NAO_INFORMADO','DESCONHECIDO']);
  const norm=s=>String(s??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
  const unsupported={vendor_cart:'Carrinhos de lanche/ambulantes não têm categoria própria na fonte',wheelchair:'Cadeira de rodas não tem categoria própria na fonte',scooter:'Patinete não tem categoria própria na fonte',taxi:'Táxi/Uber não é discriminado pelo uso do automóvel',electric_bike:'Bicicleta elétrica não é discriminada separadamente',ambulance:'Ambulância não é discriminada separadamente',unresolved_vehicle:'O veículo pedido não tem uma categoria exata identificável no catálogo recebido'};
  const roleLabel={MOTORISTA:'Motoristas',PASSAGEIROS:'Passageiros',PEDESTRE:'Pedestres',DESCONHECIDO:'Papel desconhecido',NAO_INFORMADO:'Papel não informado'};
  function hydrate(base,mobility){
    if(mobility.scope!=='RMBS'||mobility.baseGroups!==base.length)throw Error('A base de veículos não corresponde ao cubo publicado.');
    const sums=base.map(()=>[0,0,0,0]);
    const result=mobility.records.map(row=>{
      const [index,vid,pid,n,deaths,involved,fatal]=row;
      if(!base[index]||!mobility.vehicleProfiles[vid]||!mobility.personProfiles[pid]||![n,deaths,involved,fatal].every(Number.isInteger)||n<=0||deaths<0||involved<0||![0,n].includes(fatal))throw Error('Perfil de mobilidade inválido.');
      [n,deaths,involved,fatal].forEach((v,i)=>sums[index][i]+=v);
      return {...base[index],n,deaths,involved,fatal,vehicles:Object.fromEntries(mobility.vehicleProfiles[vid].map(([t,q])=>[t,q*n])),people:mobility.personProfiles[pid].map(([role,driver,injury,quantity,personDeaths])=>({role,driver,injury,n:quantity*n,deaths:personDeaths*n}))};
    });
    for(let i=0;i<base.length;i++)if(['n','deaths','involved','fatal'].some((k,j)=>base[i][k]!==sums[i][j]))throw Error('Totais de mobilidade não reconciliam com o painel.');
    return result;
  }
  function identifyVehicles(q,types){
    const found=new Set(types.filter(t=>!unknown.has(t)&&(' '+q+' ').includes(' '+norm(t)+' ')));
    const aliases=[[/\b(bicicletas?|ciclistas?|bikes?)\b/,'BICICLETA'],[/\b(carros?|automoveis|automovel)\b/,'AUTOMOVEL'],[/\b(motos?|motocicletas?|motociclistas?|motoqueiros?)\b/,'MOTOCICLETA'],[/\bmotonetas?\b/,'MOTONETA'],[/\bciclomotores?\b/,'CICLOMOTOR'],[/\bonibus\b/,'ONIBUS'],[/\bmicro onibus\b/,'MICRO-ONIBUS'],[/\bcaminhoes\b|\bcaminhao\b/,'CAMINHAO'],[/\bcaminhao trator\b/,'CAMINHAO-TRATOR'],[/\b(caminhonetes?|picapes?)\b/,'CAMINHONETE'],[/\bcamionetas?\b/,'CAMIONETA'],[/\bcarrocas?\b/,'CARROCA'],[/\bcharretes?\b/,'CHARRETE'],[/\bse?mirreboques?\b/,'SEMIRREBOQUE'],[/\breboques?\b/,'REBOQUE'],[/\btratores?\b/,'TRATOR'],[/\butilitarios?\b/,'UTILITARIO']];
    for(const [re,t] of aliases){let text=q;if(t==='ONIBUS')text=text.replace(/micro onibus/g,'');if(t==='CAMINHAO')text=text.replace(/caminhao trator/g,'');if(re.test(text)&&types.includes(t))found.add(t);}
    // An exact long type must not accidentally imply its shorter parent category.
    if(/micro onibus/.test(q)&&!q.replace(/micro onibus/g,'').match(/\bonibus\b/))found.delete('ONIBUS');
    if(/caminhao trator/.test(q)&&!q.replace(/caminhao trator/g,'').match(/\bcaminhao\b/))found.delete('CAMINHAO');
    if(/caminhao trator/.test(q)&&!q.replace(/caminhao trator/g,'').match(/\btrator\b/))found.delete('TRATOR');
    return [...found];
  }
  function infer(question,types){
    const q=norm(question),p={},neg=q.match(/\b(?:sem|exceto|excluindo)\s+(.+)$/),excluded=neg?identifyVehicles(neg[1],types):[],vehicles=identifyVehicles(neg?q.slice(0,neg.index):q,types);
    if(vehicles.length)p.vehicles=vehicles;if(excluded.length)p.excludeVehicles=excluded;
    const unavailable=[];
    if(/(?:carrinh|carrocinh)\w*.*(?:lanche|comida|ambulant)|ambulant/.test(q))unavailable.push('vendor_cart');
    if(/cadeira de rodas|cadeirante/.test(q))unavailable.push('wheelchair');
    if(/patinete/.test(q))unavailable.push('scooter');
    if(/\btaxi\b|\buber\b/.test(q))unavailable.push('taxi');
    if(/bicicleta\w* eletric/.test(q))unavailable.push('electric_bike');
    if(/ambulancia/.test(q))unavailable.push('ambulance');
    if(/\b(carretas?|trem|trens|skates?|patins|hoverboards?|segways?|aviao|avioes|barcos?|canoas?|navios?)\b|outros veiculos/.test(q))unavailable.push('unresolved_vehicle');
    if(/\bcarrinhos?\b|\bcarrocinhas?\b/.test(q)&&!unavailable.includes('vendor_cart'))unavailable.push('unresolved_vehicle');
    if(/\b(ciclistas?)\b/.test(q))p.roadUser='cyclist';else if(/motociclista|motoqueiro/.test(q))p.roadUser='motorcyclist';
    const roles=[];if(/motorista|condutor/.test(q))roles.push('MOTORISTA');if(/passageir/.test(q))roles.push('PASSAGEIROS');if(/pedestre/.test(q))roles.push('PEDESTRE');if(roles.length)p.roles=roles;
    const clause=q.match(/\b(?:acidentes?|sinistros?)\b.{0,45}?\b(?:envolvendo|com|de)\s+([a-z].*)$/)||q.match(/^(?:e\s+|agora\s+)?(?:de|com|envolvendo)\s+([a-z].*)$/);
    if(!vehicles.length&&!roles.length&&!unavailable.length&&clause){
      const text=clause[1];
      if(!/^(?:transito|transporte|vitimas?|feridos?|obitos?|mortes?|chuva|pista|tempo|precipitacao|colis|atropel|capot|tomb|engav|choque|queda|pessoas?|fatal|fatais|nao fata|sem obito|janeiro|fevereiro|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro|santos|sao vicente|praia grande|guaruja|cubatao|bertioga|itanhaem|peruibe|mongagua|rodovia|via|bairro|verao|horario|velocidade|alcool|idade|sexo|genero|marca|placa|tipo|dados|acordo)\b/.test(text))unavailable.push('unresolved_vehicle');
    }
    if(unavailable.length)p.unsupportedVehicles=[...new Set(unavailable)];
    if(vehicles.length>1){p.vehicleMatch=/compar|versus|\bvs\b|\bou\b/.test(q)?'any':/\bentre\b|contra|envolvendo.*\be\b|colisao.*\be\b/.test(q)?'all':'any';if(/compar|por tipo de veiculo|por veiculo/.test(q)||p.vehicleMatch==='any')p.groupBy='vehicle';}
    if(/por (?:tipo de )?veiculo|quais veiculos|todos os veiculos|qualquer veiculo|tipos de veiculos/.test(q)){p.groupBy='vehicle';p.limit=25;}
    const nonfatal=/\bnao fata(?:l|is)\b|sem obitos|sem mortes/.test(q),fatal=/\bfata(?:l|is)\b/.test(q.replace(/nao fata(?:l|is)/g,''));
    if(nonfatal)p.outcome=fatal?'all':'nonfatal';
    else if(/(?:so|somente|apenas)\s+(?:os\s+)?(?:acidentes\s+|sinistros\s+)?fata(?:l|is)\b/.test(q))p.outcome='fatal';
    if(/quant(?:os|as)\s+(?:motoristas|condutores|passageiros|pedestres|ciclistas|motociclistas)|(?:ciclistas|motociclistas|motoristas|passageiros|pedestres).*(?:morrer|mort|obito|ferid)/.test(q))p.peopleRequested=true;
    return p;
  }
  const hasRole=(r,roles)=>r.people.some(p=>p.n>0&&(roles.includes(p.role)||(roles.includes('MOTORISTA')&&p.driver==='SIM')));
  function select(rows,p){
    return rows.filter(r=>(!p.vehicles?.length||(p.vehicleMatch==='all'?p.vehicles.every(t=>r.vehicles[t]>0):p.vehicles.some(t=>r.vehicles[t]>0)))&&(!p.excludeVehicles?.length||p.excludeVehicles.every(t=>!r.vehicles[t]))&&(!p.roles?.length||p.vehicles?.length||hasRole(r,p.roles)||p.roles.includes('PEDESTRE')&&r.type==='ATROPELAMENTO COM PEDESTRE')&&(p.outcome!=='fatal'||r.fatal===r.n)&&(p.outcome!=='nonfatal'||r.fatal===0));
  }
  function summary(rows,roles=[],types=[]){
    const result={eventsWithKnownVehicleType:0,eventsWithUnknownVehicleType:0,eventsWithoutVehicleRows:0,vehicles:0,selectedVehicles:0,peopleRecorded:0,personDeaths:0,peopleInjured:0,eventsWithPeople:0,eventsWithSelectedRole:0,byRole:{}};
    for(const r of rows){const entries=Object.entries(r.vehicles);
      if(!entries.length)result.eventsWithoutVehicleRows+=r.n;
      if(entries.some(([t])=>!unknown.has(t)))result.eventsWithKnownVehicleType+=r.n;
      if(entries.some(([t])=>unknown.has(t)))result.eventsWithUnknownVehicleType+=r.n;
      result.vehicles+=entries.reduce((n,[,v])=>n+v,0);result.selectedVehicles+=entries.filter(([t])=>!types.length||types.includes(t)).reduce((n,[,v])=>n+v,0);
      if(r.people.length)result.eventsWithPeople+=r.n;
      if(roles.length&&hasRole(r,roles))result.eventsWithSelectedRole+=r.n;
      for(const person of r.people){const role=person.driver==='SIM'?'MOTORISTA':person.role;
        if(roles.length&&!roles.includes(role))continue;
        result.peopleRecorded+=person.n;result.personDeaths+=person.deaths;if(['LEVE','GRAVE'].includes(person.injury))result.peopleInjured+=person.n;
        const v=result.byRole[role]||={label:roleLabel[role]||role,people:0,deaths:0,injured:0};v.people+=person.n;v.deaths+=person.deaths;if(['LEVE','GRAVE'].includes(person.injury))v.injured+=person.n;
      }
    }
    return result;
  }
  function limitations(p){
    const notes=(p.unsupportedVehicles||[]).map(k=>unsupported[k]);
    if(p.roadUser==='cyclist')notes.push('Ciclistas: a fonte permite identificar sinistros envolvendo BICICLETA. Não identifica ciclistas individualmente nem seus óbitos/ferimentos em separado.');
    if(p.roadUser==='motorcyclist')notes.push('Motociclistas: o recorte identifica eventos envolvendo MOTOCICLETA; não vincula cada pessoa ao veículo que ocupava.');
    if(p.vehicles?.length&&p.roles?.length)notes.push('A tabela de pessoas não liga cada motorista/passageiro ao tipo de veículo. As pessoas registradas nos eventos selecionados podem pertencer a outro veículo da mesma ocorrência.');
    if(p.groupBy==='vehicle')notes.push('Um evento pode aparecer em mais de uma categoria de veículo. A soma das categorias pode superar o total de sinistros distintos.');
    if(p.vehicles?.length)notes.push('Óbitos e fatalidade referem-se ao sinistro envolvendo o veículo, sem identificar em qual veículo ocorreu a morte. Zero significa nenhum registro identificado; categorias desconhecidas e ausência de detalhes limitam a cobertura.');
    return notes;
  }
  const vehicleTypes=['AUTOMOVEL','MOTOCICLETA','MOTONETA','CAMINHAO','ONIBUS','CAMINHONETE','CAMIONETA','BICICLETA','CAMINHAO-TRATOR','UTILITARIO','SEMIRREBOQUE','MICRO-ONIBUS','CICLOMOTOR','REBOQUE','TRATOR','QUADRICICLO','VEICULO ARTICULADO','CHARRETE','TREMINHAO','TRICICLO','BONDE','VEICULO DE SERVICO','CARROCA','DESCONHECIDO','NAO_INFORMADO'];
  return {hydrate,infer,select,summary,limitations,unsupported,roleLabel,unknown,vehicleTypes};
})();
if(typeof module!=='undefined')module.exports=MobilityAnalytics;

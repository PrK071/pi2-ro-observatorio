'use strict';
// Pure functions shared by the browser and numerical regression checks.
const Analytics = (() => {
  const sum = (rows, key) => rows.reduce((n,r)=>n+(Number(r[key])||0),0);
  const percent = (n,d) => d ? 100*n/d : null;
  function distance(lat1,lng1,lat2,lng2) {
    const rad=Math.PI/180,a=Math.sin((lat2-lat1)*rad/2)**2+Math.cos(lat1*rad)*Math.cos(lat2*rad)*Math.sin((lng2-lng1)*rad/2)**2;
    return 6371*2*Math.asin(Math.sqrt(Math.min(1,a)));
  }
  function filter(rows,f) {
    return rows.filter(r=>(!f.ano||r.date.slice(0,4)===String(f.ano))&&
      (!f.mes||Number(r.date.slice(5,7))===Number(f.mes))&&
      (!f.periodo||r.date.slice(0,7)===f.periodo)&&
      (!f.municipio||r.city===f.municipio)&&(!f.tipo_acidente||r.type===f.tipo_acidente)&&
      (f.risco_pista_molhada==null||f.risco_pista_molhada===''||(f.risco_pista_molhada==='unknown'?r.wet===null:r.wet===Number(f.risco_pista_molhada)))&&
      (!f.logradouro||r.street===f.logradouro)&&(!f.bairro||r.district===f.bairro)&&
      (f.lat==null||(r.lat!==null&&r.lng!==null&&distance(f.lat,f.lng,r.lat,r.lng)<=f.radius_km)));
  }
  function group(rows,key,metric='n') {
    const result=new Map();for(const r of rows){const k=r[key]??'NAO_INFORMADO';result.set(k,(result.get(k)||0)+(Number(r[metric])||0));}
    return [...result].sort((a,b)=>b[1]-a[1]);
  }
  // Complementary error function, stable even in the upper tail (df=1).
  function erfc(x) {
    const z=Math.abs(x),t=1/(1+.5*z);
    const p=t*Math.exp(-z*z-1.26551223+t*(1.00002368+t*(.37409196+t*(.09678418+t*(-.18628806+t*(.27886807+t*(-1.13520398+t*(1.48851587+t*(-.82215223+t*.17087277)))))))));
    return x>=0?p:2-p;
  }
  function contingency(rows,outcome) {
    let a=0,b=0,c=0,d=0;
    for(const r of rows){if(![0,1].includes(r.wet)||![0,1].includes(r[outcome]))continue;
      if(r.wet===1){if(r[outcome]===1)a+=r.n;else b+=r.n;}else{if(r[outcome]===1)c+=r.n;else d+=r.n;}}
    const n=a+b+c+d, cells=[a,b,c,d], expected=n?[(a+b)*(a+c)/n,(a+b)*(b+d)/n,(c+d)*(a+c)/n,(c+d)*(b+d)/n]:[];
    const odds=cells.every(x=>x>0)?a*d/(b*c):null;
    const se=odds!==null?Math.sqrt(cells.reduce((s,x)=>s+1/x,0)):null;
    const ci=odds!==null?[Math.exp(Math.log(odds)-1.96*se),Math.exp(Math.log(odds)+1.96*se)]:null;
    const reliable=expected.length===4&&expected.every(x=>x>=5)&&cells.every(x=>x>0);
    const chi=reliable?cells.reduce((s,x,i)=>s+(x-expected[i])**2/expected[i],0):null;
    const p=chi!==null?Math.min(1,erfc(Math.sqrt(chi/2))):null;
    return {a,b,c,d,n,odds,ci,chi,p,reliable,positive:reliable&&ci[0]>1&&p<.05,
      wetRate:percent(a,a+b),dryRate:percent(c,c+d)};
  }
  function stats(rows) {
    const total=sum(rows,'n'), fatal=sum(rows,'fatal'), deaths=sum(rows,'deaths');
    const wetKnown=sum(rows.filter(r=>r.wet!==null),'n'),wet=sum(rows.filter(r=>r.wet===1),'n');
    const victimKnown=sum(rows.filter(r=>r.victim!==null),'n'),victims=sum(rows.filter(r=>r.victim===1),'n');
    const roadKnown=sum(rows.filter(r=>r.road!==null),'n'),road=sum(rows.filter(r=>r.road===1),'n');
    return {total,fatal,deaths,wetKnown,wet,victimKnown,victims,roadKnown,road,
      fatalRate:percent(fatal,total),victimRate:percent(victims,victimKnown),wetRate:percent(wet,wetKnown),roadRate:percent(road,roadKnown),
      h1:contingency(rows,'victim'),h2:contingency(rows,'road')};
  }
  function seasons(rows,f,period) {
    const counts=[sum(rows.filter(r=>r.season===0),'n'),sum(rows.filter(r=>r.season===1),'n')],days=[0,0];
    for(let day=new Date(period[0]+'T12:00:00Z'),last=new Date(period[1]+'T12:00:00Z');day<=last;day.setUTCDate(day.getUTCDate()+1)) {
      const date=day.toISOString().slice(0,10);if(f.ano&&date.slice(0,4)!==String(f.ano))continue;
      if(f.mes&&day.getUTCMonth()+1!==Number(f.mes))continue;if(f.periodo&&date.slice(0,7)!==f.periodo)continue;
      const high=[12,1,2].includes(day.getUTCMonth()+1)&&[5,6,0].includes(day.getUTCDay());days[Number(high)]++;
    }
    return {counts,days,rates:counts.map((x,i)=>days[i]?x/days[i]:null)};
  }
  function csv(rows,fields) {
    const cell=value=>'"'+(typeof value==='string'?value.replace(/^[=+@-]/,"'$&"):String(value??'NAO_INFORMADO')).replaceAll('"','""')+'"';
    return '\ufeff'+[fields,...rows.map(r=>fields.map(f=>r[f]))].map(row=>row.map(cell).join(';')).join('\r\n');
  }
  return {sum,percent,distance,filter,group,contingency,stats,seasons,csv};
})();
if(typeof module!=='undefined')module.exports=Analytics;

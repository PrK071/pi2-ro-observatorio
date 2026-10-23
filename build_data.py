import pathlib,csv,json,collections,datetime,zipfile,io,gzip,unicodedata
R=pathlib.Path(__file__).parent; O=R/'dist'; O.mkdir(exist_ok=True); T=R/'treated'
def n(s):
    try: return float(s.replace(',','.')) if s and float(s.replace(',','.'))!=-9999 else None
    except ValueError: return None
def i(s): return int(n(s) or 0)
def load(name):
    with (T/f'{name}_ro.csv').open(encoding='utf-8-sig',newline='') as f: yield from csv.DictReader(f,delimiter=';')
loc={r['chv_localidade']:r for r in load('localidades')}; rec=[]; byid={}; missing=collections.Counter()
for a in load('acidentes'):
    try: datetime.date.fromisoformat(a['data_acidente'])
    except ValueError: missing['invalidDate']+=1; continue
    l=loc.get(a['chv_localidade'],{}); lat=n(a['latitude_acidente']); lon=n(a['longitude_acidente'])
    clock=a['hora_acidente']
    valid_clock=len(clock)==6 and clock.isdigit() and int(clock[:2])<24 and int(clock[2:4])<60 and int(clock[4:])<60
    if not valid_clock:missing['time']+=1
    if lat is None or lon is None: missing['coordinates']+=1
    if not l: missing['locality']+=1
    r={'id':a['num_acidente'],'date':a['data_acidente'],'city':l.get('municipio',a['codigo_ibge']),'ibge':a['codigo_ibge'],'type':a['tp_acidente'],'weather':a['cond_meteorologica'],'phase':a['fase_dia'],'weekday':a['dia_semana'],'hour':clock[:2] if valid_clock else None,'surface':a['cond_pista'],'n':i(a['qtde_acidente']),'deaths':i(a['qtde_obitos']),'involved':i(a['qtde_envolvidos']),'nonfatal':i(a['qtde_feridosilesos']),'fatal':i(a['qtde_acid_com_obitos'])}
    # Dashboard publishes aggregates only. Individual event IDs and addresses stay local.
    rec.append(r); byid[r['id']]=r
dim=collections.defaultdict(collections.Counter)
for a in load('vitimas'):
    r=byid.get(a['num_acidente'])
    if not r: continue
    if a['gravidade_lesao']=='OBITO' and i(a['qtde_envolvidos'])!=i(a['qtde_obitos']):missing['injuryLabelMismatch']+=1
    for f in ['faixa_idade','genero','gravidade_lesao','tp_envolvido','susp_alcool']:
        dim[(r['date'][:7],r['city'],f)][a[f]]+=i(a['qtde_envolvidos'])
for a in load('veiculos'):
    r=byid.get(a['num_acidente'])
    if r: dim[(r['date'][:7],r['city'],'tipo_veiculo')][a['tipo_veiculo']]+=i(a['qtde_veiculos'])
cube=collections.defaultdict(lambda:[0,0,0,0,0,0])
fields=['date','city','type','weather','phase','weekday','hour','surface']
for r in rec:
    key=tuple(r[f] if r[f] is not None else 'NAO_INFORMADO' for f in fields)
    for j,f in enumerate(['n','deaths','involved','nonfatal','fatal']): cube[key][j]+=r[f]
    cube[key][5]+=1
cache=json.loads((T/'climate_cache.json').read_text(encoding='utf-8')); climate=cache['climate']; ca=cache['audit']
audit=json.loads((T/'audit_national.json').read_text())
data={'fields':fields+['n','deaths','involved','nonfatal','fatal','rows'],'records':[list(k)+v for k,v in cube.items()],'dimensions':[{'month':m,'city':c,'field':f,'values':dict(v)} for (m,c,f),v in dim.items()],'climate':climate,'audit':audit,'climateAudit':ca,'quality':dict(missing),'period':[min(r['date'] for r in rec),max(r['date'] for r in rec)],'generated':datetime.datetime.now(datetime.timezone.utc).isoformat(),'scope':'RO','instructionsFound':False}
(O/'data.json').write_text(json.dumps(data,ensure_ascii=False,separators=(',',':')),encoding='utf-8')
with gzip.open(O/'data.json.gz','wb',compresslevel=9) as f: f.write((O/'data.json').read_bytes())
(O/'auditoria.json').write_text(json.dumps({k:v for k,v in data.items() if k not in ['records','dimensions']},ensure_ascii=False,indent=2),encoding='utf-8')
# Downloads exclude street addresses and individual event identifiers.
with (O/'acidentes-ro.csv').open('w',encoding='utf-8-sig',newline='') as f:
    w=csv.writer(f,delimiter=';'); w.writerow(['data_acidente','municipio','tipo_acidente','condicao_meteorologica','fase_dia','dia_semana','hora','condicao_pista','quantidade_acidentes','obitos','envolvidos','feridos_ou_ilesos','acidentes_com_obito','registros_de_origem']); w.writerows(data['records'])
with gzip.open(O/'acidentes-ro.csv.gz','wb',compresslevel=9) as f:f.write((O/'acidentes-ro.csv').read_bytes())
print('DASHBOARD COMPLETE',len(rec),'unique events',len(cube),'aggregate rows',sum(x['n'] for x in rec),'accidents',flush=True)

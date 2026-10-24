"""Join vehicle/person profiles to original regional events without publishing IDs.

The public base group index is a row reference into research.json.gz, not a source
identifier. Multiple vehicle rows never multiply event counts. All base group
totals are reconciled before publication; trained predictions are not recomputed.
"""
import collections,csv,datetime as dt,gzip,hashlib,json,pathlib,sys
R=pathlib.Path(__file__).resolve().parent;sys.path.insert(0,str(R))
from build_research import DIMENSIONS,iter_events,read,number
T,O=R/'treated',R/'dist'
UNKNOWN={'NAO_INFORMADO','DESCONHECIDO'}

def fingerprint(p):
    h=hashlib.sha256()
    with p.open('rb') as f:
        for block in iter(lambda:f.read(8*1024*1024),b''):h.update(block)
    return h.hexdigest()

def main():
    base=json.loads(gzip.decompress((O/'research.json.gz').read_bytes()))
    positions=[base['fields'].index(f) for f in DIMENSIONS]
    lookup={tuple(row[i] for i in positions):index for index,row in enumerate(base['records'])}
    if len(lookup)!=len(base['records']):raise ValueError('Base dimensions are not unique')
    vehicles=collections.defaultdict(collections.Counter)
    for row in read('veiculos'):
        quantity=number(row['qtde_veiculos'])
        if quantity is None or quantity<0 or quantity!=int(quantity):raise ValueError('Invalid vehicle quantity')
        if quantity:vehicles[row['num_acidente']][row['tipo_veiculo']]+=int(quantity)
    people=collections.defaultdict(lambda:collections.defaultdict(lambda:[0,0]))
    for row in read('vitimas'):
        n,deaths=(number(row[k]) for k in ['qtde_envolvidos','qtde_obitos'])
        if n is None or deaths is None or not 0<=deaths<=n or n!=int(n) or deaths!=int(deaths):raise ValueError('Invalid person measures')
        if n:
            key=(row['tp_envolvido'],row['ind_motorista'],row['gravidade_lesao'])
            value=people[row['num_acidente']][key];value[0]+=int(n);value[1]+=int(deaths)
    vp,pp=[],[];vi,pi={},{}
    def profile_id(value,profiles,index):
        if value not in index:index[value]=len(profiles);profiles.append(value)
        return index[value]
    cube=collections.defaultdict(lambda:[0,0,0,0]);reconciled=collections.defaultdict(lambda:[0,0,0,0]);audit=collections.Counter();categories={};march={}
    for aid,key,measures,_flags in iter_events():
        n,deaths,involved,fatal=measures
        if n!=1 or fatal not in (0,1):raise ValueError('Vehicle attribution requires individual event source rows')
        group=lookup.get(key)
        if group is None:raise ValueError('Original event could not be matched to the published base')
        vprofile=tuple(sorted(vehicles.get(aid,{}).items()))
        pprofile=tuple(sorted((*dims,*counts) for dims,counts in people.get(aid,{}).items()))
        vid=profile_id(vprofile,vp,vi);pid=profile_id(pprofile,pp,pi)
        # Fatality status is part of the key so event outcome filtering is exact.
        value=cube[(group,vid,pid,fatal)]
        for i,x in enumerate(measures):value[i]+=x;reconciled[group][i]+=x
        audit['events']+=1;audit['fatal']+=fatal;audit['nonfatal']+=1-fatal;audit['deaths']+=deaths
        audit['eventsWithVehicleRows']+=bool(vprofile)
        audit['eventsWithKnownVehicleType']+=any(t not in UNKNOWN for t,_ in vprofile)
        audit['eventsWithUnknownVehicleType']+=any(t in UNKNOWN for t,_ in vprofile)
        audit['vehicles']+=sum(q for _,q in vprofile)
        audit['eventsWithPersonCounts']+=bool(pprofile)
        audit['peopleRecorded']+=sum(p[3] for p in pprofile)
        audit['personDeaths']+=sum(p[4] for p in pprofile)
        audit['eventsWithKnownPersonRole']+=any(p[0] not in UNKNOWN for p in pprofile)
        for t,q in vprofile:
            for table in [categories]+([march] if key[0].startswith('2024-03') else []):
                v=table.setdefault(t,dict(events=0,fatal=0,nonfatal=0,vehicles=0,deathsInEvents=0))
                v['events']+=1;v['fatal']+=fatal;v['nonfatal']+=1-fatal;v['vehicles']+=q;v['deathsInEvents']+=deaths
    metric_positions=[base['fields'].index(f) for f in ['n','deaths','involved','fatal']]
    for index,row in enumerate(base['records']):
        if reconciled[index]!=[row[i] for i in metric_positions]:raise ValueError('Per-group base totals do not reconcile')
    if audit['deaths']!=audit['personDeaths']:raise ValueError('Deaths by people do not reconcile with events')
    source={'events':'acidentes_rmbs.csv','vehicles':'veiculos_rmbs.csv','people':'vitimas_rmbs.csv','joinKey':'num_acidente (local only)','vehicleRowKey':['tipo_veiculo','ind_veic_estrangeiro'],'personRowKey':['tp_envolvido','ind_motorista','gravidade_lesao']}
    method={
        'unit':'Distinct original event, grouped by public base dimensions, vehicle profile, person profile and fatality flag',
        'eventDeduplication':'Vehicle quantities and person detail rows are aggregated before joining; event totals never sum a direct one-to-many join',
        'fatality':'fatal event flag from acidentes; nonfatal = n - fatal; nonfatal does not mean uninjured',
        'vehiclePresence':'Positive qtde_veiculos; unknown categories remain unknown. A vehicle type can occur in a fatal event without any death in that vehicle.',
        'personAttribution':'Person table has role/driver flag/injury but no person-to-vehicle link. Driver deaths cannot be attributed to a vehicle category in mixed events.',
        'cyclist':'CICLISTA is not a distinct person role in the supplied region. Bicycle-involved events can be counted from tipo_veiculo=BICICLETA; cyclist injuries/deaths are not identified separately.',
        'unsupported':'Ambulant food carts, wheelchairs, scooters, specific service uses and other absent types cannot be inferred from DESCONHECIDO, NAO_INFORMADO or another vehicle category.',
        'overlap':'Vehicle rankings overlap when an event contains multiple types. Union counts deduplicate events; intersection requires all requested types.',
        'privacy':'No original accident/person/vehicle identifiers are published; baseGroup is only a reference to an existing public aggregate row.'}
    payload={'version':1,'scope':'RMBS','baseSha256':fingerprint(O/'research.json.gz'),'baseGroups':len(base['records']),'baseFields':base['fields'],
             'fields':['baseGroup','vehicleProfile','personProfile','n','deaths','involved','fatal'],
             'records':[[group,vid,pid,*value] for (group,vid,pid,_fatal),value in sorted(cube.items())],
             'vehicleProfiles':vp,'personProfiles':pp,'vehicleTypes':sorted(categories),'personRoles':sorted({p[0] for profile in pp for p in profile}),
             'audit':dict(audit),'period':base['period'],'source':source,'methodology':method,'generated':dt.datetime.now(dt.timezone.utc).isoformat()}
    raw=json.dumps(payload,ensure_ascii=False,separators=(',',':'),allow_nan=False).encode()
    with gzip.GzipFile(filename=str(O/'mobility.json.gz'),mode='wb',mtime=0) as f:f.write(raw)
    report={'allPassed':True,'checks':['All regional source events have weight 1','Original dimensions match every base group','n/deaths/involved/fatal reconcile within every base group','Person death counts reconcile with accident deaths','Vehicle and person quantities are nonnegative integers'],
            'audit':dict(audit),'vehicleTypes':categories,'march2024':march,'source':source,'methodology':method,
            'inputHashes':{str(p.relative_to(R)):fingerprint(p) for p in [O/'research.json.gz',T/'acidentes_rmbs.csv',T/'veiculos_rmbs.csv',T/'vitimas_rmbs.csv']}}
    (O/'auditoria-mobilidade.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8',newline='\n')
    metadata=json.loads((O/'metodologia.json').read_text(encoding='utf8'))
    metadata['mobility']={'file':'mobility.json.gz','auditFile':'auditoria-mobilidade.json','vehicleTypes':payload['vehicleTypes'],'personRoles':payload['personRoles'],'audit':payload['audit'],'source':source,'methodology':method}
    (O/'metodologia.json').write_text(json.dumps(metadata,ensure_ascii=False,indent=2),encoding='utf8',newline='\n')
    print(json.dumps({'profiles':len(cube),'vehicleProfiles':len(vp),'personProfiles':len(pp),'audit':dict(audit),'march2024':march},ensure_ascii=False))

if __name__=='__main__':main()

import pathlib, zipfile, csv, io, sqlite3, json, re, unicodedata, functools, gzip, datetime, collections, time,hashlib
R=pathlib.Path(__file__).parent; O=R/'treated'; O.mkdir(exist_ok=True)
@functools.lru_cache(maxsize=150000)
def norm(s):
    s=' '.join(s.strip().split()).upper().replace(';',',')
    s=''.join(c for c in unicodedata.normalize('NFKD',s) if not unicodedata.combining(c))
    return s if s and s not in ('NULL','NAN','N/A','NAO INFORMADO','NAO INFORMADA','IGNORADO','-9999','-9999,0') else 'NAO_INFORMADO'
def textrows(z,e): return csv.reader(io.TextIOWrapper(z.open(e),encoding='cp1252',newline=''),delimiter=';')
db=sqlite3.connect(O/'nacional.sqlite'); db.execute('PRAGMA journal_mode=WAL'); db.execute('PRAGMA synchronous=NORMAL'); db.execute('PRAGMA cache_size=-5000000')
audit=json.loads((O/'audit_progress.json').read_text()) if (O/'audit_progress.json').exists() else []
groups={}; headers={}
for p in (R/'raw').rglob('*.zip'):
    if 'Dados Acidentes' not in str(p): continue
    with zipfile.ZipFile(p) as z: sig=tuple((e.filename,e.CRC,e.file_size) for e in z.infolist())
    groups.setdefault(sig,[]).append(p)
ordered=sorted(groups.values(),key=lambda g:zipfile.ZipFile(g[0]).namelist()[0],reverse=True)
tables={'Acidentes':'acidentes','Localidade':'localidades','Vitimas':'vitimas','TipoVeiculo':'veiculos'}
for prefix,table in tables.items():
    db.execute(f'CREATE TABLE IF NOT EXISTS {table}(k TEXT PRIMARY KEY, accident TEXT, uf TEXT, payload TEXT NOT NULL, source TEXT NOT NULL) WITHOUT ROWID')
    if (O/f'{table}_br.csv.gz').exists() and (O/f'{table}_ro.csv').exists() and any(a['table']==table for a in audit) and db.execute(f'SELECT 1 FROM {table} LIMIT 1').fetchone():
        print('TABLE ALREADY VERIFIED',table,flush=True);continue
    audit=[a for a in audit if a['table']!=table]
    totalread=0
    seen=bytearray(20000000) if table!='localidades' else set()
    ranks={}
    for rank,paths in enumerate(ordered,1):
        with zipfile.ZipFile(paths[0]) as zz: ranks[next(e.filename for e in zz.infolist() if e.filename.startswith(prefix))]=rank
    source_counts=collections.Counter()
    for aid,source in db.execute(f'SELECT accident,source FROM {table}'):
        source_counts[source]+=1
        if table=='localidades': seen.add(aid)
        else:
            k=int(aid)
            if k>=len(seen): seen.extend(bytearray(k-len(seen)+1000000))
            seen[k]=min(seen[k] or 255,ranks[source])
    for rank,paths in enumerate(ordered,1):
        p=paths[0]
        with zipfile.ZipFile(p) as z:
            e=next(e for e in z.infolist() if e.filename.startswith(prefix)); rr=textrows(z,e); h=next(rr); headers[table]=h
            ix={k:i for i,k in enumerate(h)}; count=bad=missing=0; batch=[]; before=db.total_changes
            prior_source_count=source_counts[e.filename]
            print('START',table,p.name,flush=True)
            dim=[i for i,k in enumerate(h) if not k.startswith('qtde_')]
            ufidx=ix.get('uf_acidente',ix.get('uf'))
            for row in rr:
                count+=1
                if len(row)!=len(h): bad+=1; continue
                if not row[0].strip(): missing+=1; continue
                # Newest snapshot owns all detail rows for its accident; older detail only recovers absent IDs.
                aid=row[0]; uf=row[ufidx] if ufidx is not None else ''
                if table=='localidades':
                    if aid in seen: continue
                    seen.add(aid)
                else:
                    try: aidnum=int(aid)
                    except ValueError: bad+=1; continue
                    if aidnum<0 or aidnum>200000000: bad+=1; continue
                    if aidnum>=len(seen): seen.extend(bytearray(aidnum-len(seen)+1000000))
                    previous=seen[aidnum]
                    if previous and (table=='acidentes' or previous<rank): continue
                    seen[aidnum]=rank
                a=[norm(v) for v in row]
                if prefix in ('Acidentes','Localidade'): key=aid
                else: key=hashlib.blake2b('\x1f'.join(a[i] for i in dim).encode('utf-8'),digest_size=20).digest()
                batch.append((key,aid,uf,';'.join(a),e.filename))
                if len(batch)>=10000:
                    batch.sort(key=lambda x:x[0]); db.executemany(f'INSERT OR IGNORE INTO {table} VALUES(?,?,?,?,?)',batch); batch=[]
                if count%1000000==0:
                    db.commit(); print('PROGRESS',table,p.name,count,flush=True)
            if batch: db.executemany(f'INSERT OR IGNORE INTO {table} VALUES(?,?,?,?,?)',batch)
            db.commit(); added=db.total_changes-before+prior_source_count
            audit.append({'table':table,'archive':p.name,'source':e.filename,'identicalArchives':[x.name for x in paths[1:]],'read':count,'retainedNewKeys':added,'duplicatesOrOlder':count-bad-missing-added,'malformed':bad,'missingKey':missing})
            print('DONE',table,p.name,count,added,flush=True)
    # Detail quantity changes do not create new keys; obsolete categories from older snapshots must not reappear.
    # Older detail rows are already skipped by the per-accident source ownership map.
    print('EXPORT',table,flush=True)
    with gzip.open(O/f'{table}_br.csv.gz','wt',encoding='utf-8',newline='',compresslevel=3) as f:
        f.write(';'.join(headers[table])+'\n')
        for (s,) in db.execute(f'SELECT payload FROM {table}'): f.write(s+'\n')
    with (O/f'{table}_ro.csv').open('w',encoding='utf-8-sig',newline='') as f:
        f.write(';'.join(headers[table])+'\n')
        if table!='veiculos': query=f"SELECT payload FROM {table} WHERE uf='RO'"
        else:
            roids={r[0] for r in db.execute("SELECT k FROM acidentes WHERE uf='RO'")}
            query='SELECT accident,payload FROM veiculos'
        if table!='veiculos':
            for (s,) in db.execute(query): f.write(s+'\n')
        else:
            for aid,s in db.execute(query):
                if aid in roids:f.write(s+'\n')
    (O/'audit_progress.json').write_text(json.dumps(audit,indent=2),encoding='utf-8')
counts={t:sum(a['retainedNewKeys'] for a in audit if a['table']==t) for t in tables.values()}
(O/'audit_national.json').write_text(json.dumps({'sources':audit,'counts':counts,'normalization':'UTF-8, uppercase, no accents, collapsed whitespace; missing values explicitly NAO_INFORMADO; latest snapshot wins by key','generated':datetime.datetime.now(datetime.timezone.utc).isoformat()},indent=2),encoding='utf-8')
db.execute('PRAGMA wal_checkpoint(TRUNCATE)'); db.close(); print('NATIONAL COMPLETE',counts,flush=True)

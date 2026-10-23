import pathlib,sys,json,os
R=pathlib.Path(__file__).parent;T=R/'treated';sys.path.insert(0,str(R/'tools'/'pylibs'));import duckdb
a=json.loads((T/'audit_national.json').read_text());p=T/'veiculos_br.parquet';parent=T/'acidentes_br.parquet'
if a.get('quarantineCounts',{}).get('veiculos_sem_acidente'):
    print('QUARANTINE ALREADY VERIFIED');sys.exit(0)
c=duckdb.connect();c.execute("SET memory_limit='768MB'");c.execute('SET threads=2')
base=f"read_parquet('{p.as_posix()}') v";acc=f"read_parquet('{parent.as_posix()}') a"
bad=f'SELECT v.* FROM {base} ANTI JOIN {acc} USING(num_acidente)'
good=f'SELECT v.* FROM {base} SEMI JOIN {acc} USING(num_acidente)'
orphan=T/'veiculos_sem_acidente.parquet';temp=T/'veiculos_validos.parquet'
print('QUARANTINE EXTRACT',flush=True)
c.execute(f"COPY ({bad}) TO '{orphan.as_posix()}' (FORMAT PARQUET,COMPRESSION ZSTD)")
q=c.execute('SELECT count(*) FROM read_parquet(?)',[str(orphan)]).fetchone()[0]
c.execute(f"COPY ({good}) TO '{temp.as_posix()}' (FORMAT PARQUET,COMPRESSION ZSTD)")
kept=c.execute('SELECT count(*) FROM read_parquet(?)',[str(temp)]).fetchone()[0]
assert kept+q==a['counts']['veiculos']
os.replace(temp,p)
for src,dst in [(p,T/'veiculos_validos.csv.gz'),(orphan,T/'veiculos_sem_acidente.csv.gz')]:
    print('QUARANTINE CSV',dst.name,flush=True)
    c.execute(f"COPY (SELECT * FROM read_parquet('{src.as_posix()}')) TO '{dst.as_posix()}' (FORMAT CSV,DELIMITER ';',HEADER TRUE,COMPRESSION GZIP)")
os.replace(T/'veiculos_validos.csv.gz',T/'veiculos_br.csv.gz')
a['countsBeforeQuarantine']=dict(a['counts']);a['counts']['veiculos']=kept;a['quarantineCounts']={'veiculos_sem_acidente':q};a['quarantineReason']='num_acidente sem correspondencia em todas as edicoes de acidentes recebidas'
(T/'audit_national.json').write_text(json.dumps(a,indent=2),encoding='utf-8')
r=json.loads((T/'compactacao.json').read_text());r['veiculos'].update(rows=kept,quarantinedRows=q,parquetBytes=p.stat().st_size,csvGzipBytes=(T/'veiculos_br.csv.gz').stat().st_size)
(T/'compactacao.json').write_text(json.dumps(r,indent=2),encoding='utf-8');c.close()
print('QUARANTINE COMPLETE',q,'main rows',kept,flush=True)

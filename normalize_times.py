import pathlib,sys,json,csv,os
R=pathlib.Path(__file__).parent;T=R/'treated';sys.path.insert(0,str(R/'tools'/'pylibs'));import duckdb
c=duckdb.connect();c.execute("SET memory_limit='512MB'");c.execute('SET threads=2')
expr="CASE WHEN regexp_full_match(hora_acidente,'([01][0-9]|2[0-3])[0-5][0-9][0-5][0-9]') THEN hora_acidente ELSE 'NAO_INFORMADO' END AS hora_acidente"
report=json.loads((T/'compactacao.json').read_text())
for ext in ['csv.gz','parquet']:
    src=T/f'acidentes_br.{ext}';dst=T/f'acidentes_br.normalizado.{ext}'
    rel=f"read_parquet('{src.as_posix()}')" if ext=='parquet' else f"read_csv('{src.as_posix()}',delim=';',header=true,all_varchar=true,nullstr='__ETL_UNUSED_NULL__')"
    print('NORMALIZE CLOCK',ext,flush=True)
    opts="FORMAT PARQUET,COMPRESSION ZSTD" if ext=='parquet' else "FORMAT CSV,DELIMITER ';',HEADER TRUE,COMPRESSION GZIP"
    c.execute(f"COPY (SELECT * REPLACE({expr}) FROM {rel}) TO '{dst.as_posix()}' ({opts})")
    os.replace(dst,src)
p=T/'acidentes_ro.csv';temp=T/'acidentes_ro.tmp.csv'
with p.open(encoding='utf-8-sig',newline='') as f,temp.open('w',encoding='utf-8-sig',newline='') as g:
    rr=csv.DictReader(f,delimiter=';');w=csv.DictWriter(g,fieldnames=rr.fieldnames,delimiter=';');w.writeheader()
    for row in rr:
        v=row['hora_acidente'];valid=len(v)==6 and v.isdigit() and int(v[:2])<24 and int(v[2:4])<60 and int(v[4:])<60
        if not valid:row['hora_acidente']='NAO_INFORMADO'
        w.writerow(row)
os.replace(temp,p)
report['acidentes'].update(csvGzipBytes=(T/'acidentes_br.csv.gz').stat().st_size,parquetBytes=(T/'acidentes_br.parquet').stat().st_size,timeNormalized=True)
(T/'compactacao.json').write_text(json.dumps(report,indent=2),encoding='utf-8');c.close();print('CLOCK NORMALIZATION COMPLETE',flush=True)

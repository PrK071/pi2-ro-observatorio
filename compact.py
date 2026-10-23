"""Lossless CSV publication and lean Parquet model; optional absent measures stay explicit."""
import pathlib,sys,json
R=pathlib.Path(__file__).parent; T=R/'treated'; sys.path.insert(0,str(R/'tools'/'pylibs'));import duckdb
db=duckdb.connect();db.execute("SET memory_limit='512MB'");db.execute('SET threads=2')
omit={'acidentes':['ano_acidente','mes_acidente','mes_ano_acidente'],'vitimas':['chv_localidade','data_acidente','uf_acidente','ano_acidente','mes_acidente','mes_ano_acidente'],'localidades':['mes_ano_referencia'],'veiculos':[]}
report=json.loads((T/'compactacao.json').read_text()) if (T/'compactacao.json').exists() else {}
for name in ['acidentes','localidades','vitimas','veiculos','clima']:
    if '--only' in sys.argv and name!=sys.argv[sys.argv.index('--only')+1]:continue
    src=T/(f'{name}_br.csv.gz' if name!='clima' else 'clima_br_2023.csv.gz'); target=T/f'{name}_br.parquet'
    if target.exists() and target.stat().st_mtime>src.stat().st_mtime and name in report:
        print('COMPACT ALREADY VERIFIED',name,flush=True);continue
    print('COMPACT',name,flush=True)
    rel=f"read_csv('{src.as_posix()}', delim=';', header=true, all_varchar=true, nullstr='__ETL_UNUSED_NULL__', max_line_size=1000000)"
    cols=[r[0] for r in db.execute(f'DESCRIBE SELECT * FROM {rel}').fetchall()]
    numeric=[c for c in cols if c.startswith('qtde_') or c in ('frota_total','frota_circulante','ano_referencia','mes_referencia')]
    invalid={}
    if numeric:
        checks=','.join('count(*) FILTER (WHERE TRY_CAST("'+c+'" AS BIGINT) IS NULL)' for c in numeric)
        invalid=dict(zip(numeric,db.execute(f'SELECT {checks} FROM {rel}').fetchone()))
    selected=[]
    for c in cols:
        if c in omit.get(name,[]):continue
        q='"'+c.replace('"','""')+'"'
        # Optional fields retain NAO_INFORMADO instead of inventing numerical values.
        if c in invalid and invalid[c]==0:
            selected.append(f'CAST({q} AS BIGINT) AS {q}')
        elif c in ('data_acidente','data'):selected.append(f'CAST({q} AS DATE) AS {q}')
        else:selected.append(q)
    query='SELECT '+','.join(selected)+' FROM '+rel
    db.execute(f"COPY ({query}) TO '{target.as_posix()}' (FORMAT PARQUET, COMPRESSION ZSTD)")
    rows=db.execute(f"SELECT count(*) FROM read_parquet('{target.as_posix()}')").fetchone()[0]
    report[name]={'rows':rows,'csvGzipBytes':src.stat().st_size,'parquetBytes':target.stat().st_size,'removedDerivedOrJoinColumns':omit.get(name,[])}
    print('COMPACT DONE',name,rows,target.stat().st_size,flush=True)
(T/'compactacao.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
db.close()

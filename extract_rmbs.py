"""Extract only available, audited regional records. Does not modify national data."""
import csv
import pathlib
import sys
sys.path.insert(0,str(pathlib.Path(__file__).parent/'tools'/'pylibs'))
import duckdb
R=pathlib.Path(__file__).resolve().parent
T=R/'treated'
d=duckdb.connect()
d.execute("SET memory_limit='768MB'")
codes=['3548500','3551009','3541000','3518701','3513504','3506359','3522109','3537602','3531100']
d.execute("CREATE TEMP TABLE regional AS SELECT * FROM read_parquet(?) WHERE uf_acidente='SP' AND codigo_ibge IN (SELECT unnest(?)) AND data_acidente BETWEEN DATE '2022-01-01' AND DATE '2025-10-31'",[str(T/'acidentes_br.parquet'),codes])
for table,query in [
    ('acidentes','SELECT * FROM regional'),
    ('vitimas',"SELECT v.* FROM read_parquet(?) v SEMI JOIN regional a USING(num_acidente)"),
    ('veiculos',"SELECT v.* FROM read_parquet(?) v SEMI JOIN regional a USING(num_acidente)"),
    ('localidades',"SELECT l.* FROM read_parquet(?) l SEMI JOIN regional a USING(chv_localidade)")]:
    cur=d.execute(query,[] if table=='acidentes' else [str(T/f'{table}_br.parquet')])
    with (T/f'{table}_rmbs.csv').open('w',encoding='utf-8',newline='') as f:
        w=csv.writer(f,delimiter=';');w.writerow([x[0] for x in cur.description]);w.writerows(cur.fetchall())
print(d.execute('SELECT count(*),sum(qtde_acidente),sum(qtde_obitos),min(data_acidente),max(data_acidente) FROM regional').fetchall())

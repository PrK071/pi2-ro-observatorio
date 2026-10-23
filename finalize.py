import pathlib,zipfile,csv,io,unicodedata,json,datetime,sys
R=pathlib.Path(__file__).parent; T=R/'treated'
def norm(s):return ''.join(c for c in unicodedata.normalize('NFKD',' '.join(s.strip().split()).upper()) if not unicodedata.combining(c)) or 'NAO_INFORMADO'
with zipfile.ZipFile(next((R/'raw').rglob('2023.zip'))) as z, (T/'estacoes_br.csv').open('w',encoding='utf-8',newline='') as f:
    w=csv.writer(f,delimiter=';'); w.writerow(['regiao','uf','estacao','codigo_wmo','latitude','longitude','altitude','data_fundacao'])
    for e in z.infolist():
        rr=csv.reader(io.TextIOWrapper(z.open(e),encoding='cp1252',newline=''),delimiter=';'); a=[next(rr)[1] for _ in range(8)]
        a=[norm(x) for x in a]
        for i in [4,5,6]:a[i]=a[i].replace(',','.')
        for pattern in ['%d/%m/%Y','%d/%m/%y']:
            try:a[7]=datetime.datetime.strptime(a[7],pattern).date().isoformat();break
            except ValueError:pass
        w.writerow(a)
audit=json.loads((T/'audit_national.json').read_text(encoding='utf-8'))
checks={}
checks['quarantine']=audit.get('quarantineCounts',{})
d=json.loads((R/'dist'/'data.json').read_text(encoding='utf-8')); fields=d['fields'];nidx=fields.index('n');didx=fields.index('deaths')
with (T/'acidentes_ro.csv').open(encoding='utf-8-sig',newline='') as f:
    rr=list(csv.DictReader(f,delimiter=';'))
assert sum(int(a['qtde_acidente']) for a in rr)==sum(a[nidx] for a in d['records'])
assert sum(int(a['qtde_obitos']) for a in rr)==sum(a[didx] for a in d['records'])
checks['dashboard']={'accidents':sum(a[nidx] for a in d['records']),'deaths':sum(a[didx] for a in d['records']),'sourceRows':len(rr),'reconciled':True}
ids={a['num_acidente'] for a in rr}
for table,quantity,dimension in [('vitimas','qtde_envolvidos','genero'),('veiculos','qtde_veiculos','tipo_veiculo')]:
    with (T/f'{table}_ro.csv').open(encoding='utf-8-sig',newline='') as f:
        expected=sum(int(a[quantity]) for a in csv.DictReader(f,delimiter=';') if a['num_acidente'] in ids)
    actual=sum(sum(a['values'].values()) for a in d['dimensions'] if a['field']==dimension)
    assert expected==actual,(table,expected,actual)
    checks['dashboard'][table+'QuantityReconciled']=actual
sys.path.insert(0,str(R/'tools'/'pylibs'));import duckdb
dd=duckdb.connect();dd.execute("SET memory_limit='768MB'");dd.execute('SET threads=2')
for table in ['acidentes','localidades','vitimas','veiculos','clima']:
    path=str(T/f'{table}_br.parquet')
    nulls=dd.execute('SELECT sum(stats_null_count) FROM parquet_metadata(?)',[path]).fetchone()[0]
    assert nulls==0,(table,'physical null values',nulls)
    checks.setdefault(table,{})['parquetNullValues']=nulls
    count=dd.execute('SELECT count(*) FROM read_parquet(?)',[path]).fetchone()[0]
    checks[table]['rows']=count
    if table!='clima':
        assert count==audit['counts'][table],(table,count,audit['counts'][table])
        key='chv_localidade' if table=='localidades' else 'num_acidente'
        checks[table]['emptyKeys']=dd.execute(f'SELECT count(*) FROM read_parquet(?) WHERE "{key}"=\'\'',[path]).fetchone()[0]
        assert checks[table]['emptyKeys']==0
        for row in dd.execute('SELECT * FROM read_parquet(?) LIMIT 1000',[path]).fetchall():
            for s in row:
                if isinstance(s,str):
                    assert s!='',(table,'empty field')
                    assert not any(unicodedata.combining(c) for c in unicodedata.normalize('NFD',s)),(table,'accent')
for table in ['vitimas','veiculos']:
    left=(T/f'{table}_br.parquet').as_posix();right=(T/'acidentes_br.parquet').as_posix()
    checks[table]['unlinkedAccidentKeys']=dd.execute(f"SELECT count(*) FROM read_parquet('{left}') d LEFT JOIN read_parquet('{right}') a USING(num_acidente) WHERE a.num_acidente IS NULL").fetchone()[0]
    assert checks[table]['unlinkedAccidentKeys']==0
if checks['quarantine'].get('veiculos_sem_acidente'):
    qpath=str(T/'veiculos_sem_acidente.parquet');qcount=dd.execute('SELECT count(*) FROM read_parquet(?)',[qpath]).fetchone()[0]
    assert qcount==checks['quarantine']['veiculos_sem_acidente']
    assert qcount+checks['veiculos']['rows']==audit['countsBeforeQuarantine']['veiculos']
clima=(T/'clima_br.parquet').as_posix()
checks['clima']['duplicateStationDateHours']=dd.execute(f"SELECT count(*)-count(DISTINCT (codigo_wmo,data,hora_utc)) FROM read_parquet('{clima}')").fetchone()[0]
assert checks['clima']['duplicateStationDateHours']==0
right=(T/'localidades_br.parquet').as_posix();left=(T/'acidentes_br.parquet').as_posix()
checks['acidentes']['unlinkedLocalityKeys']=dd.execute(f"SELECT count(*) FROM read_parquet('{left}') a LEFT JOIN read_parquet('{right}') l USING(chv_localidade) WHERE l.chv_localidade IS NULL").fetchone()[0]
checks['acidentes']['invalidClockValues']=dd.execute(f"SELECT count(*) FROM read_parquet('{left}') WHERE hora_acidente<>'NAO_INFORMADO' AND NOT regexp_full_match(hora_acidente,'([01][0-9]|2[0-3])[0-5][0-9][0-5][0-9]')").fetchone()[0]
assert checks['acidentes']['invalidClockValues']==0
dd.close()
(T/'validacao.json').write_text(json.dumps(checks,indent=2),encoding='utf-8')
report=json.loads((T/'compactacao.json').read_text(encoding='utf-8'))
md=['# Base tratada PI2-RO','','Todos os dados nacionais recebidos foram processados. O dashboard usa o recorte de Rondônia.','','| Tabela | Linhas | Parquet (MB) |','| --- | ---: | ---: |']
for name,r in report.items():md.append(f"| {name} | {r['rows']:,} | {r['parquetBytes']/1000000:.2f} |")
md+=['',f"Tamanho total dos Parquets: {sum(r['parquetBytes'] for r in report.values())/1000000:.2f} MB.",'','## Tratamento','','UTF-8, remoção de acentos, padronização de espaços e maiúsculas, deduplicação por chaves, prioridade da edição mais recente e recuperação de chaves exclusivas de edições anteriores. Os valores ausentes são identificados por NAO_INFORMADO, sem substituir medidas desconhecidas por zero. Os Parquets foram verificados e não contêm nulos físicos.','','## Arquivos','','- `*_br.parquet`: modelo nacional compacto.','- `*_br.csv.gz`: tabelas nacionais tratadas com os campos de origem.','- `*_ro.csv`: recortes de Rondônia.','- `clima_br_2023.csv.gz`: observações meteorológicas nacionais.','- `estacoes_br.csv`: cadastro e coordenadas das estações.','- `audit_national.json`: auditoria de fontes, cópias e chaves.','- `validacao.json`: verificações e vínculos sem correspondência.','- `consultas.sql`: exemplos de consultas com DuckDB.','','## Validação de vínculos','']
for name in ['vitimas','veiculos']:md.append(f"- {name}: {checks[name]['unlinkedAccidentKeys']:,} linhas sem acidente correspondente.")
if checks['quarantine'].get('veiculos_sem_acidente'):
    md.append(f"- Quarentena preservada: {checks['quarantine']['veiculos_sem_acidente']:,} linhas em veiculos_sem_acidente.parquet e veiculos_sem_acidente.csv.gz. Esses registros foram separados da base principal.")
md.append(f"- acidentes: {checks['acidentes']['unlinkedLocalityKeys']:,} linhas sem localidade correspondente.")
md+=['','Os registros sem correspondência são preservados nas tabelas nacionais e identificados na validação. Eles não são associados artificialmente a outra entidade.','','O período de acidentes de RO é 2018-01-01 a 2025-08-31. O clima recebido cobre 2023. As observações horárias do clima são UTC.','','A documentação completa e os scripts estão na pasta superior.']
(T/'RESUMO.md').write_text('\n'.join(md)+'\n',encoding='utf-8')
print(json.dumps(checks,indent=2))

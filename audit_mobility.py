"""Independent DuckDB join oracle for every published date/city/vehicle cell."""
import sys,pathlib,json,gzip,collections
R=pathlib.Path(__file__).resolve().parent;sys.path[:0]=[str(R),str(R/'tools/pylibs')]
import duckdb
from build_research import CITIES
O=R/'dist';base=json.loads(gzip.decompress((O/'research.json.gz').read_bytes()));mob=json.loads(gzip.decompress((O/'mobility.json.gz').read_bytes()))
report=json.loads((O/'auditoria-mobilidade.json').read_text(encoding='utf8'))
c=duckdb.connect();c.execute("SET memory_limit='768MB'")
c.execute("CREATE TEMP TABLE regional AS SELECT * FROM read_csv('treated/acidentes_rmbs.csv',delim=';',header=true,all_varchar=true)")
query="""WITH vehicles AS (
 SELECT v.num_acidente,v.tipo_veiculo,sum(v.qtde_veiculos) vehicles
 FROM read_parquet('treated/veiculos_br.parquet') v SEMI JOIN regional a USING(num_acidente)
 WHERE v.qtde_veiculos>0 GROUP BY ALL)
SELECT a.data_acidente,a.codigo_ibge,v.tipo_veiculo,
 sum(CAST(a.qtde_acidente AS BIGINT)),sum(CAST(a.qtde_acid_com_obitos AS BIGINT)),
 sum(CAST(a.qtde_obitos AS BIGINT)),sum(v.vehicles)
FROM regional a JOIN vehicles v USING(num_acidente) GROUP BY ALL"""
expected={tuple([date,CITIES[code],typ]):[int(n),int(fatal),int(deaths),int(vehicles)] for date,code,typ,n,fatal,deaths,vehicles in c.execute(query).fetchall()}
actual=collections.defaultdict(lambda:[0,0,0,0]);people=collections.defaultdict(lambda:[0,0]);dateix,cityix=[base['fields'].index(f) for f in ['date','city']]
for index,vid,pid,n,deaths,involved,fatal in mob['records']:
    row=base['records'][index]
    for typ,qty in mob['vehicleProfiles'][vid]:
        value=actual[(row[dateix],row[cityix],typ)]
        for j,x in enumerate([n,fatal,deaths,qty*n]):value[j]+=x
    for role,driver,injury,qty,died in mob['personProfiles'][pid]:
        value=people[(role,driver,injury)];value[0]+=qty*n;value[1]+=died*n
assert dict(actual)==expected,'Vehicle date/city cells differ from independent join'
person_query="""SELECT tp_envolvido,ind_motorista,gravidade_lesao,sum(qtde_envolvidos),sum(qtde_obitos)
 FROM read_parquet('treated/vitimas_br.parquet') v SEMI JOIN regional a USING(num_acidente)
 WHERE qtde_envolvidos>0 GROUP BY ALL"""
expected_people={(role,driver,injury):[int(n),int(deaths)] for role,driver,injury,n,deaths in c.execute(person_query).fetchall()}
assert dict(people)==expected_people,'Person role/driver/injury cells differ from independent join'
cases={}
for name,condition in [
 ('march2024_bicycle',"v.tipo_veiculo='BICICLETA'"),
 ('march2024_cart',"v.tipo_veiculo='CARROCA'"),
 ('march2024_car_or_motorcycle',"v.tipo_veiculo IN ('AUTOMOVEL','MOTOCICLETA')"),
 ('march2024_car_and_motorcycle',"v.tipo_veiculo IN ('AUTOMOVEL','MOTOCICLETA') GROUP BY v.num_acidente HAVING count(DISTINCT v.tipo_veiculo)=2"),
 ('march2024_bus',"v.tipo_veiculo='ONIBUS'")]:
    matches="SELECT DISTINCT v.num_acidente FROM read_parquet('treated/veiculos_br.parquet') v WHERE qtde_veiculos>0 AND "+condition
    q="SELECT count(*),sum(CAST(qtde_acid_com_obitos AS BIGINT)),sum(CAST(qtde_obitos AS BIGINT)) FROM regional a WHERE data_acidente BETWEEN '2024-03-01' AND '2024-03-31' AND num_acidente IN ("+matches+")"
    n,fatal,deaths=c.execute(q).fetchone();fatal=fatal or 0
    cases[name]={'n':n,'fatal':fatal,'nonfatal':n-fatal,'deathsInEvents':deaths or 0}
report['independentAudit']={'allPassed':True,'method':'DuckDB aggregates national vehicle/person Parquets before joining to regional original events; compares every published date/city/type cell','vehicleCellsCompared':len(expected),'personCellsCompared':len(expected_people),'cases':cases}
(O/'auditoria-mobilidade.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf8',newline='\n')
print(json.dumps(report['independentAudit'],ensure_ascii=False))

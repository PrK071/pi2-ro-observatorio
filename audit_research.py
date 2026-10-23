"""Independent numerical checks, including original-coordinate weather joins."""
import sys,pathlib
R=pathlib.Path(__file__).resolve().parent;sys.path[:0]=[str(R),str(R/'tools/pylibs')]
import csv,gzip,json,math,subprocess
import numpy as np
from sklearn.metrics.pairwise import haversine_distances
from build_research import distance,load_climate,number
from train_models import original_hypothesis
import datetime as dt
O=R/'dist';data=json.loads(gzip.decompress((O/'research.json.gz').read_bytes()))
rows=[dict(zip(data['fields'],r)) for r in data['records']]
checks=[]
def record(name,condition,detail):
    if not condition:raise AssertionError(name+': '+str(detail))
    checks.append({'check':name,'passed':True,'detail':detail})
with (R/'treated/acidentes_rmbs.csv').open(encoding='utf-8-sig',newline='') as f:source=list(csv.DictReader(f,delimiter=';'))
for raw,published in [('qtde_acidente','n'),('qtde_acid_com_obitos','fatal'),('qtde_obitos','deaths')]:
    a=sum(int(r[raw]) for r in source);b=sum(r[published] for r in rows);record('reconcile_'+published,a==b,{'source':a,'published':b})
points=np.array([[0,0],[0,90],[0,179],[0,-179],[-23.96,-46.33],[-24.7,-47.5],[90,0],[-90,0]])
reference=haversine_distances(np.radians(points))*6371
error=max(abs(distance(tuple(a),tuple(b))-reference[i,j]) for i,a in enumerate(points) for j,b in enumerate(points))
record('haversine_vs_sklearn',error<1e-6,{'maxErrorKm':error,'radiusKm':6371})
observations,stations=load_climate()
# Independently rebuild the complete three-hour measurements with original
# coordinates and clock fields, then reconcile published weighted distribution.
from collections import Counter
rebuilt=Counter();matches=0
for r in source:
    if not r['data_acidente'].startswith('2023'):continue
    lat,lng=number(r['latitude_acidente']),number(r['longitude_acidente'])
    if lat is None or lng is None or not(-24.65<=lat<=-23.5 and -47.65<=lng<=-45.65):continue
    ranked=sorted((float(haversine_distances(np.radians([[lat,lng]]),np.radians([pos]))[0,0])*6371,code) for code,pos in stations.items())
    km,code=ranked[0]
    if km>100:continue
    clock=r['hora_acidente'];valid=len(clock)==6 and clock.isdigit() and int(clock[:2])<24 and int(clock[2:4])<60 and int(clock[4:])<60
    hour=int(clock[:2]) if valid else {'MANHA':9,'TARDE':15,'NOITE':21,'MADRUGADA':3}.get(r['fase_dia'],12)
    timestamp=dt.datetime.fromisoformat(r['data_acidente'])+dt.timedelta(hours=hour)
    previous=[observations.get((code,timestamp-dt.timedelta(hours=k)),(None,None))[0] for k in (1,2,3)]
    if all(p is not None for p in previous):
        rebuilt[(r['data_acidente'],code,round(sum(previous),2))]+=int(r['qtde_acidente']);matches+=int(r['qtde_acidente'])
published=Counter()
for r in rows:
    if r['rain3h'] is not None:published[(r['date'],r['stationCode'],r['rain3h'])]+=r['n']
record('three_strictly_previous_hours_and_nearest_station',rebuilt==published,{'events':matches,'sourceCoordinates':'unrounded','oracle':'sklearn haversine, independent distribution rebuild'})
with (R/'treated/clima_br.parquet').open('rb') as f:record('climate_input_exists',f.read(4)==b'PAR1','Parquet')
node=R/'tools/node.exe'
if not node.exists():node='node'
subprocess.run([str(node),'--test','tests/analysis.test.cjs','tests/research.test.cjs'],cwd=R,check=True)
record('javascript_oracles',True,'15 numerical tests; SciPy and sklearn comparisons')
result={'checks':checks,'allPassed':True,'total':len(checks)}
(O/'auditoria-calculos.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
print('Scientific audit passed:',len(checks),'checks')

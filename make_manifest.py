"""SHA-256 provenance for exact local editions. Manifest excludes its own hash."""
import hashlib,json,pathlib,platform,sys
R=pathlib.Path(__file__).resolve().parent;sys.path[:0]=[str(R/'tools/pylibs'),str(R)]
import numpy,scipy,sklearn,duckdb
def entry(p):
    h=hashlib.sha256()
    with p.open('rb') as f:
        for block in iter(lambda:f.read(8*1024*1024),b''):h.update(block)
    return {'path':p.relative_to(R).as_posix(),'bytes':p.stat().st_size,'sha256':h.hexdigest()}
raw=sorted((R/'raw').rglob('*.zip'))
treated=[R/'treated'/n for n in ['acidentes_br.parquet','vitimas_br.parquet','localidades_br.parquet','clima_br.parquet','estacoes_br.csv','acidentes_rmbs.csv','vitimas_rmbs.csv','localidades_rmbs.csv','contagens_diarias_2023.csv','model_primary.joblib','model_climate.joblib','model_climate_control.joblib']]
scripts=list(R.glob('*.py'))+list((R/'tests').glob('*.cjs'))+[R/'analysis_config.json',R/'requirements.txt',R/'README.md',R/'.gitattributes',R/'vercel.json',R/'dist/vercel.json']
# Historical Rondônia exports are local intermediates excluded from Git and
# deployment. Configuration is code, not a publicly served research artifact.
excluded={'reproducibilidade.json','data.json','acidentes-ro.csv','vercel.json'}
public=[p for p in (R/'dist').iterdir() if p.is_file() and p.name not in excluded]
public+=list((R/'dist/figuras').glob('*.svg'))+[p for p in (R/'dist/vendor').iterdir() if p.is_file()]
d={'schemaVersion':1,'scope':'RMBS','sourceEdition':'Local supplied archives, not a live or automatically updated source',
   'environment':{'python':platform.python_version(),'numpy':numpy.__version__,'scipy':scipy.__version__,'sklearn':sklearn.__version__,'duckdb':duckdb.__version__},
   'entrypoint':'python run_research.py [--from-raw]','raw':[entry(p) for p in raw],
   'inputsAndLocalModels':[entry(p) for p in treated if p.exists()],'code':[entry(p) for p in sorted(scripts)],
   'outputs':[entry(p) for p in sorted(public)],
   'determinism':'Semantic results reproducible with fixed seed and versions; generation timestamps and model/PDF serialization can change binary hashes. Compare hashes of inputs and metric values separately.',
   'availability':'Raw archives, national Parquets and joblib models are local and excluded from Git. Reproduction from scratch requires obtaining the identical source files matching these hashes. Public cube supports independent numerical verification without raw identifiers.'}
(R/'dist/reproducibilidade.json').write_text(json.dumps(d,ensure_ascii=False,indent=2),encoding='utf-8',newline='\n')
print('Manifest:',len(raw),'raw archives;',len(public),'public outputs')

"""Reads only the static files intended for deployment; emits hashes or base64 chunks."""
import pathlib,sys,hashlib,json,base64
P=pathlib.Path(__file__).parent/'dist'
FILES=['index.html','style.css','app.js','analysis.js','interactions.js','research-ui.js','vercel.json','referencia-dashboard.png',
       'research.json.gz','metodologia.json','modelos.json','reproducibilidade.json','auditoria-calculos.json',
       'artigo.html','auditoria-formulas.html','artigo-baixada-santista.pdf',
       'figuras/hipotese-central.svg','figuras/confiabilidade.svg',
       'vendor/leaflet.js','vendor/leaflet.css','vendor/chart.umd.min.js']
if len(sys.argv)==1:
    print(json.dumps([{'file':f,'size':(P/f).stat().st_size,'sha':hashlib.sha1((P/f).read_bytes()).hexdigest()} for f in FILES]))
else:
    name=sys.argv[1];assert name in FILES
    with (P/name).open('rb') as f:f.seek(int(sys.argv[2]));print(base64.b64encode(f.read(int(sys.argv[3]))).decode('ascii'))

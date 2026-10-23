"""Reads only the static files intended for deployment; emits hashes or base64 chunks."""
import pathlib,sys,hashlib,json,base64
P=pathlib.Path(__file__).parent/'dist'
FILES=['index.html','style.css','app.js','vercel.json','data.json.gz','acidentes-ro.csv.gz','auditoria.json']
if len(sys.argv)==1:
    print(json.dumps([{'file':f,'size':(P/f).stat().st_size,'sha':hashlib.sha1((P/f).read_bytes()).hexdigest()} for f in FILES]))
else:
    name=sys.argv[1];assert name in FILES
    with (P/name).open('rb') as f:f.seek(int(sys.argv[2]));print(base64.b64encode(f.read(int(sys.argv[3]))).decode('ascii'))

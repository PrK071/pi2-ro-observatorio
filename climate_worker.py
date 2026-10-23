import pathlib,csv,json,collections,zipfile,io,gzip,unicodedata
R=pathlib.Path(__file__).parent; T=R/'treated'
def n(s):
    try: return float(s.replace(',','.')) if s and float(s.replace(',','.'))!=-9999 else None
    except ValueError: return None
climate=[]; ca=[]
def norm(s):
    s=' '.join(s.strip().split()).upper()
    s=''.join(c for c in unicodedata.normalize('NFKD',s) if not unicodedata.combining(c))
    return s if s and s not in ('-9999','-9999,0') else 'NAO_INFORMADO'
with zipfile.ZipFile(next((R/'raw').rglob('2023.zip'))) as z, gzip.open(T/'clima_br_2023.csv.gz','wt',encoding='utf-8',newline='') as f:
    w=csv.writer(f,delimiter=';'); wrote=False
    for idx,e in enumerate(z.infolist()):
        rr=csv.reader(io.TextIOWrapper(z.open(e),encoding='cp1252',newline=''),delimiter=';')
        meta=[next(rr) for _ in range(8)]; h=next(rr); h=h[:-1] if not h[-1] else h
        uf=meta[1][1]; station=norm(meta[2][1]); code=meta[3][1]
        if not wrote:
            w.writerow(['uf','estacao','codigo_wmo']+[norm(x).lower().replace(' ','_') for x in h]); wrote=True
        count=valid=0; months=collections.defaultdict(lambda:[0.,0,0.,0,0,0])
        for a in rr:
            if a and not a[-1]: a=a[:-1]
            if len(a)!=len(h): continue
            count+=1
            cleaned=[norm(x) for x in a]
            cleaned[0]=cleaned[0].replace('/','-')
            cleaned[1]=cleaned[1][:2]+':'+cleaned[1][2:4]+':00'
            # Decimal commas become decimal points in numeric meteorological columns.
            cleaned[2:]=[str(n(x)) if n(x) is not None else 'NAO_INFORMADO' for x in a[2:]]
            w.writerow([uf,station,code]+cleaned)
            rain=n(a[2]); temp=n(a[7]); m=a[0][:7].replace('/','-'); s=months[m]; s[4]+=1
            if rain is not None: s[0]+=rain; s[1]+=1; valid+=1
            if temp is not None: s[2]+=temp; s[3]+=1
            if rain is not None and rain>0: s[5]+=1
        ca.append({'station':code,'uf':uf,'rows':count,'validRain':valid})
        if uf=='RO':
            for m,s in sorted(months.items()): climate.append({'month':m,'station':station,'code':code,'rain':round(s[0],2) if s[1] else None,'rainHours':s[1],'hours':s[4],'temp':round(s[2]/s[3],2) if s[3] else None,'tempHours':s[3],'wetHours':s[5]})
        if idx%50==0: print('CLIMATE',idx,len(z.infolist()),flush=True)
(T/'climate_cache.json').write_text(json.dumps({'climate':climate,'audit':ca}),encoding='utf-8')
print('CLIMATE COMPLETE',flush=True)

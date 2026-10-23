"""Rebuild station metadata without the historical Rondônia dashboard dependency."""
import pathlib, zipfile, csv, io, unicodedata, datetime as dt
R=pathlib.Path(__file__).resolve().parent
def normalize(s):
    return ''.join(c for c in unicodedata.normalize('NFKD',' '.join(s.strip().split()).upper()) if not unicodedata.combining(c)) or 'NAO_INFORMADO'
with zipfile.ZipFile(next((R/'raw').rglob('2023.zip'))) as z,(R/'treated/estacoes_br.csv').open('w',encoding='utf-8',newline='') as f:
    w=csv.writer(f,delimiter=';');w.writerow(['regiao','uf','estacao','codigo_wmo','latitude','longitude','altitude','data_fundacao'])
    for e in z.infolist():
        if not e.filename.lower().endswith('.csv'):continue
        rows=csv.reader(io.TextIOWrapper(z.open(e),encoding='cp1252',newline=''),delimiter=';')
        a=[normalize(next(rows)[1]) for _ in range(8)]
        for i in (4,5,6):a[i]=a[i].replace(',','.')
        for fmt in ('%d/%m/%Y','%d/%m/%y'):
            try:a[7]=dt.datetime.strptime(a[7],fmt).date().isoformat();break
            except ValueError:pass
        w.writerow(a)
print('Station catalogue rebuilt')

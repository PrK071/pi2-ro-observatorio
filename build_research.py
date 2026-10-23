"""Build the Baixada Santista research cube from audited national tables.

No individual identifiers, address numbers, or unrounded coordinates are published.
Missing observations remain unknown. Run extract_rmbs.py first.
"""
import collections
import csv
import datetime as dt
import gzip
import json
import math
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent
T = ROOT / 'treated'
O = ROOT / 'dist'
sys.path.insert(0, str(ROOT / 'tools' / 'pylibs'))


def number(value):
    try:
        n = float(str(value).replace(',', '.'))
        return n if math.isfinite(n) and n != -9999 else None
    except (ValueError, TypeError):
        return None


def read(name):
    with (T / f'{name}_rmbs.csv').open(encoding='utf-8-sig', newline='') as f:
        yield from csv.DictReader(f, delimiter=';')


def distance(a, b):
    lat1, lon1, lat2, lon2 = map(math.radians, (*a, *b))
    v = math.sin((lat2-lat1)/2)**2 + math.cos(lat1)*math.cos(lat2)*math.sin((lon2-lon1)/2)**2
    return 6371 * 2 * math.asin(math.sqrt(max(0, min(1, v))))


def load_climate():
    import duckdb
    db = duckdb.connect()
    db.execute("SET memory_limit='512MB'")
    cursor = db.execute("SELECT * FROM read_parquet(?) WHERE codigo_wmo IN ('A765','A712')", [str(T / 'clima_br.parquet')])
    columns = [c[0] for c in cursor.description]
    rain_col = next(i for i, c in enumerate(columns) if c.startswith('precipitacao_total'))
    temp_col = next(i for i, c in enumerate(columns) if c.startswith('temperatura_do_ar_-_bulbo_seco'))
    observations = {}
    for row in cursor.fetchall():
        timestamp = dt.datetime.combine(row[3], dt.time.fromisoformat(row[4])) - dt.timedelta(hours=3)
        observations[(row[2], timestamp)] = (number(row[rain_col]), number(row[temp_col]))
    db.close()
    stations = {}
    with (T / 'estacoes_br.csv').open(encoding='utf-8-sig', newline='') as f:
        for s in csv.DictReader(f, delimiter=';'):
            if s['codigo_wmo'] in ('A765','A712'):
                stations[s['codigo_wmo']] = (float(s['latitude']), float(s['longitude']))
    return observations, stations


def main():
    climate, stations = load_climate()
    locations = {r['chv_localidade']: r for r in read('localidades')}
    cities = {'3548500':'SANTOS','3551009':'SAO VICENTE','3541000':'PRAIA GRANDE',
              '3518701':'GUARUJA','3513504':'CUBATAO','3506359':'BERTIOGA',
              '3522109':'ITANHAEM','3537602':'PERUIBE','3531100':'MONGAGUA'}
    # A person labelled LEVE, GRAVE or OBITO establishes a victim. The aggregate
    # feridos/ilesos field cannot establish this distinction.
    injuries = collections.defaultdict(lambda: [0, 0, 0])
    for v in read('vitimas'):
        counts = injuries[v['num_acidente']]
        count = int(number(v['qtde_envolvidos']) or 0)
        if v['gravidade_lesao'] in ('LEVE', 'GRAVE', 'OBITO'):
            counts[0] += count
        elif v['gravidade_lesao'] == 'SEM FERIMENTO':
            counts[1] += count
        else:
            counts[2] += count

    fields = ['date','city','type','phase','weekday','road','wet','victim',
              'lat','lng','rain','rain3h','temp','season','climateMethod','street','district',
              'stationCode','stationDistanceKm']
    cube = collections.defaultdict(lambda: [0, 0, 0, 0])
    audit = collections.Counter()
    for a in read('acidentes'):
        date = dt.date.fromisoformat(a['data_acidente'])
        n = int(a['qtde_acidente'])
        fatal = int(a['qtde_acid_com_obitos'])
        involved = int(a['qtde_envolvidos'])
        evidence, unharmed, unknown = injuries.get(a['num_acidente'], [0,0,0])
        victim = None
        if n == 1:
            if fatal > 0 or evidence > 0:
                victim = 1
            elif unharmed == involved and involved > 0 and unknown == 0:
                victim = 0
        lat, lng = number(a['latitude_acidente']), number(a['longitude_acidente'])
        # Reject zeroes, swapped coordinates and out-of-state points, preserving
        # those records in all non-spatial totals. Broad coastal RMBS envelope.
        valid_geo = lat is not None and lng is not None and -24.65 <= lat <= -23.5 and -47.65 <= lng <= -45.65
        if not valid_geo:
            lat = lng = None
            audit['withoutValidCoordinates'] += n
        rain = rain3h = temp = None
        climate_method = None
        station_code = station_km = None
        if valid_geo and date.year == 2023:
            station, km = min(((code, distance((lat,lng), point)) for code,point in stations.items()), key=lambda x:x[1])
            if km <= 100:
                station_code, station_km = station, round(km, 3)
                clock = a['hora_acidente']
                if re.fullmatch(r'([01]\d|2[0-3])[0-5]\d[0-5]\d', clock):
                    hour = int(clock[:2])
                    climate_method = 'hora_registrada'
                else:
                    hour = {'MANHA':9,'TARDE':15,'NOITE':21,'MADRUGADA':3}.get(a['fase_dia'],12)
                    climate_method = 'hora_aproximada'
                timestamp = dt.datetime.combine(date, dt.time(hour))
                rain, temp = climate.get((station,timestamp), (None,None))
                prior = [climate.get((station,timestamp-dt.timedelta(hours=k)),(None,None))[0] for k in (1,2,3)]
                # Strictly previous three hours; incomplete windows are unknown.
                rain3h = sum(prior) if all(x is not None for x in prior) else None
        surface = a['cond_pista']
        wet = 1 if surface == 'MOLHADA' or (rain is not None and rain > .2) or (rain3h is not None and rain3h > .5) else None
        if wet is None and (surface == 'SECA' or (rain is not None and rain3h is not None)):
            wet = 0
        road_type = a['tp_rodovia']
        # Avoid confusing Avenida Padre Anchieta with Rodovia Anchieta.
        road_name = re.search(r'\b(?:SP|BR)[ -]?\d{2,3}\b|^(?:RODOVIA\s+)?(?:ANCHIETA|IMIGRANTES|PIACAGUERA)\b',a['end_acidente'])
        road = 1 if road_type in ('ESTADUAL','FEDERAL') or road_name else (0 if road_type == 'MUNICIPAL' else None)
        season = int(date.month in (12,1,2) and date.weekday() in (4,5,6))
        city = cities[a['codigo_ibge']]
        key = (str(date),city,a['tp_acidente'],a['fase_dia'],a['dia_semana'],road,wet,victim,
               round(lat,2) if lat is not None else None,round(lng,2) if lng is not None else None,
               round(rain,2) if rain is not None else None,round(rain3h,2) if rain3h is not None else None,
               round(temp,2) if temp is not None else None,season,climate_method,
               a['end_acidente'],a['bairro_acidente'],station_code,station_km)
        values = cube[key]
        for i,value in enumerate((n,int(a['qtde_obitos']),involved,fatal)):
            values[i] += value
        audit['accidents'] += n
        audit['wetKnown'] += n if wet is not None else 0
        audit['victimKnown'] += n if victim is not None else 0
        audit['climateMatched'] += n if rain is not None else 0

    dates = [k[0] for k in cube]
    data = {'version':3,'scope':'RMBS','fields':fields+['n','deaths','involved','fatal'],
            'records':[list(k)+v for k,v in sorted(cube.items(), key=lambda item: json.dumps(item[0]))], 'audit':dict(audit),
            'period':[min(dates),max(dates)],'requestedPeriod':['2022-01-01','2025-10-31'],
            'cities':cities,'climateYears':[2023],
            'methodology':{'timezone':'UTC-03:00','stationMaxDistanceKm':100,
                           'stations':['A765 — Bertioga','A712 — Iguape'],
                           'coordinatePrecisionDegrees':.01,'rainWindow':'three strictly preceding hours',
                           'missingClimate':'unknown, never zero-imputed','victimSource':'vitimas.gravidade_lesao + numeric fatal events',
                           'spatialDistance':'Haversine; degrees converted to radians; R=6371 km',
                           'distanceFormula':'a=sin²(Δφ/2)+cos(φ1)cos(φ2)sin²(Δλ/2); d=2R asin(sqrt(a))',
                           'distancePrecision':'Station matching uses original coordinates; browser radius uses rounded public coordinates',
                           'stationSelection':'Nearest among two supplied coastal stations, not the entire INMET network'},
            'generated':dt.datetime.now(dt.timezone.utc).isoformat()}
    content = json.dumps(data,ensure_ascii=False,separators=(',',':'),allow_nan=False).encode()
    with gzip.GzipFile(filename=str(O/'research.json.gz'), mode='wb',mtime=0) as f:
        f.write(content)
    (O/'metodologia.json').write_text(json.dumps({k:v for k,v in data.items() if k!='records'},ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps({'groups':len(cube),**dict(audit)},ensure_ascii=False))


if __name__ == '__main__':
    main()

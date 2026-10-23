"""Frozen chronological benchmarks, hypothesis tables and daily Poisson analysis.

Predictions target fatality CONDITIONAL ON a registered accident; they do not
predict accident incidence. Test labels never fit preprocessing or select a model.
Run after build_research.py. No personal identifiers enter published artifacts.
"""
import sys, pathlib
ROOT = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / 'tools' / 'pylibs'))
import collections, csv, datetime as dt, gzip, hashlib, json, math, platform
import numpy as np
import scipy
from scipy.special import gammaln
from scipy.stats import chi2_contingency, fisher_exact, norm
import sklearn
from sklearn.compose import ColumnTransformer
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LogisticRegression
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import roc_auc_score, average_precision_score, brier_score_loss, precision_recall_curve, confusion_matrix
import joblib
from build_research import distance, load_climate

T, O = ROOT/'treated', ROOT/'dist'
CONFIG = json.loads((ROOT/'analysis_config.json').read_text())

def dump(path, data):
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2, allow_nan=False), encoding='utf-8')

def table(rows, outcome='victim'):
    cells = np.zeros((2,2),dtype=int)
    for r in rows:
        if r['wet'] in (0,1) and r[outcome] in (0,1):
            cells[1-r['wet'],1-r[outcome]] += r['n']
    a,b,c,d = cells.ravel().tolist()
    out = dict(a=a,b=b,c=c,d=d,n=a+b+c+d,odds=None,ci=None,p=None,test=None,decision='inconclusiva')
    if min(a+b,c+d,a+c,b+d)==0:
        return out
    chi,p,_,expected = chi2_contingency(cells,correction=False)
    out['chi']=float(chi);out['expectedMin']=float(expected.min())
    if min(a,b,c,d)>0:
        odds=a*d/(b*c); se=math.sqrt(1/a+1/b+1/c+1/d)
        out.update(odds=odds,ci=[math.exp(math.log(odds)-1.96*se),math.exp(math.log(odds)+1.96*se)])
    if expected.min()<5 or min(a,b,c,d)==0:
        p=float(fisher_exact(cells).pvalue);out['test']='Fisher bilateral'
    else:out['test']='Pearson sem correção'
    out['p']=float(p)
    if out['ci'] and p<.05 and out['ci'][0]>1:out['decision']='associação positiva'
    elif out['ci'] and p<.05 and out['ci'][1]<1:out['decision']='associação inversa'
    else:out['decision']='sem evidência suficiente de associação'
    return out

def holm(items):
    ranked=sorted([(x['p'],i) for i,x in enumerate(items) if x['p'] is not None])
    previous=0
    for j,(p,i) in enumerate(ranked):
        previous=max(previous,min(1,p*(len(ranked)-j)))
        items[i]['pHolm']=previous
    return items

def original_hypothesis(rows):
    rr=[{**r,'wet':int(r['rain3h']>CONFIG['central_hypothesis_rain3h_threshold_mm'])} for r in rows if r['rain3h'] is not None]
    fatal=[{**r,'n':n,'fatality':y} for r in rr for y,n in ((1,r['fatal']),(0,r['n']-r['fatal'])) if n]
    road=table(rr,'road');death=table(fatal,'fatality')
    holm([road,death])
    return {'exposure':'rain3h > 5 mm; comparação <= 5 mm; três horas estritamente anteriores completas',
            'eligible':sum(r['n'] for r in rr),'highRain':sum(r['n'] for r in rr if r['wet']),
            'road':road,'fatality':death}

def feature_rows(rows, climate=False):
    cats=['city','phase','weekday','road','wet']
    if climate:cats += ['stationCode','climateMethod']
    nums=['monthSin','monthCos','lat','lng']
    if climate:nums+=['rain','rain3h','temp','stationDistanceKm']
    matrix=[]
    for r in rows:
        month=int(r['date'][5:7]); computed={**r,'monthSin':math.sin(2*math.pi*month/12),'monthCos':math.cos(2*math.pi*month/12)}
        matrix.append([str(computed[k]) if computed.get(k) is not None else 'NAO_INFORMADO' for k in cats]+[computed[k] if computed.get(k) is not None else np.nan for k in nums])
    return np.asarray(matrix,dtype=object),cats+nums,len(cats)

def metrics(y,p,threshold):
    tn,fp,fn,tp=confusion_matrix(y,p>=threshold,labels=[0,1]).ravel().tolist()
    both=len(set(y))==2
    bins=[]
    # Equal-width reliability bins; skip empty bins without inventing zeros.
    for low,high in zip(np.linspace(0,1,11)[:-1],np.linspace(0,1,11)[1:]):
        mask=(p>=low)&((p<high) if high<1 else (p<=high))
        if mask.any():bins.append({'mean':float(p[mask].mean()),'observed':float(y[mask].mean()),'n':int(mask.sum())})
    return {'n':len(y),'positive':int(y.sum()),'prevalence':float(y.mean()) if len(y) else None,
            'rocAuc':float(roc_auc_score(y,p)) if both else None,
            'averagePrecision':float(average_precision_score(y,p)) if both else None,
            'brier':float(brier_score_loss(y,p)), 'threshold':float(threshold),
            'precision':tp/(tp+fp) if tp+fp else None,'recall':tp/(tp+fn) if tp+fn else None,
            'confusion':{'tn':tn,'fp':fp,'fn':fn,'tp':tp},'calibration':bins}

def bootstrap(y,p,dates):
    rng=np.random.default_rng(CONFIG['seed'])
    days=sorted(set(dates)); index={day:np.flatnonzero(dates==day) for day in days}
    scores={'rocAuc':[],'averagePrecision':[],'brier':[]}
    for _ in range(CONFIG['bootstrap_repetitions']):
        ix=np.concatenate([index[d] for d in rng.choice(days,len(days),replace=True)])
        yy,pp=y[ix],p[ix]
        if len(set(yy))<2:continue
        scores['rocAuc'].append(float(roc_auc_score(yy,pp)))
        scores['averagePrecision'].append(float(average_precision_score(yy,pp)))
        scores['brier'].append(float(brier_score_loss(yy,pp)))
    return {k:np.quantile(v,[.025,.975]).tolist() if v else None for k,v in scores.items()}

def benchmark(cube_rows, name, climate=False, weather_features=True):
    spec=CONFIG[name]
    source=[r for r in cube_rows if r['date']<=spec['test_end'] and (not climate or (r['date']>=spec['start'] and r['rain'] is not None))]
    # A cube row may represent multiple events. Expand only its binary outcome;
    # all copies share predictors and date, hence cannot cross chronological splits.
    expanded=[]; labels=[]
    for r in source:
        if not 0<=r['fatal']<=r['n']:raise ValueError('Invalid event counts')
        expanded.extend([r]*r['n']);labels.extend([1]*r['fatal']+[0]*(r['n']-r['fatal']))
    x,features,ncat=feature_rows(expanded,climate and weather_features);y=np.asarray(labels)
    dates=np.asarray([r['date'] for r in expanded])
    masks={'train':dates<=spec['train_end'],'validation':(dates>spec['train_end'])&(dates<=spec['validation_end']),
           'test':dates>spec['validation_end']}
    if any(len(set(y[mask]))<2 for mask in masks.values()):
        return {'status':'insufficient_classes','splits':{k:int(v.sum()) for k,v in masks.items()}}
    train,val,test=(masks[k] for k in ('train','validation','test'))
    models={}; scores={}; selection=[]
    baseline=float(y[train].mean())
    for key in ['baseline','logistic','random_forest']:
        if key=='baseline':vp=np.full(val.sum(),baseline);threshold=.5;model=None
        else:
            preprocessing=ColumnTransformer([
                ('categorical',OneHotEncoder(handle_unknown='ignore',sparse_output=False),list(range(ncat))),
                ('numeric',Pipeline([('impute',SimpleImputer(strategy='median',add_indicator=True)),('scale',StandardScaler())]),list(range(ncat,len(features))))])
            estimator=LogisticRegression(**CONFIG['logistic'],random_state=CONFIG['seed']) if key=='logistic' else RandomForestClassifier(**CONFIG['random_forest'],random_state=CONFIG['seed'],n_jobs=2)
            model=Pipeline([('preprocess',preprocessing),('model',estimator)])
            model.fit(x[train],y[train]);vp=model.predict_proba(x[val])[:,1]
            precision,recall,thresholds=precision_recall_curve(y[val],vp)
            f1=2*precision[:-1]*recall[:-1]/np.maximum(precision[:-1]+recall[:-1],1e-15)
            threshold=float(thresholds[np.argmax(f1)])
        vm=metrics(y[val],vp,threshold)
        scores[key]={'validation':vm};models[key]=(model,threshold)
        selection.append((vm['averagePrecision'],-vm['brier'],key))
    selected=max(selection)[2]  # Selection finished BEFORE test labels are scored.
    for key,(model,threshold) in models.items():
        p=model.predict_proba(x[test])[:,1] if model else np.full(test.sum(),baseline)
        scores[key]['test']=metrics(y[test],p,threshold)
    model,threshold=models[selected]
    all_x,_,_=feature_rows(cube_rows,climate and weather_features)
    eligible=[i for i,r in enumerate(cube_rows) if spec['validation_end']<r['date']<=spec['test_end'] and (not climate or r['rain'] is not None)]
    probabilities=model.predict_proba(all_x[eligible])[:,1] if model else np.full(len(eligible),baseline)
    field=('climateScore' if weather_features else 'climateControlScore') if climate else 'fatalScore'
    for i,r in enumerate(cube_rows):r[field]=None
    for i,p in zip(eligible,probabilities):cube_rows[i][field]=round(float(p),8)
    p=model.predict_proba(x[test])[:,1] if model else np.full(test.sum(),baseline)
    score=scores[selected]['test'];score['ci95DayBootstrap']=bootstrap(y[test],p,dates[test])
    bycity={}
    for city in sorted({r['city'] for r in expanded}):
        citymask=np.asarray([r['city']==city for r in expanded])[test]
        if citymask.any():bycity[city]=metrics(y[test][citymask],p[citymask],threshold)
    if model:joblib.dump(model,T/f'model_{name}{"_control" if not weather_features else ""}.joblib')
    return {'status':'trained','target':'P(sinistro fatal | sinistro registrado, contexto)',
            'features':features,'selection':'AP de validação; desempate por menor Brier; inclui baseline',
            'selected':selected,'thresholdRule':'F1 máximo na validação; baseline fixo 0,5',
            'splits':{k:{'n':int(v.sum()),'positive':int(y[v].sum()),'start':min(dates[v].tolist()),'end':max(dates[v].tolist())} for k,v in masks.items()},
            'models':scores,'byCity':bycity,'trainPrevalence':baseline,'threshold':threshold,
            'bootstrap':'IC percentil; reamostragem de dias do teste; não cobre incerteza do treinamento nem dependência entre dias'}

def poisson(rows):
    """2023 daily city counts, including calendar zeros, full 24h rain only.

    Quasi-Poisson inference via weekly cluster sandwich; no traffic offset.
    Tourist proxy = DJF Friday/Saturday/Sunday, adjusted for month and weekday.
    """
    climate,stations=load_climate()
    cities=sorted({r['city'] for r in rows})
    anchors={};counts=collections.Counter()
    for city in cities:
        geo=[r for r in rows if r['city']==city and r['lat'] is not None]
        lat=sum(r['lat']*r['n'] for r in geo)/sum(r['n'] for r in geo)
        lng=sum(r['lng']*r['n'] for r in geo)/sum(r['n'] for r in geo)
        code,km=min(((code,distance((lat,lng),pos)) for code,pos in stations.items()),key=lambda a:a[1])
        anchors[city]={'lat':lat,'lng':lng,'station':code,'distanceKm':km}
    for r in rows:
        if r['date'].startswith('2023'):counts[(r['date'],r['city'])]+=r['n']
    observations=[];excluded=0
    for dayno in range(365):
        date=dt.date(2023,1,1)+dt.timedelta(days=dayno)
        for city in cities:
            anchor=anchors[city]
            hourly=[climate.get((anchor['station'],dt.datetime.combine(date,dt.time(h))),(None,None))[0] for h in range(24)]
            if anchor['distanceKm']>CONFIG['station_max_distance_km'] or any(v is None for v in hourly):excluded+=1;continue
            observations.append({'date':str(date),'city':city,'count':counts[(str(date),city)],'rain':sum(hourly),'tourist':int(date.month in (12,1,2) and date.weekday() in (4,5,6)),
                                 'month':date.month,'weekday':date.weekday(),'trend':dayno/365,'week':str(date-dt.timedelta(days=date.weekday()))})
    features=['intercept','tourist','log1p_rain','tourist_x_lograin','trend']+['city_'+c for c in cities[1:]]+['month_'+str(m) for m in range(2,13)]+['weekday_'+str(d) for d in range(1,7)]
    x=np.array([[1,r['tourist'],math.log1p(r['rain']),r['tourist']*math.log1p(r['rain']),r['trend']]+[int(r['city']==c) for c in cities[1:]]+[int(r['month']==m) for m in range(2,13)]+[int(r['weekday']==d) for d in range(1,7)] for r in observations],float)
    y=np.array([r['count'] for r in observations]);beta=np.zeros(x.shape[1]);beta[0]=math.log(y.mean())
    converged=False
    for iteration in range(100):
        mu=np.exp(np.clip(x@beta,-20,20));bread=x.T@(mu[:,None]*x)
        step=np.linalg.lstsq(bread,x.T@(y-mu),rcond=None)[0]
        if np.max(np.abs(step))>3:step*=3/np.max(np.abs(step))
        beta+=step
        if np.max(np.abs(step))<1e-8:converged=True;break
    mu=np.exp(x@beta);inv=np.linalg.pinv(x.T@(mu[:,None]*x));meat=np.zeros_like(inv)
    weeks=sorted({r['week'] for r in observations})
    for week in weeks:
        mask=np.array([r['week']==week for r in observations]);u=x[mask].T@(y[mask]-mu[mask]);meat+=np.outer(u,u)
    covariance=inv@meat@inv * len(weeks)/(len(weeks)-1) * (len(y)-1)/(len(y)-len(beta))
    se=np.sqrt(np.maximum(np.diag(covariance),0));results={}
    for k in ('tourist','log1p_rain','tourist_x_lograin'):
        i=features.index(k);results[k]={'coefficient':float(beta[i]),'irr':float(np.exp(beta[i])),
                    'ci':[float(np.exp(beta[i]-1.96*se[i])),float(np.exp(beta[i]+1.96*se[i]))],
                    'p':float(2*norm.sf(abs(beta[i]/se[i])))}
    with (T/'contagens_diarias_2023.csv').open('w',newline='',encoding='utf-8') as f:
        w=csv.DictWriter(f,fieldnames=list(observations[0]));w.writeheader();w.writerows(observations)
    return {'nCityDays':len(y),'accidents':int(y.sum()),'zeroCityDays':int((y==0).sum()),'excludedIncompleteWeatherCityDays':excluded,
            'clustersWeeks':len(weeks),'designRank':int(np.linalg.matrix_rank(x)),'parameters':len(beta),'converged':converged,
            'pearsonDispersion':float(np.sum((y-mu)**2/mu)/(len(y)-len(beta))),
            'features':features,'effects':results,'cityAnchors':anchors,
            'stationMethod':'Nearest of two supplied stations to accident-weighted public-coordinate reference point per city; fixed across days',
            'offset':'none: counts per calendar day; traffic volume unavailable',
            'covariance':'sandwich clustered by Monday-based calendar week (joint across municipalities); normal approximation',
            'calendar':'365 days in 2023 × 9 cities; retain only station-days with all 24 hourly readings; zero = no recorded accident, not proof of complete reporting'}

def main():
    cube_path=O/'research.json.gz'
    d=json.loads(gzip.decompress(cube_path.read_bytes()))
    rows=[dict(zip(d['fields'],r)) for r in d['records']]
    hypotheses={'regional':{'h1':table(rows),'h2':table(rows,'road')},'byCity':{}}
    hypotheses['central']=original_hypothesis(rows)
    for city in sorted(set(r['city'] for r in rows)):
        rr=[r for r in rows if r['city']==city]
        hypotheses['byCity'][city]={'total':sum(r['n'] for r in rr),'fatal':sum(r['fatal'] for r in rr),
                                  'h1':table(rr),'h2':table(rr,'road'),'central':original_hypothesis(rr)}
    for key in ('h1','h2'):holm([v[key] for v in hypotheses['byCity'].values()])
    hypotheses['sensitivity']={
        'year2023':table([r for r in rows if r['date'].startswith('2023')]),
        'recordedHour':table([r for r in rows if r['climateMethod']=='hora_registrada']),
        'weatherOnlyExposure':table([{**r,'wet':int(r['rain']>.2 or r['rain3h']>.5)} for r in rows if r['rain'] is not None and r['rain3h'] is not None])}
    print('Training chronological primary benchmark',flush=True)
    report={'config':CONFIG,'versions':{'python':platform.python_version(),'numpy':np.__version__,'scipy':scipy.__version__,'sklearn':sklearn.__version__},'hypotheses':hypotheses}
    report['primary']=benchmark(rows,'primary')
    print('Training independent 2023 climate benchmark',flush=True)
    report['climate']=benchmark(rows,'climate',True)
    print('Fitting weather ablation on identical 2023 partitions',flush=True)
    report['climateControl']=benchmark(rows,'climate',True,False)
    report['missingnessByYear']=[]
    for year in ('2022','2023','2024','2025'):
        for fatal in (0,1):
            base=[r for r in rows if r['date'].startswith(year)]
            weight=lambda r:r['fatal'] if fatal else r['n']-r['fatal']
            n=sum(weight(r) for r in base)
            report['missingnessByYear'].append({'year':year,'fatal':fatal,'n':n,
                **{k:sum(weight(r) for r in base if r[k] is None)/n if n else None for k in ('lat','road','wet','victim')}})
    print('Fitting daily count model',flush=True)
    report['countModel']=poisson(rows)
    report['geography']={'stations':{code:{'lat':pos[0],'lng':pos[1]} for code,pos in load_climate()[1].items()},
                         'matched':sum(r['n'] for r in rows if r['rain'] is not None)}
    for f in ('fatalScore','climateScore','climateControlScore'):
        if f not in d['fields']:d['fields'].append(f)
    d['records']=[[r.get(f) for f in d['fields']] for r in rows]
    d['methodology']['prediction']='Frozen train/validation/test chronological splits; only test scores published; see modelos.json'
    payload=json.dumps(d,ensure_ascii=False,separators=(',',':'),allow_nan=False).encode()
    with gzip.GzipFile(filename=str(cube_path),mode='wb',mtime=0) as f:f.write(payload)
    dump(O/'modelos.json',report)
    dump(O/'metodologia.json',{k:v for k,v in d.items() if k!='records'})
    print(json.dumps({'primary':report['primary']['selected'],'primaryTest':report['primary']['models'][report['primary']['selected']]['test'],
                      'climate':report['climate'].get('selected'),'h1':hypotheses['regional']['h1'],'h3':report['countModel']['effects']},ensure_ascii=False),flush=True)

if __name__=='__main__':main()

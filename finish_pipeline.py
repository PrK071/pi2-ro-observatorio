import pathlib,time,subprocess,sys
R=pathlib.Path(__file__).parent
while not all((R/'treated'/f).exists() for f in ['audit_national.json','climate_cache.json']):time.sleep(5)
for script in ['build_data.py','compact.py','finalize.py']:
    print('FINISH STEP',script,flush=True)
    subprocess.run([sys.executable,'-u',str(R/script)],check=True)
print('ALL DATA STEPS COMPLETE',flush=True)

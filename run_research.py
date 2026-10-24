"""Reproduce regional outputs; --from-raw also rebuilds national inputs.

Requires the supplied raw ZIP collection, or the five audited regional inputs.
Use Python 3.13 and requirements.txt. Existing source files are never downloaded
or silently substituted with another edition.
"""
import pathlib, subprocess, sys
R=pathlib.Path(__file__).resolve().parent
scripts=[]
if '--from-raw' in sys.argv:
    scripts+=['etl_national.py','climate_worker.py','compact.py','normalize_times.py','quarantine.py','build_station_catalog.py']
scripts+=['extract_rmbs.py','build_research.py','train_models.py','build_mobility.py','audit_mobility.py','build_article.py','audit_research.py','make_manifest.py']
for script in scripts:
    print('RUN',script,flush=True)
    subprocess.run([sys.executable,str(R/script)],cwd=R,check=True)

"""Small end-to-end ETL regression fixture; never changes the user's input ZIP."""
import tempfile,pathlib,shutil,zipfile,subprocess,sqlite3,json,csv,io,sys
root=pathlib.Path(__file__).parent
with tempfile.TemporaryDirectory(prefix='pi2-etl-check-') as temp:
    p=pathlib.Path(temp); raw=p/'raw'/'Dados Acidentes';raw.mkdir(parents=True)
    shutil.copy(root/'etl_national.py',p/'etl_national.py')
    def snap(name,stamp,latest):
        tables={'Acidentes':[['num_acidente','uf_acidente','nome','qtde_acidente'],['1','RO','  São   João  ' if latest else 'ANTIGO','2' if latest else '1']], 'Localidade':[['chv_localidade','uf','municipio'],['RO01','RO','São João']], 'Vitimas':[['num_acidente','uf_acidente','genero','qtde_envolvidos'],['1','RO','FEMININO' if latest else 'MASCULINO','2' if latest else '1']], 'TipoVeiculo':[['num_acidente','tipo_veiculo','qtde_veiculos'],['1','ÔNIBUS' if latest else 'CARRO','2' if latest else '1']]}
        if not latest: tables['Acidentes'].append(['2','RO','','1'])
        with zipfile.ZipFile(raw/name,'w') as z:
            for t,rows in tables.items():
                f=io.StringIO();csv.writer(f,delimiter=';',lineterminator='\n').writerows(rows);z.writestr(f'{t}_DadosAbertos_{stamp}.csv',f.getvalue().encode('cp1252'))
    snap('new.zip','20251212',True);snap('old.zip','20230613',False);shutil.copy(raw/'old.zip',raw/'duplicate.zip')
    subprocess.run([sys.executable,str(p/'etl_national.py')],check=True,capture_output=True)
    db=sqlite3.connect(p/'treated'/'nacional.sqlite')
    assert db.execute('select count(*) from acidentes').fetchone()[0]==2
    assert db.execute("select payload from acidentes where k='1'").fetchone()[0]=='1;RO;SAO JOAO;2'
    assert 'NAO_INFORMADO' in db.execute("select payload from acidentes where k='2'").fetchone()[0]
    assert db.execute('select count(*) from vitimas').fetchone()[0]==1
    assert 'FEMININO' in db.execute('select payload from vitimas').fetchone()[0]
    assert 'ONIBUS' in db.execute('select payload from veiculos').fetchone()[0]
    audit=json.loads((p/'treated'/'audit_national.json').read_text())
    assert any(x['identicalArchives'] for x in audit['sources'])
    db.close()
    print('PASS: latest snapshot, historical recovery, accents, whitespace, missing marker, detail supersession, identical ZIP detection')

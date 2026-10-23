-- Executar com DuckDB a partir desta pasta.
-- As tabelas Parquet preservam NAO_INFORMADO nos campos opcionais ausentes.
CREATE OR REPLACE VIEW acidentes AS SELECT * FROM read_parquet('acidentes_br.parquet');
CREATE OR REPLACE VIEW localidades AS SELECT * FROM read_parquet('localidades_br.parquet');
CREATE OR REPLACE VIEW vitimas AS SELECT * FROM read_parquet('vitimas_br.parquet');
CREATE OR REPLACE VIEW veiculos AS SELECT * FROM read_parquet('veiculos_br.parquet');
CREATE OR REPLACE VIEW clima AS SELECT * FROM read_parquet('clima_br.parquet');

-- Indicadores por UF. Não unir diretamente aos detalhes de vítimas e veículos:
-- uma relação com várias linhas por acidente multiplicaria os totais.
SELECT uf_acidente, sum(qtde_acidente) AS acidentes,
       sum(qtde_envolvidos) AS envolvidos, sum(qtde_obitos) AS obitos
FROM acidentes GROUP BY uf_acidente ORDER BY acidentes DESC;

-- Rondônia por mês e município: a chave de localidade inclui a competência.
SELECT date_trunc('month',a.data_acidente)::DATE AS mes,
       l.municipio, sum(a.qtde_acidente) AS acidentes,
       sum(a.qtde_obitos) AS obitos
FROM acidentes a LEFT JOIN localidades l USING(chv_localidade)
WHERE a.uf_acidente='RO'
GROUP BY mes,l.municipio ORDER BY mes,l.municipio;

-- Perfil de pessoas em RO: obter UF pelo acidente, sem somar os indicadores dele.
SELECT v.genero, sum(v.qtde_envolvidos) AS envolvidos
FROM vitimas v JOIN acidentes a USING(num_acidente)
WHERE a.uf_acidente='RO' GROUP BY v.genero;

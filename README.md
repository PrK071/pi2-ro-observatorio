# Observatório RO

Dashboard de acidentes de trânsito de Rondônia com ETL nacional dos dados fornecidos e do INMET 2023.

**[Acessar o dashboard](https://pi2-ro-observatorio.vercel.app/)**

O painel reúne 104.666 acidentes, 199.531 pessoas envolvidas e 3.320 óbitos, de janeiro de 2018 a agosto de 2025. O ano de 2025 é parcial. Os cinco Parquets nacionais principais somam aproximadamente 444 MB.

## Executar o dashboard

O dashboard usa HTML, CSS e JavaScript e já inclui os agregados compactados necessários à execução, sem etapa de compilação:

```sh
python -m http.server 8879 --bind 127.0.0.1 --directory dist
```

Abra [http://127.0.0.1:8879](http://127.0.0.1:8879) em um navegador atual com suporte a `DecompressionStream`. Para publicar na Vercel, importe o repositório: `vercel.json` configura `dist/` como diretório de saída.

## Conteúdo versionado

O repositório inclui o código do ETL, o dashboard, os agregados de publicação e os relatórios de auditoria. Os arquivos nacionais completos, os ZIPs brutos, o ambiente Python e o banco de trabalho são gerados localmente.

Consulte o [resumo da base](treated/RESUMO.md), a [validação](treated/validacao.json) e as [consultas SQL](treated/consultas.sql).

## Entregas

- `treated/*_br.csv.gz`: bases nacionais completas, tratadas, em UTF-8, separadas por ponto e vírgula.
- `treated/*_br.parquet`: modelo compacto com compressão Zstandard. Campos derivados de data são removidos; em vítimas, os atributos do acidente são obtidos pela chave `num_acidente`.
- `treated/*_ro.csv`: recortes tratados de Rondônia, mantendo os campos de origem.
- `treated/audit_national.json`: contagens por fonte, duplicatas, arquivos idênticos e rejeições.
- `treated/compactacao.json`: quantidades de linhas e tamanhos dos arquivos finais.
- `treated/veiculos_sem_acidente.*`: registros sem acidente correspondente, separados para revisão e preservados em quarentena.
- `dist/`: dashboard estático e agregados de publicação. Não contém endereços nem identificadores individuais dos acidentes.

## Regras de tratamento

1. Os ZIPs originais são preservados. Arquivos internos são identificados pelo nome, tamanho e CRC. Cópias idênticas são processadas uma única vez.
2. A edição mais recente, identificada pela data no nome interno do CSV, prevalece sobre as anteriores. O nome externo do ZIP não é utilizado como data de atualização.
3. Categorias são convertidas para maiúsculas, sem acentos, com espaços normalizados. Ponto e vírgula dentro de um valor é substituído por vírgula para manter o intercâmbio tabular. Não se aplica correspondência aproximada de nomes, para evitar fundir localidades distintas.
4. Campos vazios e indicadores textuais de ausência recebem `NAO_INFORMADO`. As sentinelas meteorológicas `-9999` também recebem esse marcador. Ausência não é substituída por zero. Os arquivos de intercâmbio não contêm campos vazios.
5. Acidentes são identificados por `num_acidente`; localidades por `chv_localidade`. Pessoas e veículos conservam as dimensões descritivas da origem como chave composta. A quantidade mais recente prevalece para a mesma chave. Detalhes de versões antigas não são somados aos detalhes mais recentes do mesmo acidente.
6. Registros sem chave obrigatória ou com estrutura incompatível são rejeitados e contabilizados. Campos opcionais ausentes não provocam a exclusão integral do registro.
7. Identificadores, CEPs, códigos IBGE e horários são mantidos como texto para preservar zeros à esquerda. Horários fora do padrão HHMMSS válido, como 999999, são convertidos para NAO_INFORMADO nas saídas finais. Datas são ISO. No clima, o horário é UTC e os decimais são padronizados com ponto.
8. O INMET é consolidado em uma única tabela nacional de observações horárias. Estação e código WMO acompanham cada observação. O dashboard usa apenas RO e o período climático disponível, 2023.

## Métricas do dashboard

- Acidentes: soma de `qtde_acidente`, após deduplicação.
- Pessoas envolvidas: soma de `qtde_envolvidos` na tabela de acidentes.
- Óbitos: soma de `qtde_obitos` na tabela de acidentes.
- Acidentes com óbito: soma de `qtde_acid_com_obitos`.
- Óbitos por 100 acidentes: `100 * óbitos / acidentes`. Não é uma taxa populacional.
- Feridos/ilesos: categoria agregada da origem; não deve ser interpretada como somente feridos.
- Perfis: somas das quantidades da tabela de vítimas ou veículos, sem unir os detalhes diretamente à tabela de acidentes antes de calcular os indicadores principais. Isso evita multiplicar os totais pelo número de linhas de detalhe.
- Chuva: soma das precipitações horárias válidas de cada estação. Na opção de todas as estações, média dos totais mensais das estações com observações.
- Temperatura: média das observações horárias válidas, ponderada pela quantidade de horas.

## Limites

A fonte de acidentes é identificada pelos arquivos fornecidos, sem atribuição a um órgão não confirmado. A cobertura depende dos registros recebidos; o último período pode ser parcial. Não se interpola clima ausente nem se atribui causalidade à comparação de chuva e acidentes. A condição meteorológica não foi preenchida nos registros de acidentes de RO, e o filtro correspondente fica desativado. Os filtros de ano e município controlam os perfis de pessoas. O painel climático mantém 2023 e seu próprio seletor de estação, com cobertura explícita das horas válidas. Os rótulos de gravidade originais são preservados quando divergem das contagens numéricas; os indicadores de óbitos usam as contagens numéricas.

## Reprodução

Recomendado: Python 3.13. O ETL usa a biblioteca padrão e DuckDB. Instale a dependência:

```sh
python -m pip install -r requirements.txt
```

Extraia o ZIP original para `raw/`, preservando a estrutura interna `PI2-RO/Dados Acidentes/` e `PI2-RO/Dados Clima/INMET/`. Execute:

```sh
python etl_national.py
python climate_worker.py
python compact.py
python normalize_times.py
python quarantine.py
python build_data.py
python finalize.py
```

O teste usa arquivos sintéticos temporários e verifica prioridade entre versões, recuperação histórica, normalização, tratamento de ausências e identificação de ZIPs idênticos:

```sh
python check_etl.py
```

A execução completa pode exigir vários GB de espaço temporário. O SQLite é um banco de trabalho, utilizado na deduplicação e conferência. Após todas as validações, ele pode ser removido para liberar espaço. Os CSVs e Parquets são os arquivos finais para intercâmbio e análise.

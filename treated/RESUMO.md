# Base tratada PI2-RO

Todos os dados nacionais recebidos foram processados. O dashboard usa o recorte de Rondônia.

| Tabela | Linhas | Parquet (MB) |
| --- | ---: | ---: |
| clima | 4,966,920 | 72.87 |
| acidentes | 8,106,410 | 238.11 |
| localidades | 514,924 | 2.73 |
| vitimas | 12,282,662 | 77.27 |
| veiculos | 10,584,738 | 52.97 |

Tamanho total dos Parquets: 443.96 MB.

## Tratamento

UTF-8, remoção de acentos, padronização de espaços e maiúsculas, deduplicação por chaves, prioridade da edição mais recente e recuperação de chaves exclusivas de edições anteriores. Os valores ausentes são identificados por NAO_INFORMADO, sem substituir medidas desconhecidas por zero. Os Parquets foram verificados e não contêm nulos físicos.

## Arquivos

- `*_br.parquet`: modelo nacional compacto.
- `*_br.csv.gz`: tabelas nacionais tratadas com os campos de origem.
- `*_ro.csv`: recortes de Rondônia.
- `clima_br_2023.csv.gz`: observações meteorológicas nacionais.
- `estacoes_br.csv`: cadastro e coordenadas das estações.
- `audit_national.json`: auditoria de fontes, cópias e chaves.
- `validacao.json`: verificações e vínculos sem correspondência.
- `consultas.sql`: exemplos de consultas com DuckDB.

## Validação de vínculos

- vitimas: 0 linhas sem acidente correspondente.
- veiculos: 0 linhas sem acidente correspondente.
- Quarentena preservada: 38,926 linhas em veiculos_sem_acidente.parquet e veiculos_sem_acidente.csv.gz. Esses registros foram separados da base principal.
- acidentes: 0 linhas sem localidade correspondente.

Os registros sem correspondência são preservados nas tabelas nacionais e identificados na validação. Eles não são associados artificialmente a outra entidade.

O período de acidentes de RO é 2018-01-01 a 2025-08-31. O clima recebido cobre 2023. As observações horárias do clima são UTC.

A documentação completa e os scripts estão na pasta superior.

# Observatório da Baixada Santista

Sinistros de trânsito, clima, Haversine, ETL e modelagem preditiva nos nove municípios da RMBS. Esta edição inclui artigo científico, conferência das fórmulas e experimentos cronológicos efetivamente treinados. O nome do repositório foi preservado para manter os links anteriores.

## Resultado da conferência do texto de referência

A hipótese original compara **chuva medida nas três horas anteriores > 5 mm** com **≤ 5 mm**. Ela não é equivalente ao indicador combinado de pista molhada do dashboard anterior.

| Componente central | N | OR | IC95% | p bilateral |
| --- | ---: | ---: | --- | ---: |
| Proporção rodoviária | 8.023 | 1,219 | 0,939–1,581 | 0,1361 |
| Fatalidade por evento | 8.688 | 0,811 | 0,397–1,655 | 0,5645 |

A hipótese composta não foi sustentada nesta edição. Não se demonstrou ausência de efeito ou causalidade. A análise de tipo de via também não demonstra deslocamento espacial de hotspots. P-valores ajustados de Holm, tabelas municipais e análises complementares estão em `dist/modelos.json`.

Haversine implementa `a = sin²(Δφ/2) + cos(φ1)cos(φ2)sin²(Δλ/2)` e `d = 2R asin(sqrt(a))`, com graus convertidos para radianos e R = 6.371 km. A raiz cobre toda a soma. Ela é usada para vincular a estação entre duas candidatas até 100 km e para o filtro espacial público. A precipitação anterior soma exclusivamente `t−1h`, `t−2h` e `t−3h`, exigindo três medidas válidas.

## Cobertura e denominadores

- 31.493 sinistros, 911 **eventos fatais**, 961 **óbitos em pessoas**.
- Período observado: 01/01/2022–31/08/2025. Meses posteriores não viram zeros.
- Nove municípios, com Mongaguá 3531100 e Peruíbe 3537602.
- INMET disponível: 2023, estações A765 (Bertioga) e A712 (Iguape).
- 8.701 eventos com chuva horária vinculada; 8.688 com três horas anteriores completas; 381 após > 5 mm.
- Cubo público: 30.867 grupos, cuja soma de `n` reconcilia os 31.493 eventos. Contagem de grupos não substitui `n`.
- Gravidade de vítimas classificável em 5.530 eventos. “Feridos/ilesos” não é tratado como feridos; desconhecidos não viram casos sem vítima.

Os totais de 1.692.810 registros e a AUC 0,8790 do texto de referência não foram reproduzidos neste recorte.

## Dashboard e artigo

O dashboard contém mapa, filtros cruzados, tabelas 2×2 recalculadas, Fisher para tabelas esparsas, comparação de modelos, confiabilidade, teste da hipótese original, demonstração de Haversine e sequência do ETL. O raio espacial é ajustável. A comparação global dos modelos e o modelo diário regional são explicitamente fixos; os demais resultados usam os filtros ativos.

Os gráficos interativos permitem clicar novamente na seleção para removê-la. Os botões locais limpam somente a dimensão do gráfico; **Voltar/Refazer** recuperam a sequência de filtros, camadas, séries ocultas e experimento. A seleção de um mês na série temporal mantém o ano/mês escolhidos manualmente como contexto e não deixa filtros residuais ao removê-la. Os gráficos de referência preservam as alternativas antes de seu próprio filtro, conforme indicado nas notas; indicadores e testes usam a interseção completa dos filtros.

- [Artigo editável em Markdown](docs/artigo-baixada-santista.md)
- [Artigo em HTML](dist/artigo.html)
- [Artigo em PDF](dist/artigo-baixada-santista.pdf)
- [Conferência das fórmulas](docs/auditoria-formulas.md)
- [Resultados e configurações](dist/modelos.json)
- [Manifesto SHA-256](dist/reproducibilidade.json)
- [Auditoria numérica](dist/auditoria-calculos.json)

```sh
python -m http.server 8879 --bind 127.0.0.1 --directory dist
```

Abrir `http://127.0.0.1:8879/`. O navegador precisa de `DecompressionStream` para ler o cubo gzip. Leaflet e Chart.js estão incluídos em `dist/vendor/`; a cartografia depende de conexão. O painel é estático e o agente analítico usa intenções locais, sem API de IA.

## Modelagem executada

**Contexto:** treino 2022–2023, validação 2024 e teste jan–ago/2025. **Clima:** treino jan–jun/2023, validação jul–set e teste out–dez. Prevalência constante, regressão logística L2 e Random Forest são comparadas. O modelo é selecionado por Average Precision na validação; limiares são definidos na validação. Não há reajuste no teste. A semente é 42.

No teste de 2025, a logística selecionada apresenta AUC 0,765, AP 0,131 e Brier 0,03119. O Brier da prevalência constante é 0,02656: o modelo selecionado não melhora esse erro probabilístico. A precisão no limiar congelado é 6,31%, com sensibilidade 63,87%. Escores são experimentais e condicionais a um sinistro já registrado, sem prever incidência futura.

O experimento climático também inclui ablação na mesma amostra, retirando as variáveis meteorológicas adicionais. Não houve ganho pontual com sua inclusão. A categoria combinada de pista/chuva permanece no controle e essa comparação não prova efeito causal. Há forte mudança de preenchimento ao longo dos anos: modelos podem aprender atalhos administrativos associados à fatalidade. Esses limites são apresentados no artigo e no painel.

O modelo complementar de contagem ajusta Poisson em 3.227 município-dias de 2023, com 745 células sem evento registrado, 24 observações de chuva exigidas por dia e erros agrupados em 53 semanas. Inclui município, mês, dia da semana, tendência, chuva diária e interação com verão turístico. Não há evidência suficiente da interação; sem fluxo de tráfego, estima contagens diárias e não risco por viagem.

## Reproduzir

Usar Python 3.13 e Node.js 22. Os dados brutos, os Parquets nacionais, os CSVs intermediários e os modelos joblib permanecem locais e fora do Git. É necessário obter as mesmas edições dos insumos e conferir os hashes; apenas baixar outra edição pública pode alterar os resultados.

```sh
python -m pip install -r requirements.txt
# Com os Parquets auditados disponíveis:
python run_research.py
# Ou desde os ZIPs recebidos, em um diretório de trabalho limpo:
python run_research.py --from-raw
```

Sequência nacional: `etl_national.py` → `climate_worker.py` → `compact.py` → `normalize_times.py` → `quarantine.py` → `build_station_catalog.py`.

Sequência regional: `extract_rmbs.py` → `build_research.py` → `train_models.py` → `build_article.py` → `audit_research.py` → `make_manifest.py`.

As configurações estão em `analysis_config.json`. O manifesto registra hashes dos ZIPs, insumos, código, modelos locais e saídas. Carimbos de geração e serializações podem alterar os hashes de saídas entre execuções; comparar insumos, configuração e métricas além dos bytes.

## Verificações

```sh
node --test tests/analysis.test.cjs tests/research.test.cjs
python audit_research.py
```

Quinze testes JavaScript cobrem fórmulas, arcos conhecidos, tabelas 2×2, Fisher municipal, filtros, denominadores, índices de fatalidade e métricas de previsões de teste comparadas com SciPy/scikit-learn. A auditoria Python reconcilia os totais e reconstrói a distribuição da chuva anterior com coordenadas originais e uma implementação independente de Haversine. Não executa nem altera o grande ETL nacional durante a conferência regional.

Os testes de navegador em `tests/chart-navigation.cjs` conferem cliques reais nos gráficos, remoção de seleção, histórico, legendas, mapa, filtros combinados e visualização móvel. Com o servidor HTTP ativo e Playwright instalado, executar `node --test tests/chart-navigation.cjs`. O caminho do módulo, do navegador e do servidor podem ser informados por `PLAYWRIGHT_MODULE`, `BROWSER_EXECUTABLE` e `DASHBOARD_URL`.

## Fontes e histórico

As referências bibliográficas verificadas estão no artigo. Fontes oficiais: [RENAEST](https://dados.transportes.gov.br/sk/dataset/renaest), [INMET](https://portal.inmet.gov.br/dadoshistoricos) e [IBGE](https://www.ibge.gov.br/explica/codigos-dos-municipios.php). O [histórico de Rondônia](docs/historico-rondonia.md) permanece como documentação da etapa anterior.

A atualização nesta pasta não publica automaticamente o site hospedado.

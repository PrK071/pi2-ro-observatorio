# Observatório da Baixada Santista

Dashboard de sinistros de trânsito e clima nos nove municípios da Região Metropolitana da Baixada Santista (RMBS), adaptado ao relatório técnico-científico do PI2 da FATEC. O nome do repositório e o endereço de hospedagem foram mantidos para preservar os links existentes.

**[Abrir o dashboard](https://pi2-ro-observatorio.vercel.app/)**

## O que está implementado

- Mapa Leaflet com cartografia Esri, hotspots agregados, camada de eventos fatais e filtro espacial por raio de 2 km.
- Seis indicadores: sinistros, eventos fatais, letalidade por evento, sinistros com vítimas identificadas, condição molhada/chuva e rodovias.
- Filtros de ano, mês, município, tipo, condição de pista/chuva, logradouro e área. As seleções atualizam indicadores, mapa, gráficos, síntese científica e respostas analíticas.
- Série mensal com sinistros e média da precipitação horária associada aos registros; gráficos de municípios, severidade e tipologia.
- H1: tabela 2×2, Odds Ratio, IC95%, qui-quadrado de Pearson e p-valor recalculados em cada recorte. Células nulas/zero, grupos ausentes e frequências esperadas pequenas são tratados explicitamente.
- H2: proporção de eventos rodoviários por condição da pista/chuva, com teste de associação.
- H3: contagens e médias por dia de calendário no verão turístico e nos demais períodos; interpretação exploratória, sem alegar controle meteorológico ou causalidade.
- Agente analítico local com intenções predefinidas, sem API externa. Responde com os números dos filtros ativos e identifica o contexto de cada resposta.
- Exportação CSV da seleção com prevenção de fórmulas em campos textuais, layout responsivo e controles acessíveis por teclado.

## Cobertura real, diferente das métricas do relatório

| Item | Base disponível |
| --- | --- |
| Escopo solicitado | Janeiro de 2022 a outubro de 2025 |
| Acidentes recebidos | 01/01/2022 a 31/08/2025 |
| Sinistros únicos | 31.493 |
| Sinistros fatais | 911 |
| Óbitos | 961 |
| Municípios | Santos, São Vicente, Praia Grande, Guarujá, Cubatão, Bertioga, Itanhaém, Peruíbe, Mongaguá |
| INMET fornecido | 2023, estações costeiras A765 (Bertioga) e A712 (Iguape) |

Setembro e outubro de 2025 são apresentados como meses sem cobertura, sem convertê-los em meses com zero sinistros. Os totais de 508.575, OR 1,264 e AUCs do documento de referência **não foram apresentados como resultados desta base**. Mongaguá usa o código IBGE correto, **3531100**, distinto de Peruíbe, 3537602: [IBGE](https://www.ibge.gov.br/cidades-e-estados/sp/mongagua.html).

A existência de vítimas é estabelecida pelas categorias LEVE, GRAVE ou OBITO da tabela de pessoas ou pela contagem numérica de eventos fatais. Um evento é classificado sem vítimas apenas quando a quantidade de pessoas SEM FERIMENTO reconcilia com todos os envolvidos, sem gravidade desconhecida. O campo agregado `qtde_feridosilesos` não permite distinguir feridos de ilesos. A proporção de vítimas classificáveis é informada no painel; os demais eventos não entram artificialmente no grupo sem vítimas.

O OR compara a gravidade **entre sinistros registrados**, sem estimar incidência de acidentes, risco por viagem ou efeito causal da chuva. O selo positivo exige IC95% acima de 1 e p < 0,05, com frequências esperadas de pelo menos 5 e células positivas. Amostras com informações completas podem apresentar viés de seleção.

## Executar

O painel publicado é estático e funciona sem instalação de dependências ou chave de API. Leaflet 1.9.4 e Chart.js 4.5.1 estão incluídos em `dist/vendor/`; a cartografia e as fontes tipográficas precisam de conexão à internet. O processamento dos filtros acontece no navegador sobre o cubo regional comprimido.

```sh
python -m http.server 8879 --bind 127.0.0.1 --directory dist
```

Abra [localhost:8879](http://127.0.0.1:8879) em navegador atualizado com suporte a `DecompressionStream`. A configuração Vercel publica `dist/`, sem compilação.

## Reproduzir a base regional

O ETL nacional original e sua documentação foram preservados em [docs/historico-rondonia.md](docs/historico-rondonia.md). Os Parquets nacionais e os arquivos brutos permanecem locais e fora do Git. Para regenerar a versão regional após produzir os Parquets nacionais:

```sh
python -m pip install -r requirements.txt
python extract_rmbs.py
python build_research.py
node --test tests/analysis.test.cjs
```

`extract_rmbs.py` seleciona os nove códigos IBGE, UF SP e o período solicitado nos Parquets auditados. A extração de pessoas usa semijunção por identificador; os indicadores dos eventos nunca são somados após uma junção que os multiplique. Os arquivos intermediários são `treated/{acidentes,vitimas,localidades}_rmbs.csv`.

`build_research.py` gera `dist/research.json.gz` e `dist/metodologia.json`. A junção meteorológica usa a estação costeira mais próxima do ponto registrado, até 100 km, no horário BRT. Quando não há hora válida, usa o centro de referência da fase do dia. A chuva anterior soma **as três horas estritamente anteriores**, e exige uma janela completa. Não há imputação de chuva ausente por zero, nem simulação de cobertura meteorológica para 2022/2024/2025. Cada grupo preserva se a hora foi aproximada ou registrada.

Condição molhada: pista informada MOLHADA, chuva horária acima de 0,2 mm ou chuva anterior acima de 0,5 mm. Condição seca/sem indício: pista informada SECA ou ambas as medidas climáticas conhecidas sem exceder os limites. Sem essas evidências, condição desconhecida. Isto é uma aproximação meteorológica e não uma medição da aderência da pista.

Rodovias: tipo ESTADUAL/FEDERAL, código SP/BR ou nome explícito de eixo rodoviário. A identificação evita confundir Avenida Padre Anchieta com Rodovia Anchieta. O mapa descarta coordenadas ausentes, zero ou fora do envelope regional e agrega pontos a 0,01°; esse envelope é uma verificação aproximada, não uma validação por polígono municipal. Não publica identificadores de acidentes, números de endereço nem coordenadas individuais exatas.

## Limites de implementação

A arquitetura estática do projeto existente foi mantida. Não há backend FastAPI em produção: as consultas e testes estatísticos são executados no navegador, com DuckDB usado na preparação da base. O chat usa intenções locais, não Gemini. Não há modelo preditivo treinado neste recorte; por isso o dashboard não exibe probabilidades individuais nem AUCs importadas do relatório. A análise H3 não incorpora feriados nem exposição ao tráfego e não testa uma hipótese de contagem ajustada por chuva.

As limitações de cobertura são apresentadas na interface e no download da metodologia. Os testes numéricos verificam uma tabela 2×2 de referência, valores desconhecidos, grupos ausentes, interseção dos filtros, calendário bissexto, contagens reconciliadas e ausência de identificadores individuais no cubo publicado.

## Fontes

- [RENAEST / SENATRAN](https://www.gov.br/transportes/pt-br/assuntos/transito/conteudo-Senatran/renaest): fonte descrita no relatório de referência; a análise usa os arquivos nacionais fornecidos e auditados neste projeto.
- [INMET — dados históricos](https://portal.inmet.gov.br/dadoshistoricos).
- [IBGE — códigos municipais](https://www.ibge.gov.br/explica/codigos-dos-municipios.php).
- [Leaflet — referência](https://leafletjs.com/reference.html), [Chart.js — API](https://www.chartjs.org/docs/latest/developers/api.html).

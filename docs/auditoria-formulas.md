# CONFERÊNCIA DAS FÓRMULAS E DOS ÍNDICES

## Correspondência entre o texto de referência e a implementação

| Elemento | Conferência e correção |
| --- | --- |
| Haversine | d = 2R asin(√a); a é a soma de dois termos. O texto recebido não explicita com clareza a raiz da soma. O código aplica a raiz e converte graus para radianos. |
| Distância | R = 6.371 km; resultado em km. Seleção da estação usa coordenadas originais; filtro público usa coordenadas arredondadas. |
| Chuva anterior | Soma de t−1h, t−2h e t−3h, sem a hora corrente; três medidas válidas. |
| Exposição original | R₃h > 5 mm; até 5 mm é o comparador. Não equivale à regra combinada de pista molhada de 0,2/0,5 mm. |
| Pearson | E = margem da linha × margem da coluna / N; χ² = soma de (observado − esperado)² / esperado. Fisher em tabela esparsa. |
| H0 | Independência/OR = 1. Rejeitar H0 não prova causalidade. p nunca é apresentado como 0,000. |
| Sinistros | Soma de qtde_acidente: 31.493; não é a quantidade de linhas do cubo público. |
| Eventos fatais | Soma de qtde_acid_com_obitos: 911. Proporção fatal = 911/31.493 = 2,893%. |
| Óbitos | Soma de qtde_obitos: 961 pessoas. 961/31.493 não é proporção de eventos fatais. |
| Com vítimas | Necessita gravidade por pessoa; “feridos/ilesos” não define vítima. Ausentes não entram no grupo sem vítimas. |
| Regiões | Nove municípios; não sete. Código de Mongaguá 3531100. |
| Período | Jan/2022–ago/2025 para sinistros; clima só em 2023. Não há cobertura de todo 2025. |
| Modelo | Treino real nesta edição. Random Forest não superou logística na seleção por AP; AUC 0,8790 do texto não foi reproduzida. |
| Classes | Sem class_weight nesta execução; L2 é regularização, não penalização de classe. Limiar vem da validação. |
| Hotspots | Proporção rodoviária não demonstra migração espacial nem deslocamento de tráfego. |

## Recalcular a hipótese original

| Rodovia | Sim | Não | Total |
| --- | ---: | ---: | ---: |
| Chuva anterior > 5 mm | 78 | 248 | 326 |
| Chuva anterior ≤ 5 mm | 1.579 | 6.118 | 7.697 |

E para as quatro células = margem da linha × margem da coluna / 8023. χ² = 2,221661, p = 0,1361; OR = (78 × 6118) / (248 × 1579) = 1,218626; IC95% 0,939 a 1,581.

| Evento fatal | Sim | Não | Total |
| --- | ---: | ---: | ---: |
| Chuva anterior > 5 mm | 8 | 373 | 381 |
| Chuva anterior ≤ 5 mm | 214 | 8.093 | 8.307 |

χ² = 0,332053, p = 0,5645; OR = (8 × 8093) / (373 × 214) = 0,811105; IC95% 0,397 a 1,655. A hipótese composta não é sustentada. A ausência de significância não prova ausência de efeito.

## Referências empregadas na revisão

A fundamentação do teste, da probabilidade e da modelagem deve ter correspondência temática. A comparação entre Excel e Power BI de Cosic e Toth, citada no texto inicial, aborda ferramentas de relatório e não sustenta diretamente Haversine, Pearson ou a superioridade de Random Forest. A revisão utiliza documentação científica e referências de ETL, florestas, validação temporal, métricas e contagens pertinentes a cada técnica. Afirmações numéricas de densidade, N, AUC e feature importance sem reprodução local foram retiradas da conclusão. Não se publicou ranking de importância que não tenha sido calculado.

Os testes automatizados incluem arcos conhecidos e antimeridiano para Haversine, comparação com scikit-learn, tabelas e p-valores comparados com SciPy, chuva de três horas reconstruída a partir da origem, reconciliação dos denominadores e métricas de teste comparadas com sklearn. Consulte auditoria-calculos.json e o artigo para os resultados completos.

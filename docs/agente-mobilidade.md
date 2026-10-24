# Consultas específicas por veículo e papel da pessoa

O erro observado era a interpretação apenas do período: a pergunta sobre ciclistas/carros de ambulantes em março de 2024 recebia o total de 760 sinistros do mês. A implementação passa a exigir a categoria solicitada e consulta os detalhes de **TipoVeiculo** e **Vitimas**, ligados ao sinistro original por `num_acidente` no ETL local.

## Construção reproduzível

1. `extract_rmbs.py` seleciona os nove códigos IBGE e o período efetivamente recebido e faz SEMI JOIN para extrair veículos, vítimas e localidades.
2. `build_research.iter_events` transforma cada evento com as mesmas dimensões geográficas, climáticas e de classificação do cubo científico.
3. `build_mobility.py` agrega as linhas de veículos por acidente/tipo e os detalhes de pessoas por acidente/papel/indicador de motorista/gravidade. Só então relaciona esses perfis aos sinistros originais. As 31.493 linhas de acidentes têm peso 1.
4. O cubo complementar `mobility.json.gz` guarda referência à linha agregada pública da pesquisa e perfis de veículos/pessoas. Nenhum `num_acidente` ou identificador de pessoa/veículo é publicado. Perfis compartilhados são escalados pelo número de eventos do grupo.
5. Cada grupo reconcilia `n`, eventos fatais, óbitos em pessoas e envolvidos com o cubo já publicado. A condição fatal faz parte da chave, permitindo filtrar fatais e não fatais com exatidão. As previsões já congeladas permanecem associadas às mesmas dimensões.
6. `audit_mobility.py` executa uma consulta independente no DuckDB sobre os Parquets nacionais e os eventos regionais originais. Compara todas as 23.401 células data/município/tipo de veículo e as 14 células de papel/indicador de motorista/gravidade das pessoas. Os resultados e hashes estão em `auditoria-mobilidade.json` e `reproducibilidade.json`.

Para reconstruir apenas a extensão com o cubo científico existente:

```sh
python extract_rmbs.py
python build_mobility.py
python audit_mobility.py
python make_manifest.py
```

A execução completa `python run_research.py` inclui a extensão após o treinamento. Ela exige também `veiculos_br.parquet` da mesma edição auditada. O cubo complementar contém o SHA-256 do cubo base; o backend recusa versões incompatíveis. Navegador e servidor reconciliam os totais por grupo antes de usá-lo.

## Unidades e perguntas

- **Sinistros** contam ocorrências distintas. Um evento com carro e moto entra uma vez na união; um evento pode aparecer nas duas linhas de um ranking por categoria. As linhas não devem ser somadas como total distinto.
- **Fatais** são eventos com pelo menos um óbito. **Não fatais** são os demais eventos e podem ter feridos. **Óbitos** contam pessoas em todos os veículos do sinistro, não apenas no veículo usado no filtro.
- **Veículos** somam `qtde_veiculos`, independentemente do número de acidentes. Dois automóveis em uma colisão são dois veículos e um sinistro.
- **Motoristas/passageiros/pedestres** usam o papel e o indicador da tabela de pessoas. A fonte não fornece ligação de cada pessoa ao veículo. Em eventos com vários veículos, não se pode atribuir um óbito especificamente ao motorista do carro, ônibus ou moto. O agente apresenta pessoas registradas nos sinistros selecionados e explicita esse limite.
- **Ciclistas** são consultados por sinistros com `tipo_veiculo=BICICLETA`, pois a tabela de pessoas recebida não contém o papel CICLISTA. Isso não identifica óbitos ou ferimentos de ciclistas individualmente.
- **Carroça** e **charrete** existem no catálogo. Carrinhos de lanche de ambulantes, cadeira de rodas, patinete, táxi/Uber por uso e bicicleta elétrica não são categorias específicas nesta edição. Não são inferidos de `DESCONHECIDO`, `NAO_INFORMADO` ou de outro tipo. Pedidos mistos recebem resultado parcial rotulado, e pedidos somente de categorias não discriminadas não recebem o total geral como substituto.

Na edição observada há 46.125 veículos registrados e 25 categorias, com 30.571 sinistros com alguma linha de veículo. Há 23.405 com ao menos uma categoria conhecida, 9.924 com alguma categoria desconhecida e 922 sem linhas de veículo; conhecida e desconhecida podem coexistir. Há 10.391 pessoas com quantidade positiva registradas nos detalhes, em 5.788 sinistros; ausência de detalhe de pessoa não significa ausência de envolvidos. Os 961 óbitos reconciliam com a tabela de sinistros.

## Exemplo da pergunta recebida

Para **março de 2024, na Baixada Santista inteira**, a consulta independente identificou:

| Categoria ou condição | Sinistros | Fatais | Não fatais |
| --- | ---: | ---: | ---: |
| Bicicleta | 1 | 0 | 1 |
| Carroça | 0 | 0 | 0 |
| Ônibus | 25 | 4 | 21 |
| Automóvel ou motocicleta, união distinta | 490 | 14 | 476 |
| Automóvel e motocicleta na mesma ocorrência | 198 | 3 | 195 |

Os carrinhos de ambulantes não podem ser isolados. Zero indica nenhum registro identificado nessa categoria/período, sem comprovar inexistência. A cobertura e os desconhecidos são informados em cada consulta. O resultado de bicicleta se refere a evento envolvendo bicicleta, não a uma contagem individual de ciclistas.

Os mesmos cálculos funcionam na **Consulta local**, sem depender da ativação do serviço de IA. A ferramenta da IA usa os mesmos parâmetros e cálculos validados.

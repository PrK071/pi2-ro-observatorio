# Agente analítico conversacional

A interface aceita perguntas livres, histórico curto, comparações entre cidades, períodos escritos na mensagem e continuações como “e em 2024?”. Os filtros atuais são o contexto inicial. Cidades e períodos explicitamente pedidos substituem aquela dimensão para a consulta; as outras restrições permanecem. A consulta não modifica os filtros do dashboard. “Nova conversa” limpa o histórico, e uma mudança de filtros reinicia o contexto enviado na próxima pergunta.

## Interpretação e dados

O endpoint `api/chat.mjs` chama o Vercel AI Gateway pelo protocolo HTTP compatível com Chat Completions. O modelo inicial é `openai/gpt-4.1-mini`, verificado no catálogo público do Gateway em 23/10/2026, com suporte a ferramentas. `AI_GATEWAY_MODEL` pode selecionar outro modelo compatível. Não há SDK nem dependência adicional no navegador ou no servidor.

As ferramentas só consultam o cubo público e o relatório treinado: `consultar_dados`, `buscar_categorias` e `consultar_estudo`. O modelo recebe o contexto calculado e pode refinar a seleção antes de responder. O servidor recalcula os resultados a partir dos arquivos versionados; não aceita números calculados pelo cliente como evidência. Os parâmetros são validados contra o catálogo e listas de operações permitidas. Não há execução de SQL ou código gerado.

As consultas por bicicleta, automóvel, ônibus, moto, caminhão e demais tipos usam a extensão `mobility.json.gz`, construída das tabelas de veículos e pessoas. Ela inclui união/interseção/exclusão de veículos, eventos fatais e não fatais e papéis das pessoas. Ver o [protocolo de mobilidade e seus limites](agente-mobilidade.md). Categorias não discriminadas não são substituídas pelo total geral, inclusive no modo local.

As contagens somam `n`, os eventos fatais somam `fatal` e as mortes em pessoas somam `deaths`. Estatísticas compartilham `dist/analysis.js`. O agente deve distinguir associação, causalidade, escores experimentais e risco por viagem. Dados ausentes e cobertura parcial de 2025 permanecem explícitos. O modelo de linguagem pode cometer erros de interpretação; o recorte e os links de fontes ajudam a conferir a resposta.

## Autenticação e disponibilidade

Em Vercel, a função usa o token OIDC renovado no cabeçalho `x-vercel-oidc-token` da requisição da plataforma, consultado apenas quando `VERCEL=1`. Em desenvolvimento, aceita `VERCEL_OIDC_TOKEN` no ambiente. Também aceita uma credencial já configurada em `AI_GATEWAY_API_KEY`. Nenhum token é publicado no cliente. O acesso depende da conta, verificação e saldo/créditos existentes do Gateway; o código não cadastra cartão, compra créditos, cria chave ou altera orçamento. Autenticação OIDC por si só não garante que a conta esteja habilitada para inferência.

Sem serviço de IA, o motor local `dist/assistant.js` continua consultando municípios, anos, meses, chuva, tipos, vias, fases do dia e resultados do estudo, com contexto curto e tratamento de alguns erros de escrita. Essa interpretação tem alcance limitado e a interface informa **Consulta local**, em vez de afirmar que a conversa está usando IA.

No modo IA, perguntas, até seis mensagens anteriores, filtros e contexto agregado são enviados pelo servidor ao Gateway e ao provedor do modelo. O navegador mantém o histórico somente em memória e o envia em cada requisição. O servidor não persiste conversas nem imprime perguntas ou credenciais nos logs. Somente os arquivos públicos agregados são usados; nenhum identificador individual é enviado.

Cada mensagem tem até 2.000 caracteres. O servidor limita o corpo, o histórico, o número de chamadas de ferramentas, os tokens de saída e o tempo de resposta. Há um controle temporário de rajadas por instância; ele não equivale a uma cota durável global nem a um limite financeiro. Os controles de saldo/orçamento existentes da conta continuam aplicáveis.

## Desenvolvimento e publicação

`node dev-server.mjs` serve o painel e a mesma função de chat em `http://127.0.0.1:8879`. Sem credencial local, o chat responde no modo local. Não é necessário instalar pacotes. Uma credencial pode ser configurada no ambiente do processo; nunca deve ser incluída no Git.

O frontend continua em `dist/`. A publicação com a API usa a raiz do repositório e `vercel.json`; `includeFiles` inclui somente o cubo e o relatório necessários. `deploy_files.py` é um auxiliar do pacote estático, sem a função de servidor; não substitui a publicação Git da raiz para o chat com IA.

`node --test tests/assistant.test.cjs tests/analysis.test.cjs tests/research.test.cjs` verifica consultas e fórmulas sem usar serviço externo. `tests/assistant-browser.cjs` verifica conversa, contexto, cancelamento e apresentação móvel em navegador real. Uma validação ao vivo é necessária para confirmar autenticação e disponibilidade do Gateway na implantação.

Documentação utilizada: [OIDC](https://vercel.com/docs/ai-gateway/authentication-and-byok/oidc), [Chat Completions](https://vercel.com/docs/ai-gateway/sdks-and-apis/openai-chat-completions), [ferramentas](https://vercel.com/docs/ai-gateway/sdks-and-apis/openai-chat-completions/tool-calling) e [Node.js na Vercel](https://vercel.com/docs/functions/runtimes/node-js).

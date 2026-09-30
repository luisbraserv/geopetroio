# Auditoria das alterações de setembro de 2026

Data: **09/09/2026**. Período: **01/09 até o HEAD `4b97c84c6f7bac9aa197f4f69791e6fc54c5d404`**, incluindo os ajustes locais do monitoramento do Desktop. Esta auditoria amplia a [correção dos cards](auditoria-desktop-cards-2026-09.md).

**Resultado: há entregas funcionais e testes aprovados, mas a implementação ainda tem falhas de autorização, consistência dos alarmes e interface.** A correção anterior dos cards foi preservada; esta rodada produziu a auditoria, reproduções e evidências, sem publicar uma nova versão.

---

## ✅ Correção dos achados — 2026-09-09, à noite

**Os oito achados foram corrigidos em código, na ordem recomendada ao final deste documento.** O texto
dos achados abaixo fica **como estava**: ele descreve o defeito e é a razão de a correção existir.

| Achado | O que passou a valer | Onde |
|---|---|---|
| **A01** | Conta ativa passa a ser exigida no `CONNECT`, no `SUBSCRIBE`, na publicação **e a cada entrega** — [RN-107](business-rules.md#rn-107--o-corte-de-acesso-vale-também-no-tempo-real) | `WebSocketAuthInterceptor`, `RealtimeOutbound` (novo), `RealtimeController` |
| **A02** | O pico do episódio é gravado numa linha própria, não deduzido dos fatos — [RN-106](business-rules.md#rn-106--o-pico-de-um-episódio-de-alarme-é-gravado-à-parte) | `V2026.09.09.2`, `ExtremoDoEpisodioEntity`, `HistoricoDeAlarmes` |
| **A03** | A transação virou explícita: a projeção só muda **depois do commit**, sob trava por unidade | `MotorDeAlarmes` |
| **A04** | Identidade repetida no ciclo é recusada, e o motor encadeia o estado — [RN-105](business-rules.md#rn-105--um-ciclo-de-tempo-real-carrega-uma-leitura-por-grandeza) | `RealtimeController`, `MotorDeAlarmes` |
| **A05** | ⚠️ Corrigido em 09/09 e **removido em 10/09 junto com a tela**: o achado deixou de existir por ausência de código — ver A05 abaixo | (nada: `ProntidaoService` e a tela não existem mais) |
| **A06** | Respostas passam a ser atadas ao ciclo da seleção; o callback de erro ganhou a guarda que só o de sucesso tinha | `LimitesAlarmePageComponent` |
| **A07** | Parâmetro ausente e parâmetro ilegível respondem **400**, sem vazar o detalhe da conversão | `ApiExceptionHandler` |
| **A08** | Os cenários úteis migraram para o motor atual; o arquivo morto e o comando `test:hydraulics` saíram | `squeeze-hydraulic-simulation.service.spec.ts` |

⚠️ **A05 mudou o significado de um número na tela — e no dia seguinte a tela saiu.** A correção fez
"limites ativos" deixar de contar flags e passar a destacar **quantos vigiam de fato**, com o limite
que só a estação avalia aparecendo como estado próprio (`ALARME_SO_LOCAL`). Isso valeu por um dia:
em 2026-09-10 a Prontidão da Frota foi removida inteira
([`configuracao-da-estacao.md §7`](features/configuracao-da-estacao.md)), **e o achado deixou de
existir por ausência de código, não por conserto**. O parágrafo fica aqui porque descreve o que a
tela precisaria fazer se um dia voltar.

⚠️ **A02 não recupera o passado.** A migração semeia o extremo dos episódios existentes a partir dos
fatos; o pico entre transições daquele período não foi gravado por ninguém e não volta.

### Verificação desta rodada

| Suíte | Resultado |
|---|---|
| Backend, `mvn -B test` | **290 aprovados** (264 no `app`, 26 no `usuario`), sem falhas, erros ou skips — eram 262 |
| Front, `npm test` | **421 aprovados em 46 arquivos** — eram 413 |

⚠️ **[FATO 2026-09-10] Os números acima são os de 09/09 e não valem mais**, pela remoção da Prontidão
da Frota no dia seguinte: Backend em **280** (254 no `app`, os 10 de `ProntidaoServiceTest` saíram
com o serviço) e Front em **412 em 45 arquivos** (os 9 de `prontidao-frota-page.component.spec.ts`
saíram com a tela). Ambas as suítes seguem **sem falhas**. Ficam registrados os dois números porque
esta seção documenta a rodada de 09/09.

⚠️ **O comando de teste do Front é `ng test`, não `vitest`.** O alvo em `angular.json` é
`@angular/build:unit-test`, e é ele que monta o ambiente jsdom, os globais, o `zone.js`, o
`@angular/compiler` e o `TestBed.initTestEnvironment` — por isso não há `vitest.config` nem arquivo
de setup no repositório. Chamar `npx vitest run` direto pula tudo isso e produz **38 falhas em 28
arquivos** que não são defeito nenhum (`JIT compilation failed for injectable [class
PlatformLocation]`, `describe is not defined`, `localStorage is not defined`). Registrado aqui porque
o resultado é convincente e leva a concluir que a suíte está quebrada quando ela está verde.
| Front, `npm run build` | Aprovado; os mesmos avisos de bundle (525,02 kB) e de CSS já registrados |

Os testes novos partem dos cenários reproduzidos nesta auditoria: rollback real da transação do
serviço, identidade repetida no ciclo, reinício depois do pico, conta desativada no `CONNECT` e na
entrega, 409 atrasado de outra sonda e `400` nos parâmetros do histórico.

⚠️ **Não foram executados contra o código anterior.** Vários deles nem compilariam ali — dependem de
colaboradores que a correção introduziu (a linha de extremo, a transação explícita, a guarda de
saída). Os que descrevem comportamento puro e rodariam nos dois lados são os de identidade repetida no
ciclo e o do 409 atrasado; **os demais são cobertura do comportamento novo, não prova do defeito
antigo**. A prova do defeito antigo continua sendo a das reproduções em
[`deploy/dev/audit-september/`](../deploy/dev/audit-september/), feitas antes da correção.

⚠️ **O que esta rodada NÃO fez:** subir os serviços, validar login real, exercitar STOMP/MQTT ao vivo
ou executar o Desktop. As limitações de disponibilidade registradas abaixo **continuam valendo** — o
que se provou aqui é o comportamento sob teste automatizado.

---

## Escopo e método

- **41 commits alcançáveis** na linha de ancestrais do HEAD durante setembro. Commits substituídos por `amend` não foram contados novamente.
- Base anterior ao mês: `cf532537c4ffa191267436c45b07081a23f3de36`. A consolidação do monorepo em 03/09 é `47d9df2a5810e5ababa3db687e246124289c0da3`.
- Foram inventariados 775 caminhos diferentes da base anterior. Isso inclui a importação dos projetos; **não significa 775 arquivos revisados linha por linha**. Comparando os blobs do HEAD com os existentes na importação, 445 caminhos têm conteúdo diferente, incluindo documentação, configuração e renomeações textuais.
- Revisão dirigida aos fluxos alterados e seus contratos: identidade, cadastros, Flyway, recuperação/SMTP, simulador, cards, configuração remota, leitura/publicação, alarmes, prontidão e telas correspondentes.
- Inventário verificável: [histórico e alterações locais](../deploy/dev/audit-september/history.json) e [conteúdos diferentes da importação](../deploy/dev/audit-september/changed-since-import.json). Como `git` não está disponível no PATH, a coleta leu os objetos Git locais; não alterou o repositório.
- Os testes isolados de defeitos usam objetos em memória, conta fictícia e falha de transação injetada. Não alteram usuários, limites ou leituras reais.

## Achados prioritários

### A01 — Alta: conta desativada continua autorizada no tempo real

**Regra afetada:** RN-062, corte de acesso após desativação.

O HTTP verifica `ContaAtivaVerificador`. O `CONNECT` do WebSocket verifica a validade do JWT, mas não o status da conta. O `SUBSCRIBE` e a autorização de publicação consultam `usuarioPossuiAcessoAUnidade`, que também não verifica o status. As guardas de saída cobrem configuração/cards, não o tópico de tempo real.

**Reprodução:** conta fictícia `INATIVO`, perfil `SONDA`, token considerado ainda válido: `CONNECT=true`, `SUBSCRIBE=true` e autorização por unidade `true`. Uma assinatura já aberta também não ganha uma verificação de status a cada entrega de tempo real.

**Impacto:** desativar a conta corta as requisições HTTP, mas não garante o corte de leitura/publicação por esse canal.

**Código:** [WebSocketAuthInterceptor](../Geopetro-Backend/app/src/main/java/com/geopetro/realtime/WebSocketAuthInterceptor.java), linhas 88–124; [SondaMonitoramentoService](../Geopetro-Backend/app/src/main/java/com/geopetro/monitoramento/SondaMonitoramentoService.java), método `usuarioPossuiAcessoAUnidade`; [WebSocketConfig](../Geopetro-Backend/app/src/main/java/com/geopetro/realtime/WebSocketConfig.java), interceptores de saída.

**Correção necessária:** aplicar a mesma regra de conta ativa ao conectar, publicar e entregar tempo real; revalidar o escopo das assinaturas existentes. Testar desativação e revogação de acesso depois da assinatura, além do CONNECT inicial.

**Evidência:** [reprodução WebSocket](../deploy/dev/audit-september/websocket-probe.log).

### A02 — Alta: o histórico e a reconstrução perdem o pico medido do alarme

**Contrato afetado:** `valorExtremo` do episódio e reconstrução da projeção a partir do log.

O estado em memória acompanha o extremo em cada leitura, mas os eventos persistidos guardam apenas o valor na transição. Uma leitura mais extrema sem mudança de severidade não deixa esse extremo no log. No fechamento normal, grava-se o valor de retorno à faixa. A reconstrução usa o valor do último fato, e o histórico calcula o extremo somente entre os fatos.

**Reprodução:** máximo crítico 120; leituras `130 → 200 → 90`. O episódio abre em 130, chega a 200 e fecha em 90. O histórico apresenta **130** como extremo. Reiniciar depois da leitura 200 também reduz a projeção de **200 para 130**.

**Impacto:** o histórico pode subestimar a excursão, mesmo quando todas as leituras chegaram corretamente ao servidor.

**Código:** [AvaliadorDeAlarme](../Geopetro-Backend/app/src/main/java/com/geopetro/alarmes/AvaliadorDeAlarme.java), criação do evento na linha 104; [EpisodioAlarme](../Geopetro-Backend/app/src/main/java/com/geopetro/alarmes/EpisodioAlarme.java), `extremo`; [MotorDeAlarmes](../Geopetro-Backend/app/src/main/java/com/geopetro/alarmes/MotorDeAlarmes.java), reconstrução na linha 200.

**Correção necessária:** definir e persistir a informação necessária para recuperar o extremo sem confundi-lo com o valor que provocou a transição. A solução precisa contemplar episódios ainda abertos e reinícios, não apenas o FECHOU.

**Evidência:** [reprodução de alarmes](../deploy/dev/audit-september/alarm-probe.log).

### A03 — Alta: rollback pode deixar alarme na memória sem evento persistido

`MotorDeAlarmes.avaliar` é transacional, mas `gravar` executa `estados.putAll` antes de a transação externa confirmar. `saveAll` concluir não prova que o commit terminou.

**Reprodução:** motor chamado por proxy transacional Spring, com falha injetada no commit: **zero eventos persistidos e um alarme ativo**. A próxima leitura na mesma severidade pode não gerar outro ABRIU, porque a memória considera que ele já aconteceu.

**Impacto:** tela e histórico divergem; a recuperação prometida no comentário “a próxima leitura tenta de novo” não vale para falhas na confirmação da transação.

**Código:** [MotorDeAlarmes](../Geopetro-Backend/app/src/main/java/com/geopetro/alarmes/MotorDeAlarmes.java), linhas 83 e 143–149. Os testes atuais instanciam o motor com `new`, não exercitando a transação do serviço por proxy.

**Correção necessária:** coordenar publicação da projeção com o commit e proteger a avaliação por unidade contra concorrência. Testar rollback real da transação do serviço, além de falha do método do repositório.

**Evidência:** [reprodução com falha de commit](../deploy/dev/audit-september/alarm-probe.log). O teste simula a falha; não derruba o MySQL real.

### A04 — Média: identidades repetidas no mesmo ciclo abrem episódios duplicados

Cada leitura consulta `estados.get(chave)`, enquanto as alterações do ciclo ficam acumuladas em outro mapa. Duas leituras da mesma identidade no primeiro ciclo enxergam o estado anterior vazio e abrem episódios diferentes. O controller não recusa identidades repetidas no payload.

**Reprodução:** duas leituras de `PRESSAO_01`, ambas 130, no mesmo ciclo: **dois ABRIU com IDs distintos e somente um estado ativo**. Um dos episódios fica sem estado correspondente para fechar normalmente.

**Código:** [MotorDeAlarmes](../Geopetro-Backend/app/src/main/java/com/geopetro/alarmes/MotorDeAlarmes.java), linha 100; [RealtimeController](../Geopetro-Backend/app/src/main/java/com/geopetro/realtime/RealtimeController.java), `receberEstado`.

**Correção necessária:** validar a unicidade de `(dispositivoId, serie)` no ciclo e estabelecer uma política explícita para repetição. A ordenação por sessão STOMP também não equivale a exclusão mútua entre duas sessões da mesma unidade.

**Evidência:** [reprodução de duplicação](../deploy/dev/audit-september/alarm-probe.log). O produtor regular tende a enviar uma leitura por identidade; o cenário reproduz um payload repetido aceito pela API.

### A05 — Média: Prontidão pode indicar vigilância que não existe

> ⚠️ **[FATO 2026-09-10] Este achado deixou de existir por ausência de código, não por conserto.**
>
> A correção entrou em 2026-09-09 — `ProntidaoService` passou a cruzar os limites ativos com as
> grandezas efetivamente lidas e publicadas. No dia seguinte a **tela inteira foi removida**
> ([`configuracao-da-estacao.md §7`](features/configuracao-da-estacao.md)): sem mutirão de migração
> espalhado no tempo, não havia pergunta para ela responder.
>
> Foram embora o controller, o serviço, `ProntidaoDaUnidade`, a tela, o `prontidao.service.ts` do
> Front, e os `Resumo`/`resumos()` de `CardsDeclarados` e `LimitesDeclarados` — que só ela usava.
>
> **Registrado assim de propósito:** um "✅ corrigido" aqui faria parecer que a contagem passou a
> cruzar as grandezas em algum lugar que ainda existe. Não passou — não há mais onde. Se a tela
> voltar, o achado volta com ela, e o texto abaixo continua valendo como especificação do que ela
> precisa fazer.


`LimitesDeclarados.resumos` conta todos os limites com `ativo=true`, sem cruzá-los com os cards ativos/visíveis e suas séries. O Front classifica como `PRONTA` quando há algum card ativo e algum limite ativo, mesmo que não correspondam.

**Cenário deduzido diretamente do código:** `PRESSAO_01` ativo e sem limite; `PESO_01` desativado e com limite marcado ativo. A resposta tem `cardsAtivos=1` e `limitesAtivos=1`, então a tela indica `PRONTA`, embora nenhuma grandeza lida esteja vigiada. Card invisível também pode ser contado como vigilância remota, apesar da assimetria documentada.

**Código à época:** [LimitesDeclarados](../Geopetro-Backend/app/src/main/java/com/geopetro/configuracaosonda/LimitesDeclarados.java), linha 54; `ProntidaoService` e `prontidao.service.ts`, removidos com a tela de Prontidão da Frota.

**Correção necessária:** cruzar limites com identidades de grandezas efetivamente habilitadas e distinguir cobertura local/remota. Não basta contar documentos ou flags independentes. **Achado por análise estrutural; não foi reproduzido na interface em execução.**

### A06 — Média: conflito atrasado de outra sonda deixa a tela de limites carregando

O seletor permite trocar de unidade durante um salvamento. O callback de sucesso confere a seleção atual, mas o callback de erro não faz a mesma checagem antes de tratar o HTTP 409.

**Reprodução:** salvar unidade 1, selecionar e carregar unidade 2, receber 409 do salvamento da unidade 1. O componente solicita novamente a unidade 1 e liga `carregando`. Ao receber essa resposta, a guarda percebe que a seleção atual é 2 e retorna sem desligar o carregamento. A unidade 2 fica escondida pelo indicador de espera.

**Código:** [LimitesAlarmePageComponent](../Geopetro-Front/src/app/features/monitoramento/pages/limites-alarme-page/limites-alarme-page.component.ts), linhas 206–229 e 142–146.

**Correção necessária:** vincular respostas ao ciclo da seleção/requisição; ignorar sucesso e erro de operações antigas antes de alterar os sinais da tela. Cobrir também a sequência de seleção A → B → A.

**Evidência:** [reprodução do Front](../deploy/dev/audit-september/frontend-probe.log), executando os métodos extraídos do código atual com sinais e respostas controlados; não é teste visual de navegador.

### A07 — Média: parâmetros inválidos do histórico retornam HTTP 500

`ApiExceptionHandler` não trata especificamente parâmetro obrigatório ausente e erro de conversão de parâmetro. O handler genérico de `Exception` devolve 500.

**Reprodução via MockMvc:** `GET /api/sondas/1/alarmes/historico` sem período e a mesma rota com `inicio=invalid`: ambos **500**, quando o erro de entrada deveria ser **400**.

**Impacto:** erros corrigíveis na chamada são apresentados como falha interna; clientes não conseguem distinguir adequadamente entrada inválida de indisponibilidade.

**Código:** [ApiExceptionHandler](../Geopetro-Backend/app/src/main/java/com/geopetro/config/ApiExceptionHandler.java), linha 56; [AlarmesController](../Geopetro-Backend/app/src/main/java/com/geopetro/alarmes/AlarmesController.java), parâmetros do histórico.

**Correção necessária:** tratar as exceções de binding/conversão com 400 e preservar o contrato de erro; incluir esses casos nos testes HTTP.

**Evidência:** [reprodução HTTP isolada](../deploy/dev/audit-september/alarm-probe.log). Não depende da disponibilidade da porta 8080.

### A08 — Média, preexistente: a suíte separada de hidráulica não executa

`npm run test:hydraulics` termina com código 1 antes de rodar qualquer teste: `tests/hydraulics.spec.js` importa `../public/simulador/js/shared/hydraulics.js`, que não existe.

**Origem:** a árvore importada em 03/09 já continha o teste sem o módulo importado. Não é uma regressão atribuída às alterações de alarmes.

**Código à época:** `tests/hydraulics.spec.js`, removido posteriormente; script no [package.json](../Geopetro-Front/package.json).

**Correção necessária:** migrar os cenários úteis para os motores atuais e integrar a execução à verificação normal; não basta remover o comando ou criar um arquivo vazio para deixá-lo verde.

**Evidência:** `Geopetro-Front/audit-month-hydraulics.log`: uma suíte falhou, zero testes executados. Isso não invalida os 413 testes Angular aprovados, mas impede afirmar que todos os comandos de teste do Front funcionam.

## Confronto das entregas com as specs

| Frente de setembro | Código e verificação observados | Resultado da auditoria |
|---|---|---|
| Geometria de poço, survey, metros/pés e referência por cenário | Validador no Backend, persistência e bloqueio por versão; formulários, geometria e receitas no Front; suítes correspondentes aprovadas | Implementado no escopo testado. Sem certificação física dos cálculos ou homologação do relatório em operação |
| Senhas, desativação, tipo de unidade, retirada de vínculos organizacionais | Política central, filtros HTTP e cadastros; testes de identidade e domínio aprovados | Implementação HTTP presente; RN-062 incompleta no tempo real, A01 |
| Exclusão com referências, incluindo telemetria | Guarda de exclusão, consulta de existência e testes de indisponibilidade | Cobertura automatizada passou; CRUD contra os serviços em uso não foi validado nesta rodada |
| Flyway e SUPORTE | Migrations e autorização; dez testes de migration MySQL aprovados no schema de teste | Não prova que uma instalação em produção já executou as migrations. A migration de eventos de 09/09 está incluída no teste de base nova |
| Prefixo `/api`, recuperação e SMTP | Rotas, token de recuperação, consumo único, expiração, configuração cifrada e testes | Cobertura aprovada. Não foi enviado e-mail real nem feito teste com provedor SMTP externo |
| Cards e canal de configuração | Revisões independentes, validação, publicação após commit e cache local | Ajustes anteriores do monitoramento corrigem renderização e restauração offline; ver relatório específico |
| Leitura por bloco, conversão por card e séries de stroke | Projeção dinâmica, filtros por série, serialização e consumo MQTT | Testes do Desktop/Telemetria aprovados. Leitura de CLP real e faixa analógica continuam exigindo verificação em campo |
| Limites, avaliação, destaque e histórico de alarmes | Código presente em Backend, Front e Desktop; suites existentes aprovadas | Falhas A02–A07 mostram lacunas não cobertas pelas suites existentes |
| Prontidão da frota | ⚠️ **Removida em 2026-09-10** (`configuracao-da-estacao.md §7`) | Não há mais o que verificar; OQ-049 volta a ficar sem resposta |
| Horus | Após a importação, alterações de conteúdo em spec, `carta.operacao.fxml` e CSS; handlers FXML referenciados existem | Revisão estática de layout e vínculos; sem execução/homologação visual do Horus nesta rodada |
| Renomeação e scripts de ambiente | Caminhos atuais e build Front verificados | Serviços locais indisponíveis na checagem final; não confundir build aprovado com serviço publicado |

## Testes e disponibilidade

| Verificação | Resultado | Evidência |
|---|---|---|
| Backend, `mvn -B test` | **262 aprovados**: 236 no `app` e 26 no `usuario`; sem falhas, erros ou skips | `Geopetro-Backend/target/audit-month-tests.log`, término 16:40 de 09/09 |
| Front, `npm test -- --watch=false` | **413 aprovados em 46 arquivos** | `Geopetro-Front/audit-month-tests.log`, execução 18:40 |
| Front, `npm run build` | **Aprovado**; bundle inicial 525,02 kB para orçamento de 500 kB e avisos de CSS de squeeze/tampão | `Geopetro-Front/audit-month-build.log` |
| Front, `npm run test:hydraulics` | **Falhou antes dos testes**, módulo ausente | `Geopetro-Front/audit-month-hydraulics.log` |
| Telemetria, `mvn -B test` | **28 aprovados**, sem falhas, erros ou skips | `Geopetro-Telemetria/target/audit-month-tests.log`, término 18:41 |
| Desktop, execução da correção anterior, `-Dfx.disponivel=true` | **215 aprovados**, incluindo JavaFX; regressões/layout verificados novamente após os ajustes finais | `Geopetro-Desktop/target/audit-monitoring-tests.log`, `audit-monitoring-regression.log` e `audit-monitoring-layout.log`; não contado como nova execução desta rodada |
| Reproduções de auditoria | A01, A02, A03, A04, A06 e A07 reproduzidos isoladamente | [fontes e logs](../deploy/dev/audit-september/) |

Os **918 casos aprovados nas quatro suites principais** incluem a execução anterior do Desktop. Eles não incluem as reproduções que demonstram os defeitos nem tornam a suíte de hidráulica aprovada. Relatórios antigos de Surefire podem continuar em `target`; a contagem do Backend foi obtida dos resumos da execução atual, não da soma indiscriminada dos XML existentes.

A primeira tentativa da Telemetria foi bloqueada pela revisão automática por limite de uso; posteriormente a execução foi autorizada e concluída. O Front também precisou de execução fora do sandbox após erros de acesso aos diretórios de fontes. **Esses bloqueios de teste foram superados.**

**Disponibilidade local:** na consulta de 18:45 e na confirmação posterior, `localhost:4200`, `localhost:8080` e `localhost:8081` não responderam. A checagem de listeners/processos fora do sandbox também não encontrou os serviços nessas portas. `curl` em `127.0.0.1:8080` retornou conexão recusada. [Evidência HTTP](../deploy/dev/audit-september/live.json).

Portanto, **não há validação ao vivo de login, CRUD, histórico ou publicação STOMP nesta rodada**. A tentativa de login não chegou ao servidor; não é evidência de senha inválida. Os HTTP 400/500 descritos nos achados vieram de testes isolados do controller. Os resultados positivos de disponibilidade registrados na auditoria anterior são históricos.

## Pendências das specs e divergências documentais

1. **Buffer persistente de telemetria:** ainda há fila em memória com descarte quando enche em `TelemetriaMqttService`, linhas 87–89. Cache de configuração não é armazenamento de leituras pendentes. A decisão de não aceitar perda em falha de MQTT ainda exige implementação/homologação.
2. **Auto-update do Desktop:** permanece pendente. A presença do alarme local no código não demonstra distribuição às unidades da frota.
3. **Retenção de telemetria:** a implantação fornecida inicializa 7 dias em dev e 90 dias como padrão na VM2, enquanto as specs mencionam histórico por cinco anos. É divergência dos arquivos de provisionamento; o bucket efetivamente instalado não foi consultado. Alterar a variável de inicialização, sozinho, não comprova migração de um bucket existente.
4. **Assimetria dos cards invisíveis:** alarme local pode existir sem alarme remoto, conforme decisão expressa em `alarmes.md`. Foi tratada como comportamento documentado, não como bug novo. A05 trata da classificação equivocada na prontidão.
5. **Documentação defasada:** ✅ **corrigida em 09/09.** `features/alarmes.md` §5 dizia que tela e avaliação estavam pendentes, embora o cabeçalho registrasse entrega em 09/09; `technical-debt.md` indicava que a migration de eventos não fora escrita; `Geopetro-Front/specs/simulador/geometria-poco.md` descrevia como *working tree* arquivos já commitados. Os três textos passaram a distinguir o registro histórico datado do estado vigente, em vez de serem apagados.
6. **Validação operacional:** faixa analógica do CLP, alarmes com hardware real, entrega presencial/automática e continuidade sob queda de conexão não foram homologados por esses testes de software.

## Ordem recomendada de correção e encerramento

1. Fechar A01 e testar uma sessão já conectada depois da desativação/revogação.
2. Corrigir A02/A03/A04 em conjunto, com testes de persistência, reinício, rollback e identidade repetida; conferir concorrência entre sessões da mesma unidade.
3. Corrigir A05/A06/A07, testando a cobertura real de grandezas, respostas atrasadas e chamadas inválidas.
4. Recuperar os cenários úteis de A08 e atualizar o estado vigente das specs, preservando os registros históricos datados.
5. Com os serviços iniciados e as migrations conferidas no ambiente de destino, validar login e endpoints autenticados, configuração → Desktop → STOMP/MQTT → histórico e alarmes. Depois, homologar com CLP real.

As reproduções podem ser repetidas por [run-probes.ps1](../deploy/dev/audit-september/run-probes.ps1), depois de compilar/testar o Backend e instalar as dependências do Front. Elas **passam quando o defeito atual é reproduzido**; são evidências de auditoria, não testes de regressão afirmando que esse comportamento é desejado.

Execução conjunta conferida às 18:54: [log consolidado](../deploy/dev/audit-september/probes-combined.log). Nesta máquina, a política padrão impede carregar scripts; a execução foi feita com `powershell.exe -NoProfile -ExecutionPolicy Bypass -File deploy/dev/audit-september/run-probes.ps1`, limitado àquele processo, sem alterar a política permanente.

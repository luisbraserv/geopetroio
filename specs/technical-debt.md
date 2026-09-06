# Dívida Técnica e Inconsistências — GeopetroIO

> Levantamento por engenharia reversa · 2026-08-26 · ver [convenção de marcação](README.md#convenção-de-marcação)
>
> Falhas de segurança estão em documento separado: [`security-findings.md`](security-findings.md).

## Sumário por severidade

| ID | Item | Aplicação | Severidade | Estado |
|---|---|---|---|---|
| [DT-001](#dt-001--código-fonte-perdido-de-almoxarifado-e-compras) | Código-fonte perdido (almoxarifado/compras) | Backend | **Crítica** | Registro histórico |
| [DT-002](#dt-002--estratégias-conflitantes-de-evolução-de-schema) | Estratégias conflitantes de schema | Backend | **Crítica** | Parcialmente resolvido |
| [DT-003](#dt-003--telemetria-capturada-mas-nunca-persistida) | Telemetria capturada e descartada | Sistema | **Crítica** | ✅ Resolvido |
| [DT-004](#dt-004--risco-de-onedrive-sobre-repositórios-git) | OneDrive corrompendo repositórios Git | Todas | **Crítica** | Aberto |
| [DT-005](#dt-005--módulos-de-backend-sem-interface) | Módulos de backend sem interface | Backend | Alta | ✅ Resolvido |
| [DT-006](#dt-006--químico-desconectado-do-modelo-relacional) | Químico fora do modelo relacional | Backend | Alta | ✅ Eliminado |
| [DT-007](#dt-007--ausência-de-testes-em-áreas-críticas) | Ausência de testes em áreas críticas | Backend | Alta | Aberto |
| [DT-008](#dt-008--patch-que-não-é-parcial) | PATCH que não é parcial | Backend | Alta | Aberto |
| [DT-009](#dt-009--documentação-divergente-do-código) | Documentação divergente do código | Desktops | Alta | Aberto |
| [DT-010](#dt-010--duplicação-entre-os-dois-desktops) | Duplicação entre os dois desktops | Desktops | Média | Aceita |
| [DT-011](#dt-011--divergência-de-roles-backend--frontend) | Divergência de roles backend↔frontend | Backend/Front | Média | ✅ Resolvido |
| [DT-012](#dt-012--dois-formatos-de-erro-na-api) | Dois formatos de erro na API | Backend | Média | Aberto |
| [DT-013](#dt-013--seed-de-dados-sintéticos-sem-guarda) | Seed sintético sem guarda de ambiente | Desktop-Sonda | Média | Aberto |
| [DT-014](#dt-014--simulador-sem-validação-de-entrada) | Simulador sem validação de entrada | Front | Média | Aberto |
| [DT-015](#dt-015--código-morto-inventário) | Código morto (inventário) | Todas | Baixa | Parcialmente resolvido |
| [DT-016](#dt-016--inconsistências-de-organização-de-projeto) | Organização de projeto | Backend | Baixa | Aberto |

---

## DT-001 · Código-fonte perdido de almoxarifado e compras

**Severidade: Crítica** · **[DECIDIDO 2026-08-26]** módulos descontinuados · Registro histórico

### O que foi encontrado [FATO]

A pasta `almoxarifado/` **não era um módulo Maven** e continha apenas diretórios vazios.
`git log --all -- almoxarifado` retorna **zero commits**.

Porém, artefatos de build locais (gitignorados) provam que existiu implementação completa:

**`almoxarifado/target/almoxarifado-0.0.1-SNAPSHOT.jar` — 27 classes compiladas:** controllers,
requests/responses, entidades, repositórios JPA com projeção, services, enum.

**`app/target/surefire-reports/` — 33 testes passando, 0 falhas**, revelando regras de negócio:
- `deveBloquearExclusaoDeAlmoxarifadoComItens` · `deveBloquearExclusaoDeCategoriaComItens` · `deveBloquearExclusaoDeItemComMovimentacoes`
- `deveRegistrarEntradaSomandoEstoque` / `deveRegistrarSaidaSubtraindoEstoque`
- **`deveLancarExcecaoAoRegistrarSaidaComSaldoInsuficiente`**
- `deveLancarExcecaoAoRegistrarSaidaParaUsuarioNaoInterno` · `deveGerarResumoPreenchendoDiasSemMovimentacao`

**Bônus — `com.geopetro.compra`, nunca visto em nenhum código-fonte**, com 19 testes passando,
revelando aprovação multinível por faixa de valor: `deveExigirNiveis1e2ParaPedidoAteOLimite` ·
`deveExigirNiveis2e3ParaPedidoAcimaDoLimite` · `deveBloquearMesmoUsuarioEmDuasEtapas` ·
`deveExigirObservacaoParaReprovar` · `deveBloquearFornecedorInativo`.

### O que isso significa

Trabalho **funcional e testado** de dois módulos se perdeu. Sobraram apenas binários. O classpath nos
relatórios aponta para um caminho **sem** a pasta `GeopetroIO` — **[INFERÊNCIA]** os artefatos precedem
uma reorganização de pastas, e o código nunca foi commitado antes dela.

### Lição estrutural

Custo concreto de [DT-004](#dt-004--risco-de-onedrive-sobre-repositórios-git) somado a trabalho não
commitado. O `.gitignore` sempre excluiu `target/` — corretamente. O erro foi o código nunca ter
entrado no Git.

**[FATO]** As classes compiladas ainda existem em disco e são descompiláveis, caso a decisão mude.

---

## DT-002 · Estratégias conflitantes de evolução de schema

**Severidade: Crítica** · Backend-Sonda · **Parcialmente resolvido**

**[FATO]** Conviviam **três** mecanismos. Um foi eliminado em 2026-08-26:

| # | Mecanismo | Estado |
|---|---|---|
| 1 | Hibernate `ddl-auto` (`update` em dev, `validate` em prod) | Ativo |
| 2 | Scripts SQL manuais em `db/migration/V*.sql` | Ativo — **sem execução automática** |
| 3 | ~~`ProcessoSchemaInitializer`~~ | ✅ **Removido** com o módulo `processo` |

**[FATO] Não há Flyway nem Liquibase.** Os scripts imitam a convenção Flyway (`V<data>__desc.sql`) sem
o mecanismo. O cabeçalho de `V2026.06.02` avisa: *"O projeto NAO usa Flyway/Liquibase... Rode
manualmente em producao ANTES de subir a aplicacao"*.

### O que melhorou

O mecanismo 3 era o pior dos três: um `ApplicationRunner` que executava `ALTER TABLE processos` a cada
startup, com falhas engolidas em log `debug` — DDL em runtime num ambiente configurado para apenas
validar. Saiu junto com o módulo.

### ⚠️ Fila de mudanças manuais criada em 2026-09-05

A entrevista de produto decidiu **cinco alterações de schema**. Sem Flyway e com `ddl-auto=validate` em
produção, **todas exigem script manual executado antes do deploy** — e a aplicação não sobe se faltar
uma:

| # | Mudança | Origem |
|---|---|---|
| 1 | ✅ **Script pronto 2026-09-06** — `ALTER TABLE unidades_sondas`, coluna `tipo` com backfill `SONDA` e depois NOT NULL. Não aplicado em produção | [RN-065](business-rules.md#rn-065--unidadesonda-tem-tipo) · [`2026-09-06-unidade-sonda-tipo.sql`](../Backend-Sonda-Geopetro-IO/db/migrations/2026-09-06-unidade-sonda-tipo.sql) |
| 2 | ✅ **Script pronto 2026-09-06** — `DROP` de `usuario_interno_regionais`, `usuario_interno_setores` e da coluna `regional_id`. ⚠️ Descarta dados sem volta. Não aplicado em produção | [RN-064](business-rules.md#rn-064--o-usuário-não-tem-mais-vínculo-organizacional) · [`2026-09-06-usuario-sem-vinculo-organizacional.sql`](../Backend-Sonda-Geopetro-IO/db/migrations/2026-09-06-usuario-sem-vinculo-organizacional.sql) |
| 3 | Tabelas de **limite** e **log de eventos** de alarme | [RN-071](business-rules.md#rn-071--o-alarme-tem-dois-níveis-atenção-e-crítico) · [RN-076](business-rules.md#rn-076--o-alarme-é-registrado-como-sequência-de-fatos) |
| 4 | **Poço** com geometria e trajetória tipadas em JSON, mais `simulador_cenarios.poco_id`. Script pronto; estrutura criada no MySQL local, aplicação em produção pendente | [RN-059](business-rules.md#rn-059--a-geometria-pertence-ao-poço-não-ao-cenário) · [migration](../Backend-Sonda-Geopetro-IO/db/migrations/2026-09-05-simulador-pocos.sql) · [registro de execução](../Backend-Sonda-Geopetro-IO/specs/simulador-pocos.md#banco) |
| 5 | `DROP` das tabelas órfãs dos módulos removidos | [OQ-026](open-questions.md#oq-026--o-que-fazer-com-as-tabelas-órfãs) |

**Por que isto agrava DT-002:** até aqui a fila manual era histórica — scripts antigos já aplicados. A
partir de hoje ela é **corrente**, com cinco itens acumulados de uma vez, numa operação conduzida por
**uma pessoa** e **sem backup do MySQL** ([product-context §11](product-context.md#11-fechamentos-das-rodadas-3-a-6)).
Um erro de ordem ou um script esquecido derruba a subida da aplicação.

⚠️ O `deploy/mysql-init/01-schema.sql` também precisa ser regerado — ele é gerado a partir das
entidades JPA, e todas as cinco mudanças alteram entidades.

**[FATO 2026-09-06]** Os itens 1, 2 e 4 têm script escrito; o baseline foi ajustado à mão nas três
frentes. **Nenhum foi aplicado em produção.** A ordem entre eles é livre — não há dependência —, mas
os dois novos precisam rodar antes da subida da aplicação. Restam sem script os itens 3 (alarmes) e
5 (tabelas órfãs).

### O que permanece

- Em produção (`validate`), a aplicação **não sobe** se o DBA não executar manualmente, na ordem certa: `migration-regional.sql` → `V2026.06.02` → `V2026.06.03` → `V2026.06.04` → `V2026.06.15`.
- **[FATO]** `migration-regional.sql` tem passos de limpeza **comentados** com instrução *"após validar os dados"*. Sem registro de execução — [OQ-015](open-questions.md#oq-015--as-colunas-legadas-ainda-existem-em-produção).
- ⚠️ **Novo:** as migrations existentes referenciam tabelas de módulos removidos (`projetos`, `processos`, `usuario_interno_setores`). Elas continuam válidas historicamente, mas um ambiente novo criaria tabelas sem uso.

**Recomendação:** adotar Flyway (os scripts já estão no formato e são idempotentes) e criar uma
migration de baseline refletindo o escopo atual.

---

## DT-003 · Telemetria capturada mas nunca persistida

**Severidade: Crítica** · ✅ **Resolvido em 2026-08-27**

### O problema

```
Desktop-Sonda ──publica──► Broker MQTT ──►   ???   ──► Backend-Sonda ──► Front
  (funcionava)            (funcionava)     (vazio)      (pronto)       (pronto)
```

Os dois extremos funcionavam e o cliente REST do Backend-Sonda já estava implementado. **Faltava o
meio.** Nenhum dado de telemetria era persistido, e a tela de Monitoramento sempre retornava `502`.
Era a maior lacuna funcional do sistema.

### Como foi resolvido

**[DECIDIDO 2026-08-26]** Papéis definidos: `Desktop-Sonda` é o **produtor**,
`Backend-Telemetria-Sonda-Geopetro-io` é o **consumidor**. O consumidor no-op do Backend-Sonda
(`MonitoramentoTelemetriaService.processar`, que apenas logava) foi removido junto com a dependência
Paho e as propriedades `mqtt.*` — não para resolver o problema, mas para **esclarecer de quem era a
responsabilidade**.

**[FATO 2026-08-27]** O Backend-Telemetria foi implementado: consumidor MQTT, persistência em
InfluxDB e API REST de consulta. 24 testes passando. Ver
[`Backend-Telemetria-Sonda-Geopetro-io/specs/`](../Backend-Telemetria-Sonda-Geopetro-io/specs/).

### Pendências operacionais remanescentes

O código existe; a operação ainda não:

| Item | Referência |
|---|---|
| Provisionar broker MQTT e InfluxDB | — |
| Definir `INFLUX_TOKEN` (sem default, falha no startup) | — |
| Autenticação no broker | [SEC-009](security-findings.md#sec-009--broker-mqtt-sem-autenticação) |
| Criar o repositório Git do serviço | [DT-004](#dt-004--risco-de-onedrive-sobre-repositórios-git) |
| Política de retenção do InfluxDB | [`rest-monitoramento.md`](contracts/rest-monitoramento.md#6-pontos-em-aberto) |
| Migrar o produtor para o formato alvo | [`mqtt-telemetria.md §9`](contracts/mqtt-telemetria.md#9-migração-a-partir-do-formato-atual) |

⚠️ **Nova dívida introduzida:** não há teste de integração com InfluxDB real —
`InfluxTelemetriaRepository`, incluindo a montagem do Flux e o cálculo da janela de agregação, não é
exercitado por nenhum teste. Um Testcontainer fecharia a lacuna.

---

## DT-004 · Risco de OneDrive sobre repositórios Git

**Severidade: Crítica** · Todas as aplicações

**[FATO]** Todo o workspace está sob `OneDrive - BRASERV PETROLEO LTDA`. Verificação via
`Get-ChildItem -Force` mostra atributo NTFS `ReparsePoint` (Files On-Demand) em **todos** os arquivos,
incluindo o interior dos diretórios `.git`.

### Dano observado [FATO]

Três manifestações distintas, todas verificadas durante este levantamento:

1. **Perda de repositório.** O `.git` do projeto de telemetria perdeu `HEAD`, `index`, `packed-refs`, **todos os objetos** e todos os hooks. `git status` falha com `fatal: not a git repository`.

2. **Bloqueio de arquivo em build.** `mvnw clean` falhou com `Failed to delete usuario\target\generated-test-sources` — o sincronizador mantinha o diretório aberto.

3. **Caminho excedendo MAX_PATH.** `git diff` falha com `Filename too long` em
   `Front/src/app/features/monitoramento/pages/monitoramento-sonda-page/monitoramento-sonda-page.component.html`.
   O caminho absoluto tem **294 caracteres**, acima do limite de 260 do Windows.

   ⚠️ **Consequência perigosa:** o Git não consegue fazer `stat` no arquivo e o reporta como
   **modificado mesmo estando intacto**. Um `git add -A` seguido de commit pode registrar mudanças
   fantasma — ou pior, mascarar mudanças reais em meio a ruído.

### Causa

**[INFERÊNCIA]** Duas causas somadas:
- O OneDrive interfere em operações atômicas do Git (criação/renomeação de `HEAD` e `index`) e em exclusão de diretórios.
- O caminho base é longo por natureza: `OneDrive - BRASERV PETROLEO LTDA\Braserv - Desenvolvimento-Automacao - Documents\Desenvolvimento APP\GeopetroIO\` consome ~150 caracteres antes de qualquer arquivo do projeto.

É causa provável também da perda documentada em
[DT-001](#dt-001--código-fonte-perdido-de-almoxarifado-e-compras).

### Mitigações

| Prazo | Ação |
|---|---|
| **Definitiva** | ❌ **Recusada 2026-09-05** — mover os repositórios para fora da árvore sincronizada (ex.: `C:\dev\GeopetroIO\`) resolveria as três manifestações de uma vez |
| Paliativa | `git config --global core.longpaths true` (não está definido hoje) — resolve apenas a manifestação 3 |
| Paliativa | ❌ **Recusada 2026-09-05** — excluir `target/`, `node_modules/` e `.git/` da sincronização do OneDrive |

### ⏳ Risco aceito em 2026-09-05

**[DECIDIDO 2026-09-05]** Os repositórios **ficam onde estão**, e nenhuma das mitigações será aplicada.
Ver [OQ-025](open-questions.md#oq-025--os-repositórios-podem-sair-do-onedrive).

⚠️ **[FATO observado 2026-09-05]** Durante a própria entrevista que registrou esta decisão, o OneDrive
impediu leitura de arquivos **duas vezes**: `git status` falhou com `read error ... Invalid argument` e
`mmap failed` em 16 arquivos do Backend-Telemetria, e um `grep` recebeu `Permission denied` em arquivos
do simulador. O comportamento é corrente, não histórico.

**O que segue exposto:** histórico Git dos cinco repositórios, e — de forma mais aguda — **trabalho não
commitado**. Com backup de MySQL também recusado
([product-context §11](product-context.md#11-fechamentos-das-rodadas-3-a-6)), commitar cedo e com
frequência passa a ser a única rede de proteção do código.

**É o risco de maior impacto potencial do levantamento: perda silenciosa de histórico e de código.**
Ver [OQ-025](open-questions.md#oq-025--os-repositórios-podem-sair-do-onedrive).

---

## DT-005 · Módulos de backend sem interface

**Severidade: Alta** · ✅ **Resolvido em 2026-08-26**

**[FATO]** Havia quatro domínios com API REST completa e **nenhuma tela** que os consumisse:
Processos, Anotações, Observações e Químicos — este último o maior módulo do backend, com job
agendado e alertas por e-mail.

✅ **Todos foram removidos** em 2026-08-26. O backend não tem mais nenhum módulo órfão de interface.

**Lição preservada:** o padrão indicava construção de backend antes de definição de produto. Sob SDD,
uma spec de feature deve declarar o consumidor da API antes da implementação.

---

## DT-006 · Químico desconectado do modelo relacional

**Severidade: Alta** · ✅ **Eliminado em 2026-08-26**

**[FATO]** O módulo ignorava o modelo relacional existente:

| Campo | Como estava | Como deveria |
|---|---|---|
| `QuimicoEntity.regional` | enum próprio `{AL, SE, RN, BA, ES, AM, OUTRA}` | FK → `RegionalEntity` |
| `OperacaoSondaEntity.sonda` | String livre | FK → `UnidadeSondaEntity` |
| `dataRecebimento` / `dataValidade` | **String** | `LocalDate` |

O enum próprio **não continha `BRASIL`**, a regional padrão criada pelas migrations — os dois
vocabulários eram incompatíveis.

**[FATO]** Também eliminou a **única violação do grafo de dependências**: `EmailQuimicoService` fazia
SQL nativo contra `usuarios`/`usuario_roles` sem declarar dependência Maven de `usuario`. **O grafo de
dependências entre módulos está hoje íntegro.**

**[INFERÊNCIA]** O módulo nasceu de uma planilha (`Planilha_Quimicos.xlsm`, citada no seed) e foi
encaixado no monólito sem refatoração. **Lição:** integrar ao modelo existente é parte do custo de
adotar um domínio, não um passo opcional.

---

## DT-007 · Ausência de testes em áreas críticas

**Severidade: Alta** · Backend-Sonda · Aberto

**[FATO]** Cobertura no levantamento: **43 testes**, todos unitários, em 7 classes.

**[FATO 2026-09-06]** Hoje são **110** no Backend-Sonda e **27** no Backend-Telemetria. Duas lacunas
fecharam parcialmente:

| Antes | Agora |
|---|---|
| Nenhum teste de controller / HTTP | `PocoSecurityTest` exercita `SecurityConfig` sobre `/api/simulador/pocos` |
| Nenhum `@DataJpaTest` | `PocoPersistenceTest` usa H2 real, incluindo a restrição de FK |
| Módulo `security` sem cobertura | `ContaAtivaVerificadorTest` e `JwtAuthenticationFilterTest` cobrem o corte de acesso |
| Exclusão sem teste | `GuardaDeExclusaoTest` e `TelemetriaVinculoAdapterTest` cobrem RN-063 e RN-072, incluindo o caso em que a Telemetria está fora |

⚠️ **O que continua descoberto, e é o que mais importa:** `/auth/login` e `/usuarios/**` não têm
**nenhum** teste HTTP — e é exatamente a superfície que [RN-079](business-rules.md#rn-079--a-api-padroniza-o-prefixo-api)
vai mover para `/api`. A geração e validação de JWT (`JwtTokenAdapter`) também segue sem teste, assim
como os módulos `empresa` e `monitoramento`.

**Consequência direta [FATO]:** nenhuma das falhas corrigidas em
[`security-findings.md`](security-findings.md) seria detectada por regressão hoje.

**[FATO] Causa raiz relacionada:** os testes de `regional`, `setor` e `unidade-sonda` vivem
fisicamente em `app/src/test/`, não nos módulos que testam — porque **esses módulos não declaram
`spring-boot-starter-test`**. Só `usuario` e `app` declaram.

**Nota:** a remoção dos módulos reduziu a contagem de 61 para 43 testes, mas **não piorou a
proporção** — os testes removidos cobriam justamente os módulos removidos.

---

## DT-008 · PATCH que não é parcial

**Severidade: Alta** · Backend-Sonda · Aberto

**[FATO]** `AtualizarUsuarioRequest.toCommand()` chama `Telefone.comTratamento()` e
`Email.comTratamento()` **incondicionalmente**. Omitir `telefone` ou `email` no corpo de um
`PATCH /usuarios/{username}` causa `IllegalArgumentException` → `400`.

Apenas `endereco` é tratado como opcional.

**Impacto:** o verbo é `PATCH` mas a semântica é `PUT`. Qualquer cliente que envie só os campos
alterados quebra.

---

## DT-009 · Documentação divergente do código

**Severidade: Alta** · Desktop-Sonda e Horus · Aberto

### Desktop-Sonda [FATO]

`docs/documentacao-sistema.html` (datado "Maio 2026") descreve comportamento que **não existe**:

| Documentado | Realidade no código |
|---|---|
| `POST /leituras` para "Backend Telemetria :8081" | `TelemetriaHttpService` foi **removido** (commit `46b1d26`) |
| Buffer de contingência `telemetria-buffer.json` | **Nunca existiu** em nenhuma revisão |
| Tópico por sensor com payload rico | Tópico único `telemetria/{unidade}/batch` |

**Ressalva importante:** o restante do documento (mapeamento de sensores, fórmulas de conversão, telas,
fluxo do CLP) é **correto e valioso** — foi usado e validado neste levantamento.

### Horus [FATO]

`StrokePorMinutoService` tem javadoc, comentários e nomes de método afirmando *"últimos 10 segundos"*,
mas `JANELA_TEMPO_MS = 60000` (**60 segundos**).

**[FATO]** Os READMEs de pacote do Desktop-Sonda descrevem uma arquitetura CRUD genérica que **não
corresponde a nenhuma classe real**, e referenciam três arquivos que **não existem**.

---

## DT-010 · Duplicação entre os dois desktops

**Severidade: Média** · **[DECIDIDO 2026-08-26]** duplicação aceita — produtos distintos

**[FATO]** Desktop-Sonda e Horus implementam independentemente o mesmo conjunto:

| Capacidade | Desktop-Sonda | Horus |
|---|---|---|
| Leitura CLP S7 | Moka7, rack 0 slot **1** | Moka7, rack 0 slot **0** |
| Conversão bar→psi | `14.5037738` | `14.5038` |
| Vazão | Média móvel 60s | Média móvel 60s |
| Carta de Operação | PDF **escrito à mão** (bytes crus) | **PDFBox 2.0.32** |
| Persistência local | H2 | JSONL |
| Build | Maven + Spring | Gradle |

Documentado aqui para que a duplicação seja **consciente**, e para que correções de fórmula sejam
aplicadas **nos dois lugares**.

**[FATO]** Duplicação interna adicional no Desktop-Sonda: a suavização de curva está implementada
**três vezes**, com os mesmos números mágicos (`5`, `0.045`, `17`).

---

## DT-011 · Divergência de roles backend ↔ frontend

**Severidade: Média** · ✅ **Resolvido em 2026-08-27**

**Estado anterior [FATO]:** backend com **17 valores**, frontend com **20** — e o frontend declarava
`USER`, `OPERADOR` e `ENGENHARIA` que **não existiam** no backend. Apenas 5 tinham efeito real.

**Como foi resolvido:** o enum foi reduzido a **7 roles** (`ADMIN`, `CLIENTE`, `INTERNO`,
`CIMENTACAO`, `SONDA`, `GERENCIA`, `DIRETORIA`) e o frontend passou a espelhá-lo exatamente.
**Todas as 7 têm efeito real** — nenhuma role decorativa restou.

**Melhoria estrutural [FATO]:** as roles por módulo deixaram de ser literais espalhados e passaram a
constantes exportadas (`ROLES_MONITORAMENTO`, `ROLES_SIMULADOR`, `ROLES_ADMINISTRACAO`) em
`user.model.ts`, usadas tanto pelos guards de rota quanto pelo menu. Antes, menu e guard podiam
divergir silenciosamente — um item aparecia e levava a "acesso negado".

---

## DT-012 · Dois formatos de erro na API

**Severidade: Média** · Backend-Sonda · Aberto

**[FATO]** `ApiExceptionHandler` padroniza erros de negócio como
`ApiErrorResponse{timestamp, status, error, message, path, details}`.

Mas rejeições do Spring Security (401/403 pré-controller) usam `response.sendError()` → **HTML padrão
do servlet**.

O cliente recebe JSON estruturado para um `403` de `BusinessException` e HTML para um `403` de
autorização. **[FATO]** O `parseApiError` do frontend tem tratamento defensivo para isso.

---

## DT-013 · Seed de dados sintéticos sem guarda

**Severidade: Média** · Desktop-Sonda · Aberto

**[FATO]** `SondaReadingSeeder` insere **1000 leituras sintéticas** (senoide + ruído, seed fixa `42`)
sempre que o banco H2 estiver vazio — **sem `@Profile("dev")` nem qualquer guarda de ambiente**.

**Impacto:** numa instalação nova em campo, o operador vê ~1h40 de dados **fabricados** no menu
Gráficos antes de existir leitura real do CLP. Nada na UI distingue dado real de sintético.

---

## DT-014 · Simulador sem validação de entrada

**Severidade: Média** · Front · Aberto

**[FATO]** Os ~40 campos numéricos de engenharia dos formulários de squeeze e tampão **não têm nenhum
`Validators`** — apenas valores padrão. O único uso na feature inteira é no `FormArray` de aditivos.

**Impacto:** valores fisicamente impossíveis produzem relatórios de engenharia sem nenhum aviso.
Ver [OQ-009](open-questions.md#oq-009--quais-são-os-limites-físicos-aceitáveis-no-simulador).

**Relevância aumentada:** com as remoções, o simulador é hoje **o único domínio de negócio próprio do
sistema**. Sua falta de validação passou de item médio a risco concentrado.

---

## DT-015 · Código morto (inventário)

**Severidade: Baixa** · Parcialmente resolvido

### Backend-Sonda [FATO]
- ✅ **Resolvido:** `ProcessoSchemaInitializer`, pacote `com.geopetro.telemetria`, dependência Paho, propriedades `mqtt.*`, `@EnableScheduling`, `data-quimicos.sql` — todos removidos em 2026-08-26
- ✅ **Resolvido 2026-09-06:** `RegionalBuscaPort`, `SetorConsultaPort` e seus adaptadores — ficaram sem chamador quando [RN-064](business-rules.md#rn-064--o-usuário-não-tem-mais-vínculo-organizacional) tirou o vínculo organizacional, e saíram junto em vez de virar porta órfã
- ⏳ **Lombok** declarado em `app/pom.xml` e **nunca usado** — zero anotações
- ⏳ `src/main/java` e `src/test/java` na **raiz** (fora dos módulos), vazios, nunca commitados — scaffold do Spring Initializr
- ⏳ **[FATO]** Nenhum `TODO`/`FIXME`/`@Deprecated` em todo o código — a dívida real não está sinalizada

### Front [FATO]
- ✅ **Resolvido:** tela de Projetos, `projeto.service.ts`, interfaces `Projeto`/`ProjetoPayload`, rota e aba
- ⏳ Pastas `almoxarifado/` e `compra/` — subdiretórios nomeados, **zero arquivos**
- ⏳ ⚠️ **Interceptor envia token ao ViaCEP** — o `Authorization` é anexado a chamadas externas
- ⏳ `MOCK_USERS` (4 usuários com senha em texto puro) — não importado
- ⏳ `SimuladorStateStoreService.listLocal/saveLocal/updateLocal/deleteLocal` — nunca chamado
- ⏳ `RichTextEditorComponent` — não importado por ninguém
- ⏳ `@maskito/*` (4 pacotes) instalados, **nenhum import**
- ⏳ `environment.telemetriaUrl` — declarado nos 3 ambientes, **nunca consumido**
- ⏳ `tests/hydraulics.spec.js` — referencia arquivo que **não existe**; há script `test:hydraulics` que falharia
- ⏳ `public/data/quimicos.json` (+2 backups) e `cement-additives.seed.json` — órfãos
- ⏳ Branch morto em `ShellComponent.navEntries` para grupo `'Gerenciamento'` inexistente
- ⏳ Checkbox "Lembrar acesso" sem binding; link "Esqueci minha senha" apontando para `/`

### Desktop-Sonda [FATO]
- `SondaData.calcularVazao()` — com TODO explícito, nunca usado
- Getters de `SondaService` (`getPeso`, `getPressao01..03`, `getStatus`, `obterDadosAtuais`) — sem chamador
- Comentários de campo em `SondaData.java:17-20` **incorretos** quanto ao mapeamento de sensores
- `writeSinglePagePdf`, `buildChartSlots`, `drawTimeLabels` — definidos, nunca chamados
- `spring-boot-starter-webmvc`, `-webmvc-test`, `spring-boot-h2console` com `web-application-type=none`

### Horus [FATO]
- `H2DatabaseService` — nunca instanciada; dependência H2 inerte
- `VazaoCalculatorService` — só `reset()` é chamado; métodos de cálculo mortos
- `S7AreaHelper` — nunca referenciado
- Tela "Carregar CSV" — não alcançável, e não há parser de CSV
- `slf4j-simple` declarado, logging via `System.out`
- 2 dos 3 construtores de `ConfiguracaoBomba` — mortos

---

## DT-016 · Inconsistências de organização de projeto

**Severidade: Baixa** · Aberto

**[FATO]**
- Módulo Maven `unidade-sonda` tem pacote Java `com.geopetro.unidadesonda` — único que diverge do padrão
- Coleção Postman cobre apenas login e usuários (6 operações). O exemplo de "Criar Usuario Interno" usa `"setor": "Automacao"` (String), que não existe no contrato atual
- **[FATO]** Endpoints de usuários e auth ficam **fora** do prefixo `/api`, enquanto o resto usa `/api/{recurso}` — [OQ-013](open-questions.md#oq-013--endpoints-fora-do-padrão-api-são-deliberados)
- `UsuarioPaginadoResponse` no front duplica a forma de `Pagina<T>` em vez de reusar o genérico
- **[FATO]** Mojibake em `meu-usuario-page.component.html:43` — `"Buscando endereÃ§o pelo CEP..."`
- **[FATO]** Namespaces JavaFX inconsistentes nos FXML do Horus: `javafx/21`, `21.0.1` e `25`, com dependência real 21.0.6
- **[FATO]** Higiene no Horus: `data/registros_operacao.json` (3,3 MB de telemetria real) e binários H2 versionados no Git
- Build do front usa `--configuration k8s`, mas **não há manifesto Kubernetes** no workspace — [OQ-012](open-questions.md#oq-012--onde-vivem-os-manifestos-de-deploy)
- `Braserv-Horus-Desktop` injeta um `JAVA_HOME` de fallback fixo no `build.gradle` — frágil entre máquinas
- ✅ **Resolvido 2026-09-06:** o Backend-Telemetria roda Spring Boot **3.4.5** enquanto o Backend-Sonda já está no **4.0.5**. O Boot 3.4.5 traz Mockito 5.14.2 com Byte Buddy 1.15.11, que **não reconhece o bytecode do Java 25** instalado — *toda* mockagem de classe falhava com `Java 25 (69) is not supported`, derrubando **10 dos 24 testes** do serviço. Corrigido fixando `mockito.version` e `byte-buddy.version` no `pom.xml` para as mesmas versões que o Boot 4 já resolve. ⚠️ **A divergência de Boot entre os dois serviços permanece** — este é o primeiro sintoma dela, e não será o último

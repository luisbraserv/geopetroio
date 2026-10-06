# Dívida Técnica e Inconsistências — GeopetroIO

> Levantamento por engenharia reversa · 2026-08-26 · ver [convenção de marcação](../README.md#convenção-de-marcação)
>
> Falhas de segurança estão em documento separado: [`security-findings.md`](seguranca/security-findings.md).

## Sumário por severidade

| ID | Item | Aplicação | Severidade | Estado |
|---|---|---|---|---|
| [DT-001](#dt-001--código-fonte-perdido-de-almoxarifado-e-compras) | Código-fonte perdido (almoxarifado/compras) | Backend | **Crítica** | Registro histórico |
| [DT-002](#dt-002--estratégias-conflitantes-de-evolução-de-schema) | Estratégias conflitantes de schema | Backend | **Crítica** | ✅ **Resolvido 2026-09-07** — Flyway |
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
| [DT-013](#dt-013--seed-de-dados-sintéticos-sem-guarda) | Seed sintético sem guarda de ambiente | Geopetro-Desktop | Média | Aberto |
| [DT-014](#dt-014--simulador-sem-validação-de-entrada) | Simulador sem validação de entrada | Front | Média | Aberto |
| [DT-015](#dt-015--código-morto-inventário) | Código morto (inventário) | Todas | Baixa | Parcialmente resolvido |
| [DT-016](#dt-016--inconsistências-de-organização-de-projeto) | Organização de projeto | Backend | Baixa | Aberto |

---

**Histórico detalhado:** [levantamento integral](historico/technical-debt-2026-09.md). Itens resolvidos aparecem abaixo apenas com o resultado; itens em aberto conservam diagnóstico e ações.

## DT-001 · Código-fonte perdido de almoxarifado e compras

**Registro histórico.** Almoxarifado e compras foram descontinuados; o código-fonte não está no Git. Evidências e lições de recuperação ficaram no histórico.

[Evidências e trajetória](historico/technical-debt-2026-09.md).

## DT-002 · Estratégias conflitantes de evolução de schema

**Resolvido no código em 2026-09-07.** Flyway aplica migrations no startup e Hibernate usa validate. As migrations ainda precisam ser conferidas no próximo deploy de produção; a antiga fila de execução manual foi superada.

[Evidências e trajetória](historico/technical-debt-2026-09.md).

## DT-003 · Telemetria capturada mas nunca persistida

**Resolvido.** A telemetria histórica passou a ser persistida pelo serviço Geopetro-Telemetria no InfluxDB; veja o [contrato MQTT](mqtt/mqtt-telemetria.md).

[Evidências e trajetória](historico/technical-debt-2026-09.md).

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

   ✅ **[FATO 2026-09-07] Aliviado, não resolvido.** A [renomeação dos projetos](renomeacao-projetos.md)
   encurtou **todo** caminho do repositório em 8 caracteres — `Geopetro-Backend` contra
   `Backend-Sonda-Geopetro-IO`. A fronteira dos 260 ficou mais longe; a causa, que é a profundidade da
   árvore do OneDrive, continua.

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
Ver [OQ-025](../negocio/requisitos/open-questions.md#oq-025--os-repositórios-podem-sair-do-onedrive).

⚠️ **[FATO observado 2026-09-05]** Durante a própria entrevista que registrou esta decisão, o OneDrive
impediu leitura de arquivos **duas vezes**: `git status` falhou com `read error ... Invalid argument` e
`mmap failed` em 16 arquivos do Geopetro-Telemetria, e um `grep` recebeu `Permission denied` em arquivos
do simulador. O comportamento é corrente, não histórico.

**O que segue exposto:** histórico Git dos cinco repositórios, e — de forma mais aguda — **trabalho não
commitado**. Com backup de MySQL também recusado
([product-context §11](../negocio/requisitos/product-context.md#11-fechamentos-das-rodadas-3-a-6)), commitar cedo e com
frequência passa a ser a única rede de proteção do código.

**É o risco de maior impacto potencial do levantamento: perda silenciosa de histórico e de código.**
Ver [OQ-025](../negocio/requisitos/open-questions.md#oq-025--os-repositórios-podem-sair-do-onedrive).

---

## DT-005 · Módulos de backend sem interface

**Resolvido por redução de escopo.** Módulos sem interface foram removidos; funções remanescentes estão no inventário vigente.

[Evidências e trajetória](historico/technical-debt-2026-09.md).

## DT-006 · Químico desconectado do modelo relacional

**Eliminado.** O módulo Químicos saiu do backend. Tabelas remanescentes seguem a decisão [OQ-026](../negocio/requisitos/open-questions.md#oq-026--o-que-fazer-com-as-tabelas-órfãs).

[Evidências e trajetória](historico/technical-debt-2026-09.md).

## DT-007 · Ausência de testes em áreas críticas

**Severidade: Alta** · Geopetro-Backend · Aberto

**[FATO]** Cobertura no levantamento: **43 testes**, todos unitários, em 7 classes.

**[FATO 2026-09-06]** Hoje são **110** no Geopetro-Backend e **27** no Geopetro-Telemetria. Duas lacunas
fecharam parcialmente:

| Antes | Agora |
|---|---|
| Nenhum teste de controller / HTTP | `PocoSecurityTest` exercita `SecurityConfig` sobre `/api/simulador/pocos` |
| Nenhum `@DataJpaTest` | `PocoPersistenceTest` usa H2 real, incluindo a restrição de FK |
| Módulo `security` sem cobertura | `ContaAtivaVerificadorTest` e `JwtAuthenticationFilterTest` cobrem o corte de acesso |
| Exclusão sem teste | `GuardaDeExclusaoTest` e `TelemetriaVinculoAdapterTest` cobrem RN-063 e RN-072, incluindo o caso em que a Telemetria está fora |

**[FATO 2026-09-06 — atualização]** A lacuna HTTP de login e usuários foi coberta
em `IdentidadeHttpSecurityTest`: nove testes passaram nas URLs antigas antes de
[RN-079](../negocio/regras/business-rules.md#rn-079--a-api-padroniza-o-prefixo-api), e onze passaram
nas URLs `/api` após a migração. A ordem das regras de autoatendimento/administração,
as restrições de regionais/cadastros e a ausência de segredo JWT têm regressões.
Backend: 121 testes aprovados nesta execução, excluindo o teste de migrations MySQL.
Contrato em [`api-prefix.md`](../../../apps/geopetro-backend/specs/api-prefix.md).

**Ainda aberto:** geração, assinatura, expiração e validação criptográfica de JWT
não são exercitadas pela nova suíte HTTP, que usa `TokenPort` mockado. Também
permanecem lacunas nos módulos `empresa` e `monitoramento`.

**[FATO] Causa raiz relacionada:** os testes de `regional`, `setor` e `unidade-sonda` vivem
fisicamente em `app/src/test/`, não nos módulos que testam — porque **esses módulos não declaram
`spring-boot-starter-test`**. Só `usuario` e `app` declaram.

**Nota:** a remoção dos módulos reduziu a contagem de 61 para 43 testes, mas **não piorou a
proporção** — os testes removidos cobriam justamente os módulos removidos.

---

## DT-008 · PATCH que não é parcial

**Severidade: Alta** · Geopetro-Backend · Aberto

**[FATO]** `AtualizarUsuarioRequest.toCommand()` chama `Telefone.comTratamento()` e
`Email.comTratamento()` **incondicionalmente**. Omitir `telefone` ou `email` no corpo de um
`PATCH /usuarios/{username}` causa `IllegalArgumentException` → `400`.

Apenas `endereco` é tratado como opcional.

**Impacto:** o verbo é `PATCH` mas a semântica é `PUT`. Qualquer cliente que envie só os campos
alterados quebra.

---

## DT-009 · Documentação divergente do código

**Severidade: Alta** · Geopetro-Desktop e Horus · Aberto

### Geopetro-Desktop [FATO]

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

**[FATO]** Os READMEs de pacote do Geopetro-Desktop descrevem uma arquitetura CRUD genérica que **não
corresponde a nenhuma classe real**, e referenciam três arquivos que **não existem**.

---

## DT-010 · Duplicação entre os dois desktops

**Aceito.** Geopetro-Desktop e Horus permanecem produtos separados; a duplicação entre eles não é tarefa de unificação.

[Evidências e trajetória](historico/technical-debt-2026-09.md).

## DT-011 · Divergência de roles backend ↔ frontend

**Resolvido.** Roles e permissões foram alinhadas entre backend e frontend; veja [RN-099](../negocio/regras/business-rules.md#rn-099--acesso-por-combinação-tipo-de-conta--permissão-de-módulo).

[Evidências e trajetória](historico/technical-debt-2026-09.md).

## DT-012 · Dois formatos de erro na API

**Severidade: Média** · Geopetro-Backend · Aberto

**[FATO]** `ApiExceptionHandler` padroniza erros de negócio como
`ApiErrorResponse{timestamp, status, error, message, path, details}`.

Mas rejeições do Spring Security (401/403 pré-controller) usam `response.sendError()` → **HTML padrão
do servlet**.

O cliente recebe JSON estruturado para um `403` de `BusinessException` e HTML para um `403` de
autorização. **[FATO]** O `parseApiError` do frontend tem tratamento defensivo para isso.

---

## DT-013 · Seed de dados sintéticos sem guarda

**Severidade: Média** · Geopetro-Desktop · Aberto

**[FATO]** `SondaReadingSeeder` insere **1000 leituras sintéticas** (senoide + ruído, seed fixa `42`)
sempre que o banco H2 estiver vazio — **sem `@Profile("dev")` nem qualquer guarda de ambiente**.

**Impacto:** numa instalação nova em campo, o operador vê ~1h40 de dados **fabricados** no menu
Gráficos antes de existir leitura real do CLP. Nada na UI distingue dado real de sintético.

---

## DT-014 · Simulador sem validação de entrada

**Severidade: Média** · Front · Aberto

**[FATO]** A geometria inconsistente bloqueia o cálculo e relações entre
campos geram avisos em squeeze e tampão. Permanecem sem definição completa as
faixas quantitativas e a obrigatoriedade dos campos individuais. Ver
[faixas de validação](../../../apps/geopetro-frontend/specs/simulador/faixas-validacao.md)
e [OQ-009](../negocio/requisitos/open-questions.md#oq-009--quais-são-os-limites-físicos-aceitáveis-no-simulador).

**Impacto:** um valor individual fora do domínio físico ainda pode chegar
ao relatório se não for capturado por uma relação entre campos.

---

## DT-015 · Código morto (inventário)

**Severidade: Baixa** · Parcialmente resolvido

### Geopetro-Backend [FATO]
- ✅ **Resolvido:** `ProcessoSchemaInitializer`, pacote `com.geopetro.telemetria`, dependência Paho, propriedades `mqtt.*`, `@EnableScheduling`, `data-quimicos.sql` — todos removidos em 2026-08-26
- ✅ **Resolvido 2026-09-06:** `RegionalBuscaPort`, `SetorConsultaPort` e seus adaptadores — ficaram sem chamador quando [RN-064](../negocio/regras/business-rules.md#rn-064--o-usuário-não-tem-mais-vínculo-organizacional) tirou o vínculo organizacional, e saíram junto em vez de virar porta órfã
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

### Geopetro-Desktop [FATO]
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
- **[FATO]** Endpoints de usuários e auth ficam **fora** do prefixo `/api`, enquanto o resto usa `/api/{recurso}` — [OQ-013](../negocio/requisitos/open-questions.md#oq-013--endpoints-fora-do-padrão-api-são-deliberados)
- `UsuarioPaginadoResponse` no front duplica a forma de `Pagina<T>` em vez de reusar o genérico
- **[FATO]** Mojibake em `meu-usuario-page.component.html:43` — `"Buscando endereÃ§o pelo CEP..."`
- **[FATO]** Namespaces JavaFX inconsistentes nos FXML do Horus: `javafx/21`, `21.0.1` e `25`, com dependência real 21.0.6
- **[FATO]** Higiene no Horus: `data/registros_operacao.json` (3,3 MB de telemetria real) e binários H2 versionados no Git
- Build do front usa `--configuration k8s`, mas **não há manifesto Kubernetes** no workspace — [OQ-012](../negocio/requisitos/open-questions.md#oq-012--onde-vivem-os-manifestos-de-deploy)
- `Braserv-Horus-Desktop` injeta um `JAVA_HOME` de fallback fixo no `build.gradle` — frágil entre máquinas
- ✅ **Resolvido 2026-09-06:** o Geopetro-Telemetria roda Spring Boot **3.4.5** enquanto o Geopetro-Backend já está no **4.0.5**. O Boot 3.4.5 traz Mockito 5.14.2 com Byte Buddy 1.15.11, que **não reconhece o bytecode do Java 25** instalado — *toda* mockagem de classe falhava com `Java 25 (69) is not supported`, derrubando **10 dos 24 testes** do serviço. Corrigido fixando `mockito.version` e `byte-buddy.version` no `pom.xml` para as mesmas versões que o Boot 4 já resolve. ⚠️ **A divergência de Boot entre os dois serviços permanece** — este é o primeiro sintoma dela, e não será o último

## DT-017 · Logado sem permissão recebe 401 em vez de 403

**Severidade: Média** · ✅ **Resolvido em 2026-10-06** no Braserv-Core e no Geopetro-Backend

**[FATO 2026-10-06]** Encontrado no Braserv-Core, que copiou a configuração de segurança do backend. No servidor real, o `403` de uma regra de acesso vira um despacho interno para `/error`, que não carrega o token. A segunda passagem pela segurança trata a requisição como anônima e responde `401`. O MockMvc não reproduz o despacho, por isso os testes de segurança passavam.

**Efeito:** o Front trata `401` como sessão vencida. Um usuário logado que abre uma tela sem permissão pode ser mandado de volta ao login, em vez de ver "acesso negado".

**[INFERÊNCIA]** O Geopetro-Backend tem a mesma configuração (`SecurityConfig` sem liberar o despacho de erro) e deve ter o mesmo comportamento; não foi conferido com o backend rodando.

**Correção:** `.dispatcherTypeMatchers(DispatcherType.ERROR).permitAll()` no início da cadeia. Aplicada no Braserv-Core em 2026-10-06, com o teste `ProibidoNaoViraNaoAutenticadoTest`, que faz a requisição HTTP real. No backend, corrigida na fase 3 do [Braserv-Core](backend/braserv-core.md), com o mesmo teste por HTTP real.

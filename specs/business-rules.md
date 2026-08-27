# Regras de Negócio Identificadas no Código — GeopetroIO

> Levantamento por engenharia reversa · 2026-08-26 · ver [convenção de marcação](README.md#convenção-de-marcação)
>
> **Aviso central:** estas regras foram **extraídas do código**, não de uma definição de negócio.
> Várias são **implícitas** — nunca foram escritas em lugar nenhum antes deste documento. Uma regra
> aqui documentada **não é necessariamente a regra correta**; é o que o sistema faz hoje.
>
> Regras marcadas **⚠️ IMPLÍCITA** merecem revisão explícita pela equipe de negócio.
>
> **IDs são permanentes.** Regras de módulos removidos ficam registradas como memória de decisão, com
> os números preservados — não são reaproveitados.

---

## Identidade e Usuários

### RN-001 · Username é a chave de negócio
**[FATO]** A PK da tabela `usuarios` é o próprio `username` (String), não um id surrogate.
**Consequência ⚠️ IMPLÍCITA:** um username **não pode ser alterado** sem quebrar as FKs que o
referenciam.
**[PENDENTE]** Isso é intencional? Existe caso de negócio de renomear usuário?

### RN-002 · Identificador de login aceita username ou e-mail
**[FATO]** `AutenticacaoUseCase.autenticar` decide pela presença de `@` no identificador.
**⚠️ IMPLÍCITA:** um username que contenha `@` seria interpretado como e-mail. O regex de username
impede isso — mas é proteção acidental, não declarada.

### RN-003 · Formato de username
**[FATO]** Obrigatório, máximo 60 caracteres, regex `[a-zA-Z0-9._-]+`.

### RN-004 · Força de senha
**[FATO]** 8–20 caracteres, com minúscula + maiúscula + dígito + caractere especial.
**[FATO]** Exceção: se o valor já for hash BCrypt (regex `^\$2[aby]\$\d{2}\$.{53}$`), a validação é
pulada — permite reusar o mesmo setter para senha crua (criação) e hash (reconstrução do banco).
**[FATO] Inconsistência:** a troca via `/usuarios/me/senha` **não aplica** essa política no frontend.
**[DECIDIDO 2026-08-26]** A política **não está definida formalmente**. Ver
[OQ-004](open-questions.md#oq-004--qual-é-a-política-de-senha).

### RN-005 · Nova senha deve diferir da atual
**[FATO]** `AlterarSenhaUsuarioUseCase.alterar` exige senha atual válida, nova = confirmação, e nova ≠ atual.

### RN-006 · Role base é sempre aplicada
**[FATO]** `criarCliente` sempre inclui `CLIENTE`; `criarInterno` sempre inclui `INTERNO`, além das
roles informadas.

### RN-007 · Regional principal entra automaticamente na lista de regionais
**[FATO]** `CriarUsuarioUseCase.resolverRegionais` — se uma regional principal for informada, ela
**sempre** é adicionada ao conjunto de regionais do usuário interno.

### RN-008 · Value objects autovalidados
**[FATO]** `Email` (precisa de `@` e `.` no domínio; normaliza trim+lowercase) · `Telefone`
(DDD 2 + número 9 = 11 dígitos) · `Endereco` (CEP 8 dígitos, estado 2 letras).
Violação lança `IllegalArgumentException` → `400`.

### RN-009 · Cliente exige empresa existente
**[FATO]** `criarCliente` exige `empresaId` válido; `criarInterno` valida todos os `setorIds` por
contagem e a regional principal, se informada.

---

## Controle de acesso por organização

### RN-010 · ADMIN é irrestrito
**[FATO]** `ADMIN` acessa todos os cadastros e todas as sondas, sem filtro.

### RN-011 · ~~Usuário interno acessa apenas a própria regional~~ — SUPERADA
**[DECIDIDO 2026-08-27]** Substituída por [RN-047](#rn-047--escopo-de-sondas-por-perfil): o escopo
passou a ser definido pelo **perfil**, não pelo vínculo regional. Os perfis operacionais veem a frota
inteira.

### RN-012 · ~~Usuários não-internos não têm escopo organizacional~~ — SUPERADA
**[DECIDIDO 2026-08-27]** O `UsuarioCliente` passou a ter escopo próprio — a lista de Unidades/Sondas
concedidas no cadastro ([RN-048](#rn-048--concessão-de-sondas-ao-cliente-é-explícita)). Antes ele não
tinha vínculo algum e, por um defeito da implementação anterior, acabava enxergando **todas** as
sondas.

### RN-013 · ~~Apenas a regional PRINCIPAL conta para autorização~~ — SUPERADA
**[DECIDIDO 2026-08-27]** A regra **deixou de existir**.

**O que dizia:** o acesso às sondas usava apenas a regional principal do usuário interno, ignorando a
lista N:N `usuario_interno_regionais`. Um usuário vinculado a 3 regionais via sondas de apenas 1.

**Como foi superada:** com [RN-047](#rn-047--escopo-de-sondas-por-perfil), os perfis operacionais
passaram a enxergar a **frota inteira** — a regional saiu completamente do controle de acesso ao
monitoramento, que era o último lugar onde essa limitação se manifestava.

⚠️ **Consequência a registrar:** o vínculo N:N usuário↔regional/setor continua no modelo e no
cadastro, mas hoje **não influencia nenhuma decisão de autorização**. Ver
[OQ-002](open-questions.md#oq-002--múltiplas-regionais-por-usuário-devem-valer-para-autorização).

### RN-047 · Escopo de sondas por perfil
**[DECIDIDO 2026-08-27]** Regra central do monitoramento.

| Perfil | Escopo |
|---|---|
| `ADMIN`, `SONDA`, `CIMENTACAO`, `GERENCIA`, `DIRETORIA` | **Frota inteira** |
| `CLIENTE` | **Apenas** as Unidades/Sondas concedidas no seu cadastro |
| Qualquer outro (ex.: só `INTERNO`) | Nenhuma sonda |

**[FATO]** Implementada em `SondaMonitoramentoService`, com 9 testes cobrindo cada caso.

**Precedência:** a role de maior alcance vence. Um usuário `CLIENTE` + `ADMIN` enxerga a frota
inteira — o vínculo de cliente não o limita.

**Lista vazia é estado válido:** um cliente sem nenhuma sonda concedida acessa a tela de
monitoramento e não vê sonda alguma. Não é erro; é ausência de concessão.

### RN-048 · Concessão de sondas ao cliente é explícita
**[FATO]** O vínculo vive na tabela `usuario_cliente_unidades` e é definido **unidade a unidade** no
cadastro do cliente (`POST /usuarios/clientes` e `PATCH /usuarios/{username}`, campo
`unidadeSondaIds`).

**⚠️ IMPLÍCITA e deliberada:** o acesso do cliente **não é derivado** de empresa, regional ou setor.
É concessão explícita. A razão: um cliente é externo à organização — herdar acesso de uma estrutura
interna abriria a porta para expor dados de uma empresa a outra por efeito colateral de um cadastro.

**Semântica de atualização [FATO]:**
- Campo **omitido** no PATCH → mantém o vínculo atual
- Array **vazio** → revoga o acesso a todas as sondas (operação legítima)
- Id inexistente → `400`, indicando formulário dessincronizado

### RN-049 · Acesso ao Simulador
**[DECIDIDO 2026-08-27]** Restrito a `ADMIN`, `CIMENTACAO`, `GERENCIA` e `DIRETORIA`.

**[FATO]** `CLIENTE` e `SONDA` **não** acessam o simulador — nem no menu, nem na rota, nem na API.

### RN-014 · ~~Observações sem controle de acesso~~ — REMOVIDA
**[DECIDIDO 2026-08-26]** O módulo `observacao` foi removido. A regra documentava que
`ObservacaoService` não aplicava nenhum filtro por setor/regional — qualquer usuário que alcançasse o
endpoint lia, editava e excluía observações de qualquer setor.

**Lição que sobrevive:** era uma assimetria acidental (Processos filtrava, Observações não). Se um
novo domínio com escopo por setor nascer, **o filtro de acesso deve estar na spec antes do código**.

### RN-015 · ⚠️ Cenários do simulador não têm dono
**[FATO]** `simulador` grava `criadoPor` como String simples, sem FK, e **nunca compara** com o
usuário logado. Qualquer `CIMENTACAO`/`ADMIN` edita ou exclui cenários e pastas de outro usuário.
**[PENDENTE]** Ver [OQ-005](open-questions.md#oq-005--cenários-do-simulador-têm-dono).

---

## Cadastros mestres

### RN-016 · Unicidade por cadastro — inconsistente
**[FATO]** Regras diferentes entre cadastros do mesmo nível:

| Cadastro | Unicidade | Case-insensitive? |
|---|---|---|
| Regional | `nome` UNIQUE, validado no service | **Sim** |
| Empresa | `cnpj` UNIQUE na tabela, validado só se não vazio | Não aplicável |
| UnidadeSonda | `nome` UNIQUE, validado no service | Não |
| **Setor** | ⚠️ **Nenhuma** — nem na tabela, nem no service | — |

**[FATO]** A ausência em Setor é lacuna conhecida: a migration `V2026.06.02` foi escrita
especificamente para **deduplicar** setores repetidos que causavam erro 500 em produção. Os dados
foram corrigidos; **a causa raiz não**.

### RN-017 · Guarda de exclusão — inconsistente
**[FATO]** Políticas divergentes entre cadastros equivalentes:

| Entidade | Política ao excluir |
|---|---|
| **Regional** | **Bloqueia** se houver setor ou unidade/sonda vinculada |
| Setor | ⚠️ Nenhuma — FK violation → `500` genérico |
| UnidadeSonda | ⚠️ Nenhuma |
| Empresa | ⚠️ Nenhuma |
| Pasta do simulador | Cascade `ALL` + `orphanRemoval` sobre os cenários |

**⚠️ IMPLÍCITA:** não existe política declarada de integridade referencial. Cada módulo decidiu
isoladamente. Só `Regional` tem guarda completa. Ver
[OQ-007](open-questions.md#oq-007--qual-é-a-política-de-exclusão-do-sistema).

**Nota histórica:** o módulo `quimico` (removido) tinha **duas políticas opostas dentro de si** —
excluir `OperacaoSonda` era bloqueado se houvesse movimentações, mas excluir `Quimico` apagava todo o
histórico em cascata, com perda irreversível de auditoria.

### RN-018 · Nome da Unidade/Sonda é chave de integração
**[FATO]** `UnidadeSonda.nome` (ex.: `SPT-144`, `UC-01`) é o `idSondaUnidade` usado nos tópicos MQTT e
nas consultas de série temporal. Confirmado pela migration `V2026.06.15`.
**⚠️ IMPLÍCITA e crítica:** renomear uma unidade **quebra o histórico de telemetria**, e nada no
sistema impede ou avisa sobre isso.

---

## Processos — REMOVIDOS

**[DECIDIDO 2026-08-26]** Os módulos `projeto`, `processo` e `observacao` foram removidos.

As regras **RN-019 a RN-022** documentavam esses módulos e **não valem mais**. Ficam registradas como
memória de decisão:

| Regra | O que dizia |
|---|---|
| RN-019 | Setor derivado da Unidade/Sonda — o `setorId` do request era só validado por consistência, nunca usado |
| RN-020 | Projeto devia pertencer à **mesma regional** da Unidade/Sonda → senão `400` |
| RN-021 | `projeto_id` nullable na coluna, mas `@NotNull` no request — divergência schema × contrato |
| RN-022 | ⚠️ **Não existia máquina de estados** — `arquivar()`/`desarquivar()` forçavam o status sem validar o estado atual, e o `PUT` aceitava qualquer valor do enum |

**Lição que sobrevive à remoção:** RN-022 era a **maior pendência de definição de negócio do sistema**
— transições como `CANCELADO → ABERTO` e `CONCLUIDO → ARQUIVADO → ABERTO` eram permitidas sem erro.
Se um domínio com ciclo de vida nascer no futuro (processo, ordem de serviço, pedido), **a máquina de
estados deve estar na spec antes do código**. Foi exatamente a lacuna que nunca se fechou aqui.

---

## Estoque de Químicos — REMOVIDO

**[DECIDIDO 2026-08-26]** O módulo `quimico` foi removido.

As regras **RN-023 a RN-029** documentavam esse módulo e **não valem mais**. Registro histórico:

| Regra | O que dizia |
|---|---|
| RN-023 | Saldo nunca persistido: `quantidadeInicial + soma(movimentações)`; `entrada` soma, `uso`/`perda` subtraem, `ajuste` entra bruto |
| RN-024 | ⚠️ **Não havia checagem de saldo** — estoque podia ficar negativo sem erro |
| RN-025 | Movimentação herdava `data`/`poco`/`tipoTrabalho` da operação-pai |
| RN-026 | Alerta de estoque baixo com margem fixa de 20% (`estoqueMinimo × 1,2`) — nunca documentada |
| RN-027 | Alerta de vencimento por `diasVencimento` (default 60); anti-spam por `intervaloReenvioDias` (default 7) |
| RN-028 | ⚠️ Alerta imediato pós-movimentação **ignorava** o anti-spam — múltiplos e-mails no mesmo dia |
| RN-029 | ⚠️ Campo `destinatarios` validado e persistido, porém **nunca lido** — destinatários vinham de SQL nativo por role `CIMENTACAO` |

**Lição que sobrevive:** RN-024 reproduzia exatamente a lacuna que o módulo `almoxarifado`
descontinuado **já havia resolvido e testado** (`deveLancarExcecaoAoRegistrarSaidaComSaldoInsuficiente`).
Duas implementações de controle de estoque no mesmo sistema, com regras divergentes, e a que tinha a
validação correta foi a que se perdeu. Se um novo domínio de estoque nascer, essa regra entra na spec
**antes** do código.

---

## Telemetria — conversão de sinal

> Estas regras são **física/engenharia aplicada** e estão hoje implícitas no código do Desktop-Sonda.
> São candidatas prioritárias a spec formal — erro aqui produz dado operacional errado silenciosamente,
> em toda a frota.

### RN-030 · Conversão 4-20mA → PSI
**[FATO]** `PlcConnectionService.converterValorPlcParaPressaoPsi`:
```
correnteMa    = (bruto / 1000) × 20
pressaoMaxPsi = rangeBar × 14.5037738
pressaoPsi    = ((correnteMa - 4) / 16) × pressaoMaxPsi
resultado     = pressaoPsi × sensibilidade
```
⚠️ **[PENDENTE]** A escala bruta 0–1000 tem comentário no próprio código: *"A escala 0..1000 é
preservada até sua confirmação no PLC"*. **Os próprios desenvolvedores marcam como não validado.**
Ver [OQ-016](open-questions.md#oq-016--a-escala-analógica-01000-do-clp-foi-confirmada).

### RN-031 · Peso da coluna
**[FATO]** `peso_lbf = max(0, pressaoB002 - pressaoZeroPsi) × areaEfetivaPol2 × fatorCalibracao`,
arredondado a 2 casas. O `max(0, ...)` impede peso negativo.

### RN-032 · Torque hidráulico por tipo de movimento
**[FATO]** `HydraulicTorqueCalculator.calculateTorque`:
- **Avanço**: área total do pistão
- **Recuo**: área anular (pistão − haste)
- `torque = pressãoEfetiva × área × braço`

Coberto por teste (`HydraulicTorqueCalculatorTest`).

### RN-033 · Vazão por média móvel
**[FATO]** Delta de strokes por ciclo (com proteção contra contador decrescente) → janela deslizante
de **60 segundos** → `pumpConstant × strokesPerMinuteMédio`.

⚠️ **[FATO]** No Horus, os comentários do `StrokePorMinutoService` dizem repetidamente *"últimos 10
segundos"*, mas a constante real é `JANELA_TEMPO_MS = 60000` (**60s**). Documentação e código divergem.

### RN-034 · Validação de geometria da chave hidráulica
**[FATO]** `rangeBar > 0` · `diâmetro pistão > 0` · `diâmetro haste ≥ 0` · **haste < pistão** ·
`braço > 0` · movimento selecionado. Card de torque exibe aviso se a configuração estiver incompleta.

### RN-035 · Reset ao detectar reinício do CLP
**[FATO]** Ambos os desktops detectam retrocesso do contador cumulativo de stroke (indicando reinício
do CLP) e resetam os históricos de cálculo, evitando delta negativo.

### RN-036 · ⚠️ B005 alimenta dois indicadores
**[FATO]** "P. Bomba de Lama" e "ESCP" exibem **o mesmo valor físico** (B005). Não são sensores
distintos. Intencional e documentado.

### RN-037 · ⚠️ Visibilidade de card controla publicação, não gravação
**[FATO]** Desmarcar um card no Desktop-Sonda suprime a **publicação MQTT** daquela variável (e a
tabela `FlowRateReading`, no caso da Vazão), mas `SondaReading` continua sendo gravado no H2 para
todas as variáveis. **O texto da UI afirma o contrário.**

### RN-038 · Sem publicação sem identificador de sonda
**[FATO]** Se `sondaId` estiver vazio, o Desktop-Sonda **não publica nada** (apenas log debug).

### RN-039 · ⚠️ Perda de telemetria em falha de publicação
**[FATO]** Se a publicação MQTT falhar, a leitura daquele ciclo é **perdida** para telemetria remota
(permanece só no H2 local). **Não há buffer de contingência** — a documentação interna descreve um
`telemetria-buffer.json` que não existe no código.
**[PENDENTE]** Ver [OQ-019](open-questions.md#oq-019--perda-de-telemetria-em-falha-de-mqtt-é-aceitável).

---

## Cimentação

### RN-040 · Limites de upload de imagem no relatório
**[FATO]** Logo do cliente ≤ **2 MB** · esquema mecânico ≤ **5 MB**. Validado no client antes da
leitura como base64 dataURL.

### RN-041 · Aditivos são o único campo validado do simulador
**[FATO]** `FormArray` de aditivos: `name` obrigatório, `conc` obrigatório e `min(0)`.
⚠️ Os ~40 campos numéricos de engenharia (gradientes, pesos, pressões, geometria) **não têm nenhuma
validação**.

**⚠️ IMPLÍCITA e de alto risco:** não existe nenhuma faixa declarada de valores plausíveis para
parâmetros críticos de engenharia de poço. Um valor absurdo produz um relatório absurdo sem aviso.
Ver [OQ-009](open-questions.md#oq-009--quais-são-os-limites-físicos-aceitáveis-no-simulador).

### RN-042 · Suavização de curva
**[FATO]** Média móvel de **2 passadas**, janela dinâmica `max(5, 4.5% do nº de amostras)`, limitada a
17, sempre ímpar. Implementada **três vezes de forma independente** no Desktop-Sonda.
**[FATO]** No frontend a suavização é diferente: média móvel de **8 pontos fixos**.
**⚠️ IMPLÍCITA:** duas definições distintas de "curva suavizada" no mesmo produto.

---

## Regras transversais

### RN-043 · Paginação padronizada
**[FATO]** `PaginaResponse<T>` com `conteudo`, `pagina` (0-based), `tamanho`, `totalElementos`,
`totalPaginas`, `primeira`, `ultima`. Usado por empresa, regional, setor, unidade-sonda e usuários.

### RN-044 · Formato de erro da API
**[FATO]** `ApiErrorResponse{timestamp, status, error, message, path, details}` via
`@RestControllerAdvice`.
⚠️ **[FATO]** Rejeições do Spring Security (401/403 pré-controller) **não** usam esse formato —
retornam HTML padrão do servlet. O cliente recebe dois formatos de erro diferentes
([DT-012](technical-debt.md#dt-012--dois-formatos-de-erro-na-api)).

### RN-045 · Sessão expira em 1 hora, sem renovação
**[FATO]** JWT com expiração default de 3600s. **Sem refresh token, sem logout no servidor, sem
revogação.** O frontend derruba a sessão em qualquer `401`.
**⚠️ IMPLÍCITA:** um token vazado permanece válido até expirar. Um usuário desativado continua
acessando até o token expirar — o filtro lê as roles do token sem reconsultar o banco.
Ver [SEC-008](security-findings.md#sec-008--token-não-revogável-e-desacoplado-do-estado-do-usuário).

### RN-046 · CORS permite túneis de desenvolvimento
**[FATO]** O padrão default inclui `https://*.trycloudflare.com`. Aceitável em dev; **[PENDENTE]**
confirmar que não vale em produção.

---

## Tempo real

### RN-050 · Uma instalação do Desktop pertence a uma Unidade/Sonda
**[DECIDIDO 2026-08-27]** O campo `unidadeSondaId` é **obrigatório** na configuração do Desktop para
o canal de tempo real.

**[FATO]** É esse id que endereça o tópico e que o backend usa para autorizar a publicação — uma
instalação mal configurada não consegue escrever na tela de outra sonda.

⚠️ **[FATO]** Duas instalações com o mesmo `unidadeSondaId` sobrescrevem o estado uma da outra. Não
há detecção disso hoje.

**[FATO]** Sem a configuração, o Desktop **segue operando normalmente** — lê o CLP, grava local e
publica no MQTT. O tempo real é canal adicional, não requisito de funcionamento.

### RN-051 · Tempo real descarta estados intermediários; MQTT não
**[DECIDIDO 2026-08-27]** Os dois canais tratam perda de forma **deliberadamente oposta**:

| Canal | Estrutura | Se o canal ficar lento |
|---|---|---|
| MQTT (histórico) | `BlockingQueue(3600)` | Acumula; descarta o **mais antigo** só se encher |
| WebSocket (tempo real) | `AtomicReference` | Descarta o **intermediário**, mantém o mais recente |

**Por quê:** ao reconectar, a tela precisa do "agora", não de uma fila de estados velhos para
processar. Já o histórico existe justamente para não ter buracos.

**[FATO]** A fila MQTT cobre ~1 hora de broker fora. Mesmo descartando, o H2 local do Desktop mantém
o registro completo ([RN-039](#rn-039--perda-de-telemetria-em-falha-de-publicação)).

### RN-052 · Autorização de tempo real acontece no SUBSCRIBE
**[FATO]** Não basta autenticar na conexão: o destino carrega o id da unidade, e um usuário
autenticado poderia **trocá-lo à mão** para assinar a sonda de outro cliente.

A verificação usa a mesma regra do histórico
([RN-047](#rn-047--escopo-de-sondas-por-perfil)) — não há um segundo modelo de permissão para manter.

**[FATO]** Destino fora do padrão é **recusado por padrão**, para que um tópico novo não nasça sem
controle de acesso por esquecimento. Coberto por 9 testes.

### RN-053 · Estar "Online" não significa dado fresco
**[FATO]** Se a sonda parar de publicar, a conexão WebSocket permanece aberta e os cards
congelariam sem aviso.

A tela alerta após **5 segundos** sem leitura nova. **⚠️ IMPLÍCITA:** o limite de 5s foi escolhido
como ~5× o ciclo de 1s; nunca foi validado com a operação.

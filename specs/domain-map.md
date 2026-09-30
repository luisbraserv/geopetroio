# Mapa de Domínios — GeopetroIO

> Levantamento por engenharia reversa · 2026-08-26 · ver [convenção de marcação](README.md#convenção-de-marcação)

## 1. Domínios de negócio

**[INFERÊNCIA]** Após as remoções de 2026-08-26, o sistema se organiza em **três domínios ativos**.

```
┌─────────────────────────────────────────────────────────────────┐
│  IDENTIDADE E ORGANIZAÇÃO          (núcleo — todos dependem)     │
│  Empresa · Regional · Setor · Unidade/Sonda · Usuário           │
└───────────────┬─────────────────────────────────────────────────┘
                │
       ┌────────┴────────┐
       ▼                 ▼
┌──────────────┐  ┌──────────────┐      ┌ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┐
│  TELEMETRIA  │  │  CIMENTAÇÃO  │        FORA DE ESCOPO
│  Sonda · CLP │  │  Simulador   │      │ Operação (Processo)   │
│  MQTT        │  │  Carta Op.   │        Suprimentos (Químico,
│  InfluxDB    │  │  Relatórios  │      │ Almoxarifado, Compras)│
└──────────────┘  └──────────────┘        ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─
```

**[DECIDIDO 2026-08-26]** Saíram do sistema:

| Domínio | Módulos | Situação |
|---|---|---|
| **Operação** | `projeto`, `processo`, `observacao` | Removidos do backend; tela de Projetos removida do front |
| **Suprimentos** | `quimico` | Removido do backend |
| **Suprimentos** | `almoxarifado`, `compra` | Descontinuados — nunca versionados |

## 2. Núcleo — Identidade e Organização

**[FATO]** Hierarquia organizacional, extraída das entidades JPA e FKs:

```
Regional (regionais)                    nome UNIQUE NOT NULL
   │  1:N
   ├── Setor (setores)                  nome NOT NULL — SEM unique ⚠️
   │      │  1:N
   │      └── UnidadeSonda (unidades_sondas)   nome UNIQUE NOT NULL
   │                                            ▲
   │                                            └─ chave de correlação
   │                                               com a telemetria
   └── 1:N  UsuarioInterno (regional principal)

Empresa (empresas)   cnpj UNIQUE (mas nullable)
   └── 1:N  UsuarioCliente
```

**[FATO]** Com a saída de `projeto`, a Regional passou a ter apenas dois tipos de dependente: setores
e usuários internos.

✅ **[DECIDIDO 2026-09-05]** Com a remoção do vínculo organizacional do usuário
([RN-064](business-rules.md#rn-064--o-usuário-não-tem-mais-vínculo-organizacional)), a Regional passa a
ter **um único dependente: o Setor**. A hierarquia fica puramente estrutural — Regional → Setor →
Unidade/Sonda — sem nenhum ramo apontando para pessoas.

**[DECIDIDO 2026-09-05] `UnidadeSonda` ganha `tipo`:** `SONDA` · `UNIDADE_BOMBEIO` ·
`SLICKLINE_WIRELINE` · `CIMENTACAO` · `UCAQ`. O cadastro sempre abrigou mais que sondas — é o que o
próprio nome do módulo indica. Ver [RN-065](business-rules.md#rn-065--unidadesonda-tem-tipo) e, para o
efeito na telemetria, [OQ-041](open-questions.md#oq-041--o-tipo-da-unidade-define-quais-variáveis-são-monitoradas).

### Usuário — modelo de herança

**[FATO]** `SINGLE_TABLE` em `usuarios`, discriminador `tipo_usuario`, **PK é o `username`** (String,
chave de negócio — não surrogate key).

| Entidade | Discriminador | Campos próprios |
|---|---|---|
| `UsuarioEntity` (abstrata) | — | `username` (PK), `password`, `roles`, `status`, `nome`, `telefone`, `email`, endereço |
| `UsuarioInternoEntity` | `INTERNO` | `matricula`, `regional` (principal), `regionais` (N:N), `setores` (N:N) |
| `UsuarioClienteEntity` | `CLIENTE` | `clienteId`, `empresa` (String), `empresaRef` (FK), `unidadesSondas` (N:N) |

**[FATO 2026-08-27]** `UsuarioClienteEntity.unidadesSondas` é a tabela `usuario_cliente_unidades`
(`usuario_username` × `unidade_sonda_id`) e define **quais sondas o cliente enxerga** no
monitoramento. É `EAGER` de propósito: é consultada em toda checagem de acesso, e o volume por
cliente é pequeno.

⚠️ **[FATO]** `UsuarioClienteEntity` guarda a empresa **duas vezes**: `empresa` (String denormalizada)
e `empresaRef` (FK). Fonte potencial de divergência.

✅ **[DECIDIDO 2026-09-05] O vínculo N:N com regionais e setores é removido.** Existia desde
`V2026.06.03` e, desde 2026-08-27, **não influenciava nenhuma decisão** — nem no backend nem no front.
Saem a regional principal, as duas listas N:N e as tabelas `usuario_interno_regionais` e
`usuario_interno_setores`. Ver [RN-064](business-rules.md#rn-064--o-usuário-não-tem-mais-vínculo-organizacional).

## 3. Domínio de Telemetria

**[FATO]** Cadeia física → digital:

| Código | Endereço DB1 | Tipo | Grandeza | Dispositivo MQTT |
|---|---|---|---|---|
| B001 | `DBD0` | DWord (contador cumulativo) | Vazão (por delta de strokes) | `VAZAO_01` |
| B002 | `DBW4` | Word 4-20mA | Peso da Coluna | `PESO_COLUNA_01` |
| B003 | `DBW6` | Word 4-20mA | Torque Chave Hidráulica Tubos | `TORQUE_01` |
| B004 | `DBW8` | Word 4-20mA | Torque Chave Flutuante | `TORQUE_02` |
| B005 | `DBW10` | Word 4-20mA | Pressão Bomba de Lama **e** ESCP | `PRESSAO_01` |

**[FATO]** B005 alimenta **dois cards distintos** na UI com o mesmo valor físico — intencional.

**[FATO]** A chave de correlação entre telemetria e cadastro é `UnidadeSonda.nome` (ex.: `SPT-144`,
`UC-01`). A migration `V2026.06.15` afirma explicitamente que esses nomes "correspondem aos
`idSondaUnidade` usados no seed de telemetria (InfluxDB)".

### Papéis no fluxo de telemetria

**[DECIDIDO 2026-08-26]**

```
Geopetro-Desktop ──publish──► BROKER MQTT ──subscribe──► Geopetro-Telemetria
  PRODUTOR                                              CONSUMIDOR
  (existe)                                              (implementado)
                                                              │ InfluxDB
                                                              ▼
                            Front ◄──REST── Geopetro-Backend ◄──REST──
                                            (autoriza e faz proxy)
```

**[FATO]** O Geopetro-Backend **não consome MQTT** — o consumidor no-op foi removido em 2026-08-26. Seu
papel no histórico é **autorizar e consultar** séries já processadas.

### Tempo real, a partir de 2026-08-27

**[DECIDIDO 2026-08-27]** Um segundo caminho, independente do MQTT:

```
Geopetro-Desktop ──WebSocket/STOMP──► Geopetro-Backend ──► Angular
   (AtomicReference)                 retransmite      /topic/realtime/
   estado atual                      sem persistir    unidades-sondas/{id}
```

**[FATO]** O Geopetro-Backend **agora participa do WebSocket** — mas como retransmissor, não como
persistidor. Nada deste canal é gravado.

**A distinção que organiza os dois caminhos:**

| | MQTT | WebSocket |
|---|---|---|
| Pergunta | "o que aconteceu?" | "o que está acontecendo?" |
| Estrutura no produtor | `BlockingQueue` | `AtomicReference` |
| Perda aceitável | Não | **Sim, por desenho** |
| Endereçamento | `UnidadeSonda.nome` | `UnidadeSonda.id` (imune a rename) |

Contratos: [`mqtt-telemetria.md`](contracts/mqtt-telemetria.md) ·
[`rest-monitoramento.md`](contracts/rest-monitoramento.md) ·
[`websocket-realtime.md`](contracts/websocket-realtime.md).

## 4. Domínio de Cimentação

**[FATO]** Existe em **duas implementações independentes**, sem código compartilhado:

| Implementação | Onde | Escopo |
|---|---|---|
| **Simulador web** | `Front/features/simulador` (~17.800 linhas) | Cálculo de engenharia: squeeze, tampão, reologia, pasta, hidráulica, relatórios |
| **Cimentação Desktop** | `Braserv-Horus-Desktop` | Monitoramento em tempo real da bomba via CLP + Carta de Operação em PDF |

**[FATO]** O backend do simulador é **agnóstico de domínio**: persiste `formValue` como `LONGTEXT`
opaco e `operacao` como VARCHAR livre. Todo o cálculo de engenharia acontece no cliente. O backend só
organiza cenários em pastas.

**[DECIDIDO 2026-08-26]** Os dois desktops permanecem separados — produtos distintos, duplicação
aceita conscientemente ([DT-010](technical-debt.md#dt-010--duplicação-entre-os-dois-desktops)).

**[FATO]** Com as remoções, `simulador` é hoje **o único módulo de domínio de negócio próprio** que
resta no backend, além de identidade e organização.

### Poço — entidade decidida em 2026-09-05

**[DECIDIDO 2026-09-05]** `Poço` passa a ser **entidade do sistema**. Ainda **não existe em código**.

A motivação é operacional: o mesmo poço volta em vários cenários (squeeze, tampão, revisões), e
redigitar a geometria a cada vez produz divergência entre cenários que descrevem a mesma realidade
física.

```
Poço  (novo)
 ├── geometria: fases · revestimentos · sapatas
 ├── trajetória: estações de survey (MD · inclinação · azimute)
 └── 1:N  CenarioSimulador  (referencia o poço)
```

⚠️ **É a primeira vez que o backend do simulador conhece o domínio.** Hoje ele é **agnóstico** —
persiste `formValue` como `LONGTEXT` opaco e `operacao` como VARCHAR livre (§4 acima). Tirar a
geometria de dentro do blob muda essa premissa arquitetural, não apenas o schema.

**Relação com a telemetria [PENDENTE]:** a telemetria segue indexada por **sonda e tempo**, sem
segmentação por poço. Com `Poço` existindo, a ponte entre os dois eixos do sistema deixa de ser
hipotética — mas **não foi decidida**. Ver
[OQ-027](open-questions.md#oq-027--o-simulador-deve-ganhar-um-consumidor-de-telemetria).

Detalhe em [`../Geopetro-Front/specs/simulador/geometria-poco.md`](../Geopetro-Front/specs/simulador/geometria-poco.md)
e [RN-059](business-rules.md#rn-059--a-geometria-pertence-ao-poço-não-ao-cenário).

## 5. Domínios fora de escopo

**[DECIDIDO 2026-08-26]**

| Domínio | Módulos | Como saiu |
|---|---|---|
| **Operação** | `projeto`, `processo` (+anotações), `observacao` | Removidos do código. Recuperáveis do Git |
| **Suprimentos** | `quimico` | Removido do código. Recuperável do Git |
| **Suprimentos** | `almoxarifado`, `compra` | Nunca versionados — só sobreviveram `.jar` e relatórios de teste |

**Padrão observado [INFERÊNCIA]:** o sistema acumulou domínios que nunca alcançaram maturidade —
Processos nunca teve máquina de estados nem interface; Químicos nasceu de uma planilha e nunca se
integrou ao modelo relacional; Almoxarifado era tecnicamente o melhor dos três e nunca foi commitado.
A redução de escopo concentra o sistema no que de fato opera: **telemetria de sonda e cimentação**.

Registro histórico das regras descobertas em
[`business-rules.md`](business-rules.md#processos--removidos) e
[`technical-debt.md`](technical-debt.md#dt-001--código-fonte-perdido-de-almoxarifado-e-compras).

## 6. Mapa de responsabilidade por aplicação

| Domínio | Geopetro-Backend | Front | Geopetro-Desktop | Horus | Telemetria |
|---|---|---|---|---|---|
| Identidade / Autenticação | **Dono** | Consome | — | — | — |
| Organização (Regional→Sonda) | **Dono** | CRUD | — | — | — |
| Telemetria — captura | — | — | **Dono** | — | — |
| Telemetria — persistência | — | — | H2 local | — | **Dono** (InfluxDB) |
| Telemetria — autorização e consulta | **Dono** | Exibe | — | — | Fornece |
| Cimentação — cálculo | Persiste cenários | **Dono** | — | — | — |
| Cimentação — monitoramento | — | — | — | **Dono** | — |

✅ **[FATO]** Com o Geopetro-Telemetria implementado em 2026-08-27, a cadeia de telemetria está
**fechada ponta a ponta**: captura no CLP → publicação MQTT → ingestão → InfluxDB → consulta
autorizada → tela.

⚠️ **Pendências operacionais:** provisionar broker e InfluxDB, e resolver a autenticação do broker
([SEC-009](security-findings.md#sec-009--broker-mqtt-sem-autenticação)).

## 7. Modelo de autorização

**[DECIDIDO 2026-09-17]** São **8 roles**, em duas famílias, e o acesso é a **combinação** delas —
ver [RN-099](business-rules.md#rn-099--acesso-por-combinação-tipo-de-conta--permissão-de-módulo).
Frontend e backend estão alinhados (`RegrasDeAcesso` ↔ `user.model.ts`).

| Role | Família | O que concede |
|---|---|---|
| `ADMIN` | — | Acesso total, sem precisar de permissão de módulo |
| `CLIENTE` | Tipo de conta | Nada sozinha. Combinada, o escopo é ⚠️ **apenas as sondas concedidas** no cadastro |
| `INTERNO` | Tipo de conta | Nada sozinha. Combinada, o escopo é a frota inteira |
| `MONITORAMENTO` | Permissão de módulo | Monitoramento (séries) |
| `MONITORAMENTO_REAL` | Permissão de módulo | Tempo Real, Limites de Alarme e Histórico de Alarmes. **Não** depende de `MONITORAMENTO` |
| `SIMULADOR` | Permissão de módulo | A área de simuladores; qual simulador depende do domínio |
| `CIMENTACAO` | Permissão de módulo | O domínio de cimentação. Com `SIMULADOR`, abre o Simulador de Cimentação |
| `SUPORTE` | — | Configurações do sistema e gravação dos cards (RN-086). Não acompanha operação |

⚠️ **Nenhuma permissão de módulo concede nada sozinha**: `MONITORAMENTO` sem `CLIENTE` nem `INTERNO`
não abre tela alguma. Era isso que uma lista de roles não conseguia expressar.

**Removidas em 2026-09-17:** `SONDA`, `GERENCIA`, `DIRETORIA` — existiam só dentro de listas de
permissão, sem regra própria.

### A distinção que define o modelo

**[FATO]** Todos os perfis operacionais enxergam a **frota inteira**. O `CLIENTE` é a única exceção:
seu acesso é concedido **unidade a unidade** no cadastro, via a tabela `usuario_cliente_unidades`.

Isso é o que separa "quem trabalha na Braserv" de "quem é cliente da Braserv" — e é por isso que a
concessão é explícita, nunca herdada de um vínculo organizacional.

**[FATO]** `CLIENTE` combinado com outra role de acesso total prevalece pelo maior alcance: um
usuário `CLIENTE` + `ADMIN` vê a frota inteira. Há teste cobrindo isso.

### Efeito colateral: a regional saiu do controle de acesso

**[FATO]** Até 2026-08-27, um usuário interno só via sondas da sua **regional principal**. Com os
perfis operacionais passando a ver a frota inteira, essa restrição **deixou de existir** no
monitoramento — e com ela, a limitação descrita em
[RN-013](business-rules.md#rn-013--apenas-a-regional-principal-conta-para-autorização--superada) perdeu objeto.

O vínculo N:N usuário↔regional/setor continuava no modelo sem influenciar nenhuma decisão de
autorização. ✅ **[DECIDIDO 2026-09-05] Foi removido** — ver
[OQ-002](open-questions.md#oq-002--o-vínculo-regionalsetor-ainda-serve-para-alguma-coisa).

**[DECIDIDO 2026-09-05]** A seleção de sondas por usuário **continua exclusiva do `CLIENTE`**. Perfis
internos seguem enxergando a frota inteira: RN-047 e RN-048 permanecem exatamente como estão.

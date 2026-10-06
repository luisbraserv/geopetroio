# Inventário de Funcionalidades Existentes — GeopetroIO

> Levantamento por engenharia reversa · 2026-08-26 · ver [convenção de marcação](../../README.md#convenção-de-marcação)
>
> Este é o inventário **do que existe hoje**, não do que deveria existir. Comportamento
> implementado ≠ regra validada. Regras detalhadas em [`business-rules.md`](../regras/business-rules.md).
>
> **IDs são permanentes.** Funcionalidades removidas mantêm seu número, marcado como removido — os
> números não são reaproveitados, para preservar a rastreabilidade das referências.

## Índice

| # | Funcionalidade | Aplicação | Estado |
|---|---|---|---|
| [F-01](#f-01--autenticação-login) | Autenticação / Login | Braserv-Core + Front | Ativo |
| [F-02](#f-02--gestão-de-usuários) | Gestão de Usuários | Braserv-Core + Front | Ativo |
| [F-03](#f-03--autoatendimento-de-perfil) | Autoatendimento de Perfil | Braserv-Core + Front | Ativo |
| [F-04](#f-04--cadastro-de-empresas) | Cadastro de Empresas | Braserv-Core + Front | Ativo |
| [F-05](#f-05--cadastro-de-regionais) | Cadastro de Regionais | Braserv-Core + Front | Ativo |
| [F-06](#f-06--cadastro-de-setores) | Cadastro de Setores | Braserv-Core + Front | Ativo |
| [F-07](#f-07--cadastro-de-unidades) | Cadastro de Unidades | Braserv-Core + Front | Ativo |
| ~~F-08~~ | ~~Cadastro de Projetos~~ | — | **Removido 2026-08-26** |
| ~~F-09~~ | ~~Gestão de Processos~~ | — | **Removido 2026-08-26** |
| ~~F-10~~ | ~~Anotações de Processo~~ | — | **Removido 2026-08-26** |
| ~~F-11~~ | ~~Observações por Setor~~ | — | **Removido 2026-08-26** |
| ~~F-12~~ | ~~Estoque de Químicos~~ | — | **Removido 2026-08-26** |
| ~~F-13~~ | ~~Alertas de Químicos por E-mail~~ | — | **Removido 2026-08-26** |
| [F-14](#f-14--simulador-de-cimentação) | Simulador de Cimentação | Front + Backend | Ativo |
| [F-15](#f-15--monitoramento-de-unidades) | Monitoramento de Unidades | Front + Backend + Core + Telemetria | Ativo |
| [F-16](#f-16--captura-de-telemetria-na-sonda) | Captura de Telemetria na Sonda | Geopetro-Desktop | Ativo |
| [F-17](#f-17--carta-de-operação-sonda) | Carta de Operação (Sonda) | Geopetro-Desktop | Ativo |
| [F-18](#f-18--monitoramento-de-cimentação) | Monitoramento de Cimentação | Horus | Ativo |
| [F-19](#f-19--carta-de-operação-cimentação) | Carta de Operação (Cimentação) | Horus | Ativo |
| [F-20](#f-20--tempo-real-de-unidades) | **Tempo Real de Unidades** | Front + Backend + Core + Desktop | Ativo |
| [F-21](#f-21--configuração-remota-da-unidade) | Configuração remota da unidade | Backend + Desktop | Ativo |

**[FATO]** O inventário reúne **15 funcionalidades implementadas**, distribuídas em três eixos: administração
de identidade e organização (F-01 a F-07), engenharia de cimentação (F-14, F-18, F-19) e telemetria de
sonda (F-15 a F-17, F-20 e F-21). Implementação em código não indica distribuição à frota.

**[FATO 2026-08-27]** A telemetria passou a ter **dois caminhos complementares**: F-15 responde "o
que aconteceu?" (histórico, InfluxDB) e F-20 responde "o que está acontecendo?" (tempo real,
WebSocket). Ver [`websocket-realtime.md`](../../software/apis/websocket-realtime.md).

---

## F-01 · Autenticação (Login)

| Campo | Conteúdo |
|---|---|
| **Objetivo** | Autenticar usuário e emitir JWT para acesso à API |
| **Atores** | Qualquer usuário cadastrado |
| **Entradas** | `{username, password}` — aceita **username ou e-mail** |
| **Saídas** | `AutenticacaoResponse{token, username, nome, email, endereco, telefone, roles[]}` |
| **Endpoints** | `POST /api/auth/login` — **público** |
| **Servidor** | Braserv-Core |

**Fluxo principal [FATO]**
1. Front despacha ação NGXS `Login` → `AuthService.authenticate$()`.
2. Braserv-Core detecta se o identificador é e-mail (contém `@`) e busca por e-mail ou username.
3. Compara senha via BCrypt.
4. Gera JWT RS256 com `iss=braserv-core`, `tipo=usuario`, `subject=username` e claim `roles`.
5. Front persiste no `AuthState` e redireciona conforme a role.

**Regras de negócio**
- **[FATO]** Usuário inexistente e senha errada retornam a **mesma** exceção (401, "Usuário ou senha inválidos."). Não revela qual campo errou.
- **[FATO 2026-08-27]** Redirecionamento pós-login por **capacidade**, não por role literal: quem acessa Administração vai para `/app/dashboard`; quem acessa Simulador vai para `/app/simulador`; quem acessa Monitoramento vai para `/app/monitoramento-sondas`; só `INTERNO` vai para `/app/meu-usuario`. A mesma função decide o destino de `/app`, para que os dois nunca divirjam.
- **[FATO]** Não há endpoint `/me` de leitura. Os dados do usuário voltam **apenas** no login.

**Validações** — **[FATO]** `AutenticacaoRequest` **não tem** `@Valid`. O front só verifica campos não vazios.

**Erros** · `401` credenciais inválidas · `401` token expirado/ausente (HTML do servlet, **não** JSON — [DT-012](../../software/technical-debt.md#dt-012--dois-formatos-de-erro-na-api))

**Dependências** · módulos `identidade` e `usuario` do Braserv-Core · BCrypt · RS256/JWKS

**[FATO 2026-09-06]** Recuperação por e-mail implementada: link no login,
solicitação pública e tela de nova senha. Token de uso único, validade de 30 minutos,
hash no banco e limites de envio. SMTP desativado por padrão; configuração e teste
de entrega corporativa pendentes. Contrato em
[`recuperacao-senha.md`](../../../../apps/geopetro-backend/specs/recuperacao-senha.md).

**[FATO 2026-09-07]** ADMIN configura o SMTP em **Configurações → E-mail**, com
menu horizontal, ativação do envio, credencial protegida e teste de conexão.
Alterações valem sem reiniciar o backend. O teste não envia mensagens nem comprova
entrega corporativa. Detalhes em
[`configuracao-smtp.md`](../../../../apps/geopetro-backend/specs/configuracao-smtp.md).

---
## F-02 · Gestão de Usuários

| Campo | Conteúdo |
|---|---|
| **Objetivo** | Cadastrar e manter usuários internos (funcionários) e clientes |
| **Atores** | `ADMIN` |
| **Endpoints** | `POST /api/usuarios/clientes` · `POST /api/usuarios/internos` · `GET /api/usuarios?pagina&tamanho&busca` · `GET /api/usuarios/{username}` · `PATCH /api/usuarios/{username}` · `PATCH /api/usuarios/{username}/ativar` · `/desativar` |
| **Permissões** | `ROLE_ADMIN` |
| **Entidades** | `UsuarioEntity` → `UsuarioInternoEntity` / `UsuarioClienteEntity`; dados no `braserv_core` |
| **Tela** | `/app/cadastros/usuarios` |

**Fluxo [FATO 2026-10-06]** Admin escolhe o tipo (CLIENTE/INTERNO, bloqueado na edição), preenche os
dados, seleciona permissões de módulo e, para CLIENTE, escolhe as unidades concedidas.

**Regras** — ver [RN-001 a RN-009](../regras/business-rules.md#identidade-e-usuários)
- Role base (`CLIENTE`/`INTERNO`) **sempre** aplicada além das informadas.
- **[FATO 2026-08-27]** Para `CLIENTE`, o formulário oferece a seleção das **Unidades que ele poderá visualizar** no monitoramento — campo `unidadeIds`. Ver [RN-048](../regras/business-rules.md#rn-048--concessão-de-unidades-ao-cliente-é-explícita).
- **[FATO 2026-10-06]** As roles são mantidas pelo Core e incluem a permissão de módulo `UNIDADE`.

**Validações [FATO]** — domínio rico autovalidado:

| Campo | Regra |
|---|---|
| `username` | obrigatório, ≤60 chars, regex `[a-zA-Z0-9._-]+` |
| `password` | 8–20 chars, minúscula + maiúscula + dígito + especial — exceto se já for hash BCrypt |
| `email` | precisa de `@` e `.` no domínio; normalizado |
| `telefone` | DDD(2) + número(9) = 11 dígitos |
| `CEP` | 8 dígitos · `estado` 2 letras |
| `matricula` (INTERNO) | > 0 |
| `empresaId` (CLIENTE) | obrigatório e existente |

**Erros** · `400` validação · `404` empresa ou unidade inexistente · `409` usuário já existe

⚠️ **[FATO] Bug conhecido** — `PATCH /api/usuarios/{username}` **não é PATCH parcial**: omitir `telefone` ou `email` causa `400`. Ver [DT-008](../../software/technical-debt.md#dt-008--patch-que-não-é-parcial).

---

## F-03 · Autoatendimento de Perfil

| Campo | Conteúdo |
|---|---|
| **Objetivo** | Usuário editar o próprio cadastro e trocar a própria senha |
| **Atores** | Qualquer usuário autenticado |
| **Endpoints** | `PATCH /api/usuarios/me` · `PATCH /api/usuarios/me/senha` |
| **Tela** | `/app/meu-usuario` |

### ✅ Corrigido em 2026-08-26

**Estado anterior [FATO]:** `SecurityConfig` protegia `/usuarios/**` com `hasRole("ADMIN")`, o que
**incluía** `/usuarios/me`. Nenhum usuário não-administrador conseguia trocar a própria senha — recebia
`403`. Agravante: `/app/meu-usuario` é o **destino pós-login da role `INTERNO`**.

**Correção:** a regra de `/usuarios/me` passou a ser declarada **antes** da regra genérica, exigindo
apenas autenticação. Ver [SEC-003](../../software/seguranca/security-findings.md#sec-003--autoatendimento-liberado).

**Regras [FATO]** · senha atual deve conferir · nova = confirmação · **nova deve diferir da atual**

⚠️ **[DECIDIDO 2026-08-26]** A política de força de senha **não está definida formalmente**. O cadastro
admin exige 8–20 com 4 classes; a troca via `/me` valida apenas que os campos batem.
Ver [OQ-004](open-questions.md#oq-004--qual-é-a-política-de-senha).

---

## F-04 · Cadastro de Empresas

| Campo | Conteúdo |
|---|---|
| **Objetivo** | Manter empresas-cliente |
| **Atores** | `ADMIN` |
| **Endpoints** | `GET /api/empresas` · `/paginado?pagina&tamanho&busca` · `GET\|PUT\|DELETE /api/empresas/{id}` · `POST /api/empresas` |
| **Entidades** | `EmpresaEntity` (`empresas`) |
| **Tela** | `/app/cadastros/empresas` |

**Regras [FATO]** · CNPJ duplicado → `409` · CNPJ é `UNIQUE` na tabela mas **nullable**, e a checagem só roda se não for vazio · ⚠️ **exclusão sem guarda de vínculo**

**Validações [FATO]** · `@NotBlank nome` · `@Email email` · busca cobre nome e CNPJ

**Front [FATO]** · autofill de endereço por CEP via **ViaCEP chamado direto do browser** · validação client-side mínima

---

## F-05 · Cadastro de Regionais

| Campo | Conteúdo |
|---|---|
| **Objetivo** | Manter as regionais da Braserv — raiz da hierarquia organizacional |
| **Atores** | Leitura: `INTERNO`, `CIMENTACAO`, `ADMIN` · Escrita: `ADMIN` |
| **Endpoints** | `GET /api/regionais` · `/paginado` · `GET\|POST\|PUT\|DELETE /api/regionais/{id}` |
| **Entidades** | `RegionalEntity` — `nome UNIQUE NOT NULL`, `centroCusto` opcional |
| **Tela** | `/app/cadastros/regionais` (guard exige `ADMIN`) |

### ✅ Corrigido em 2026-08-26

**Estado anterior [FATO]:** não havia nenhum `requestMatchers` para `/api/regionais/**` — a rota caía
em `.anyRequest().authenticated()`. Qualquer autenticado, inclusive `CLIENTE`, podia criar, editar e
**excluir** regionais.

**Correção:** `GET` liberado aos perfis internos (as telas de Setor e Unidade precisam listar
regionais nos selects); escrita restrita a `ADMIN`. Ver
[SEC-002](../../software/seguranca/security-findings.md#sec-002--regionais-com-controle-de-acesso).

**Regras [FATO]**
- Nome duplicado, **case-insensitive** → `409`.
- **Exclusão bloqueada** se houver setor ou unidade vinculada — via guarda do Braserv-Core ([RN-017](../regras/business-rules.md#rn-017--guarda-de-exclusão--inconsistente)).

---

## F-06 · Cadastro de Setores

| Campo | Conteúdo |
|---|---|
| **Objetivo** | Manter setores vinculados a uma regional |
| **Atores** | `INTERNO`, `CIMENTACAO`, `ADMIN` |
| **Endpoints** | `GET /api/setores?regionalId` · `/paginado?busca&regionalId` · `GET\|POST\|PUT\|DELETE /api/setores/{id}` |
| **Entidades** | `SetorEntity` — `nome NOT NULL` (**sem UNIQUE**), `regional` obrigatório |
| **Tela** | `/app/cadastros/setores` |

⚠️ **Lacunas [FATO]**
- **Não valida duplicidade de nome** — ao contrário de Regional, Empresa e Unidade. A migration `V2026.06.02` foi escrita justamente para **deduplicar** setores repetidos que causavam erro 500 em produção. Os dados foram limpos; **a causa raiz não**.
- **Exclusão sem guarda de vínculo** — apagar setor em uso gera violação de FK não tratada → `500` genérico.

---

## F-07 · Cadastro de Unidades

| Campo | Conteúdo |
|---|---|
| **Objetivo** | Manter as unidades da Braserv vinculadas a um setor |
| **Atores** | Leitura: `INTERNO`, `ADMIN` · escrita: `ADMIN` ou `INTERNO`+`UNIDADE` |
| **Endpoints** | `GET /api/unidades?setorId&setorIds&regionalId&status` · `/paginado?busca` · `GET\|POST\|PUT\|DELETE /api/unidades/{id}` · `PATCH /{id}/ativar` · `/inativar` |
| **Entidades** | `UnidadeEntity` — `nome UNIQUE NOT NULL`, `apelido` opcional, `tipo`, `status`, `setor` obrigatório |
| **Servidor** | Braserv-Core |
| **Tela** | `/app/cadastros/unidades` |

⚠️ **[FATO] Criticidade especial:** `nome` (ex.: `SPT-144`, `UC-01`) é a **chave de correlação com a
telemetria** — é o `idUnidade` dos tópicos MQTT e das consultas de série. **Renomear uma unidade
quebra o histórico de telemetria**, e nada no sistema impede ou avisa. Ver
[RN-018](../regras/business-rules.md#rn-018--nome-da-unidade-é-chave-de-integração).

**Regras [FATO 2026-10-06]** · nome duplicado → `409` · nasce `ATIVA` · inativar é reversível ·
exclusão física só quando Core, Backend e Telemetria confirmam ausência total de vínculo · falha na
consulta de vínculo recusa a exclusão. Ver [RN-116](../regras/business-rules.md#rn-116--unidade-é-inativada-e-só-é-excluída-se-nunca-foi-usada).

O tipo usa os valores `SONDA`, `UNIDADE_BOMBEIO`, `SLICKLINE_WIRELINE`, `CIMENTACAO` e `UCAQ` —
[RN-065](../regras/business-rules.md#rn-065--unidade-tem-tipo).

⚠️ **O `tipo` não muda a telemetria por si.** As telas de Monitoramento e Tempo Real continuam pedindo
as mesmas cinco variáveis de sonda para qualquer unidade — ver
[OQ-041](open-questions.md#oq-041--o-tipo-da-unidade-define-quais-variáveis-são-monitoradas).

---

## F-08 a F-11 · Projetos, Processos, Anotações e Observações — REMOVIDOS

**[DECIDIDO 2026-08-26]** Os módulos `projeto`, `processo` (com anotações) e `observacao` foram
**removidos do Geopetro-Backend**, e a tela de Projetos foi removida do frontend.

### O que saiu

| ID | Funcionalidade | Módulo | Arquivos |
|---|---|---|---|
| F-08 | Cadastro de Projetos | `projeto` | 7 `.java` + tela Angular + service + models |
| F-09 | Gestão de Processos | `processo` | 15 `.java` (compartilhado com F-10) |
| F-10 | Anotações de Processo | `processo` | — |
| F-11 | Observações por Setor | `observacao` | 6 `.java` |

Endpoints removidos: `/api/projetos/**`, `/api/processos/**`, `/api/anotacoes/**`,
`/api/observacoes/**` — e os caminhos duplicados sem `/api`.

### Efeitos colaterais [FATO]

- **A falha SEC-001 deixou de existir na raiz.** Os quatro controllers com mapeamento duplo (`/api/x` e `/x`) que permitiam contornar as roles eram exatamente estes. O problema saiu junto com o código.
- **SEC-010 deixou de existir** — a ausência de filtro por setor em Observações.
- **`ProcessoSchemaInitializer` removido** — o `ApplicationRunner` que fazia `ALTER TABLE processos` a cada startup. Era a terceira estratégia conflitante de evolução de schema ([DT-002](../../software/technical-debt.md#dt-002--estratégias-conflitantes-de-evolução-de-schema)).
- **As regras RN-019 a RN-022 saíram** — incluindo a ausência de máquina de estados de Processo, que era a maior pendência de definição do sistema.
- Mensagem de erro de `RegionalService` ajustada: não menciona mais projetos vinculados.

### Tabelas órfãs

⚠️ **[FATO]** A remoção do código **não** apaga as tabelas. Permanecem no MySQL: `projetos`,
`processos`, `anotacoes`, `observacoes`. Não quebram nada (`ddl-auto=validate` ignora tabelas extras),
mas contêm dados. Ver `apps/geopetro-backend/db/cleanup/`.

### Recuperação

**[FATO]** Tudo está no histórico do Git — ver
[`apps/geopetro-backend/specs/README.md`](../../../../apps/geopetro-backend/specs/README.md#módulos-removidos).

---

## F-12 e F-13 · Químicos — REMOVIDOS

**[DECIDIDO 2026-08-26]** O módulo `quimico` foi **removido do Geopetro-Backend**.

Saíram o Estoque de Químicos (F-12) e os Alertas por E-mail (F-13), com todos os endpoints
(`/api/quimicos/**`, `/api/movimentacoes-quimico/**`, `/api/operacoes-sonda/**`,
`/api/configuracoes/**`) e entidades.

**[FATO]** Eram funcionalidades **sem interface no frontend** — a remoção não afetou nenhuma tela.

**[FATO] Efeitos colaterais:** saíram junto o **único job agendado** do sistema (`@Scheduled` diário às
08:00, e com ele `@EnableScheduling`), o **único uso de e-mail** (`spring-boot-starter-mail`), a
**única violação do grafo de dependências** entre módulos, e a falha **SEC-005** (senha SMTP em texto
puro).

⚠️ **Tabelas órfãs:** `quimicos`, `operacoes_sonda`, `movimentacoes_quimico`, `configuracoes_email`,
`alertas_email_quimico`. Script de limpeza sugerido (não executado) em
`apps/geopetro-backend/db/cleanup/2026-08-26-remove-quimico.sql`.

---

## F-14 · Simulador de Cimentação

| Campo | Conteúdo |
|---|---|
| **Objetivo** | Calcular squeeze, tampão e cimentação primária e gerar relatórios técnicos |
| **Atores** | `ADMIN` · `CLIENTE`+`SIMULADOR`+`CIMENTACAO` · `INTERNO`+`SIMULADOR`+`CIMENTACAO` — [RN-099](../regras/business-rules.md#rn-099--acesso-por-combinação-tipo-de-conta--permissão-de-módulo) |
| **Rotas** | `/app/simulador` · `/app/simulador/squeeze` · `/app/simulador/tampao` · `/app/simulador/primaria` |
| **Endpoints** | `/api/simulador/pastas[...]` · `/api/simulador/cenarios[...]` · `/cenarios/sem-pasta?operacao` |
| **Entidades** | `PastaSimuladorEntity`, `CenarioSimuladorEntity` |

**[FATO]** O cálculo ocorre no Front; o Backend persiste cenários e pastas.
Geometria, hidráulica, critérios de aceite e estado da primária estão na
[SPEC do simulador](../../../../apps/geopetro-frontend/specs/simulador/cimentacao-primaria.md).

**Capacidades de cálculo [FATO]** · tempo de espessamento (estilo API 10B-2) · curvas UCA · reologia
Bingham e lei de potência a partir de θ300..θ3 · cálculo de pasta (FAC/FAM/rendimento) · hidráulica
(ECD, perda de carga por atrito, free-fall em tubo-U) · esquemáticos de poço em SVG · relatórios de
conformidade operacional

**Saídas [FATO]** · gráficos Chart.js · relatório HTML montado por `RelatorioBuilderService` (1.540 linhas) · upload de logo (≤2MB) e esquema mecânico (≤5MB) como base64

**Regras [FATO]**
- Cenários organizados em pastas por `operacao` — o backend é agnóstico de domínio.
- ⚠️ **Sem checagem de posse**: qualquer perfil autorizado no simulador edita ou exclui cenários de outro usuário ([RN-015](../regras/business-rules.md#rn-015)) — e desde 2026-09-17 isso inclui `CLIENTE`, que passou a poder receber acesso ao simulador.
- Pasta com cenários: cascade `ALL` + `orphanRemoval`.

**[FATO]** Coerência da geometria e relações entre campos já geram bloqueios
ou avisos. Faixas quantitativas e obrigatoriedade ainda dependem da
[tabela de validação](../../../../apps/geopetro-frontend/specs/simulador/faixas-validacao.md);
veja [DT-014](../../software/technical-debt.md#dt-014--simulador-sem-validação-de-entrada).

**[FATO]** Com a remoção dos demais módulos, o `simulador` é hoje **o único domínio de negócio
próprio** que resta no backend, além da identidade e da organização.

---

## F-15 · Monitoramento de Unidades

| Campo | Conteúdo |
|---|---|
| **Objetivo** | Visualizar séries temporais de telemetria de uma unidade |
| **Atores** | `ADMIN` e conta interna com `MONITORAMENTO` (frota inteira) · `CLIENTE`+`MONITORAMENTO` (apenas as unidades concedidas) |
| **Rota** | `/app/monitoramento-sondas` — carregada sob demanda com `loadComponent` |
| **Endpoints** | `GET /api/monitoramento/unidades/minhas` · `GET /api/monitoramento/unidades/{id}/series?dispositivoId&serie&inicio&fim` |

**Fluxo [FATO]**
1. Front lista as unidades ativas do usuário (`/api/monitoramento/unidades/minhas`).
2. Usuário escolhe unidade, período (15m/1h/6h/personalizado) e dispositivos.
3. Front busca até 5 séries em paralelo (`forkJoin`) — dispositivos fixos: `PESO_COLUNA_01`, `TORQUE_01`, `TORQUE_02`, `PRESSAO_01`, `VAZAO_01`.
4. Backend consulta o acesso atual no Core e **valida o acesso à unidade**: `CLIENTE` precisa de concessão explícita; os demais perfis de monitoramento acessam a frota inteira.
5. Backend traduz o id numérico para `Unidade.nome` e chama `GET {monitoramento.base-url}/api/monitoramentos/unidades/{idUnidade}/series` via WebClient.
6. Front renderiza em **SVG desenhado à mão**, com toggle Original/Suavizada.

### ✅ Fonte de dados implementada em 2026-08-27

O serviço em `monitoramento.base-url` (default `:8081`) é o
[Geopetro-Telemetria](../../../../apps/geopetro-telemetria/specs/README.md), **implementado em
2026-08-27**. A cadeia completa — captura no CLP, publicação MQTT, ingestão, InfluxDB, consulta REST,
tela — existe agora ponta a ponta.

**[FATO]** O `MonitoramentoClient` continua degradando graciosamente: qualquer falha vira
`Optional.empty()` e o controller devolve `502` em vez de `500`.

**[FATO 2026-08-27]** O ambiente iniciado por `start-dev.cmd` habilita um seed protegido pelo profile
`dev` e pela propriedade `telemetria.seed.habilitado`. Para o dia corrente da sonda, ele substitui
somente os pontos sintéticos da `SPT-145` e grava exatamente **28.800 pontos por variável** nas cinco
séries oficiais (**144.000 pontos** no total), em lotes bloqueantes que impedem descarte por pressão
do buffer assíncrono. No build local, a tela seleciona e consulta essa sonda
automaticamente quando ela estiver presente na lista autorizada, com aviso explícito de dados
sintéticos. Produção e k8s não habilitam esse comportamento.

⚠️ **Pendências operacionais** antes de valer em produção: provisionar broker e InfluxDB, definir
`INFLUX_TOKEN` e resolver a autenticação do broker
([SEC-009](../../software/seguranca/security-findings.md#sec-009--broker-mqtt-sem-autenticação)).

**[FATO]** Acima de 2000 pontos por série a resposta vem **agregada por janela** em vez de bruta —
transparente para o frontend, que recebe a mesma forma `{dataHora, valor}`.

**Regras [FATO 2026-08-27]** — escopo definido pelo **perfil**, não mais pela regional:

| Perfil | Unidades visíveis |
|---|---|
| `ADMIN`, e `INTERNO`+`MONITORAMENTO` (ou `MONITORAMENTO_REAL`) | Frota inteira |
| `CLIENTE`+`MONITORAMENTO` | Apenas as concedidas no cadastro |
| Só `INTERNO`, ou permissão de módulo sem tipo de conta | Nenhuma |

Ver [RN-047](../regras/business-rules.md#rn-047--escopo-de-unidades-por-perfil). Erros: `403` sem acesso à unidade ·
`502` serviço de telemetria fora.

⚠️ **[FATO] Defeito corrigido:** a implementação anterior retornava `true` para qualquer usuário
não-interno — o que dava a **todo `CLIENTE` acesso a todas as sondas**. Hoje coberto por 9 testes em
`UnidadeMonitoramentoServiceTest`.

---

## F-16 · Captura de Telemetria na Sonda

| Campo | Conteúdo |
|---|---|
| **Objetivo** | Ler sensores do CLP, converter em grandezas de engenharia, gravar local e publicar via MQTT |
| **Atores** | Operador da sonda (configura) · Sistema (ciclo automático) |
| **Aplicação** | Geopetro-Desktop — **é o produtor MQTT do sistema** |
| **Entradas** | CLP Siemens S7 — DB1, leitura a cada **1 segundo** |
| **Saídas** | H2 local · MQTT `telemetria/{unidade}/batch` · dashboard JavaFX |

**Fluxo [FATO]**
1. Conecta ao CLP via Moka7/Snap7 (`ConnectTo(ip, rack=0, slot=1)` — rack/slot **fixos no código**).
2. Lê DB1 a cada 1s: `DBD0` (stroke cumulativo) + `DBW4/6/8/10` (4 sinais 4-20mA).
3. Converte para grandezas de engenharia — [RN-030 a RN-035](../regras/business-rules.md#telemetria--conversão-de-sinal).
4. Grava `SondaReading` **incondicionalmente**; `FlowRateReading` só se o card Vazão estiver visível.
5. Publica batch MQTT com as variáveis **visíveis**.
6. Atualiza os 6 cards do dashboard.

**Regras notáveis [FATO]**
- Detecta retrocesso do contador de stroke (reinício do CLP) e reseta os históricos.
- Se `unidadeId` estiver vazio, **não publica nada**.
- Falha de leitura do CLP **desconecta** o cliente S7, exigindo reconexão manual.
- ⚠️ Falha de publicação MQTT: a leitura é **perdida** para telemetria (fica só no H2). **Não há buffer de contingência** — a documentação interna descreve um que **não existe no código**.

⚠️ **[FATO]** O aviso na tela de Configurações — *"Cards desmarcados ficam ocultos e não salvam dados"*
— é **impreciso**. Desmarcar suprime a publicação MQTT, mas `SondaReading` continua sendo gravado.

⚠️ **[FATO]** `SondaReadingSeeder` insere **1000 leituras sintéticas** sempre que o banco estiver
vazio, **sem guarda de ambiente** ([DT-013](../../software/technical-debt.md#dt-013--seed-de-dados-sintéticos-sem-guarda)).

---

## F-17 · Carta de Operação (Sonda)

| Campo | Conteúdo |
|---|---|
| **Objetivo** | Gerar PDF com gráficos históricos de um período, por poço |
| **Entradas** | data/hora início e fim · título · nome do poço · até 5 variáveis |
| **Saídas** | PDF via FileChooser + cópia arquivada em `data/generated-operation-charts/` + índice TSV |

**Validações [FATO]** · título obrigatório · poço obrigatório · ≥1 variável · datas obrigatórias · hora `HH:mm:ss` · fim ≥ início — **todas com `Alert` visível**

**[FATO]** Geração de PDF **100% caseira** — escreve objetos PDF crus sem nenhuma biblioteca. Desenha
eixos, grade, polilinha e curva suavizada com operadores PDF (`re`, `m`, `l`, `c`, `Tj`).

**Telas relacionadas** · Gráficos (histórico consultável, zoom 0.5×–3.0×) · Preview da Carta

---

## F-18 · Monitoramento de Cimentação

| Campo | Conteúdo |
|---|---|
| **Objetivo** | Dashboard em tempo real da bomba de cimentação |
| **Atores** | Operador de cimentação |
| **Aplicação** | Braserv-Horus-Desktop |
| **Entradas** | CLP Siemens LOGO! — `DBD0` (stroke), `DBW4` (pressão B002) |
| **Saídas** | 4 cards (Pressão PSI, Stroke Atual, Volume Total bbl, Vazão bbl/min) · JSONL local |

**[FATO]** Ciclos distintos: **pressão a cada 250ms**, stroke/vazão/persistência a cada **1s**.

**Regras [FATO]** · IP obrigatório · timeout de conexão 5s · detecta retrocesso do contador e reseta · vazão é média móvel de **60s** · fechar a janela esconde na bandeja, não encerra

**Configuração [FATO]** · IP · constante da bomba · range de pressão (bar) · sensibilidade (0.5–1.5) · aceita separador decimal `,` ou `.` de forma inteligente (testado)


**Unidade da pressão [FATO 2026-08-28]** · O card mostra **PSI ou kgf/cm²**, escolhido em
Configuração. **A gravação continua sempre em PSI** — a conversão acontece na exibição.

⚠️ **[DECIDIDO]** Converter na leitura, não na gravação. Se a unidade escolhida chegasse ao arquivo,
o mesmo campo passaria a significar coisas diferentes conforme a configuração vigente no dia, e
séries antigas ficariam impossíveis de interpretar sem saber que configuração estava ativa quando
cada ponto foi gravado.

- 1 kgf/cm² = 14,223343307 PSI · `UnidadePressao` (7 testes)
- O **título do card** acompanha a unidade. Sem isso, um número 14x menor apareceria sob o rótulo
  "PSI", indistinguível de uma queda súbita de pressão
- kgf/cm² usa **3 casas decimais** contra 2 do PSI: com os números ~14x menores, duas casas
  apagariam variações reais
- Configuração gravada antes deste campo existir é lida como PSI
⚠️ **Tela órfã [FATO]** · "Carregar CSV" existe em FXML e controller, mas **não é alcançável** e **não faz nada** — não há parser de CSV no projeto

---

## F-19 · Carta de Operação (Cimentação)

| Campo | Conteúdo |
|---|---|
| **Objetivo** | PDF A4 paisagem com 4 gráficos de um poço/período |
| **Entradas** | nome do poço · data/hora início e fim · caminho de salvamento |
| **Saídas** | PDF com cabeçalho, 4 gráficos (Pressão, Stroke/min, Vazão, Volume Acumulado) e rodapé com estatísticas |

**Validações [FATO]** · todos os campos obrigatórios · hora `HH:mm:ss` · início ≤ fim

**[FATO]** Usa **PDFBox 2.0.32** — diferente do F-17, que escreve PDF cru. Gráficos desenhados com
`Graphics2D` e embutidos como raster, com suavização por média móvel sobreposta à série bruta.

**Unidade do relatório [FATO 2026-08-28]** · A tela permite gerar em **PSI ou kgf/cm²**, começando
na unidade configurada mas alterável a cada relatório — é comum precisar de uma cópia em kgf/cm²
para um cliente específico sem mudar a configuração da estação. A conversão acontece **ao desenhar
os gráficos**; os registros seguem em PSI. O rodapé de estatísticas usa a mesma unidade dos
gráficos: fixá-lo em PSI traria dois números diferentes para a mesma grandeza no mesmo relatório.

**Progresso da geração [FATO 2026-08-28]** · Barra de progresso com 8 etapas nomeadas (preparar,
ler registros, 4 gráficos, montar página, gravar).

⚠️ **[FATO]** Antes a geração rodava **na thread de UI**, dentro do handler do botão: a janela
congelava enquanto os quatro gráficos eram desenhados e o arquivo gravado, e o único retorno era o
alerta de sucesso surgindo do nada no fim. Sem sinal na tela, o clique parecia não ter funcionado.
Agora roda em `Task` própria, e o botão fica desabilitado durante a geração para não disparar duas.

⚠️ **[FATO] Defeito corrigido junto:** `gerarPdfComGraficos` capturava toda exceção e apenas
imprimia no console, sem relançar — a tela anunciava **"PDF gerado com sucesso"** mesmo quando
arquivo nenhum havia sido escrito. O mesmo valia para falha ao inserir um gráfico, que produzia um
relatório incompleto dado como bem-sucedido. Agora ambas viram `PdfGeracaoException` e a mensagem de
sucesso só aparece depois de o arquivo existir. Coberto por 5 testes em `PdfServiceTest`.

---

## Funcionalidades descontinuadas antes do levantamento

**[DECIDIDO 2026-08-26]** Fora de escopo. Registro em [`technical-debt.md`](../../software/technical-debt.md#dt-001--código-fonte-perdido-de-almoxarifado-e-compras).

| Módulo | Evidência encontrada |
|---|---|
| **Almoxarifado** | `.jar` com 27 classes compiladas + 33 testes passando. Código-fonte nunca commitado |
| **Compras** | 19 testes passando revelando aprovação multinível por faixa de valor. Nunca visto em código-fonte |

---

## F-20 · Tempo Real de Unidades

| Campo | Conteúdo |
|---|---|
| **Objetivo** | Acompanhar o estado instantâneo de uma Unidade, direto do CLP |
| **Atores** | Mesmos de F-15: frota inteira para os perfis operacionais; `CLIENTE` só as unidades concedidas |
| **Rota** | `/app/tempo-real` — lazy-loaded, no menu **Unidade → Tempo Real** |
| **Canal** | WebSocket/STOMP · `/topic/realtime/unidades/{id}` |
| **Contrato** | [`websocket-realtime.md`](../../software/apis/websocket-realtime.md) |

**[FATO 2026-08-27]** Implementado. Complementa F-15 sem substituí-la:

| | F-15 Monitoramento | F-20 Tempo Real |
|---|---|---|
| Origem | InfluxDB (histórico) | CLP, via WebSocket |
| Pergunta que responde | "o que aconteceu?" | "o que está acontecendo?" |
| Latência | Consulta sob demanda | ~1 segundo |
| Persistido | Sim | **Não** |

**Fluxo [FATO]**
1. A tela lista as unidades do usuário (`GET /api/monitoramento/unidades/minhas`) — mesma autorização de F-15.
2. Usuário escolhe a unidade e clica **Conectar**.
3. Front abre WebSocket, autentica com o JWT no CONNECT e assina o tópico da unidade.
4. Backend valida o acesso **no SUBSCRIBE** e retransmite o que o Desktop publica.
5. Cards atualizam a cada leitura (~1s).

**Estados exibidos [FATO]** · `Offline` · `Conectando` · `Online` · `Reconectando`

**Cards e gráficos [FATO 2026-08-27]** · A tela mostra as 6 grandezas em duas faixas, ambas em
fileiras de 3: os **cards** com o valor instantâneo e, abaixo, os **gráficos de tendência** dos
últimos 2 minutos. O card responde "quanto é agora?"; o gráfico responde "está subindo ou caindo?" —
uma pressão de 1.450 psi não diz nada sozinha, mas a curva mostra se estabilizou ou está escalando.

- Janela deslizante de **120 leituras** (`JANELA_GRAFICO`), ~2 min a 1 leitura/s, mantida em memória
  no `RealtimeService`. Limpa ao trocar de sonda e ao desconectar.
- Escala Y **recalculada a cada render** sobre a janela visível, não fixa a partir de zero — senão
  uma pressão oscilando entre 1.450 e 1.455 psi apareceria como linha reta.
- Série constante (amplitude zero) é centralizada em vez de dividir por zero, e `null` é descartado
  em vez de virar 0 — um zero falso desenharia um mergulho sugerindo queda de pressão.
- Grid de 3 colunas quebra para 2 abaixo de 1100px e para 1 abaixo de 700px: espremer um gráfico
  além disso torna a curva ilegível.

⚠️ **[DECIDIDO]** Não reusa `GraficoMonitoramentoComponent` (F-15). Aquele traz suavização por média
móvel de 8 pontos, própria de séries longas; numa janela de 2 minutos ela achataria justamente a
variação que se quer enxergar. SVG puro, sem biblioteca — são poucas dezenas de pontos.
Coberto por 6 testes em `grafico-tempo-real.component.spec.ts`.

⚠️ **[FATO]** Trocar de sonda cancela a assinatura anterior — sem isso, dois fluxos se misturariam e
os cards piscariam entre unidades.

⚠️ **[FATO] Indicador de defasagem:** estar "Online" não garante dado fresco. Se a sonda parar de
publicar, a conexão continua aberta e os cards congelariam sem aviso. A tela alerta após 5 segundos
sem leitura nova.

**Segurança [FATO]** · A autorização acontece no **SUBSCRIBE**, não só na conexão: o destino carrega
o id da unidade, e um usuário autenticado poderia trocá-lo à mão. Coberto por 9 testes em
`WebSocketAuthInterceptorTest`.

**Limitação conhecida [FATO]** · Broker STOMP em memória não propaga entre instâncias do backend.
Com mais de uma réplica, é preciso broker externo ou afinidade de sessão.

---

## F-21 · Configuração remota da unidade

**[FATO]** O Backend persiste limites por unidade, com revisão e autoria.
`GET`/`PUT /api/monitoramento/unidades/{id}/configuracao` exigem conta ativa e acesso à unidade.
O motor de alarmes usa esse documento no servidor; a tela de limites e o
histórico estão implementados. O Desktop usa limites locais independentes e
sincroniza apenas cards por STOMP. Contrato em
[`configuracao-sonda.md`](../../software/apis/configuracao-sonda.md).

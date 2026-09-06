# Dúvidas e Pontos Pendentes de Confirmação — GeopetroIO

> Levantamento por engenharia reversa · 2026-08-26 · ver [convenção de marcação](README.md#convenção-de-marcação)
>
> Estas perguntas **não podem ser respondidas pelo código**. Cada uma bloqueia ou enfraquece uma spec.
> Ao responder, mova o item para **[DECIDIDO]** com a data — não apague.
>
> **IDs são permanentes.** Perguntas resolvidas ficam marcadas, não removidas.

## Já decididas

**[DECIDIDO 2026-08-26]** — registradas para rastreabilidade.

| Pergunta | Decisão |
|---|---|
| Onde ficam as specs? | Híbrido: sistema na raiz, feature por repositório |
| Backend-Telemetria existe? | Não. Será criado como projeto novo, spec-first |
| Contrato MQTT alvo? | Batch com payload rico (1 msg/ciclo, campos descritivos no array) |
| **Quem produz e quem consome MQTT?** | **Produtor: Desktop-Sonda. Consumidor: Backend-Telemetria.** Backend-Sonda não participa |
| Almoxarifado / Compras? | Descontinuados |
| **Módulo Químicos?** | **Removido do Backend-Sonda** |
| **Módulos Projetos, Processos, Observações?** | **Removidos do Backend-Sonda e do Front** |
| Política de senha? | **Não definida** — ver [OQ-004](#oq-004--qual-é-a-política-de-senha) |
| Roles não utilizadas? | Roadmap de módulos — mantidas no modelo |
| Desktops (Sonda / Cimentação)? | Permanecem separados — duplicação aceita |
| Falhas de segurança? | Documento priorizado + correção imediata |

### Entrevista de produto — 2026-09-05

**[DECIDIDO 2026-09-05]** Primeira rodada de perguntas que o código **não podia** responder. Contexto
completo em [`product-context.md`](product-context.md).

| Tema | Decisão |
|---|---|
| Modelo comercial | Uso interno Braserv **+ cliente acompanha as sondas do trabalho dele**. `Empresa` **não** vira *tenancy* |
| Público das telas web | **Supervisão remota e cliente.** O operador na sonda não é usuário da web |
| **Alarmes por limite** | **Essenciais.** Borda **e** servidor · limite **por sonda, ajustável na hora** · tela + Desktop · **evento com histórico**, sem *ack* |
| Alarme por e-mail / SMS / WhatsApp | **Fora de escopo** — SMTP não volta ao sistema |
| **Poço** | **Vira entidade** (revisa a resposta inicial de "texto livre" na mesma entrevista) |
| Relatório do simulador | **Entregável ao cliente** — eleva [OQ-009](#oq-009--quais-são-os-limites-físicos-aceitáveis-no-simulador) a crítica |
| Congelamento de revisão do relatório | **Não** — sempre reflete o cenário atual |
| Trajetória do poço | **Survey digitado** (MD/inclinação/azimute). Importação de arquivo fora de escopo |
| Conectividade das sondas | **Varia muito por sonda** |
| Frota | **Mais de 10 sondas** |
| Atualização em campo | **Auto-update é necessário** — não existe hoje |
| Retenção do histórico | **5 anos** |
| Canal servidor → sonda | Pela **conexão WebSocket/STOMP que já existe** |
| Repositórios | **5 repos independentes** seguem valendo; o commit de monorepo é local |
| Operação da produção | **Uma pessoa**, que também desenvolve |
| Prioridade | **Simulador em curso** (geometria de poço), com spec |

### Entrevista de produto — rodada 2, 2026-09-05

**[DECIDIDO 2026-09-05]** Segunda leva: fechou pendências antigas do catálogo e os buracos que a
primeira rodada abriu.

| # | Tema | Decisão |
|---|---|---|
| OQ-002 | Vínculo usuário↔regional/setor | **Remover do cadastro.** Não afeta nada; a visibilidade de sondas fica só com role + concessão ao cliente |
| OQ-004 | Política de senha | **Unificar a regra atual** (8–20, quatro classes) **no backend**, em todos os caminhos |
| OQ-007 | Exclusão | **Bloquear quando houver vínculo**, estendendo a regra da Regional a todos os cadastros |
| OQ-017 | Rack/slot do CLP | **Iguais em toda a frota** — as constantes ficam |
| OQ-021 | Recuperação de senha | **Autoatendimento por e-mail** — ⚠️ traz SMTP de volta ao sistema |
| OQ-022 | Revogação de acesso | **Corte imediato** — desativar precisa ter efeito na hora |
| OQ-026 | Tabelas órfãs | **Descartar direto** (os scripts em `db/cleanup/` já existem) |
| OQ-029 | Autenticação entre VMs | **Firewall basta** — risco aceito e registrado |
| OQ-030 | Resolução da retenção | **1 segundo durante os 5 anos**, sem agregação |
| OQ-032 | Quem ajusta o limite | **Todos que veem a sonda**, inclusive `CLIENTE` |
| OQ-033 | Método da trajetória | **Mínima curvatura** |
| OQ-034 | Cenário × geometria | **Referencia o poço** — corrigir a geometria corrige todos os cenários dele |
| OQ-035 | Auto-update | **Baixa e instala sozinho** |
| OQ-036 | Usuário de serviço das sondas | **Um para toda a frota** — ⚠️ ver [SEC-011](security-findings.md#sec-011--credencial-única-de-frota-nas-sondas) |
| — | Cliente vê alarme | **Vê tudo**, igual à supervisão: estado atual e histórico |
| — | Sonda que para de publicar | **Não é alarme** — com conectividade variando tanto, alarmar silêncio viraria ruído constante |
| — | Histerese do alarme | **Tempo mínimo fora e dentro** da faixa |
| — | Unidade de profundidade | **Ambas na tela** (m e ft); **gravada em metros** — mesmo princípio do Horus com PSI |
| — | Cenários legados do simulador | **Abrem como estão**, sem migração forçada |
| — | Seleção de sondas por usuário | **Continua exclusiva do `CLIENTE`.** Interno segue vendo a frota inteira — RN-047 e RN-048 **inalteradas** |
| — | **Tipo da Unidade/Sonda** | Novo campo obrigatório: `SONDA`, `UNIDADE_BOMBEIO`, `SLICKLINE_WIRELINE`, `CIMENTACAO`, `UCAQ` — [RN-065](business-rules.md#rn-065--unidadesonda-tem-tipo) · efeito na telemetria em [OQ-041](#oq-041--o-tipo-da-unidade-define-quais-variáveis-são-monitoradas) |

### Entrevista de produto — rodadas 3 a 6, 2026-09-05

**[DECIDIDO 2026-09-05]** Fechou as pendências que as rodadas anteriores abriram.

| # | Tema | Decisão |
|---|---|---|
| OQ-009 | Faixas do simulador | **A equipe fornece** — tabela pronta em [`faixas-validacao.md`](../Front-Sonda-Geopetro-IO/specs/simulador/faixas-validacao.md) |
| OQ-018 | Modelo do CLP | **Varia por sonda** — a documentação que diz "LOGO!" está incompleta |
| OQ-020 | Credencial `braservone` | **Banco não existe mais** — encerra por perda de objeto |
| OQ-023 | Autenticação do broker | **Esperar o auto-update** — broker aceita anônimo até a frota migrar |
| OQ-025 | Repositórios no OneDrive | **Manter como está** — risco aceito |
| OQ-027 | Simulador × telemetria | **Não se correlacionam.** São sistemas separados — encerra |
| OQ-037 | Tempo mínimo do alarme | **Configurável por sonda**, junto do limite |
| OQ-038 | Severidade | **Dois níveis: atenção e crítico** |
| OQ-039 | Excluir sonda com histórico | **Histórico conta como vínculo** — bloqueia |
| OQ-040 | Auto-update em operação | **Só com o CLP desconectado** |
| OQ-041 | Variáveis por tipo | **Tipo é só classificação, por ora.** Telemetria segue exclusiva de sonda |
| — | Backup do MySQL | **Não é necessário** — risco aceito |
| — | Backup do InfluxDB | ⏳ **Adiado** — ver [OQ-042](#oq-042--backup-do-histórico-de-telemetria) |
| — | Rack/slot por sonda | Mantido fixo **por ora**; vira configuração por card no futuro — [OQ-043](#oq-043--mapeamento-configurável-de-card-para-endereço-no-clp) |

### Entrevista de produto — rodada final, 2026-09-05

**[DECIDIDO 2026-09-05]** Encerra a entrevista.

| # | Tema | Decisão |
|---|---|---|
| OQ-012 | Manifestos Kubernetes | **Sem objeto** — o deploy é Docker Compose em duas VMs |
| OQ-013 | Endpoints fora de `/api` | **Padronizar tudo em `/api`** — ⚠️ testes de `SecurityConfig` **antes** — [RN-079](business-rules.md#rn-079--a-api-padroniza-o-prefixo-api) |
| OQ-015 | Colunas legadas em produção | **Verificação**, não decisão — conferir antes do próximo deploy com `validate` |
| OQ-031 | Telemetria fora de ordem | **Tarefa técnica** — cobrir com teste, não é decisão de produto |
| — | Escalada de severidade | **Um episódio que escala**, gravado como log de eventos — [RN-076](business-rules.md#rn-076--o-alarme-é-registrado-como-sequência-de-fatos) |
| — | Event sourcing | **Só nos alarmes.** O resto segue CRUD com JPA |
| — | CQRS | **Já existe na telemetria** (escrita ≠ leitura) e só lá — [RN-077](business-rules.md#rn-077--cqrs-existe-na-telemetria-e-só-nela) |
| — | Perfil padrão de alarme por tipo | **Recusado** — cada sonda é configurada individualmente |
| — | Sonda sem limite | **Não alarma**, e é estado normal |
| — | Persistência do limite | Vale **até alguém trocar** |

### Perguntas encerradas pelas remoções

| # | Pergunta original | Como foi encerrada |
|---|---|---|
| OQ-001 | Qual é a máquina de estados de Processo? | ✅ Módulo `processo` removido. **Lição preservada** em [RN-019..022](business-rules.md#processos--removidos) |
| OQ-003 | Observações devem ter controle de acesso por setor? | ✅ Módulo `observacao` removido |
| OQ-006 | Estoque negativo é permitido? | ✅ Módulo `quimico` removido. **Lição preservada** em [RN-024](business-rules.md#estoque-de-químicos--removido) |
| OQ-008 | Destinatários: campo configurado ou role CIMENTACAO? | ✅ Módulo `quimico` removido |
| OQ-010 | Consumidor MQTT do Backend-Sonda: remover ou implementar? | ✅ **Removido** — papéis definidos |
| OQ-011 | Existe outro cliente consumindo módulos sem interface? | ✅ Módulos removidos — a pergunta perdeu objeto |
| OQ-024 | Rotas duplicadas sem `/api` têm consumidor legado? | ✅ Controllers removidos — não há mais rota duplicada |

### Perguntas encerradas pela implementação da telemetria (2026-08-27)

| Pergunta | Como foi encerrada |
|---|---|
| Fuso horário da telemetria | ✅ **UTC no armazenamento e no REST**; entrada MQTT segue em hora local, convertida na borda via `telemetria.zona-sonda`. Resolvido sem exigir mudança no produtor |
| Downsampling / limite de pontos | ✅ Teto configurável (default 2000); acima disso agrega por janela. Transparente ao cliente |
| Formato de `dataHora` no REST | ✅ Era **`Instant` (UTC)**, não string local — a spec anterior estava errada e foi corrigida |

---

## Bloqueantes para specs de feature

### OQ-002 · O vínculo regional/setor ainda serve para alguma coisa?

✅ **RESPONDIDA 2026-09-05** · **[DECIDIDO 2026-09-05] Não. Sai do cadastro.**

O vínculo usuário↔regional e usuário↔setor é **removido** — formulário, payload, entidade e tabelas
`usuario_interno_regionais` / `usuario_interno_setores`. A visibilidade de sondas fica definida por
**role** (perfis internos veem a frota inteira) e por **concessão explícita** ao cliente:
[RN-047](business-rules.md#rn-047--escopo-de-sondas-por-perfil) e
[RN-048](business-rules.md#rn-048--concessão-de-sondas-ao-cliente-é-explícita) permanecem **inalteradas**.

**[FATO verificado 2026-09-05]** A remoção **não derruba nenhuma guarda**: `RegionalConsultaPort` é
implementado apenas por `setor` e `unidade-sonda` — o módulo `usuario` nunca participou. Hoje, excluir
uma Regional sem setores mas **com usuários vinculados** passa pela validação e quebra em violação de
FK com `500` genérico. A remoção **elimina esse modo de falha**.

⚠️ **Arrasta junto:** [RN-007](business-rules.md#rn-007--regional-principal-entra-automaticamente-na-lista-de-regionais)
deixa de existir; `regionalId`/`regionalNome` saem do `AutenticacaoResponse` e do `AuthState` do front,
onde já eram guardados sem nenhum consumidor.

**Contexto original:**
**[MUDOU 2026-08-27]** A pergunta original era se as múltiplas regionais deveriam valer para
autorização. Ela **perdeu objeto**: com [RN-047](business-rules.md#rn-047--escopo-de-sondas-por-perfil),
o escopo passou a ser definido pelo **perfil**, e a regional saiu inteiramente do controle de acesso.

**Nova pergunta, mais séria:** o vínculo N:N usuário↔regional e usuário↔setor continua no modelo, no
cadastro e na interface — mas **não influencia mais nenhuma decisão do sistema**.

**O que precisamos decidir:**
- É informação organizacional que vale manter por si (relatórios, futura segmentação)? Ou
- É resíduo de uma regra que não existe mais, e deveria sair do cadastro?

Manter um campo que o usuário preenche e que não faz nada é dívida silenciosa: alguém vai assumir que
ele restringe algo.

---

### OQ-004 · Qual é a política de senha?

✅ **RESPONDIDA 2026-09-05** · **[DECIDIDO 2026-09-05]** Vale a regra que já existe no cadastro —
**8 a 20 caracteres com minúscula, maiúscula, dígito e caractere especial** — aplicada **no backend**,
em **todos** os caminhos, inclusive na troca pelo próprio usuário via `/usuarios/me/senha`.

Expiração, histórico de senhas e bloqueio por tentativas **não entram**. Ver
[RN-061](business-rules.md#rn-061--política-de-senha-unificada).

**Contexto original — [DECIDIDO 2026-08-26]** Não existia política formal.

**Contexto [FATO]:** duas regras diferentes no mesmo sistema — o cadastro por admin exige 8–20
caracteres com 4 classes; a troca pelo próprio usuário valida apenas que os campos batem.

**O que precisamos:** política única, aplicada no **backend** (validação de frontend é conveniência,
não controle). Definir: comprimento, classes exigidas, expiração, histórico, bloqueio por tentativas.

---

### OQ-005 · Cenários do simulador têm dono?

✅ **RESPONDIDA 2026-09-05** · **[DECIDIDO 2026-09-05] Não.** Ficam **abertos como hoje**: qualquer perfil autorizado no simulador
edita ou exclui cenário de qualquer outro. Equipe pequena e de confiança — o custo de controlar posse
não compensa.

Passa a ser **decisão consciente**, não lacuna. [RN-015](business-rules.md#rn-015--cenários-do-simulador-não-têm-dono)
deixa de ser dívida. O que se aceita junto: um relatório entregue ao cliente pode ter seu cenário
alterado depois por outra pessoa, sem registro.

**Contexto original [FATO]:** `criadoPor` é gravado como String simples, sem FK, e **nunca comparado**
com o usuário logado. Qualquer `CIMENTACAO`/`ADMIN` edita ou exclui cenários de outro usuário.

**Relevância aumentada:** com as remoções, o simulador é **o único domínio de negócio próprio do
sistema**. Suas lacunas passaram de periféricas a centrais.

**O que precisamos:** cenários são privados por usuário, compartilhados por equipe/regional, ou
globais? Isso muda a modelagem e o controle de acesso.

---

### OQ-007 · Qual é a política de exclusão do sistema?

✅ **RESPONDIDA 2026-09-05** · **[DECIDIDO 2026-09-05] Bloquear quando houver vínculo**, estendendo a
todos os cadastros a regra que hoje só a Regional aplica, com mensagem dizendo **o que** impede.
Sem exclusão lógica. Ver [RN-063](business-rules.md#rn-063--exclusão-bloqueada-por-vínculo-em-todos-os-cadastros).

⚠️ **Lacuna que a decisão não cobre:** o vínculo é **relacional**. Os 5 anos de telemetria vivem no
InfluxDB, onde não há FK. Excluir uma Unidade/Sonda sem vínculo no MySQL deixa a série órfã, sem nada
apontando para ela — ver [OQ-039](#oq-039--excluir-sonda-com-histórico-de-telemetria).

**Contexto original:**
**Contexto [FATO]:** políticas conflitantes — bloquear se houver vínculo (Regional), ou nenhuma guarda
(Setor, UnidadeSonda, Empresa → FK violation e `500` genérico).

**O que precisamos:** política declarada. Sugestão a validar: exclusão lógica (soft delete) para
entidades com histórico, bloqueio para cadastros-mestre com vínculo.

---

### OQ-009 · Quais são os limites físicos aceitáveis no simulador?

⏳ **ENCAMINHADA 2026-09-05** · **[DECIDIDO 2026-09-05]** As faixas serão **fornecidas pela equipe
técnica**. A tabela a preencher, campo a campo, está em
[`Front/specs/simulador/faixas-validacao.md`](../Front-Sonda-Geopetro-IO/specs/simulador/faixas-validacao.md).

**Segue bloqueada até os números chegarem** — mas as **regras entre campos** (ID < OD, TVD ≤ MD, base >
topo, fratura > poro) podem ser implementadas antes, porque não dependem de nenhuma faixa.
**Contexto [FATO]:** ~40 campos numéricos de engenharia sem nenhuma validação. Valores fisicamente
impossíveis produzem relatórios sem aviso.

**O que precisamos:** faixa mínima/máxima plausível por campo (MD/TVD, pesos de fluido, gradientes de
fratura e poro, pressão de operação, θ300..θ3, diâmetros). É conhecimento de engenharia de cimentação
que só a equipe técnica tem.

**Prioridade elevada:** é hoje o único domínio de negócio próprio do sistema.

⚠️ **[DECIDIDO 2026-09-05] Elevada a crítica.** O relatório do simulador é **entregue ao cliente**
([product-context §6](product-context.md#6-simulador--o-relatório-é-entregável-ao-cliente)). Deixa de
ser dívida de qualidade interna e passa a ser risco de relacionamento: um valor fisicamente impossível
produz hoje um relatório de aparência impecável, sem um único aviso, e esse relatório sai da empresa.

---

## Integrações e arquitetura

### OQ-012 · Onde vivem os manifestos de deploy?

✅ **ENCERRADA 2026-09-05 — sem objeto.** O deploy é **Docker Compose em duas VMs**, documentado em
[deploy/README.md](../deploy/README.md). Não existem manifestos Kubernetes porque não há Kubernetes.

**Resíduo [FATO]:** o build do frontend ainda usa `--configuration k8s`, que hoje significa apenas
"same-origin, nginx faz proxy" — nome herdado de um destino que não se concretizou. Renomear é
cosmético; saber que não indica Kubernetes é o que importa.

**Contexto original:**
**Contexto [FATO]:** o build do frontend usa `--configuration k8s` e o `nginx.conf` referencia os
serviços por nome (`backend-sonda:8080`, `telemetria:8081`), mas **não há nenhum manifesto Kubernetes**
no workspace.

---

### OQ-013 · Endpoints fora do padrão `/api` são deliberados?

✅ **RESPONDIDA 2026-09-05** · **[DECIDIDO 2026-09-05] Padronizar tudo em `/api`.** `/auth/login` e
`/usuarios/**` migram. Ver [RN-079](business-rules.md#rn-079--a-api-padroniza-o-prefixo-api).

⚠️ **A migração toca `SecurityConfig`, o front e o `nginx.conf` no mesmo deploy** — e a ordem dos
`requestMatchers` é exatamente onde SEC-001, SEC-002 e SEC-003 nasceram, sem nenhum teste HTTP que
detecte regressão. **Escrever os testes de `SecurityConfig` antes de mover as rotas.**

**Contexto original:**
**Contexto [FATO]:** `/auth/login` e `/usuarios/**` ficam fora do prefixo `/api`, enquanto todo o resto
usa `/api/{recurso}`. Pode ser design (serviço de identidade separado) ou inconsistência.

---

### OQ-014 · ~~Qual é a lista canônica de roles?~~ — RESPONDIDA
**[DECIDIDO 2026-08-27]** São **7**: `ADMIN`, `CLIENTE`, `INTERNO`, `CIMENTACAO`, `SONDA`,
`GERENCIA`, `DIRETORIA`. Backend e frontend alinhados, e **todas com efeito real**.

Ver [DT-011](technical-debt.md#dt-011--divergência-de-roles-backend--frontend).

---

## Ambiente, dados e operação

### OQ-015 · As colunas legadas ainda existem em produção?

⏳ **ENCAMINHADA 2026-09-05** · **[DECIDIDO 2026-09-05] É verificação, não decisão.** Conferir no banco
de produção antes do próximo deploy com `ddl-auto=validate` — divergência entre schema e entidades
impede a aplicação de subir.

**Ganhou companhia:** a mesma verificação vale agora para o descarte das tabelas órfãs
([OQ-026](#oq-026--o-que-fazer-com-as-tabelas-órfãs)), para a coluna nova `tipo`
([RN-065](business-rules.md#rn-065--unidadesonda-tem-tipo)) e para a remoção de
`usuario_interno_regionais` / `usuario_interno_setores`
([RN-064](business-rules.md#rn-064--o-usuário-não-tem-mais-vínculo-organizacional)) — quatro mudanças de
schema decididas hoje, todas manuais, todas antes do deploy.

**Contexto original:**
**Contexto [FATO]:** `migration-regional.sql` tem passos comentados para remover `setores.regional` e
`projetos.setor_id`, com instrução *"após validar os dados"*. Sem registro de execução.

**Por que importa:** com `ddl-auto=validate` em produção, divergência entre schema e entidades impede
a aplicação de subir.

**Nota:** parte dessa pergunta perdeu urgência — `projetos` não é mais entidade mapeada.

---

### OQ-016 · A escala analógica do CLP foi confirmada? — ✅ **RESOLVIDA 2026-08-31**

**Era [FATO]:** comentário no próprio código dizia *"A escala 0..1000 é preservada até sua confirmação
no PLC"* — a conversão inteira dependia de uma premissa que os desenvolvedores marcavam como não
validada.

**Resposta:** a escala **não era** 0–1000. O bloco *Analog Amplifier* está configurado com
*Measurement Range* −50..750 e `Offset -250`, então o Ax publicado vai de −50 (4 mA) a 750 (20 mA).
A conversão foi reescrita conforme [RN-030](business-rules.md#rn-030--conversão-do-ax-do-logo--psi)
e a escala antiga removida do código.

**[FATO]** A premissa errada tinha duas consequências que já se manifestavam: valores fora de faixa
e leitura *unsigned* de um Ax que pode ser negativo. Ambas corrigidas.

⚠️ **Permanece em aberto:** confirmar em campo, com calibrador de laço, que o amplificador de **cada
canal** está com essa mesma configuração. A conversão hoje assume −50..750 para os quatro. Um canal
configurado diferente produz leitura proporcionalmente errada, e o Ax cru no rodapé do card é o que
denuncia.
---

### OQ-017 · Rack/slot do CLP valem para toda a frota?

✅ **RESPONDIDA 2026-09-05** · **[DECIDIDO 2026-09-05] Sim — toda a frota usa a mesma configuração.**
`rack=0, slot=1` continuam constantes no código do Desktop-Sonda; só o IP segue configurável. Se uma
sonda futura divergir, isso vira campo de configuração — não é o caso hoje.

**Contexto original:**
**Contexto [FATO]:** `rack=0, slot=1` são **constantes fixas** no Desktop-Sonda (o Horus usa `slot=0`).
Apenas o IP é configurável pela interface.

**O que precisamos:** todas as sondas usam a mesma configuração? Se alguma precisar de valores
diferentes, hoje não há como configurar sem recompilar.

---

### OQ-018 · Qual é o modelo real de CLP?

✅ **RESPONDIDA 2026-09-05** · **[DECIDIDO 2026-09-05] Varia por sonda.** Não há modelo único na frota —
a documentação que chama tudo de "Siemens LOGO!" está incompleta e deve ser corrigida onde aparecer.

⚠️ **Tensão com [OQ-017](#oq-017--rackslot-do-clp-valem-para-toda-a-frota):** modelos diferentes
costumam exigir rack/slot diferentes — o próprio sistema já mostra isso, com o Desktop-Sonda usando
`slot=1` e o Horus, que lê um LOGO!, usando `slot=0`. **[DECIDIDO 2026-09-05]** As constantes ficam como
estão **por ora**; a configuração por card ([OQ-043](#oq-043--mapeamento-configurável-de-card-para-endereço-no-clp))
é a saída planejada.
**Contexto [FATO]:** a documentação chama de "Siemens LOGO!", mas o acesso usa protocolo S7 completo
com leitura de Data Block por rack/slot — padrão mais típico de S7-300/1200/1500.

---

### OQ-019 · Perda de telemetria em falha de MQTT é aceitável?

✅ **RESPONDIDA 2026-09-05** · **[DECIDIDO 2026-09-05] Não é aceitável.** A conectividade **varia muito por sonda** e o histórico tem
retenção de 5 anos como valor de produto — lacuna é perda, não inconveniente. O **buffer de
contingência deixa de ser opcional** e entra na spec do Desktop-Sonda.

⚠️ **Duas consequências que a resposta abre:**
- O buffer só chega à frota com **auto-update**, que não existe ([product-context §4](product-context.md#4-realidade-de-campo)).
- O reenvio produz telemetria **fora de ordem** — ver [OQ-031](#oq-031--o-consumidor-tolera-telemetria-fora-de-ordem).

**Contexto original [FATO]:** se a publicação falha, a leitura daquele ciclo é perdida para telemetria
remota (fica só no H2 local). Não há buffer de contingência — a documentação promete um que não existe.

---

### OQ-020 · A credencial do banco `braservone` ainda é válida?

✅ **RESPONDIDA 2026-09-05** · **[DECIDIDO 2026-09-05] O banco não existe mais.** A credencial não dá
acesso a nada — a questão encerra por perda de objeto, e [SEC-006](security-findings.md#sec-006--credencial-mysql-no-histórico-do-git)
deixa de ser explorável.

⚠️ **Resíduo que permanece:** a senha continua legível no histórico do Git. Se aquele valor foi
**reutilizado** em qualquer outro sistema, ele segue comprometido lá — desativar o banco não desfaz isso.
O arquivo, inerte em runtime, ainda deve sair do projeto.
**Contexto [FATO]:** credencial MySQL em texto plano no histórico do Git do Horus, desde o commit
inicial, apontando para um banco sem relação identificada com o GeopetroIO.

**Ação independente da resposta:** rotacionar.
Ver [SEC-006](security-findings.md#sec-006--credencial-mysql-no-histórico-do-git).

---

### OQ-021 · Recuperação de senha é planejada?

✅ **RESPONDIDA 2026-09-05** · **[DECIDIDO 2026-09-05] Sim — autoatendimento por e-mail.**

⚠️ **Consequência de arquitetura:** isso **traz o SMTP de volta ao sistema**. A integração de e-mail
saiu com o módulo `quimico` em 2026-08-26 e a decisão sobre alarmes manteve isso — mas recuperação de
senha por autoatendimento não existe sem envio de e-mail. As duas decisões convivem: **e-mail volta
para identidade, não para alarme.**

**Contexto original [FATO]:** não existe fluxo. O link "Esqueci minha senha" aponta para `/`, e o
checkbox "Lembrar acesso" não tem binding — ambos devem sair da tela até o fluxo existir.

---

### OQ-022 · Revogação imediata de acesso é requisito?

✅ **RESPONDIDA 2026-09-05** · **[DECIDIDO 2026-09-05] Sim — corte imediato.** Desativar um usuário
precisa ter efeito na hora, sem esperar o token expirar. Encerra
[SEC-008](security-findings.md#sec-008--token-não-revogável-e-desacoplado-do-estado-do-usuário) como
decisão e o abre como trabalho.

**Custo aceito:** o `JwtAuthenticationFilter` passa a precisar do estado do usuário a cada requisição.
Um cache curto (poucos segundos) preserva quase toda a vantagem do JWT sem estado e mantém o corte
praticamente imediato. Ver [RN-062](business-rules.md#rn-062--desativar-usuário-corta-o-acesso-na-hora).

**Contexto original [FATO]:** desativar um usuário não tem efeito até o token expirar (1h) — o filtro
lê as roles do token sem reconsultar o banco.

---

### OQ-023 · Qual broker MQTT será usado em produção?

✅ **RESPONDIDA** · **Broker:** Mosquitto, já configurado em [`deploy/vm2-telemetria`](../deploy/README.md).
**[DECIDIDO 2026-09-05] Autenticação:** ativada **depois** que a frota tiver auto-update — até lá o
broker aceita conexão anônima.

⚠️ **O que essa decisão não resolve:** o auto-update precisa **chegar** às sondas, e as instalações
atuais não o têm. A primeira distribuição é presencial de qualquer forma. O caminho eficiente é **uma
única rodada de campo** instalando uma versão que já traga auto-update, credencial MQTT, formato-alvo do
payload e buffer de contingência — depois disso, tudo é remoto. Ver
[SEC-009](security-findings.md#sec-009--broker-mqtt-sem-autenticação) e
[OQ-035](#oq-035--como-o-desktop-sonda-se-atualiza-em-campo).
**Contexto [FATO]:** hoje o Desktop-Sonda conecta **sem autenticação**. A escolha afeta custo por
mensagem — que foi a razão original do formato batch.

**Urgência elevada [FATO 2026-08-27]:** o Backend-Telemetria já está implementado e pronto para
consumir. O suporte a credenciais existe (`MQTT_USERNAME` / `MQTT_PASSWORD`) e o serviço loga um aviso
quando conecta sem elas — mas **falta decidir e provisionar o broker**. É hoje o item que bloqueia a
telemetria de entrar em operação. Ver [SEC-009](security-findings.md#sec-009--broker-mqtt-sem-autenticação).

---

### OQ-028 · Qual é a política de retenção do InfluxDB?

✅ **RESPONDIDA 2026-09-05** · **[DECIDIDO 2026-09-05] 5 anos.**

**[INFERÊNCIA]** Com mais de 10 sondas, são ~1,6 bilhão de pontos por ano — **~8 bilhões em 5 anos**.
Reter isso em resolução de 1 segundo numa VM única é caro e degrada a consulta. A implementação
esperada é **retenção em camadas** (bruto curto + agregados de resolução decrescente), via
*downsampling* contínuo do InfluxDB.

⚠️ **Segue aberto o degrau seguinte:** [OQ-030](#oq-030--5-anos-em-que-resolução).

**Contexto original [FATO 2026-08-27]:** o serviço grava 5 pontos por segundo por sonda,
continuamente. Não havia política de retenção definida.

---

### OQ-029 · A API de telemetria precisa de autenticação serviço-a-serviço?

✅ **RESPONDIDA 2026-09-05** · **[DECIDIDO 2026-09-05] Não — o firewall basta.** Risco aceito
conscientemente: a proteção da telemetria da frota passa a depender **inteiramente** de a porta 8081 da
VM-2 estar restrita ao IP da VM-1. Um erro de regra de firewall expõe toda a telemetria, sem passar por
nenhuma autorização.

Mitigação que já consta em [deploy/README.md](../deploy/README.md): restringir `1883` à faixa das
sondas e `8081` ao IP da VM-1.

**Contexto original:**
**Contexto [FATO]:** o `WebClient` do Backend-Sonda chama a telemetria **sem credencial**, e o serviço
aceita. Se os dois estiverem na mesma rede fechada (mesmo cluster/namespace), é aceitável; se não,
qualquer host com acesso lê a telemetria de qualquer sonda, sem passar pela autorização por regional.

**O que precisamos:** confirmar a topologia de rede de produção.

---

### OQ-025 · Os repositórios podem sair do OneDrive?

✅ **RESPONDIDA 2026-09-05** · **[DECIDIDO 2026-09-05] Não — ficam onde estão.** Risco aceito
conscientemente, e sem as mitigações paliativas (excluir `.git/`, `target/` e `node_modules/` da
sincronização também foi recusado).

⚠️ **[FATO observado 2026-09-05]** Durante esta própria entrevista, o OneDrive impediu leitura de
arquivos duas vezes: `git status` falhou com `read error ... Invalid argument` e `mmap failed` em 16
arquivos do Backend-Telemetria, e um `grep` recebeu `Permission denied` em arquivos do simulador. Não é
risco teórico — é o comportamento corrente do ambiente.

**Consequência registrada:** a perda de histórico Git pode se repetir, e trabalho não commitado é o mais
exposto. Ver [DT-004](technical-debt.md#dt-004--risco-de-onedrive-sobre-repositórios-git).
**Contexto [FATO]:** o OneDrive já corrompeu um `.git` completo, é causa provável da perda do código de
almoxarifado/compras, e **durante este levantamento** bloqueou um `mvnw clean`.

**O que precisamos:** autorização para mover os repositórios para fora da árvore sincronizada. É a
mitigação de maior impacto do levantamento.
Ver [DT-004](technical-debt.md#dt-004--risco-de-onedrive-sobre-repositórios-git).

---

## Novas perguntas abertas pelas remoções

### OQ-026 · O que fazer com as tabelas órfãs?

✅ **RESPONDIDA 2026-09-05** · **[DECIDIDO 2026-09-05] Descartar direto**, sem exportar. Os scripts em
`Backend-Sonda-Geopetro-IO/db/cleanup/` já existem, comentados e nunca executados.

✅ **Resolve junto o resíduo de [SEC-005](security-findings.md#sec-005--senha-smtp-em-texto-puro):** a
tabela `configuracoes_email`, que guarda uma senha SMTP em texto puro, some com o descarte. ⚠️ Se
aquela conta de e-mail for a mesma que voltará a ser usada na recuperação de senha
([OQ-021](#oq-021--recuperação-de-senha-é-planejada)), **rotacione a senha** — apagar a linha não
desfaz a exposição.

**Contexto original:**
**Contexto [FATO]:** a remoção dos módulos não apaga as tabelas. Permanecem no MySQL com dados de
negócio:

| Origem | Tabelas |
|---|---|
| `projeto` | `projetos` |
| `processo` | `processos`, `anotacoes` |
| `observacao` | `observacoes` |
| `quimico` | `quimicos`, `operacoes_sonda`, `movimentacoes_quimico`, `configuracoes_email`, `alertas_email_quimico` |

Não quebram nada — `ddl-auto=validate` ignora tabelas extras. Mas ocupam espaço, confundem quem
inspeciona o schema, e `configuracoes_email` contém uma **senha SMTP em texto puro**.

**O que precisamos:** os dados devem ser exportados, arquivados ou descartados? Script sugerido (não
executado) em `Backend-Sonda-Geopetro-IO/db/cleanup/`.

---

### OQ-027 · O simulador deve ganhar um consumidor de telemetria?
**Contexto [INFERÊNCIA]:** com a redução de escopo, o sistema tem dois eixos — cimentação e telemetria
— hoje **sem nenhuma conexão entre si**. O Horus monitora a bomba de cimentação via CLP local e grava
em JSONL; o simulador calcula operações de cimentação no navegador; a telemetria da sonda vai para o
InfluxDB.

**Pergunta:** existe intenção de que o simulador use dados reais de telemetria (ex.: comparar pressão
prevista × pressão medida durante um squeeze)? Isso mudaria substancialmente a arquitetura-alvo.

**Não há evidência de código nesse sentido** — é uma pergunta de produto, não uma inferência sobre
código existente.

✅ **RESPONDIDA 2026-09-05** · **[DECIDIDO 2026-09-05] Não. Simulador e telemetria são sistemas
separados, sem correlação.**

O `Poço` continua existindo — mas **apenas no domínio do simulador**, como dono da geometria e da
trajetória. A telemetria segue indexada por **sonda e tempo**, sem segmentação por poço, e nenhuma tela
sobrepõe curva prevista a curva medida.

**O que isso encerra:** a hipótese de o simulador consumir telemetria real (previsto × medido) sai do
horizonte de produto. Se voltar, volta como decisão nova — não como continuidade desta.

---

## Novas perguntas abertas pela entrevista de produto (2026-09-05)

✅ **A rodada 2 respondeu quase todas no mesmo dia:** **OQ-030** (1 segundo durante os 5 anos),
**OQ-032** (todos que veem a sonda ajustam o limite), **OQ-033** (mínima curvatura), **OQ-034**
(cenário referencia o poço), **OQ-035** (baixa e instala sozinho) e **OQ-036** (um usuário de serviço
para toda a frota). Detalhe de cada uma na [tabela da rodada 2](#entrevista-de-produto--rodada-2-2026-09-05).

⏳ **Segue aberta: [OQ-031](#oq-031--o-consumidor-tolera-telemetria-fora-de-ordem)** — é técnica, não de
produto, e se resolve com teste.

### OQ-030 · 5 anos, em que resolução?
**Contexto [DECIDIDO 2026-09-05]:** a retenção é de 5 anos. Não foi definido se o dado precisa estar
disponível **em resolução de 1 segundo** durante todo esse período, ou se agregados de resolução
decrescente atendem ao uso real (auditoria, comprovação ao cliente, análise de falha).

**Por que importa:** a diferença é de uma ordem de grandeza em armazenamento e no custo de consulta.
Definir antes de acumular volume é muito mais barato que migrar depois.

---

### OQ-031 · O consumidor tolera telemetria fora de ordem?

⏳ **ENCAMINHADA 2026-09-05** · **[DECIDIDO 2026-09-05] Não é decisão de produto — é tarefa técnica.**

**Como fechar:** testes cobrindo lote atrasado chegando depois de leituras mais novas, em três pontos —
`TelemetriaPayloadParser`, a agregação por janela da consulta, e a avaliação de alarme no servidor
([`features/alarmes.md §3`](features/alarmes.md#3-a-pergunta-que-a-avaliação-dupla-obriga-a-responder)).
A persistência já é segura: o InfluxDB aceita escrita fora de ordem e é idempotente por
`measurement + tags + timestamp`.

⚠️ **O caso que mais importa é o alarme:** um lote atrasado faz o evento nascer **depois** do fato. Uma
excursão de ontem, recebida hoje, não deve acender a tela como se estivesse acontecendo agora.
**Contexto:** com o buffer de contingência decidido em [OQ-019](#oq-019--perda-de-telemetria-em-falha-de-mqtt-é-aceitável),
a sonda passa a reenviar leituras acumuladas ao voltar da queda de rede. Elas chegam **depois** de
leituras mais novas.

**[FATO]** O InfluxDB aceita escrita fora de ordem e é idempotente por `measurement + tags + timestamp`,
então a **persistência** não quebra. O que **não** foi verificado: a agregação por janela na consulta,
o `TelemetriaDevSeeder` e a avaliação de alarmes no servidor
([`features/alarmes.md §3`](features/alarmes.md#3-a-pergunta-que-a-avaliação-dupla-obriga-a-responder))
diante de um lote atrasado.

**Nenhum teste hoje exercita esse caso.**

---

### OQ-032 · Quem pode ajustar o limite de alarme?
**Contexto [DECIDIDO 2026-09-05]:** o limite é **por sonda e ajustável na hora**, na própria tela de
monitoramento — não no cadastro por `ADMIN`.

**O que precisamos:** quais perfis ajustam? Se for todo perfil que enxerga a sonda, o `CLIENTE` também
ajustaria o alarme da operação que está pagando. Se for só `ADMIN`, deixa de ser "ajustável na hora"
na prática.

**Relacionada:** o `CLIENTE` deve **ver** o alarme? Transparência ou exposição, dependendo do contrato.

---

### OQ-033 · Método de cálculo da trajetória
**Contexto [DECIDIDO 2026-09-05]:** o survey será digitado como estações de MD, inclinação e azimute.

**O que precisamos:** mínima curvatura (padrão da indústria), tangencial, ou balanced tangential? Como
o relatório é entregue ao cliente, o método deve estar declarado — e provavelmente impresso no próprio
relatório.

---

### OQ-034 · Cenário referencia ou copia a geometria do poço?
**Contexto [DECIDIDO 2026-09-05]:** `Poço` vira entidade e o cenário deixa de carregar a geometria
dentro do `formValue`.

**O que precisamos:** o cenário aponta para o poço (e acompanha edições futuras da geometria) ou copia
a geometria ao ser salvo (e congela)? Como o relatório **não** é congelado, referenciar é o coerente —
mas então **editar a geometria do poço muda relatórios antigos**, inclusive já entregues.

---

### OQ-035 · Como o Desktop-Sonda se atualiza em campo?
**Contexto [DECIDIDO 2026-09-05]:** auto-update é necessário e **não existe**. Hoje a única via é
instalador `.exe` por instalação.

**Por que é o item mais bloqueante da lista:** trava simultaneamente o formato-alvo do MQTT, os limites
de alarme na borda, o buffer de contingência e a ativação da autenticação do broker — que
[deploy/README.md](../deploy/README.md) exige fazer **depois** de atualizar a frota.

**O que precisamos:** mecanismo (canal de atualização, assinatura do pacote, *rollback*), e quem
autoriza a atualização de uma sonda em operação — atualizar durante uma manobra não é aceitável.

---

### OQ-036 · Qual é o usuário de serviço de cada sonda?
**Contexto [FATO]:** o [contrato WebSocket](contracts/websocket-realtime.md#4-autenticação-e-autorização)
determina que o Desktop autentica em `/auth/login` com **credenciais de um usuário de serviço** e usa o
JWT no CONNECT.

✅ **RESPONDIDA 2026-09-05** · **[DECIDIDO 2026-09-05] Um usuário de serviço para toda a frota.**

⚠️ **O que isso implica, e não é óbvio:** esse usuário precisa ter acesso a **todas** as sondas — logo,
a verificação por unidade no SEND ([RN-050](business-rules.md#rn-050--uma-instalação-do-desktop-pertence-a-uma-unidadesonda))
**deixa de ser uma fronteira entre sondas**. Qualquer instalação passa a poder publicar no tópico de
qualquer outra; o que separa uma da outra é a configuração local, não a autorização. Registrado como
[SEC-011](security-findings.md#sec-011--credencial-única-de-frota-nas-sondas).

**Contexto original [FATO]:** o [contrato WebSocket](contracts/websocket-realtime.md#4-autenticação-e-autorização)
determina que o Desktop autentica em `/auth/login` com credenciais de um usuário de serviço e usa o JWT
no CONNECT.

---

## Abertas pela rodada 2 (2026-09-05)

✅ **Todas respondidas nas rodadas 3 e 4, no mesmo dia:** **OQ-037** (tempo mínimo configurável por
sonda), **OQ-038** (atenção e crítico), **OQ-039** (histórico conta como vínculo), **OQ-040** (só com o
CLP desconectado) e **OQ-041** (tipo é só classificação, por ora). Detalhe na
[tabela das rodadas 3 a 6](#entrevista-de-produto--rodadas-3-a-6-2026-09-05).

### OQ-037 · Quantos segundos de tempo mínimo no alarme?
**Contexto [DECIDIDO 2026-09-05]:** a histerese será por **tempo mínimo fora e dentro** da faixa.
O valor não foi definido.

**O que precisamos:** quantos segundos fora da faixa antes de abrir o evento, e quantos dentro antes de
fechar? Os dois valores são iguais? São configuráveis por sonda, junto com o limite, ou fixos no
sistema? Muito curto polui o histórico; muito longo atrasa o alerta de uma excursão real.

---

### OQ-038 · Alarme tem severidade?
**Contexto:** não foi decidido se existe um nível único ou uma distinção entre *atenção* e *crítico*.

**O que precisamos:** um nível só mantém o modelo simples. Dois níveis (por exemplo, faixa de atenção
antes do limite duro) dão ao operador tempo de reagir antes do problema — mas dobram os campos de
configuração por sonda e por grandeza.

---

### OQ-039 · Excluir sonda com histórico de telemetria
**Contexto [DECIDIDO 2026-09-05]:** a exclusão passa a ser bloqueada quando houver **vínculo**. Mas o
vínculo é relacional, e os 5 anos de telemetria vivem no InfluxDB, sem FK.

**O que precisamos:** uma Unidade/Sonda sem vínculo no MySQL, porém com anos de série gravada, pode ser
excluída? Se sim, a série fica órfã — sem nada no sistema apontando para ela, e sem como consultá-la
pela tela. Provável resposta: o histórico conta como vínculo.

---

### OQ-040 · Auto-update durante operação
**Contexto [DECIDIDO 2026-09-05]:** o Desktop-Sonda **baixa e instala sozinho**.

**O que precisamos:** o que impede a atualização de reiniciar o app no meio de uma manobra? Opções a
avaliar: janela horária, exigir o CLP desconectado, ou adiar enquanto houver leitura ativa. Sem alguma
regra desse tipo, a atualização automática vira risco operacional em vez de conveniência.

---

### OQ-041 · O tipo da unidade define quais variáveis são monitoradas?
**Contexto [DECIDIDO 2026-09-05]:** `UnidadeSonda` passa a ter **tipo** — `SONDA`, `UNIDADE_BOMBEIO`,
`SLICKLINE_WIRELINE`, `CIMENTACAO`, `UCAQ` ([RN-065](business-rules.md#rn-065--unidadesonda-tem-tipo)).

**[FATO]** Hoje a tela de Monitoramento consulta **cinco dispositivos fixos** para qualquer unidade —
`PESO_COLUNA_01`, `TORQUE_01`, `TORQUE_02`, `PRESSAO_01` e `VAZAO_01` — e o Tempo Real mostra as mesmas
seis grandezas para todas. O vocabulário de dispositivos do
[contrato MQTT](contracts/mqtt-telemetria.md#4-vocabulário-de-dispositivos) também é único.

**O problema:** peso de coluna e torque de chave hidráulica **não existem** numa unidade de bombeio nem
numa de slickline. Uma unidade de cimentação mede pressão e vazão da bomba, não torque de tubos. Com o
tipo no cadastro e o conjunto de variáveis fixo, essas telas mostrariam cards permanentemente vazios.

**O que precisamos decidir:**
- Cada tipo tem seu próprio conjunto de variáveis, e a tela monta os cards a partir dele?
- O vocabulário de dispositivos cresce para cobrir os equipamentos novos?
- Ou o tipo é, por ora, **apenas classificação de cadastro**, sem efeito na telemetria?

⚠️ **Isto é maior do que parece:** hoje o Desktop-Sonda é escrito para o CLP **de sonda** — cinco
endereços fixos no DB1, com as conversões de peso de coluna e torque. Um equipamento de tipo diferente
tem outro CLP, outros endereços e outras grandezas. O tipo no cadastro é barato; **capturar telemetria
de equipamentos que não são sonda é um projeto**.

✅ **RESPONDIDA 2026-09-05** · **[DECIDIDO 2026-09-05] O tipo é apenas classificação de cadastro, por
ora.** A telemetria continua exclusiva de sonda, com as mesmas cinco variáveis. Unidades de outro tipo
existem no cadastro sem monitoramento.

**Caminho de saída já identificado:** [OQ-043](#oq-043--mapeamento-configurável-de-card-para-endereço-no-clp)
— com o mapeamento card→endereço configurável, instrumentar uma UCAQ ou uma unidade de bombeio deixa de
exigir código novo. As duas questões se resolvem juntas.

---

## Abertas pelas rodadas 3 a 6 (2026-09-05)

### OQ-042 · Backup do histórico de telemetria
**Contexto [DECIDIDO 2026-09-05]:** a retenção é de **5 anos em resolução de 1 segundo**, e o InfluxDB
da VM-2 é hoje a **única cópia**. Perder o disco, a VM ou sofrer ransomware significa perder o histórico
inteiro.

**[DECIDIDO 2026-09-05] Adiado** — será estruturado em outro momento.

**Nota [FATO]:** existe uma cópia parcial de fato — cada Desktop mantém em H2 local o registro completo
das leituras daquela sonda ([RN-039](business-rules.md#rn-039--perda-de-telemetria-em-falha-de-publicação)).
Não é backup utilizável: a restauração seria manual, sonda por sonda, e só alcança máquinas ainda
instaladas e com disco íntegro. Serve como último recurso, não como plano.

⚠️ **[DECIDIDO 2026-09-05] O MySQL não terá backup** — risco aceito. Vale registrar o que isso inclui:
usuários, empresas, regionais, setores, unidades e **os cenários do simulador**, que são a origem dos
relatórios entregues a clientes. Nada disso é reconstruível a partir de outro lugar.

---

### OQ-043 · Mapeamento configurável de card para endereço no CLP
**[DECIDIDO 2026-09-05 — melhoria futura]** Cada card do Desktop-Sonda passaria a declarar **onde** ler
seu valor: *"card 1 é pressão, está no rack X, slot Y, endereço Z"*.

**Contexto [FATO]:** hoje o mapeamento é fixo no código — DB1, `DBD0` e `DBW4/6/8/10`, com `rack=0` e
`slot=1` constantes. Só o IP é configurável.

**Por que importa mais do que parece:**
- Resolve [OQ-017](#oq-017--rackslot-do-clp-valem-para-toda-a-frota) e [OQ-018](#oq-018--qual-é-o-modelo-real-de-clp) de uma vez — com o modelo variando por sonda, o endereçamento deixa de ser premissa global;
- É o caminho prático para [OQ-041](#oq-041--o-tipo-da-unidade-define-quais-variáveis-são-monitoradas): instrumentar equipamento que não é sonda vira **configuração**, não desenvolvimento.

**O que precisa ser decidido quando entrar:** o que fica configurável (endereço apenas, ou também o
tipo de dado e a conversão), quem configura, e como essa configuração chega à sonda — provavelmente
pelo mesmo canal do [RN-057](business-rules.md#rn-057--a-configuração-desce-pelo-canal-de-tempo-real-e-a-sonda-pede-ao-reconectar).

⚠️ **Conversão não é endereço.** Peso de coluna e torque têm fórmulas próprias, com geometria e
calibração ([RN-030 a RN-034](business-rules.md#telemetria--conversão-de-sinal)). Tornar o endereço
configurável **não** torna a grandeza configurável — é preciso decidir até onde a flexibilidade vai.

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
**[DECIDIDO 2026-08-26]** Não existe política formal. **Segue pendente de definição.**

**Contexto [FATO]:** duas regras diferentes no mesmo sistema — o cadastro por admin exige 8–20
caracteres com 4 classes; a troca pelo próprio usuário valida apenas que os campos batem.

**O que precisamos:** política única, aplicada no **backend** (validação de frontend é conveniência,
não controle). Definir: comprimento, classes exigidas, expiração, histórico, bloqueio por tentativas.

---

### OQ-005 · Cenários do simulador têm dono?
**Contexto [FATO]:** `criadoPor` é gravado como String simples, sem FK, e **nunca comparado** com o
usuário logado. Qualquer `CIMENTACAO`/`ADMIN` edita ou exclui cenários de outro usuário.

**Relevância aumentada:** com as remoções, o simulador é **o único domínio de negócio próprio do
sistema**. Suas lacunas passaram de periféricas a centrais.

**O que precisamos:** cenários são privados por usuário, compartilhados por equipe/regional, ou
globais? Isso muda a modelagem e o controle de acesso.

---

### OQ-007 · Qual é a política de exclusão do sistema?
**Contexto [FATO]:** políticas conflitantes — bloquear se houver vínculo (Regional), ou nenhuma guarda
(Setor, UnidadeSonda, Empresa → FK violation e `500` genérico).

**O que precisamos:** política declarada. Sugestão a validar: exclusão lógica (soft delete) para
entidades com histórico, bloqueio para cadastros-mestre com vínculo.

---

### OQ-009 · Quais são os limites físicos aceitáveis no simulador?
**Contexto [FATO]:** ~40 campos numéricos de engenharia sem nenhuma validação. Valores fisicamente
impossíveis produzem relatórios sem aviso.

**O que precisamos:** faixa mínima/máxima plausível por campo (MD/TVD, pesos de fluido, gradientes de
fratura e poro, pressão de operação, θ300..θ3, diâmetros). É conhecimento de engenharia de cimentação
que só a equipe técnica tem.

**Prioridade elevada:** é hoje o único domínio de negócio próprio do sistema.

---

## Integrações e arquitetura

### OQ-012 · Onde vivem os manifestos de deploy?
**Contexto [FATO]:** o build do frontend usa `--configuration k8s` e o `nginx.conf` referencia os
serviços por nome (`backend-sonda:8080`, `telemetria:8081`), mas **não há nenhum manifesto Kubernetes**
no workspace.

---

### OQ-013 · Endpoints fora do padrão `/api` são deliberados?
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
**Contexto [FATO]:** `migration-regional.sql` tem passos comentados para remover `setores.regional` e
`projetos.setor_id`, com instrução *"após validar os dados"*. Sem registro de execução.

**Por que importa:** com `ddl-auto=validate` em produção, divergência entre schema e entidades impede
a aplicação de subir.

**Nota:** parte dessa pergunta perdeu urgência — `projetos` não é mais entidade mapeada.

---

### OQ-016 · A escala analógica 0–1000 do CLP foi confirmada?
**Contexto [FATO]:** comentário no próprio código (`PlcConnectionService.java:181`): *"A escala 0..1000
é preservada até sua confirmação no PLC"*. **Os próprios desenvolvedores marcam como não validado.**

**Por que importa:** toda a conversão de sinal depende disso. Erro aqui produz dado operacional errado
silenciosamente, em toda a frota. Ver [RN-030](business-rules.md#rn-030--conversão-4-20ma--psi).

**Prioridade elevada:** com o foco do sistema concentrado em telemetria, esta é a pergunta de maior
impacto técnico em aberto.

---

### OQ-017 · Rack/slot do CLP valem para toda a frota?
**Contexto [FATO]:** `rack=0, slot=1` são **constantes fixas** no Desktop-Sonda (o Horus usa `slot=0`).
Apenas o IP é configurável pela interface.

**O que precisamos:** todas as sondas usam a mesma configuração? Se alguma precisar de valores
diferentes, hoje não há como configurar sem recompilar.

---

### OQ-018 · Qual é o modelo real de CLP?
**Contexto [FATO]:** a documentação chama de "Siemens LOGO!", mas o acesso usa protocolo S7 completo
com leitura de Data Block por rack/slot — padrão mais típico de S7-300/1200/1500.

---

### OQ-019 · Perda de telemetria em falha de MQTT é aceitável?
**Contexto [FATO]:** se a publicação falha, a leitura daquele ciclo é perdida para telemetria remota
(fica só no H2 local). Não há buffer de contingência — a documentação promete um que não existe.

**O que precisamos:** o negócio tolera lacunas no histórico remoto durante queda de rede? Se não, o
buffer precisa entrar na spec do Desktop-Sonda — e o consumidor precisará tratar mensagens **fora de
ordem** e **duplicadas**.

**Momento oportuno:** decidir **antes** de o Backend-Telemetria ser implementado.

---

### OQ-020 · A credencial do banco `braservone` ainda é válida?
**Contexto [FATO]:** credencial MySQL em texto plano no histórico do Git do Horus, desde o commit
inicial, apontando para um banco sem relação identificada com o GeopetroIO.

**Ação independente da resposta:** rotacionar.
Ver [SEC-006](security-findings.md#sec-006--credencial-mysql-no-histórico-do-git).

---

### OQ-021 · Recuperação de senha é planejada?
**Contexto [FATO]:** não existe fluxo. O link "Esqueci minha senha" aponta para `/`, e o checkbox
"Lembrar acesso" não tem binding.

---

### OQ-022 · Revogação imediata de acesso é requisito?
**Contexto [FATO]:** desativar um usuário não tem efeito até o token expirar (1h) — o filtro lê as
roles do token sem reconsultar o banco.

**O que precisamos:** existe requisito de corte imediato de acesso (demissão, incidente)? Se sim, o
modelo atual não atende. Ver [SEC-008](security-findings.md#sec-008--token-não-revogável-e-desacoplado-do-estado-do-usuário).

---

### OQ-023 · Qual broker MQTT será usado em produção?
**Contexto [FATO]:** hoje o Desktop-Sonda conecta **sem autenticação**. A escolha afeta custo por
mensagem — que foi a razão original do formato batch.

**Urgência elevada [FATO 2026-08-27]:** o Backend-Telemetria já está implementado e pronto para
consumir. O suporte a credenciais existe (`MQTT_USERNAME` / `MQTT_PASSWORD`) e o serviço loga um aviso
quando conecta sem elas — mas **falta decidir e provisionar o broker**. É hoje o item que bloqueia a
telemetria de entrar em operação. Ver [SEC-009](security-findings.md#sec-009--broker-mqtt-sem-autenticação).

---

### OQ-028 · Qual é a política de retenção do InfluxDB?
**Contexto [FATO 2026-08-27]:** o serviço grava 5 pontos por segundo por sonda, continuamente. Com 20
sondas são ~8,6 milhões de pontos por dia. Não há política de retenção definida.

**O que precisamos:** por quanto tempo o histórico bruto fica disponível? Faz sentido um bucket de
retenção curta para dado bruto e outro com dados agregados para histórico longo (*downsampling*
contínuo do InfluxDB)?

**Por que importa agora:** definir antes de acumular volume é muito mais barato que migrar depois.

---

### OQ-029 · A API de telemetria precisa de autenticação serviço-a-serviço?
**Contexto [FATO]:** o `WebClient` do Backend-Sonda chama a telemetria **sem credencial**, e o serviço
aceita. Se os dois estiverem na mesma rede fechada (mesmo cluster/namespace), é aceitável; se não,
qualquer host com acesso lê a telemetria de qualquer sonda, sem passar pela autorização por regional.

**O que precisamos:** confirmar a topologia de rede de produção.

---

### OQ-025 · Os repositórios podem sair do OneDrive?
**Contexto [FATO]:** o OneDrive já corrompeu um `.git` completo, é causa provável da perda do código de
almoxarifado/compras, e **durante este levantamento** bloqueou um `mvnw clean`.

**O que precisamos:** autorização para mover os repositórios para fora da árvore sincronizada. É a
mitigação de maior impacto do levantamento.
Ver [DT-004](technical-debt.md#dt-004--risco-de-onedrive-sobre-repositórios-git).

---

## Novas perguntas abertas pelas remoções

### OQ-026 · O que fazer com as tabelas órfãs?
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

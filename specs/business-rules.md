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
✅ **[DECIDIDO 2026-09-05]** A política passa a ser **esta mesma**, aplicada no **backend** em todos os
caminhos — inclusive na troca pelo próprio usuário, que hoje não a aplica. Ver
[RN-061](#rn-061--política-de-senha-unificada) e [OQ-004](open-questions.md#oq-004--qual-é-a-política-de-senha).

### RN-005 · Nova senha deve diferir da atual
**[FATO]** `AlterarSenhaUsuarioUseCase.alterar` exige senha atual válida, nova = confirmação, e nova ≠ atual.

### RN-006 · Role base é sempre aplicada
**[FATO]** `criarCliente` sempre inclui `CLIENTE`; `criarInterno` sempre inclui `INTERNO`, além das
roles informadas.

### RN-007 · ~~Regional principal entra automaticamente na lista de regionais~~ — REVOGADA
**[DECIDIDO 2026-09-05]** O vínculo usuário↔regional/setor **sai do sistema** — a regra perde objeto
junto com os campos. Ver [OQ-002](open-questions.md#oq-002--o-vínculo-regionalsetor-ainda-serve-para-alguma-coisa)
e [RN-064](#rn-064--o-usuário-não-tem-mais-vínculo-organizacional).

**O que dizia [FATO]:** `CriarUsuarioUseCase.resolverRegionais` — se uma regional principal fosse
informada, ela **sempre** era adicionada ao conjunto de regionais do usuário interno.

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
[OQ-002](open-questions.md#oq-002--o-vínculo-regionalsetor-ainda-serve-para-alguma-coisa).

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
✅ **[DECIDIDO 2026-09-05]** Fica **como está**, por escolha: equipe pequena e de confiança, o custo de
controlar posse não compensa. Deixa de ser dívida e passa a ser decisão registrada — encerra
[OQ-005](open-questions.md#oq-005--cenários-do-simulador-têm-dono).

⚠️ **O que se aceita junto:** o relatório é **entregue ao cliente** e **não é congelado**. Um cenário
que originou um relatório entregue pode ser alterado depois por outra pessoa, sem registro de quem nem
de quando.

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

✅ **[DECIDIDO 2026-09-05]** Passa a existir política declarada: **bloquear quando houver vínculo**, em
todos os cadastros, com mensagem dizendo o que impede. Ver
[RN-063](#rn-063--exclusão-bloqueada-por-vínculo-em-todos-os-cadastros) e
[OQ-007](open-questions.md#oq-007--qual-é-a-política-de-exclusão-do-sistema).

**O que era [FATO]:** não existia política declarada de integridade referencial. Cada módulo decidiu
isoladamente, e só `Regional` tinha guarda completa.

**Nota histórica:** o módulo `quimico` (removido) tinha **duas políticas opostas dentro de si** —
excluir `OperacaoSonda` era bloqueado se houvesse movimentações, mas excluir `Quimico` apagava todo o
histórico em cascata, com perda irreversível de auditoria.

### RN-018 · Nome da Unidade/Sonda é chave de integração
**[FATO]** `UnidadeSonda.nome` (ex.: `SPT-144`, `UC-01`) é o `idSondaUnidade` usado nos tópicos MQTT e
nas consultas de série temporal. Confirmado pela migration `V2026.06.15`.
**⚠️ IMPLÍCITA e crítica:** renomear uma unidade **quebra o histórico de telemetria**, e nada no
sistema impede ou avisa sobre isso.

⚠️ **[DECIDIDO 2026-09-05] Agravada pela retenção de 5 anos.** Quanto mais histórico acumula, mais caro
fica o dia em que alguém renomear uma sonda para corrigir um erro de digitação. É o risco de maior
custo da base, e cresce sozinho. Mitigações possíveis, nenhuma decidida: bloquear o rename quando
houver histórico, migrar a chave do InfluxDB para o id numérico (como o tempo real já faz), ou manter
um mapa de nomes anteriores.

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

### RN-030 · Conversão do Ax do LOGO! → PSI
**[FATO 2026-08-31]** `ConversaoPressao` (Desktop-Sonda) — ponto único de conversão.

O bloco *Analog Amplifier* do LOGO! já reescalona o laço 4–20 mA para a faixa configurada em
*Measurement Range*. Com `Minimum -50`, `Maximum 750`, `Gain 1,00` e `Offset -250`:

```
 4 mA -> Ax = -50        12 mA -> Ax = 350        20 mA -> Ax = 750

fracao = (Ax + 50) / 800
bar    = fracao × rangeSensorBar        (faixa do transmissor, por canal)
psi    = bar × 14,5037738 × sensibilidade
```

⚠️ **[FATO] O Ax não é pressão nem corrente** — é a posição no laço. Convertê-lo de novo para mA,
ou tratá-lo como bar direto, aplica o escalonamento duas vezes e produz números plausíveis e errados.

⚠️ **[FATO] Leitura com sinal.** O offset −250 leva a base da escala a valores negativos. Lido como
Word *unsigned*, `-50` chega como `65486` e vira pressão absurda. `ConversaoPressao.axComoSigned`
reinterpreta como inteiro de 16 bits com sinal.

⚠️ **[DECIDIDO] Sem clamp.** Ax fora de −50..750 é preservado como veio e **sinalizado** — `WARN`
no log com endereço e valor, e o Ax cru visível em vermelho no rodapé do card. Recortar em silêncio
esconderia laço aberto, sensor sem alimentação ou bloco com outra escala. Substitui a decisão
anterior de limitar em zero.

**[FATO]** A escala antiga 0–1000 → mA foi **removida** junto com suas constantes, para que não haja
como reconverter por engano. Coberto por 11 testes em `ConversaoPressaoTest`.

### RN-031 · Peso da coluna pela cadeia do sargento
**[FATO 2026-08-31]** `PesoColunaCalculator`. O sensor está no **sargento (deadline anchor)** e mede
a reação da linha morta — não o peso no gancho.

```
P_corrigida = max(0, P - P0)                  P0 = zero do sensor, apenas offset
F_sensor    = P_corrigida × A                 (psi × pol² = lbf)
Torque      = F_sensor × L                    L = braço do sensor
R_efetivo   = (D_tambor + D_cabo) / 2
T_deadline  = (Torque / R_efetivo) × K        K = fator de calibração
HookLoad    = T_deadline × N                  N = número de linhas
PesoColuna  = max(0, HookLoad - W_catarina)
```

⚠️ **[DECIDIDO]** Substitui `peso = pressão × área × fator`, que era **fisicamente incompleto**:
devolvia apenas a força hidráulica na célula, ignorando alavanca do sargento, raio do tambor, número
de linhas e tara do conjunto móvel. O resultado não tinha relação dimensional com o peso da coluna.

⚠️ **[FATO] O diâmetro do cabo entra no braço, não na área.** A tração age na linha de centro do
cabo, então o raio efetivo é `(tambor + cabo) / 2`. Não há `π·D²/4` nesta conversão.

⚠️ **[FATO] A Catarina é descontada no fim, nunca via `pressaoZeroPsi`.** Descontada como offset de
pressão, a tara escalaria junto com o número de linhas e o erro cresceria com a carga.

**[FATO] Modelo estático.** `HookLoad ≈ T_deadline × N` vale com a Catarina parada ou quase-estática.
Atrito de polias, eficiência das sheaves, flexão do cabo e aceleração criam diferença entre linhas —
e dependem do sentido do movimento, o que um fator único não modela. Fica para um modelo dinâmico
separado. **Calibrar com a Catarina parada.**

**Calibração:** `K = CargaSuspensaReal / CargaSuspensaCalculada`. Se a referência for o peso líquido,
somar a Catarina antes. K muito distante de 1,0 indica geometria errada, não falta de calibração.

**[FATO]** Valores intermediários preservados em `PesoColunaCalculo` e exibidos na tela de
configuração — durante a calibração importa saber em qual etapa a conta se afasta. Coberto por 13
testes em `PesoColunaCalculatorTest`.
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

⚠️ **[DECIDIDO 2026-09-05] Parcialmente superada.** Desativar um usuário passa a **cortar o acesso na
hora** ([RN-062](#rn-062--desativar-usuário-corta-o-acesso-na-hora)). O que **permanece verdadeiro**: um
token vazado de usuário **ativo** continua válido até expirar — não há revogação de token individual,
apenas verificação do estado do usuário.

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
o registro completo ([RN-039](#rn-039---perda-de-telemetria-em-falha-de-publicação)).

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

---

## Regras decididas em 2026-09-05 — ainda não implementadas

> **[DECIDIDO 2026-09-05]** Vieram da entrevista de produto, não do código. Nenhuma tem implementação
> hoje. Estão aqui porque, pela regra do repositório, **a mudança de comportamento começa pela spec**.
> Contexto em [`product-context.md`](product-context.md) · detalhe em [`features/alarmes.md`](features/alarmes.md).

### RN-054 · O escopo do alarme é a sonda, e o limite muda na hora
**[DECIDIDO 2026-09-05]** O limite é definido **por Unidade/Sonda e por grandeza**, ajustável pela
supervisão **na própria tela de monitoramento**, sem passar pelo cadastro.

⚠️ **Consequência aceita:** sem entidade que delimite a operação, o limite ajustado para o trabalho de
hoje continua valendo semana que vem, para outro trabalho, até alguém lembrar de trocar. Não há "fim do
trabalho" que o sistema reconheça.

### RN-055 · Os dois lados avaliam, só o servidor registra
**[DECIDIDO 2026-09-05]** O Desktop avalia e **sinaliza localmente** (funciona sem rede); o servidor
avalia e é o **único produtor do histórico de eventos**.

**Por quê:** dois produtores do mesmo evento exigiriam deduplicação por janela, com relógios diferentes
nos dois lados. **Custo aceito:** excursão ocorrida com a sonda offline alerta o operador local e **não
entra no histórico**.

### RN-056 · Um evento por excursão, não por leitura
**[DECIDIDO 2026-09-05]** O evento tem início, fim e valor extremo. A 1 leitura/s, registrar por leitura
produziria 600 linhas para 10 minutos fora da faixa.

**[PENDENTE]** Histerese e tempo mínimo fora/dentro — sem isso, um valor oscilando na fronteira abre e
fecha dezenas de eventos por minuto.

### RN-057 · A configuração desce pelo canal de tempo real, e a sonda pede ao reconectar
**[DECIDIDO 2026-09-05]** O que o servidor precisa mandar para a sonda (limites hoje, versão de
atualização depois) desce pela **conexão WebSocket/STOMP que já existe** — não por MQTT, que reverteria
a decisão de um produtor e um consumidor no broker.

**Regra obrigatória:** ao conectar e ao **reconectar**, o Desktop pede a configuração vigente. Sem isso,
um limite alterado enquanto a sonda estava fora nunca chegaria, e ela operaria com valor velho sem que
ninguém percebesse.

### RN-058 · Telemetria remota não pode ter lacuna
**[DECIDIDO 2026-09-05]** Supera [RN-039](#rn-039---perda-de-telemetria-em-falha-de-publicação): a perda
de ciclo em falha de publicação **deixa de ser aceitável**. O Desktop passa a acumular e reenviar.

⚠️ **Abre:** telemetria fora de ordem no consumidor ([OQ-031](open-questions.md#oq-031--o-consumidor-tolera-telemetria-fora-de-ordem))
e dependência de auto-update para chegar à frota ([OQ-035](open-questions.md#oq-035--como-o-desktop-sonda-se-atualiza-em-campo)).

### RN-059 · A geometria pertence ao poço, não ao cenário
**[DECIDIDO 2026-09-05]** `Poço` vira entidade. Geometria e trajetória saem de dentro do `formValue`
opaco do cenário e passam a pertencer ao poço, que o cenário referencia.

**[FATO]** Antes desta entrega, o backend do simulador persistia o formulário como
`LONGTEXT` opaco. O cadastro de poços introduz geometria tipada e validação de domínio no backend.

**[DECIDIDO 2026-09-05]** Referência por id — [RN-067](#rn-067--o-cenário-referencia-o-poço).

**[FATO 2026-09-06]** Cadastro e vínculo implementados no working tree. O poço
guarda geometria tipada em metros, validada pelo backend; o cenário vinculado
carrega a geometria atual. Cenários legados continuam sem vínculo. Contrato e
migration em [simulador-pocos.md](../Backend-Sonda-Geopetro-IO/specs/simulador-pocos.md).

### RN-060 · TVD é derivado da trajetória, não digitado
**[DECIDIDO 2026-09-05]** Com o survey (estações de MD, inclinação e azimute), o TVD passa a ser
**calculado**. Hoje é entrada digitada por fase, com interpolação linear dentro do trecho.

⚠️ **Manter os dois caminhos convida a divergência** entre o TVD que o engenheiro digitou e o que a
trajetória calcula. Sem trajetória informada, o comportamento atual continua valendo — poço vertical ou
aproximação por fase.

✅ **[DECIDIDO 2026-09-05]** Método: **mínima curvatura** — ver [RN-066](#rn-066--mínima-curvatura-e-profundidade-gravada-em-metros).

---

## Regras da rodada 2 — 2026-09-05

> **[DECIDIDO 2026-09-05]** · **[FATO 2026-09-06]** A rodada 2 está **inteiramente implementada** no
> working tree — RN-061, RN-062, RN-063, RN-064 e RN-065. Contrato e verificação em [identidade-e-cadastro.md](../Backend-Sonda-Geopetro-IO/specs/identidade-e-cadastro.md).

### RN-061 · Política de senha unificada
**[DECIDIDO 2026-09-05]** **8 a 20 caracteres**, com minúscula, maiúscula, dígito e caractere especial.
Vale em **todos** os caminhos, validada **no backend** — inclusive em `PATCH /usuarios/me/senha`, que
hoje só confere se os dois campos batem.

**Não entram:** expiração periódica, histórico de senhas anteriores e bloqueio por tentativas.

⚠️ **Efeito na base atual:** senhas existentes que não atendam à regra continuam funcionando no login —
a validação incide sobre a **definição** de senha, não sobre a verificação. Forçar adequação exigiria
troca compulsória, que não foi decidida.

**[FATO 2026-09-06]** Implementada em `PoliticaSenha`, aplicada nos três caminhos que definem senha.
14 testes. Espaço em branco não conta como caractere especial. Ver [identidade-e-cadastro.md](../Backend-Sonda-Geopetro-IO/specs/identidade-e-cadastro.md).

### RN-062 · Desativar usuário corta o acesso na hora
**[DECIDIDO 2026-09-05]** Supera parte de [RN-045](#rn-045--sessão-expira-em-1-hora-sem-renovação):
`PATCH /usuarios/{username}/desativar` passa a ter **efeito imediato**, sem esperar o token expirar.

**Implementação esperada:** o `JwtAuthenticationFilter` consulta o estado do usuário; um cache de poucos
segundos evita uma consulta por requisição sem tornar o corte perceptivelmente mais lento.

⚠️ **O que continua valendo:** não há revogação de **token individual**. Um token vazado de usuário
ativo segue válido até expirar.

**[FATO 2026-09-06]** Implementada em `ContaAtivaVerificador`, consultada pelo `JwtAuthenticationFilter`
com cache de 10s (`security.cache-status-segundos`) — o cache é a janela do corte. **O login também
passou a checar o status**, que antes não era verificado em nenhum ponto: sem isso, o corte seria
contornado por um novo login. Ver [identidade-e-cadastro.md](../Backend-Sonda-Geopetro-IO/specs/identidade-e-cadastro.md).

### RN-063 · Exclusão bloqueada por vínculo, em todos os cadastros
**[DECIDIDO 2026-09-05]** A regra que só a Regional aplica passa a valer para **Setor, Unidade/Sonda e
Empresa**: havendo vínculo, a exclusão é recusada com mensagem dizendo **o que** impede — em vez do
`500` genérico de violação de FK de hoje.

**Sem exclusão lógica.** Nada de `ativo=false` como substituto de apagar.

⚠️ **Não cobre o histórico:** o vínculo verificado é relacional, e a telemetria vive no InfluxDB sem FK.
Ver [OQ-039](open-questions.md#oq-039--excluir-sonda-com-histórico-de-telemetria).

**[FATO 2026-09-06]** Implementada como `VinculoCadastroPort` + `GuardaDeExclusao`, que **substituem**
o antigo `RegionalConsultaPort`. Duas mudanças sobre o mecanismo anterior: vale para os quatro
cadastros, e a porta devolve **a descrição do que impede**, não um booleano — a recusa passou de
*"existem setores ou unidades/sondas vinculados"* para *"2 setores vinculados e 1 unidade/sonda
vinculada"*. A guarda consulta **todas** as fontes antes de recusar, para não revelar um impedimento
por vez. A ressalva acima deixou de valer: o histórico entra pela mesma porta, via
[RN-072](#rn-072--histórico-de-telemetria-conta-como-vínculo).

### RN-064 · O usuário não tem mais vínculo organizacional
**[DECIDIDO 2026-09-05]** Saem do sistema: `regional` principal, a lista N:N de regionais e a lista N:N
de setores do usuário interno — entidade, formulário, payload e as tabelas `usuario_interno_regionais`
e `usuario_interno_setores`.

**Motivo:** desde 2026-08-27 esses campos não influenciam nenhuma decisão. Campo preenchido que não faz
nada é dívida silenciosa — alguém assume que restringe acesso.

**O que decide visibilidade continua sendo:** a **role** ([RN-047](#rn-047--escopo-de-sondas-por-perfil))
e, para o cliente, a **concessão explícita de unidades** ([RN-048](#rn-048--concessão-de-sondas-ao-cliente-é-explícita)).
Ambas **inalteradas**.

**[FATO verificado 2026-09-05]** Nenhuma guarda depende desses vínculos — `RegionalConsultaPort` é
implementado só por `setor` e `unidade-sonda`. A remoção **elimina** um modo de falha: hoje, excluir uma
Regional com usuários vinculados e sem setores passa pela validação e quebra em FK.

**[FATO 2026-09-06]** Removida ponta a ponta: domínio, entidade, request, command, response, front e as
duas tabelas. `regionalId`/`regionalNome` saíram também do `AutenticacaoResponse` e do `AuthState`.
**Arrastou código morto junto:** `RegionalBuscaPort` e `SetorConsultaPort` ficaram sem chamador e foram
removidos com seus adaptadores; `RegionalConsultaPort` permanece. Ver [identidade-e-cadastro.md](../Backend-Sonda-Geopetro-IO/specs/identidade-e-cadastro.md).

### RN-065 · Unidade/Sonda tem tipo
**[DECIDIDO 2026-09-05]** `UnidadeSonda` ganha o campo **`tipo`**, de vocabulário fechado:

| Valor | Equipamento |
|---|---|
| `SONDA` | Sonda de perfuração / workover |
| `UNIDADE_BOMBEIO` | Unidade de bombeio |
| `SLICKLINE_WIRELINE` | Slickline / wireline |
| `CIMENTACAO` | Unidade de cimentação |
| `UCAQ` | Unidade de cimentação e acidificação |

**Por que importa além do cadastro:** o nome do módulo é `unidade-sonda` justamente porque a entidade
sempre foi mais ampla que "sonda". O tipo torna isso explícito e passa a permitir que a interface trate
equipamentos diferentes de forma diferente.

✅ **[DECIDIDO 2026-09-05] O tipo não altera a telemetria** — ver
[RN-074](#rn-074--o-tipo-não-altera-o-que-é-monitorado-por-ora). A tela continua consultando os mesmos
cinco dispositivos, e unidades que não são sonda ficam sem monitoramento.

**[PROPOSTA 2026-09-05] A função concreta do tipo hoje é outra:** carregar um **perfil de limites de
alarme padrão**, aplicado no cadastro da unidade — ver [RN-071](#rn-071--o-alarme-tem-dois-níveis-atenção-e-crítico).
Sem isso, cada unidade nova exige preencher 30 campos de alarme do zero.

⚠️ **Migração:** as unidades já cadastradas precisam de um valor. `SONDA` é o padrão coerente com a
frota atual, mas isso deve ser conferido registro a registro antes de tornar o campo obrigatório.

**[FATO 2026-09-06]** Implementado como enum fechado no backend e select no cadastro, com o tipo
editável para corrigir o backfill. A migration adiciona a coluna nula, faz o backfill e só então a
torna obrigatória. **Sem perfil de alarme por tipo** — a proposta foi recusada em
[RN-078](#rn-078--sem-perfil-padrão-de-alarme-o-limite-vale-até-alguém-trocar). Ver [identidade-e-cadastro.md](../Backend-Sonda-Geopetro-IO/specs/identidade-e-cadastro.md).

### RN-066 · Mínima curvatura, e profundidade gravada em metros
**[DECIDIDO 2026-09-05]** A trajetória é calculada por **mínima curvatura** — padrão da indústria, e o
método que se espera declarado num relatório entregue ao cliente.

**Unidade:** a tela oferece **metros e pés**; o armazenamento é **sempre em metros**, com conversão na
exibição.

**Por quê:** é a mesma decisão que o Horus tomou para PSI e kgf/cm² em 2026-08-28
([F-19](current-features.md#f-19--carta-de-operação-cimentação)). Se a unidade escolhida chegasse ao
arquivo, o mesmo campo passaria a significar coisas diferentes conforme a configuração vigente no dia.

### RN-067 · O cenário referencia o poço
**[DECIDIDO 2026-09-05]** O cenário guarda o **id do poço**, não uma cópia da geometria.

**Consequência aceita:** corrigir a geometria do poço corrige **todos** os cenários dele de uma vez —
inclusive os que já geraram relatório entregue. É coerente com a decisão de o relatório **não** ser
congelado ([product-context §6](product-context.md#6-simulador--o-relatório-é-entregável-ao-cliente)):
o sistema sempre mostra a realidade como se sabe hoje, não como se sabia na entrega.

### RN-068 · Alarme abre e fecha por tempo mínimo
**[DECIDIDO 2026-09-05]** O evento só abre após o valor ficar **N segundos consecutivos fora** da faixa,
e só fecha após **N segundos dentro**. Sem isso, a 1 leitura/s, um valor tremendo na fronteira abriria e
fecharia dezenas de eventos por minuto.

✅ **[DECIDIDO 2026-09-05]** Os tempos são **configuráveis por sonda**, junto do limite e na mesma tela —
não são constantes do sistema. Ver [RN-071](#rn-071--o-alarme-tem-dois-níveis-atenção-e-crítico).

### RN-069 · Quem vê a sonda vê e ajusta o alarme dela
**[DECIDIDO 2026-09-05]** Sem role própria para alarme: **todo usuário que enxerga a sonda** vê o estado
atual, vê o histórico de eventos e **ajusta o limite** — inclusive o `CLIENTE`, nas sondas concedidas.

⚠️ **Mitigação obrigatória:** o limite guarda **quem alterou e quando**. Sem esse registro, um limite
mudado no meio de uma operação é indistinguível de um limite que sempre foi aquele.

### RN-070 · Ausência de dado não é alarme
**[DECIDIDO 2026-09-05]** Sonda que para de publicar **não** gera evento de alarme. Permanece apenas o
aviso visual da tela após 5 segundos sem leitura nova ([RN-053](#rn-053--estar-online-não-significa-dado-fresco)).

**Por quê:** com a conectividade variando muito entre sondas, alarmar silêncio produziria ruído
constante — e o alarme que toca sempre deixa de ser lido.

---

## Regras das rodadas 3 a 6 — 2026-09-05

### RN-071 · O alarme tem dois níveis: atenção e crítico
**[DECIDIDO 2026-09-05]** Cada grandeza tem **faixa de atenção** e **faixa crítica**. A de atenção
existe para dar tempo de reagir **antes** do limite duro.

⚠️ **A superfície de configuração cresce rápido.** Por sonda e por grandeza: mínimo e máximo de atenção,
mínimo e máximo crítico, tempo mínimo fora e tempo mínimo dentro — **seis parâmetros**. Com cinco
grandezas, são **30 campos por sonda**, e mais de 10 sondas na frota.

**[PROPOSTA 2026-09-05] O `tipo` da Unidade/Sonda carrega um perfil de limites padrão**, aplicado no
cadastro da unidade. É a função concreta que o tipo ganha enquanto a telemetria segue exclusiva de sonda
([RN-074](#rn-074--o-tipo-não-altera-o-que-é-monitorado-por-ora)). Sem algo assim, ninguém preenche 30
campos por equipamento — e alarme mal configurado é pior que alarme nenhum, porque ensina a ignorar.

### RN-072 · Histórico de telemetria conta como vínculo
**[DECIDIDO 2026-09-05]** Uma Unidade/Sonda com série gravada **não pode ser excluída**. O histórico
entra na mesma guarda de [RN-063](#rn-063--exclusão-bloqueada-por-vínculo-em-todos-os-cadastros).

⚠️ **Exige contrato novo:** o vínculo verificado hoje é relacional, e a telemetria vive no InfluxDB, em
outro serviço. O Backend-Sonda precisa **perguntar** à Telemetria se existe série para aquela sonda —
endpoint que não existe. Ver [`contracts/rest-monitoramento.md`](contracts/rest-monitoramento.md#7-verificação-de-existência-de-série).

**Comportamento na indisponibilidade:** se a Telemetria estiver fora, a resposta segura é **recusar a
exclusão** — apagar um cadastro por não conseguir confirmar que ele tem histórico é o erro irreversível.

**[FATO 2026-09-06]** Endpoint `GET /api/monitoramentos/sondas/{id}/existe` implementado no
Backend-Telemetria; `TelemetriaVinculoAdapter` o consome pelo **nome** da sonda, que é a chave de
integração ([RN-018](#rn-018--nome-da-unidadesonda-é-chave-de-integração)). A indisponibilidade
bloqueia, com mensagem própria. É o único implementador da guarda que não consulta o banco relacional.
Contrato em [`rest-monitoramento.md §7`](contracts/rest-monitoramento.md#7-verificação-de-existência-de-série).

### RN-073 · Atualização automática só com o CLP desconectado
**[DECIDIDO 2026-09-05]** O Desktop-Sonda baixa e instala sozinho, mas **só** quando não há leitura
acontecendo. Sem conexão ao CLP, não há operação em curso — o app sabe disso sem depender de agenda nem
de gente.

⚠️ **Risco de nunca atualizar:** uma sonda conectada 24/7 jamais encontraria a janela. Na prática ela
existe — falha de leitura já desconecta o cliente S7 e exige reconexão manual
([F-16](current-features.md#f-16--captura-de-telemetria-na-sonda)) — mas convém prever prazo máximo ou
um comando explícito de atualizar agora.

⚠️ **A primeira distribuição é presencial de qualquer forma:** o mecanismo de auto-update precisa chegar
às máquinas que ainda não o têm. Ver [OQ-023](open-questions.md#oq-023--qual-broker-mqtt-será-usado-em-produção).

### RN-074 · O tipo não altera o que é monitorado, por ora
**[DECIDIDO 2026-09-05]** `UnidadeSonda.tipo` ([RN-065](#rn-065--unidadesonda-tem-tipo)) é **classificação
de cadastro**. A telemetria continua exclusiva de sonda de perfuração, com as mesmas cinco variáveis.

**Consequência aceita:** uma unidade de bombeio, slickline, cimentação ou UCAQ existe no cadastro **sem
monitoramento**. A tela dela não tem dado para mostrar.

**Caminho de saída já identificado:** [OQ-043](open-questions.md#oq-043--mapeamento-configurável-de-card-para-endereço-no-clp)
— com o mapeamento card→endereço configurável, instrumentar outro equipamento vira configuração, não
desenvolvimento.

### RN-075 · O simulador não consome telemetria
**[DECIDIDO 2026-09-05]** Simulador e telemetria são **sistemas separados, sem correlação**. Não há
sobreposição de curva prevista com curva medida, e a telemetria **não** é segmentada por poço.

**O `Poço` existe apenas no domínio do simulador** ([RN-059](#rn-059--a-geometria-pertence-ao-poço-não-ao-cenário)),
como dono da geometria e da trajetória. Encerra [OQ-027](open-questions.md#oq-027--o-simulador-deve-ganhar-um-consumidor-de-telemetria).

---

## Regras da rodada final — 2026-09-05

### RN-076 · O alarme é registrado como sequência de fatos
**[DECIDIDO 2026-09-05]** A ocorrência de alarme é gravada como **log append-only** (*event sourcing*),
com quatro fatos: `ABRIU` · `ESCALOU` · `REDUZIU` · `FECHOU`. Uma excursão que atravessa a atenção e
chega à crítica é **um episódio que escala**, não dois registros nem um campo sobrescrito.

A tela de alarmes ativos é uma **projeção**, reconstruível a partir do log.

**Escopo, e só ele [DECIDIDO 2026-09-05]:**

| Fica dentro | Fica fora |
|---|---|
| Ocorrências de alarme | Os **limites** — configuração é CRUD com autoria |
| — | Cadastros, usuários, simulador — seguem CRUD com JPA |

⚠️ **[FATO verificado 2026-09-05] Não existe event sourcing no sistema hoje.** Nenhuma ocorrência de
`DomainEvent`, `EventStore`, `Aggregate`, `Projection` ou `ApplicationEventPublisher` nos dois backends.
As classes `*Command` do módulo `usuario` são **objetos de entrada de caso de uso** — nomenclatura de
arquitetura hexagonal, não CQRS. Esta regra cria a primeira fatia orientada a eventos do sistema.

### RN-077 · CQRS existe na telemetria, e só nela
**[FATO 2026-09-05]** O Backend-Telemetria **separa modelo de escrita e de leitura**, e é o único
componente que o faz:

| Caminho | Modelo | Onde |
|---|---|---|
| Escrita | `TelemetriaBatch` → `LeituraTelemetria` → ponto no InfluxDB | `IngestaoTelemetriaService` |
| Leitura | série agregada por janela → `MonitoramentoSerieDTO` | `ConsultaSerieService` |

Os dois nunca se cruzam, e o modelo de leitura é **agregado**, com teto de pontos — não é o de escrita.

⚠️ **A separação não vem do MQTT.** Produtor e consumidor via broker é **mensageria**, não CQRS: seria
CQRS igualmente se a ingestão fosse por HTTP. A distinção importa para ninguém concluir que o sistema
inteiro é CQRS — o Backend-Sonda é CRUD com JPA, mesma entidade para ler e gravar.

### RN-078 · Sem perfil padrão de alarme; o limite vale até alguém trocar
**[DECIDIDO 2026-09-05]** **Cada sonda é configurada individualmente.** Os limites nascem vazios, e a
proposta de perfil padrão por `tipo` foi **recusada**.

| Situação | Comportamento |
|---|---|
| Sonda sem limite configurado | **Não alarma.** É estado normal — o sistema não sinaliza a ausência |
| Limite ajustado no meio de um trabalho | Vale **até alguém trocar**. Não expira, não volta a padrão |

⚠️ **O que isso concentra no registro de autoria:** sem perfil padrão e sem expiração, o valor vigente
de um limite não tem nenhuma referência externa que o explique. `atualizadoPor`/`atualizadoEm`
([RN-069](#rn-069--quem-vê-a-sonda-vê-e-ajusta-o-alarme-dela)) passa a ser a única forma de entender,
meses depois, por que o limite era aquele. Deixa de ser mitigação e vira parte do funcionamento.

### RN-079 · A API padroniza o prefixo `/api`
**[DECIDIDO 2026-09-05]** `/auth/login` e `/usuarios/**` passam para `/api`, uniformizando a superfície
da API. Encerra [OQ-013](open-questions.md#oq-013--endpoints-fora-do-padrão-api-são-deliberados).

⚠️ **Ordem de execução importa mais que a mudança.** A migração mexe em `SecurityConfig`, no front e no
`nginx.conf` ao mesmo tempo — e a **ordem dos `requestMatchers` é exatamente onde SEC-001, SEC-002 e
SEC-003 nasceram**, sem nenhum teste HTTP para detectar regressão
([DT-007](technical-debt.md#dt-007--ausência-de-testes-em-áreas-críticas)).

**Escrever os testes de `SecurityConfig` antes de mover as rotas** — eles já estão especificados em
[security-findings](security-findings.md#próximo-passo-recomendado) e passariam a valer como rede de
proteção justamente na mudança que mais precisa de uma.

**[FATO 2026-09-06 — implementado]** Login em `POST /api/auth/login`; usuários em
`/api/usuarios/**`. Os dois PATCH de autoatendimento vêm antes da restrição ADMIN
e são as únicas exceções. Nove testes HTTP passaram nas rotas antigas antes da
mudança; onze passaram após a migração. Frontend, Desktop-Sonda, proxies e Postman
foram atualizados juntos. Contrato, validação e distribuição em
[`api-prefix.md`](../Backend-Sonda-Geopetro-IO/specs/api-prefix.md). Sem deploy.

---

## Regras dos cards configuráveis — 2026-09-07

> **[DECIDIDO 2026-09-07]** · **Sem implementação hoje.** Contrato e consequências em
> [`features/cards-configuraveis.md`](features/cards-configuraveis.md).

### RN-080 · O card define o que se lê do CLP
**[DECIDIDO 2026-09-07]** O mapeamento deixa de ser constante no código e passa a ser **configuração
da unidade**: cada card declara tipo, nome, endereço e parâmetros de conversão. Rack, slot, número do
DB e intervalo de leitura saem do código junto.

**Supera [RN-074](#rn-074--o-tipo-não-altera-o-que-é-monitorado-por-ora).** Aquela regra dizia que o
`tipo` da Unidade/Sonda era classificação apenas e que a telemetria seguia exclusiva de sonda de
perfuração — porque instrumentar outro equipamento era projeto próprio. Com o endereçamento
configurável, **vira cadastro**. Encerra [OQ-043](open-questions.md#oq-043--mapeamento-configurável-de-card-para-endereço-no-clp),
e com ela [OQ-017](open-questions.md#oq-017--rackslot-do-clp-valem-para-toda-a-frota) e
[OQ-018](open-questions.md#oq-018--qual-é-o-modelo-real-de-clp).

⚠️ **Conversão não é endereço.** Os tipos são **vocabulário fechado** — `PESO`, `TORQUE`, `PRESSAO`,
`TEMPERATURA`, `NIVEL_TANQUE`, `CONTADOR_STROKE`. O usuário escolhe qual regra aplicar e onde ler;
não escreve regra nova. Tipo novo continua exigindo desenvolvimento.

### RN-081 · O id do card é gerado; o nome é rótulo
**[DECIDIDO 2026-09-07]** O card tem duas identidades. O `dispositivoId` é **gerado pelo sistema** no
formato `<TIPO>_<NN>`, sequencial por tipo dentro da unidade, e **nunca muda**. O `nome` é livre,
editável, e não sai da tela.

**Por quê:** o `dispositivoId` é *tag* no InfluxDB, onde cardinalidade alta degrada o banco, e a
retenção é de 5 anos. Com id livre, cada rebatismo criaria tag nova e **cortaria a série em duas**.

⚠️ É a armadilha de [RN-018](#rn-018--nome-da-unidadesonda-é-chave-de-integração), onde o nome
editável da unidade virou chave de integração — já registrado como o risco de maior custo da base.
Repeti-lo por card multiplicaria por seis.

**Número não se reaproveita:** excluir `TEMPERATURA_02` e criar outro produz `TEMPERATURA_03`.

### RN-082 · A conversão analógica é linear sobre a fração 4-20 mA
**[DECIDIDO 2026-09-07]** Todo card analógico converte em dois passos: posiciona o `Ax` na faixa do
amplificador e aplica a escala do tipo.

```
fracao = (Ax − AX_MIN) / (AX_MAX − AX_MIN)      // (Ax + 50) / 800
```

**[FATO]** Vale [RN-030](#rn-030--conversão-do-ax-do-logo--psi) inteiro: `Ax` é lido **com sinal**, e a
faixa −50..750 continua sendo [OQ-016](open-questions.md#oq-016--a-escala-analógica-do-clp-foi-confirmada),
não confirmada no CLP desde agosto.

### RN-083 · Temperatura é escala linear com mínimo e máximo
**[DECIDIDO 2026-09-07]** `valor = minimoEscala + fracao × (maximoEscala − minimoEscala)`, com unidade
`°C` ou `°F` declarada no card.

**Por que mínimo e máximo, e não só fundo de escala:** transmissores de temperatura raramente começam
em zero — `−50..+200 °C` é comum. Assumir base zero produziria erro proporcional em toda a faixa.

⚠️ **A pressão é o caso particular com mínimo zero** — `fracao × range` equivale a
`0 + fracao × (range − 0)`. **Não unificar as duas agora:** mexer na fórmula da pressão alteraria toda
leitura já gravada, e a escala do CLP segue não confirmada (RN-082).

### RN-084 · O sensor de nível mede distância, não nível
**[DECIDIDO 2026-09-07]** O sensor fica **sempre no topo** do tanque. Logo, ele mede a **distância até
a superfície do líquido**; o nível é o que sobra.

```
distancia = distanciaMinima + fracao × (distanciaMaxima − distanciaMinima)
altura    = alturaUtil − distancia
volume    = f(forma, dimensões, altura)
```

⚠️ **Ler o valor como se fosse o nível dá um tanque que enche quando esvazia.** É o erro mais provável
desta regra, e o mais silencioso: os números continuam plausíveis.

**Formas aceitas:** cilíndrico vertical (`π r² h`), cilíndrico horizontal (segmento circular) e
retangular/cubo (`C × L × h`).

**[DECIDIDO 2026-09-07 — entrevista]** A série gravada e alarmada é o **volume, em bbl**. O nível é
passo intermediário. É o volume que denuncia ganho ou perda no tanque de lama, e é em bbl que o
simulador planeja o que o tanque de cimentação vai receber. Encerra
[OQ-045](open-questions.md#oq-045--unidade-do-volume-do-tanque).

⚠️ **Isto põe a geometria do tanque dentro do dado, não só do desenho.** Forma e dimensões erradas
gravam volume errado por cinco anos, e o número continua plausível. É o parâmetro de maior
consequência da configuração.

⚠️ **O cilindro horizontal não é proporcional à altura.** Metade da altura é metade do volume, mas um
quarto da altura **não** é um quarto do volume. Tratá-lo como vertical erraria mais no começo e no fim
do tanque — onde a leitura mais importa.

### RN-085 · Vazão é derivada do contador de stroke
**[DECIDIDO 2026-09-07]** A vazão **não é lida do CLP** e nunca foi: vem do contador de stroke e da
constante da bomba.

Preserva a série `VAZAO_01` já gravada e mantém [RN-035](#telemetria--conversão-de-sinal).

**[DECIDIDO 2026-09-07 — entrevista]** Superada em alcance por
[RN-090](#rn-090--um-contador-de-stroke-produz-três-séries): o card publica **três** séries, não duas.

### RN-086 · Configurar exige ADMIN ou SUPORTE, autenticado no backend
**[DECIDIDO 2026-09-07]** Só `ADMIN` e `SUPORTE` alteram configuração — no Desktop e no Front.

⚠️ **`SUPORTE` não existe.** O enum tem sete valores, e
[DT-011](technical-debt.md#dt-011--divergência-de-roles-backend--frontend) registra que todas as sete
têm efeito real. A oitava exige valor no enum, espelho no front **e migration**: `usuario_roles.role`
é `ENUM` no baseline, então acrescentar valor é `ALTER TABLE`, não só código.

**Sem rede não se configura**, por desenho: não há validação local de credencial. O custo aceito é que
a instalação inicial de uma unidade precisa de rede ao menos uma vez.

### RN-087 · A sessão de configuração do Desktop morre com o app
**[DECIDIDO 2026-09-07]** O Desktop pede login **ao abrir uma janela de configuração**, não ao
iniciar. A sessão vale até o app fechar, **vive em memória e nunca é gravada em disco**.

**Sem login o app funciona normalmente** — lê o CLP, publica, mostra os cards, gera a carta. Só a
configuração fica restrita.

**Por que não persistir:** [SEC-011](security-findings.md#sec-011--credencial-única-de-frota-nas-sondas)
já registra uma credencial de serviço única para toda a frota como risco aceito. Um segundo segredo
gravado na máquina da unidade ampliaria a superfície sem necessidade — configurar é ato raro e
deliberado.

### RN-088 · Sem configuração, a unidade não lê nada
**[DECIDIDO 2026-09-07]** Uma unidade sem cards configurados **não produz telemetria**. Não há
conjunto padrão: o que se lê é exatamente o que foi declarado.

⚠️ **Isto promove um [PENDENTE] a requisito.** O contrato de configuração registra o *"cache
persistente para reiniciar sem rede"* como melhoria futura. Hoje, um Desktop que reinicia sem rede
perde só os limites de alarme e continua publicando. Com os cards vindo da configuração, ele **não
sabe o que ler, e a telemetria da unidade para por inteiro**. O cache em disco passa a ser requisito
de entrega — ver [`features/cards-configuraveis.md §8`](features/cards-configuraveis.md#-o-cache-persistente-deixa-de-ser-opcional).

⚠️ **Consequência de migração:** a frota atual precisa **nascer** com os cards equivalentes ao
mapeamento fixo de hoje, ou a telemetria para no dia do deploy. É migração de dados, não de schema.

---

## Regras da entrevista de 2026-09-07

> **[DECIDIDO 2026-09-07]** Rodada de perguntas sobre o funcionamento do sistema. Registro completo em
> [`features/cards-configuraveis.md §12`](features/cards-configuraveis.md#12-a-entrevista-de-2026-09-07).

### RN-089 · Cards e limites são documentos separados
**[DECIDIDO 2026-09-07]** A configuração da unidade vira **dois documentos**, cada um com sua revisão
e seu endpoint:

| Documento | Quem grava | Onde |
|---|---|---|
| **Cards** | `ADMIN` ou `SUPORTE` | Só no Geopetro-Desktop |
| **Limites de alarme** | Quem enxerga a sonda, inclusive `CLIENTE` ([RN-069](#rn-069--quem-vê-a-sonda-vê-e-ajusta-o-alarme-dela)) | Web |

**Por quê:** num documento só, o cliente que ajusta um limite devolve o documento inteiro — cards
inclusive. O servidor teria de comparar campo a campo para saber se ele mexeu no que não devia, e a
autorização ficaria escondida numa comparação. Separados, **não há como errar**.

Encerra [OQ-044](open-questions.md#oq-044--um-documento-de-configuração-duas-autoridades).

### RN-090 · Um contador de stroke produz três séries
**[DECIDIDO 2026-09-07]** Cada card `CONTADOR_STROKE` publica:

| Série | O que é |
|---|---|
| Stroke atual | Delta entre leituras do contador cumulativo |
| Vazão (`bbl/min`) | Delta × constante da bomba, no intervalo |
| Volume acumulado (`bbl`) | Contagem cumulativa × constante da bomba |

**Uma unidade pode ter várias bombas** — vários cards de stroke, cada um com sua constante.

⚠️ **[FATO verificado 2026-09-07] Quebra uma premissa do código atual.** `StrokeCalculatorService`
guarda `lastCumulativeStroke` e `firstReading`; `FlowRateCalculatorService` guarda uma
`Queue<ReadingData>` que é **janela móvel de 60 segundos**. Ambos foram escritos para uma bomba.

Com duas bombas contra esse estado compartilhado, os deltas se trocam **e** a janela de um minuto soma
strokes de bombas diferentes. As duas vazões sairiam plausíveis e erradas. Com N cards, o estado passa
a ser **por card**.

**[PENDENTE]** Vazão somada entre bombas não entra por ora. Se entrar, é derivada do conjunto de
cards, sem quebrar o que existe.

### RN-091 · Card se desativa, nunca se exclui
**[DECIDIDO 2026-09-07]** Não há exclusão de card. Desativar tira da tela e para de publicar; a
identidade permanece e o **histórico continua consultável**.

Mesma postura de [RN-072](#rn-072--histórico-de-telemetria-conta-como-vínculo), onde o histórico
passou a impedir a exclusão da unidade. Sem isso, uma série ficaria cinco anos no InfluxDB sem nada
que explicasse o que ela é.

**O limite de alarme hiberna junto:** para de avaliar e volta como estava se o card for reativado.
Quem desativa por engano não perde a configuração de alarme junto.

Encerra [OQ-046](open-questions.md#oq-046--o-que-acontece-com-a-série-de-um-card-excluído).

### RN-092 · A unidade nasce sem cards, e se configura copiando outra
**[DECIDIDO 2026-09-07]** As unidades existentes **não** recebem automaticamente os cards
equivalentes ao mapeamento fixo de hoje. Cada uma é configurada individualmente, no Desktop.

⚠️ **Custo aceito, registrado com o alerta dado:** por
[RN-088](#rn-088--sem-configuração-a-unidade-não-lê-nada), unidade sem card não lê nada. Somado a
"configuração só no Desktop" e a uma frota de mais de dez unidades, **a telemetria de cada unidade
fica parada entre o deploy e a visita de quem for configurá-la**.

✅ **Mitigação decidida:** ao configurar uma unidade vazia, é possível **copiar os cards de outra
unidade já configurada** e ajustar o que difere. Unidades iguais têm o mesmo mapeamento.

### RN-093 · A configuração não é conferida ao vivo
**[DECIDIDO 2026-09-07]** A tela de configuração **não** lê o endereço em tempo real enquanto se
digita. Salva-se e confere-se no dashboard.

⚠️ **O CLP não recusa endereço errado** — devolve bytes, e a conversão devolve um número plausível. A
proteção que resta é o **valor bruto exibido no card**, que já existe e revela canal mudo ou escala
inesperada. Ela passa a ser a única.

⚠️ Contraria o padrão da tela de peso da coluna, que recalcula enquanto se digita porque *"esperar o
Salvar para ver o efeito de cada parâmetro tornaria a calibração lenta"*.

### RN-094 · Dois cards podem ler o mesmo endereço
**[DECIDIDO 2026-09-07]** Permitido. O caso real é a mesma leitura interpretada com escalas
diferentes.

⚠️ **Custo aceito:** duas séries no histórico com o mesmo dado de origem, e nada que indique serem a
mesma coisa. Hoje `PRESSAO_01` já alimenta dois indicadores da tela, mas com **um** dispositivo no
contrato; passariam a ser dois.

Encerra [OQ-047](open-questions.md#oq-047--dois-cards-no-mesmo-endereço).

### RN-095 · A leitura do CLP passa a ser em bloco
**[DECIDIDO 2026-09-07]** Uma unidade tem **5 a 10 cards em geral, e pode ter mais**.

**[FATO]** Hoje são cinco chamadas `ReadArea` separadas por ciclo, uma por grandeza. Com N cards
configuráveis isso viraria N chamadas por segundo, e N deixou de ser conhecido.

**Passa a ler a faixa do DB de uma vez e fatiar em memória.** Além do custo, isso torna as leituras do
mesmo ciclo **coerentes entre si**: hoje, cinco chamadas sequenciais podem pegar o CLP em estados
diferentes e compor um ciclo que nunca existiu.

### RN-096 · O Horus continua separado
**[DECIDIDO 2026-09-07]** O Geopetro-Desktop passa a cobrir unidades de cimentação, mas **não absorve
o Braserv-Horus**. Não há convergência prevista, e o desenho dos cards não deve reservar espaço para
ela.

Uma unidade de cimentação pode ter os dois instalados, medindo coisas diferentes. A duplicação segue
aceita de propósito — [DT-010](technical-debt.md#dt-010--duplicação-entre-os-dois-desktops).

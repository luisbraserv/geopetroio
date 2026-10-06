# Contexto de Produto — GeopetroIO

> Levantamento por **entrevista com a equipe** · 2026-09-05 · ver [convenção de marcação](../../README.md#convenção-de-marcação)
>
> Este documento cobre a camada que faltava na base de specs. Todo o resto foi produzido por
> engenharia reversa e responde **"o que o código faz"**. Nada respondia **"para quem, para decidir
> o quê, e com que operação por trás"** — e é isso que decide o que vale construir.
>
> Diferente dos demais documentos, aqui a fonte não é o código: é a decisão da equipe. Por isso quase
> tudo é **[DECIDIDO 2026-09-05]**, não [FATO].

---

## 1. Para quem o sistema existe

**[DECIDIDO 2026-09-05]** Uso interno da Braserv **mais** acompanhamento pelo cliente contratante.

| Quem | Relação com o sistema |
|---|---|
| Braserv | Opera o sistema e a frota. Único operador da plataforma |
| Cliente contratante | Recebe login para acompanhar **as sondas do trabalho dele** |

**Consequência de modelagem:** a `Empresa` **não** se torna um limite de isolamento (*tenancy*). A
contenção do `CLIENTE` continua sendo a concessão explícita, unidade a unidade, em
`usuario_cliente_unidades` — [RN-048](../regras/business-rules.md#rn-048--concessão-de-unidades-ao-cliente-é-explícita).

⚠️ **O que isso significa na prática:** não há barreira estrutural entre clientes. O isolamento é uma
lista de vínculos, e um erro de cadastro expõe a sonda de um cliente a outro. É aceitável enquanto a
Braserv for a única operadora e o cadastro for feito por `ADMIN` — deixa de ser se a plataforma um dia
for vendida a terceiros.

---

## 2. Quem usa cada superfície

**[DECIDIDO 2026-09-05]**

| Superfície | Usuário real | Para quê |
|---|---|---|
| **Front web** — Monitoramento e Tempo Real | **Supervisão remota** e **cliente** | Acompanhar a distância o que a sonda está fazendo |
| **Geopetro-Desktop** | Operador em campo | Dashboard local imediato, independente de rede |
| **Horus / Cimentação** | Operador de cimentação | Monitorar a bomba e emitir a Carta de Operação |
| **Simulador** | Engenharia de cimentação | Planejar a operação e **produzir o relatório entregue ao cliente** |

**[DECIDIDO 2026-09-05]** O operador na sonda **não é usuário da web** — ele já tem o dashboard do
Desktop na frente.

### A inversão que isso provoca

O Geopetro-Desktop deixa de ser "o produto instalado na sonda" e passa a ser **o sensor do sistema**,
mais um terminal local para quem está no equipamento. O valor que o cliente e a supervisão enxergam
está na web.

Isso reordena prioridades já registradas: enquanto a cadeia de telemetria não roda em produção, o
sistema não entrega aquilo que foi decidido ser o seu propósito. E explica por que **auto-update** e
**buffer de contingência** (§4) deixam de ser refinamentos de um app auxiliar.

---

## 3. Alarmes — o que faltava para o produto cumprir o papel

**[DECIDIDO 2026-09-05]** Alarme por limite é **essencial**, não desejável.

Uma tela de telemetria sem limiar exige que alguém esteja olhando no momento exato em que o número
sai da faixa. Com supervisão remota e cliente como público principal (§2), ninguém está olhando o
tempo todo.

Especificação em [`features/alarmes.md`](alarmes.md). Decisões de produto:

| Aspecto | Decisão |
|---|---|
| Onde é avaliado | **Borda e servidor** — local para o operador, central para supervisão e cliente |
| Como o limite é definido | **Por sonda, ajustável na hora** pela supervisão, na própria tela |
| Por onde chega | **Destaque na tela** e **alerta no Desktop da sonda** |
| Depois do disparo | **Evento com histórico** consultável, **sem** reconhecimento formal |

⚠️ **Sem e-mail e sem SMS/WhatsApp.** A integração SMTP saiu do sistema com o módulo `quimico`
([F-13](current-features.md#f-12-e-f-13--químicos--removidos)) e **não volta por causa dos alarmes**.

**[CORREÇÃO 2026-09-05]** O SMTP **volta ao sistema** — mas por outro motivo: a recuperação de senha por
autoatendimento (§10). As duas decisões convivem sem contradição: **e-mail serve à identidade, não ao
alarme.** Quando o canal existir, será tentador ligá-lo aos alarmes; isso exigiria rever esta decisão,
não apenas aproveitar a infraestrutura.

**[DECIDIDO 2026-09-05]** Histerese por **tempo mínimo** fora e dentro da faixa; **quem enxerga a sonda
vê e ajusta** o alarme dela, inclusive o cliente; **silêncio da sonda não é alarme**.

---

## 4. Realidade de campo

**[DECIDIDO 2026-09-05]**

| Dimensão | Realidade |
|---|---|
| Frota | **Mais de 10 sondas** |
| Conectividade | **Varia muito por sonda** — de link bom a quase nada |
| Atualização do app em campo | **Não existe.** Auto-update é necessário e precisa ser construído |
| Operação da produção | **Uma pessoa**, que também desenvolve |

### Três consequências diretas

**1. O buffer de contingência deixa de ser opcional.** Encerra
[OQ-019](open-questions.md#oq-019--perda-de-telemetria-em-falha-de-mqtt-é-aceitável): com
conectividade irregular e histórico de 5 anos como produto, lacuna no histórico é perda de valor, não
inconveniente. Abre a questão nova de **mensagens fora de ordem** — ver
[OQ-031](open-questions.md#oq-031--o-consumidor-tolera-telemetria-fora-de-ordem).

**2. Sem auto-update, código novo não chega à frota.** A distribuição do
formato-alvo do MQTT ([§9 do contrato](../../software/mqtt/mqtt-telemetria.md#9-migração-a-partir-do-formato-atual)),
do alarme **local**, do buffer e da autenticação do broker depende disso —
o limite local é configurado na própria estação, não enviado pelo servidor. O
[deploy](../../../../deploy/README.md) exige ativar a autenticação depois de atualizar
as instalações, sob pena de derrubar a telemetria de quem ficou para trás.

**3. Operação por uma pessoa favorece automação sobre procedimento.** A
execução manual de migrations foi substituída por Flyway
([DT-002](../../software/technical-debt.md#dt-002--estratégias-conflitantes-de-evolução-de-schema)).
Backup e observabilidade continuam decisões operacionais próprias.

---

## 5. O histórico como produto

**[DECIDIDO 2026-09-05]** Retenção de **5 anos**.

**[INFERÊNCIA]** Ordem de grandeza, a 5 pontos/s por sonda:

| Frota | Pontos/dia | Pontos/ano | 5 anos |
|---:|---:|---:|---:|
| 10 sondas | ~4,3 mi | ~1,6 bi | **~8 bi** |
| 30 sondas | ~13 mi | ~4,7 bi | **~24 bi** |

Guardar isso em resolução de 1 segundo numa VM única é caro e degrada consulta. A saída conhecida é
**retenção em camadas** — bruto por um período curto, agregados de resolução decrescente para o resto
— que o InfluxDB resolve com *downsampling* contínuo.

⚠️ **[PENDENTE]** Se "5 anos" significar 5 anos **em resolução de 1 segundo**, o dimensionamento é
outro. Ver [OQ-030](open-questions.md#oq-030--5-anos-em-que-resolução).

### O risco que a retenção longa agrava

⚠️ **[FATO]** O histórico é indexado pelo `nome` da Unidade, que é **editável no cadastro** sem
trava nem aviso ([RN-018](../regras/business-rules.md#rn-018--nome-da-unidade-é-chave-de-integração)).

Cinco anos de série amarrada a uma chave mutável é o risco de maior custo da base. Ele cresce
silenciosamente: quanto mais histórico acumula, mais caro fica o dia em que alguém renomear uma sonda
para corrigir um erro de digitação.

---

## 6. Simulador — o relatório é entregável ao cliente

**[DECIDIDO 2026-09-05]** O relatório sai da Braserv e chega ao contratante como documento técnico.

**Consequência imediata:** [OQ-009](open-questions.md#oq-009--quais-são-os-limites-físicos-aceitáveis-no-simulador)
(faixas plausíveis dos ~40 campos de engenharia) deixa de ser dívida de qualidade e passa a ser risco
de relacionamento com cliente. Um valor fisicamente impossível hoje produz um relatório de aparência
impecável, sem um único aviso — e esse relatório é entregue.

**[DECIDIDO 2026-09-05]** Duas coisas ficam **deliberadamente de fora**, e ficam registradas como
escolha, não como esquecimento:

| Decisão | Justificativa aceita |
|---|---|
| Cenários seguem **sem dono** — qualquer perfil autorizado edita o de qualquer outro | Equipe pequena e de confiança; o custo de controlar posse não compensa. Encerra [OQ-005](open-questions.md#oq-005--cenários-do-simulador-têm-dono) |
| Relatório **não é congelado** — sempre reflete o cenário no estado atual | Quem entrega guarda o PDF por conta própria |

⚠️ **O que se aceita junto com isso:** não há como reproduzir depois o cálculo exato de um relatório
entregue, nem provar quais números o geraram. Se um cliente contestar um relatório de seis meses
atrás, a resposta do sistema é o cenário como ele está **hoje**.

---

## 7. Poço passa a existir no modelo

**[DECIDIDO 2026-09-05]** `Poço` vira **entidade** do sistema.

A decisão nasceu do simulador — o mesmo poço volta em vários cenários (squeeze, tampão, revisões), e
redigitar a geometria a cada vez produz divergência entre cenários que deveriam descrever a mesma
realidade física.

**[DECIDIDO 2026-09-05]** Isso **revisa** a decisão da mesma entrevista de que poço seria apenas texto
livre. A primeira resposta olhava a telemetria; a segunda olhava o simulador. Prevalece a segunda, por
ser a que exige estrutura.

**Alcance imediato:** cadastro + vínculo com o cenário do simulador.
**Alcance possível, não decidido:** amarrar telemetria a poço, o que habilitaria relatório de operação
por poço na web e a ponte com o simulador levantada em
[OQ-027](open-questions.md#oq-027--o-simulador-deve-ganhar-um-consumidor-de-telemetria).

---

## 8. Capacidades decididas que ainda não existem

**[DECIDIDO 2026-09-05]** Nada nesta lista tem código hoje.

| # | Capacidade | Bloqueia / é bloqueada por |
|---|---|---|
| 1 | **Entidade Poço** + vínculo com cenário | Habilita o reaproveitamento de geometria |
| 2 | **Trajetória direcional (survey)** no simulador | O modelo em curso não comporta — ver spec no Front |
| 3 | **Alarmes** (limites, avaliação dupla, eventos) | Depende de 4 |
| 4 | **Canal de configuração do servidor para a sonda** | **[FATO 2026-09-07] Implementado em código** pela conexão STOMP; [contrato](../../software/apis/configuracao-sonda.md). Distribuição à frota pendente |
| 5 | **Buffer de contingência** no Geopetro-Desktop | Depende de 6 para chegar à frota |
| 6 | **Auto-update do Geopetro-Desktop** | Bloqueia 3, 5, formato MQTT-alvo e autenticação do broker |
| 7 | **Retenção em camadas + backup automatizado** | Nenhuma; é infraestrutura |
| 8 | **Validação dos campos do simulador** | Elevada por §6 |

**Prioridade declarada [DECIDIDO 2026-09-05]:** o trabalho em curso no **simulador** (geometria de
poço e gráficos pressão × profundidade), com a spec correspondente — que é o item 2, e arrasta o 1.

---

## 9. O que o produto deliberadamente não faz

Registro de escolhas conscientes, para que ninguém as trate como lacuna a corrigir depois:

| Não faz | Decidido em |
|---|---|
| Isolamento por empresa (*tenancy*) | §1 |
| Alarme por e-mail, SMS ou WhatsApp | §3 |
| Reconhecimento formal de alarme (*ack* de sala de controle) | §3 |
| Congelamento de revisão do relatório | §6 |
| Controle de posse de cenário | §6 |
| Segmentação da telemetria por poço ou operação | §7 — possível, não decidido |
| Isolamento de acesso por regional ou setor | §10 — os campos saem do cadastro |
| Autenticação entre a VM web e a VM de telemetria | §10 — firewall é a única proteção |
| Alarme por severidade, com reconhecimento e notificação externa | §3 |

---

## 10. Identidade, acesso e cadastro

**[DECIDIDO 2026-09-05]** Segunda rodada da entrevista.

| Tema | Decisão | Consequência |
|---|---|---|
| **Senha** | 8–20 caracteres com quatro classes, **aplicada no backend** em todos os caminhos | Fecha a inconsistência entre o cadastro por admin e a troca pelo próprio usuário |
| **Revogação** | **Corte imediato** ao desativar | O filtro JWT passa a consultar o estado do usuário; cache curto mantém o custo baixo |
| **Recuperação de senha** | **Autoatendimento por e-mail** | ⚠️ Traz o **SMTP de volta** ao sistema |
| **Exclusão** | **Bloquear quando houver vínculo**, em todos os cadastros | Acaba o `500` genérico de violação de FK |
| **Vínculo organizacional do usuário** | **Removido** — regional principal, regionais e setores saem do cadastro | Não influenciava nada desde 2026-08-27 |
| **Tipo da Unidade** | Novo campo: `SONDA`, `UNIDADE_BOMBEIO`, `SLICKLINE_WIRELINE`, `CIMENTACAO`, `UCAQ` | ⚠️ Abre a questão de quais variáveis cada tipo monitora |
| **Autenticação entre VMs** | **Firewall basta** | Risco aceito: uma regra errada expõe toda a telemetria |
| **Usuário de serviço das sondas** | **Um para toda a frota** | ⚠️ A autorização por unidade deixa de separar uma sonda da outra |
| **Rack/slot do CLP** | Iguais em toda a frota | As constantes ficam no código |
| **Tabelas órfãs** | **Descartar** | Leva junto a senha SMTP em texto puro de `configuracoes_email` |

### A entidade nunca foi só "sonda"

**[DECIDIDO 2026-09-05]** O campo `tipo` torna explícito o que o domínio de Unidade já
sugeria: o cadastro abriga **equipamentos diferentes** — sonda, unidade de bombeio, slickline/wireline,
cimentação e UCAQ.

⚠️ **A telemetria ainda não sabe disso.** Todo o caminho de captura — os cinco endereços fixos no DB1 do
CLP, as conversões de peso de coluna e torque de chave hidráulica, o vocabulário de dispositivos, os
cards da tela — foi escrito para **sonda de perfuração**. Classificar no cadastro é barato; **capturar
telemetria de um equipamento que não é sonda é um projeto próprio**, com outro CLP e outras grandezas.
Ver [OQ-041](open-questions.md#oq-041--o-tipo-da-unidade-define-quais-variáveis-são-monitoradas).

### Duas decisões que enfraquecem fronteiras, conscientemente

1. **Credencial única da frota.** O usuário de serviço precisa alcançar todas as sondas, então a
   verificação por unidade no canal de tempo real deixa de separar uma instalação da outra — o que
   mantém cada sonda no seu lugar é a configuração local, não a autorização
   ([SEC-011](../../software/seguranca/security-findings.md#sec-011--credencial-única-de-frota-nas-sondas)).
2. **Firewall como única proteção entre VMs.** Sem credencial de serviço, a telemetria da frota depende
   inteiramente de a porta 8081 estar restrita ao IP certo.

Nenhuma das duas é erro — são trocas de segurança por simplicidade operacional, registradas para que
sejam revistas de propósito, e não redescobertas num incidente.

---

## 11. Fechamentos das rodadas 3 a 6

**[DECIDIDO 2026-09-05]**

| Tema | Decisão |
|---|---|
| Alarme | **Dois níveis** (atenção e crítico); tempos **configuráveis por sonda** |
| Exclusão de sonda | **Histórico de telemetria conta como vínculo** — bloqueia |
| Auto-update | **Só com o CLP desconectado** |
| Tipo da unidade | **Classificação apenas** — telemetria segue exclusiva de sonda |
| Simulador × telemetria | **Sem correlação.** São sistemas separados |
| Faixas do simulador | **A equipe fornece** — tabela pronta para preencher |
| Backup do MySQL | **Não haverá** |
| Backup do InfluxDB | **Adiado** |
| Repositórios no OneDrive | **Ficam onde estão** |
| Modelo do CLP | **Varia por sonda** |
| Autenticação do broker | **Depois** do auto-update |

### O eixo de cimentação e o de telemetria não se encontram

**[DECIDIDO 2026-09-05]** A hipótese de o simulador consumir telemetria real — pressão prevista contra
pressão medida — **sai do horizonte de produto**. Encerra
[OQ-027](open-questions.md#oq-027--o-simulador-deve-ganhar-um-consumidor-de-telemetria).

O `Poço` (§7) continua existindo, mas **só no simulador**: dono da geometria e da trajetória, sem
relação com a série temporal. O sistema tem dois eixos que compartilham identidade, organização e
autenticação — e nada mais.

### Três riscos aceitos que convém reler juntos

Cada um foi decidido isoladamente e faz sentido sozinho. Somados, definem uma postura:

| Risco aceito | Efeito combinado |
|---|---|
| **Sem backup do MySQL** | Cadastro, usuários e **cenários do simulador** — a origem dos relatórios entregues a clientes — existem em uma cópia só |
| **Backup do InfluxDB adiado** | Os 5 anos de histórico existem em uma cópia só |
| **Repositórios no OneDrive** | O código-fonte convive com um sincronizador que **já corrompeu um `.git`** e que, durante esta entrevista, bloqueou leitura de arquivos duas vezes |

**O que isso significa em uma frase:** hoje, uma perda de disco tira do ar dados que nada reconstrói.
Não é uma recomendação disfarçada — é o registro de que a decisão foi tomada com o custo à vista, para
que a revisão, quando vier, comece de onde parou.

### O que ficou explicitamente para depois

| Item | Onde |
|---|---|
| Estruturar backup do histórico | [OQ-042](open-questions.md#oq-042--backup-do-histórico-de-telemetria) |
| Mapeamento configurável de card → endereço no CLP | [OQ-043](open-questions.md#oq-043--mapeamento-configurável-de-card-para-endereço-no-clp) |
| Faixas de validação do simulador | [`faixas-validacao.md`](../../../../apps/geopetro-frontend/specs/simulador/faixas-validacao.md) |

**[DECIDIDO 2026-09-05]** O OQ-043 é o mais estratégico dos três: resolve rack/slot por sonda, o modelo
de CLP variável e o caminho para instrumentar equipamentos que não são sonda — três perguntas com uma
resposta só.

---

## 12. Arquitetura — o que a entrevista fixou

**[DECIDIDO 2026-09-05]** Rodada final.

### Onde cada padrão vale, e onde não vale

| Padrão | Onde vale | Onde **não** vale |
|---|---|---|
| **CQRS** | Geopetro-Telemetria — escrita (`TelemetriaBatch` → InfluxDB) e leitura (série agregada) têm modelos distintos que nunca se cruzam | Geopetro-Backend, que é CRUD com JPA: mesma entidade para ler e gravar |
| **Event sourcing** | **Alarmes**, e só eles — log append-only de `ABRIU`/`ESCALOU`/`REDUZIU`/`FECHOU`, com projeção para a tela | Limites de alarme, cadastros, usuários, simulador |

⚠️ **Uma correção que vale registrar:** produtor e consumidor via MQTT é **mensageria**, não CQRS. A
separação de modelos do Geopetro-Telemetria existiria igual se a ingestão fosse por HTTP. Sem essa
distinção, é fácil concluir que o sistema inteiro é CQRS — e ele não é.

**[FATO verificado 2026-09-05]** Não há event sourcing em nenhum dos dois backends: zero ocorrências de
`DomainEvent`, `EventStore`, `Aggregate`, `Projection` ou `ApplicationEventPublisher`. As classes
`*Command` do módulo `usuario` são objetos de entrada de caso de uso — nomenclatura hexagonal.

### O alarme como primeira fatia orientada a eventos

**Por que encaixa:** o que se quer guardar já é uma sequência de fatos; o histórico já foi decidido
append-only; a escalada de atenção para crítico vira mais um fato em vez de um campo sobrescrito; e a
tela pergunta "o que está alarmando agora?", que é projeção, não histórico.

**Por que fica contido:** quatro tipos de evento, uma projeção, nada migra. Um log de eventos cresce em
complexidade pelo número de **tipos**, não pelo de registros.

### A API padroniza em `/api`

**[DECIDIDO 2026-09-05]** `/auth/login` e `/usuarios/**` migram para o prefixo comum.

⚠️ **A sequência importa mais que a mudança.** Ela mexe em `SecurityConfig`, front e `nginx.conf` no
mesmo deploy — e a ordem dos `requestMatchers` é onde SEC-001, SEC-002 e SEC-003 nasceram, sem nenhum
teste HTTP que detecte a regressão. **Os testes de `SecurityConfig` vêm antes das rotas.**

### O custo operacional acumulado hoje

A entrevista originou cinco alterações de schema. A execução manual prevista
naquela data foi superada pela adoção do Flyway; o estado de cada migration e
os cuidados do próximo deploy estão em [DT-002](../../software/technical-debt.md#dt-002--estratégias-conflitantes-de-evolução-de-schema).

---

## 13. A borda deixa de ser exclusiva de sonda — 2026-09-07

**[DECIDIDO 2026-09-07]** Os cards do Desktop passam a ser **configuráveis**: o usuário declara quais
grandezas a unidade lê, com que nome e em que endereço do CLP. Spec em
[`features/cards-configuraveis.md`](cards-configuraveis.md).

**Prioridade declarada:** esta alteração vem **antes** dos itens pendentes de alarmes, borda e dívidas
técnicas.

### O que isso reverte, e por quê

| Decidido em 2026-09-05 | Decidido agora |
|---|---|
| O `tipo` da unidade é **classificação apenas**; telemetria segue exclusiva de sonda ([RN-074](../regras/business-rules.md#rn-074--o-tipo-não-altera-o-que-é-monitorado-por-ora)) | O tipo continua sem alterar a leitura — mas **a configuração altera** ([RN-080](../regras/business-rules.md#rn-080--o-card-define-o-que-se-lê-do-clp)) |
| Instrumentar equipamento que não é sonda é **projeto próprio**, com outro CLP e outras grandezas | Vira **cadastro** |
| Mapeamento card→endereço é melhoria futura ([OQ-043](open-questions.md#oq-043--mapeamento-configurável-de-card-para-endereço-no-clp)) | É a próxima entrega |

**Não é contradição — é o caminho de saída que a própria OQ-043 previu.** Ela dizia, em 2026-09-05,
que aquele mapeamento resolveria rack/slot por sonda, modelo de CLP variável e instrumentação de
outros equipamentos *"com uma resposta só"*. É o que se decidiu construir.

### A segunda inversão do Desktop

Em §2 o Desktop deixou de ser "o produto instalado na sonda" e virou **o sensor do sistema**. Agora
deixa de ser o sensor *da sonda* e vira **o agente de borda de qualquer unidade cadastrada**.

✅ **[FATO 2026-09-07]** Os nomes dos projetos acompanharam: `Geopetro-Desktop`, `Geopetro-Front`,
`Geopetro-Backend` e `Geopetro-Telemetria`, renomeados no mesmo dia —
[`renomeacao-projetos.md`](../../software/renomeacao-projetos.md).

### Duas grandezas que o sistema não conhecia

**[DECIDIDO 2026-09-07]** Temperatura e nível de tanque entram como tipos de card. Nenhuma das duas
existe hoje no contrato MQTT, no catálogo da Telemetria ou na tela.

O nível de tanque traz junto uma decisão de produto que parece detalhe e não é: **o sensor fica sempre
no topo**, então ele mede distância até o líquido, não nível. O volume sai da forma do tanque e das
dimensões. Ler o valor como se fosse nível daria um tanque que **enche quando esvazia** — e os números
continuariam plausíveis o tempo todo.

### O que isto cobra de volta

⚠️ **O cache persistente do Desktop deixa de ser opcional.** Hoje, um Desktop que reinicia sem rede
perde os limites de alarme e continua publicando. Com os cards vindo da configuração, ele **não sabe o
que ler** — e a telemetria daquela unidade para por inteiro. É a consequência mais cara desta decisão,
registrada em [RN-088](../regras/business-rules.md#rn-088--sem-configuração-a-unidade-não-lê-nada).

⚠️ **Uma role nova.** `SUPORTE` não existe, e `usuario_roles.role` é `ENUM` no banco — acrescentar
valor é migration, não só código.

### A entrevista de 2026-09-07

**[DECIDIDO 2026-09-07]** Quatro rodadas fecharam o desenho. Registro item a item em
[`features/cards-configuraveis.md §12`](cards-configuraveis.md#12-a-entrevista-de-2026-09-07)
e em [RN-089 a RN-096](../regras/business-rules.md#regras-da-entrevista-de-2026-09-07).

| Tema | Decisão |
|---|---|
| Onde se configura | **Só no Geopetro-Desktop** — acertar byte e rack exige estar na unidade. O Front só lê |
| Documento | **Dois**: cards (`ADMIN`/`SUPORTE`) e limites (quem enxerga a sonda), com revisões próprias |
| Tanque | Publica **volume em bbl** — é o que se compara com o plano do simulador |
| Contador de stroke | **Três séries** por card, e **várias bombas** por unidade |
| Card | **Não se exclui**, só se desativa. O limite de alarme hiberna junto |
| Leitura do CLP | **Em bloco**, não card a card — o número de cards deixou de ser conhecido |
| Horus | **Continua separado**, sem convergência prevista |

### Três riscos aceitos com o custo à vista

**[DECIDIDO 2026-09-07]** Escolhas feitas contra a recomendação registrada. Ficam anotadas para que a
revisão, se vier, comece de onde parou:

| Decisão | O que se aceita junto |
|---|---|
| **A frota nasce vazia** | Unidade sem card não lê nada ([RN-088](../regras/business-rules.md#rn-088--sem-configuração-a-unidade-não-lê-nada)). Com configuração só presencial e mais de dez unidades, a telemetria de cada uma fica parada entre o deploy e a visita. ✅ Mitigado por **copiar a configuração de outra unidade** |
| **Sem conferência ao vivo ao configurar** | O CLP não recusa endereço errado — devolve bytes e a conversão devolve número plausível. O valor bruto no card vira a **única** proteção |
| **Dois cards no mesmo endereço** | Duas séries no histórico com o mesmo dado de origem, sem nada indicando que são a mesma coisa |

**O que essas três têm em comum:** todas trocam trabalho de construção por trabalho de operação — e a
operação é **uma pessoa**, que também desenvolve (§4). É a mesma troca registrada em §11 para backup
e OneDrive.

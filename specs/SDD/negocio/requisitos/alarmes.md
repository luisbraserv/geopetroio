# Alarmes de Telemetria — Spec de Feature

> **[DECIDIDO 2026-09-05]** · Spec-first · **[FATO 2026-09-09] Os quatro passos entregues em código**: canal de configuração, motor de avaliação, log de eventos, ajuste de limites, destaque no tempo real, histórico na tela e alarme local na sonda. ⚠️ **A avaliação na borda só chega à frota com o auto-update do Desktop**, que não existe — até lá é visita a cada unidade.
>
> Feature de nível de sistema: atravessa Geopetro-Desktop, Geopetro-Backend e Front. Por isso mora aqui, e
> não dentro de um repositório — a mesma razão que colocou os contratos em [`../contracts/`](../../software/apis/).
>
> Contexto de produto em [`../product-context.md`](product-context.md#3-alarmes--o-que-faltava-para-o-produto-cumprir-o-papel).

## 1. Por que existe

**[DECIDIDO 2026-09-05]** O público principal das telas é **supervisão remota e cliente**
([product-context §2](product-context.md#2-quem-usa-cada-superfície)) — gente que não está olhando
a tela no segundo em que a pressão sai da faixa.

Uma tela de telemetria sem limiar transfere ao humano a obrigação de vigiar continuamente. O alarme
inverte isso: o sistema vigia, e chama.

## 2. Escopo decidido

| Aspecto | Decisão | Alternativa recusada |
|---|---|---|
| **Onde é avaliado** | **Borda e servidor** | Só no navegador — não avisa ninguém com a tela fechada |
| **Escopo do limite** | **Por sonda**, ajustável na hora pela supervisão na própria tela | Limite global por grandeza — sondas têm capacidades diferentes |
| **Canais** | Destaque na tela · alerta no Desktop da sonda | E-mail, SMS e WhatsApp — **fora de escopo** |
| **Depois do disparo** | **Evento com histórico** consultável | Reconhecimento formal (*ack*) — fora de escopo |
| **Ruído na fronteira** | **Tempo mínimo fora e dentro** da faixa | Banda de histerese — menos intuitiva de configurar |
| **Quem vê e ajusta** | **Todos que enxergam a sonda**, inclusive `CLIENTE` | Restringir a `ADMIN` — mataria o "ajustável na hora" |
| **Silêncio da sonda** | **Não é alarme** | Alarmar ausência de dado — ruído constante, dada a conectividade irregular |
| **Severidade** | **Atenção e crítico** | Nível único — não daria margem de reação antes do limite duro |
| **Tempos** | **Configuráveis por sonda**, junto do limite | Constante do sistema — equipamentos diferentes têm dinâmicas diferentes |

**[DECIDIDO 2026-09-05] Sem e-mail e sem SMS/WhatsApp.** A integração SMTP saiu do sistema com o
módulo `quimico` em 2026-08-26 e **não retorna** por esta feature. Um provedor de SMS/WhatsApp seria
integração externa nova, com custo por mensagem.

## 3. A pergunta que a avaliação dupla obriga a responder

**[FATO]** A estação avalia seus **limites locais** sem internet; o servidor avalia seus
**limites próprios** a partir do tempo real. As configurações são independentes
([configuração da estação §3](configuracao-da-estacao.md#3-alarme-próprio-da-estação)).
Só o servidor produz eventos para o histórico.

**[DECIDIDO 2026-09-09]** Uma única fonte de verdade para o histórico:

| Lado | Papel | Estado |
|---|---|---|
| **Desktop (borda)** | **Sinaliza localmente** — som e destaque na tela da sonda. **Não gera evento.** Funciona sem rede | ✅ **Implementado 2026-09-09** ([RN-104](../regras/business-rules.md#rn-104--a-estação-sinaliza-o-alarme-o-servidor-o-registra)) · ⚠️ na frota só com o auto-update |
| **Backend (servidor)** | **Único produtor do histórico de eventos.** É o que a supervisão e o cliente consultam | ✅ **Implementado 2026-09-09** |

### ⚠️ De onde o servidor tira a leitura — **[DECIDIDO 2026-09-09]**

Do **canal de tempo real** ([RN-102](../regras/business-rules.md#rn-102--o-servidor-avalia-o-alarme-pelo-canal-de-tempo-real)),
que é o único caminho por onde o Backend recebe leitura sem pedir. O histórico vai por MQTT direto à
Telemetria, e o Backend só o consulta sob demanda — esperar por ali transformaria uma consulta em
gatilho.

**Isso tem duas consequências que não estavam à vista quando a avaliação dupla foi decidida:**

1. ⚠️ **Sonda com a conexão de tempo real caída não alarma no servidor**, ainda que o MQTT siga
   gravando o histórico. Coerente com RN-070, mas não é o mesmo que dizer que nada se perde.
2. ⚠️ **Card ativo e invisível não é avaliado pelo servidor** — o tempo real carrega só cards
   visíveis (RN-037). A **estação** o avalia, porque lê todos os cards ativos: o alarme acende na
   sonda e a supervisão remota não o vê.

   ✅ **[FATO 2026-09-09]** As duas telas onde a decisão é tomada avisam disso — a de **Cards**, no
   Desktop, ao deixar um card ativo e invisível, e a de **Limites**, ao ajustar o limite dele
   ([OQ-050](open-questions.md#oq-050--limite-sobre-card-invisível-nunca-dispara)). ⚠️ O aviso
   torna a consequência visível para quem escolhe; **a assimetria permanece**, por desenho.

**Por quê:** dois produtores do mesmo evento exigiriam deduplicação por janela de tempo, com relógios
diferentes nos dois lados. O custo aceito é que uma excursão ocorrida com a sonda offline **alerta o
operador local mas não entra no histórico** — coerente com a decisão de que o histórico remoto vive do
que chega ao servidor.

⚠️ Se o buffer de contingência ([OQ-019](open-questions.md#oq-019--perda-de-telemetria-em-falha-de-mqtt-é-aceitável))
reenviar a telemetria acumulada, o servidor avaliará os pontos atrasados e o evento **nasce depois** do
fato. Ver [OQ-031](open-questions.md#oq-031--o-consumidor-tolera-telemetria-fora-de-ordem).

## 4. Modelo de dados proposto

**[FATO 2026-09-09]** Configuração, limites, **avaliação, log de eventos, a projeção na tela e o histórico** estão implementados; ver [contrato implementado](../../software/apis/configuracao-sonda.md) e [websocket-realtime §3](../../software/apis/websocket-realtime.md#alarmes-é-a-única-coisa-que-o-servidor-acrescenta--decidido-2026-09-09).

### Limite

**[FATO 2026-09-07]** Um documento por **Unidade/Sonda**, com até um limite por grandeza, no MySQL do Geopetro-Backend. A lista é substituída integralmente e a autoria corresponde à última gravação do documento. A proposta original previa um registro por Unidade/Sonda × grandeza.

⚠️ **[FATO 2026-09-09] O `dispositivoId` sozinho não identifica a grandeza.** O vocabulário deixou de ser fechado e passou a ser o que cada unidade declara no documento de cards, e a chave ganhou `serie` — [RN-101](../regras/business-rules.md#rn-101--o-limite-de-alarme-só-existe-para-uma-grandeza-que-a-unidade-declara).

```
LimiteAlarme
  unidadeSondaId       (FK)
  dispositivoId        (o que a unidade declara em /api/sondas/{id}/cards — RN-101)
  serie                (stroke | vazao | volumeAcumulado num contador; nula nos demais — RN-098)
  minimoAtencao        (opcional)
  maximoAtencao        (opcional)
  minimoCritico        (opcional)
  maximoCritico        (opcional)
  segundosParaAbrir    (tempo mínimo fora da faixa)
  segundosParaFechar   (tempo mínimo dentro da faixa)
  ativo                (boolean)
  atualizadoPor / atualizadoEm
```

**[DECIDIDO 2026-09-05]** Dois níveis — **atenção** e **crítico** ([RN-071](../regras/business-rules.md#rn-071--o-alarme-tem-dois-níveis-atenção-e-crítico))
— e os tempos são **por sonda**, editados junto do limite, não constantes do sistema
([RN-068](../regras/business-rules.md#rn-068--alarme-abre-e-fecha-por-tempo-mínimo)).

⚠️ **São 6 parâmetros por grandeza.** Com cinco grandezas, **30 campos por sonda**, e mais de 10 sondas.
Ninguém preenche isso do zero a cada cadastro — e alarme mal configurado é pior que alarme nenhum,
porque ensina o operador a ignorar.

❌ **[DECIDIDO 2026-09-05] Sem perfil padrão por tipo.** A proposta foi recusada: **cada sonda é
configurada individualmente**, e os limites começam vazios.

**Consequência aceita:** uma sonda recém-cadastrada **não alarma até alguém configurar** — e isso é
estado normal, não pendência sinalizada.

**[FATO]** A tela de Prontidão da Frota criada em 2026-09-09 foi removida
no dia seguinte por classificar cobertura a partir de contagens insuficientes.
O estado sem limite continua normal; a visibilidade remota da configuração
segue em [OQ-049](open-questions.md#oq-049--como-saber-quais-unidades-da-frota-já-foram-configuradas).

**[DECIDIDO 2026-09-05]** O limite ajustado vale **até alguém trocar**. Não expira, não volta a padrão
nenhum. O valor definido para o trabalho de hoje continua valendo semana que vem, para outro trabalho —
por isso o registro de autoria (§6) é o que permite entender depois por que o limite era aquele.

**Por que no Geopetro-Backend e não no serviço de Telemetria:** o limite é configuração de cadastro,
editada por gente autenticada, sujeita à mesma autorização por sonda. O serviço de Telemetria
deliberadamente **não conhece usuários** ([spec do Geopetro-Telemetria](../../../../Geopetro-Telemetria/specs/README.md)).

### Evento

**[DECIDIDO 2026-09-05]** A ocorrência é registrada como **sequência de eventos** (*event sourcing*),
não como linha mutável. Uma excursão que atravessa a atenção e chega à crítica é **um episódio que
escala** — a escalada é mais um fato, não um `UPDATE`.

✅ **[FATO 2026-09-09] Implementado**, na tabela `evento_alarme` (migration `V2026.09.09.1`):

```
EventoAlarme  (append-only)
  episodioId       (agrupa os fatos da mesma excursão)
  unidadeSondaId · dispositivoId · serie
  tipo             (ABRIU | ESCALOU | REDUZIU | FECHOU)
  severidade       (ATENCAO | CRITICO; no FECHOU, a que o episódio tinha ao terminar)
  ocorridoEm       (instante de recepção no servidor — RN-102)
  valor            (leitura que provocou o fato)
  limiteViolado    (MIN | MAX)
```

**Abrir direto em crítico é um fato só.** Uma pressão que salta da faixa para além do limite crítico
produz **um** `ABRIU` com severidade `CRITICO` — não um `ABRIU` em atenção seguido de `ESCALOU`.
Inventar a escalada registraria um fato que não houve.

**Projeção para a tela** — derivada, reconstruível a partir do log:

```
AlarmeAtivo  (projeção)
  unidadeSondaId · dispositivoId · serie
  episodioId · severidadeAtual
  desde · valorExtremo · limiteViolado
```

✅ **[FATO 2026-09-09]** A projeção vive **em memória** e é reconstruída no `ApplicationReadyEvent` a
partir dos episódios que nunca fecharam. ⚠️ Sem essa reconstrução, um reinício no meio de uma excursão
faria a próxima leitura abrir um **segundo** episódio para a mesma excursão — a mesma coisa contada
duas vezes no histórico. Falha na reconstrução não impede a aplicação de subir: vira `ERROR` no log, e
o motor volta sem os episódios abertos.

### O episódio — a forma em que o histórico é lido

✅ **[FATO 2026-09-09]** `GET /api/sondas/{id}/alarmes/historico?inicio=&fim=` devolve **excursões**,
montadas a partir dos fatos:

```
EpisodioAlarme  (derivado do log, não persistido)
  episodioId · unidadeSondaId · dispositivoId · serie
  severidadeMaxima   (o pior que chegou a ser, não o que era ao fechar)
  limiteViolado      (o lado por onde a excursão começou)
  abertoEm · fechadoEm   (fechadoEm nulo = ainda aberto)
  valorExtremo
  fatos[]            (a sequência: tipo, severidade, instante, valor)
```

⚠️ **Por que agrupado, e não os fatos crus.** A supervisão pergunta "quantas vezes a pressão saiu da
faixa no turno?". Um episódio que abriu em atenção, escalou e fechou são três linhas e **uma**
excursão; devolver as três soltas faria cada tela reconstruir o agrupamento, e a primeira que errasse
contaria três alarmes.

⚠️ **Os fatos vêm inteiros, mesmo os anteriores à janela.** Recortá-los pelo período consultado faria
uma excursão que abriu ontem aparecer começando por `ESCALOU` — uma escalada sem a abertura que a
explica, e com o "desde" errado.

✅ **[FATO 2026-09-09] A projeção chega à tela por dois caminhos, e são complementares:**

| Caminho | Quando responde |
|---|---|
| Dentro da mensagem de tempo real | Sempre que a sonda publica — e aí o destaque descreve **estes** números |
| `GET /api/sondas/{id}/alarmes` | Ao abrir a tela, antes da primeira mensagem, e quando a sonda **não está publicando** |

⚠️ **O segundo não é redundância.** Um episódio aberto de uma sonda que caiu continua sendo verdade, e
sem a rota ele ficaria invisível justamente quando ninguém está olhando o CLP.

### Por que aqui, e só aqui

**[DECIDIDO 2026-09-05]** O alarme é **a única fatia** do sistema orientada a eventos.

O que se quer guardar já é uma sequência de fatos, o histórico já foi decidido append-only
([RN-056](../regras/business-rules.md#rn-056--um-evento-por-excursão-não-por-leitura)), e a escalada cabe
naturalmente como mais um evento. A tela responde "o que está alarmando agora?" — pergunta de projeção,
não de histórico.

⚠️ **Duas fronteiras deliberadas, para a decisão não crescer sozinha:**

| Fica de fora | Por quê |
|---|---|
| **Os limites** (`LimiteAlarme`) | Configuração é CRUD com autoria (`atualizadoPor`/`atualizadoEm`). Versionar configuração é outro problema |
| **O resto do sistema** | Cadastros, usuários e simulador seguem CRUD com JPA. Nada migra |

**Vocabulário fechado em quatro fatos.** `ABRIU`, `ESCALOU`, `REDUZIU`, `FECHOU`. Um log de eventos
cresce em complexidade pelo número de tipos, não pelo número de registros.

**Um evento por excursão, não por leitura.** A 1 leitura/s, uma pressão 10 minutos acima do limite
geraria 600 registros — e nenhuma tela de histórico sobrevive a isso.

## 5. Como o limite é aplicado

**[FATO 2026-09-09]** A supervisão ajusta os limites do servidor em
`/app/limites-alarme`. O Front usa `GET`/`PUT /api/sondas/{id}/configuracao`;
`MotorDeAlarmes` lê o documento persistido e avalia as leituras recebidas pelo
canal de tempo real. O [contrato de limites](../../software/apis/configuracao-sonda.md)
define revisão, validação e autorização.

**[FATO]** O Desktop não assina nem recebe esse documento. Seu sininho grava
limites próprios em `config/alarmes-locais.json`. O canal STOMP de limites criado
na primeira entrega foi removido depois que perdeu o único assinante. O canal
STOMP de **cards** continua ativo e é um contrato separado.

**[PENDENTE]** O auto-update ainda é necessário para distribuir à frota versões
novas do Desktop; ele não distribui limites de alarme do servidor.

## 6. Autorização

**[DECIDIDO 2026-09-05]** Sem modelo novo. Vale [RN-047](../regras/business-rules.md#rn-047--escopo-de-sondas-por-perfil):

| Ação | Quem |
|---|---|
| Ver estado atual e **histórico** de alarmes | Quem já enxerga a sonda — inclusive `CLIENTE`, nas concedidas |
| **Ajustar o limite** | **Os mesmos** — inclusive `CLIENTE` |

**[DECIDIDO 2026-09-05]** Não há role própria para alarme: quem vê a sonda vê e ajusta o alarme dela.
Ver [RN-069](../regras/business-rules.md#rn-069--quem-vê-a-sonda-vê-e-ajusta-o-alarme-dela).

**Transparência é deliberada.** O cliente enxerga cada excursão da operação que contratou, com histórico
— não apenas o estado do momento.

⚠️ **Mitigação obrigatória, não opcional:** o limite guarda **quem alterou e quando** (`atualizadoPor`,
`atualizadoEm` no modelo do §4). Com o cliente podendo ajustar o limite da operação que paga, um valor
mudado no meio do trabalho precisa ser distinguível de um valor que sempre esteve ali. Sem esse
registro, o histórico de alarmes conta uma história que ninguém consegue auditar.

## 7. Pontos em aberto

### Resolvidos em 2026-09-05

| Questão | Decisão |
|---|---|
| **Histerese** | **Tempo mínimo fora e dentro** da faixa — [RN-068](../regras/business-rules.md#rn-068--alarme-abre-e-fecha-por-tempo-mínimo) |
| **Sonda que parou de publicar** | **Não é alarme.** Permanece só o aviso visual de 5s da tela — [RN-070](../regras/business-rules.md#rn-070--ausência-de-dado-não-é-alarme) |
| **Cliente vê alarme?** | **Vê tudo**, estado e histórico, e ainda ajusta o limite — §6 |

### Continuam abertos

✅ **Resolvidos nas rodadas 3 e 4:** tempo mínimo **configurável por sonda** (OQ-037), **dois níveis** de
severidade (OQ-038) e o tipo da unidade **não** altera as variáveis monitoradas por ora (OQ-041) — a
telemetria segue exclusiva de sonda.

✅ **Resolvidos na rodada final:** escalada é **um episódio que escala**, registrado como log de eventos
(§4); **sem perfil padrão** — cada sonda é configurada; sonda sem limite **não alarma**, e isso é estado
normal; o limite vale **até alguém trocar**.

✅ **Resolvido em 2026-09-09 pela implementação:** a **reconstrução da projeção** (item 2) — ela é
sempre refeita do zero a partir do log, no arranque. A projeção não tem persistência própria, então
não há como divergir: ou o log diz, ou não é verdade.

✅ **Parcialmente resolvido:** o **episódio que nunca fecha** (item 3) deixou de valer para o caso do
limite desativado, que agora fecha na hora
([RN-103](../regras/business-rules.md#rn-103--limite-desativado-fecha-o-episódio-aberto)). O caso da sonda
que simplesmente para de publicar continua aberto.

| # | Questão que continua aberta | Por que importa |
|---|---|---|
| 1 | **Retenção do log de eventos** — agora com a tabela existindo: [OQ-051](open-questions.md#oq-051--retenção-do-log-de-eventos-de-alarme) | O log é append-only e cresce sem parar. Precisa de política própria — a de 5 anos vale para a série, não foi discutida para alarmes |
| 3 | **Episódio que nunca fecha por silêncio da sonda** | Sonda que para de publicar durante uma excursão deixa o episódio aberto para sempre — e silêncio **não é alarme** ([RN-070](../regras/business-rules.md#rn-070--ausência-de-dado-não-é-alarme)), então nada o encerra |
| 4 | **O limite não expira** | Sendo por sonda e ajustável na hora, sem entidade que delimite a operação, o valor ajustado para o trabalho de hoje continua valendo semana que vem, para outro trabalho, até alguém lembrar de mudar. **Não há "fim do trabalho" que o sistema reconheça** — o registro de autoria (§6) é o que permite entender depois por que o limite era aquele |

✅ **Decidido em 2026-09-09:** o **limite sobre card invisível**
([OQ-050](open-questions.md#oq-050--limite-sobre-card-invisível-nunca-dispara)) — nascido do
encontro de RN-037 com RN-102 — é **avisado e não impedido**, nas duas telas onde a decisão é tomada:
a de Cards, no Desktop, e a de Limites, no Front.

⚠️ **O aviso torna a consequência visível para quem escolhe; a assimetria continua.** Quem não está
na sonda segue sem ver aquele alarme, e é esse o público da feature.

## 8. Ordem de implementação sugerida

1. ✅ **Documento de limites do servidor** (§5) — persistência, revisão e API REST implementadas. O antigo transporte STOMP de limites foi removido após a separação do alarme local.
2. ✅ **Interface de limites + avaliação no servidor + evento** — **entregue em 2026-09-09**:

   ✅ **O limite passou a valer sobre a grandeza que a unidade declara** ([RN-101](../regras/business-rules.md#rn-101--o-limite-de-alarme-só-existe-para-uma-grandeza-que-a-unidade-declara)).
   Era pré-requisito e não estava previsto aqui: com a lista fixa de cinco ids, a tela de limites não
   teria o que oferecer a uma unidade com card de temperatura ou de tanque.

   ✅ **Avaliação no servidor e log de eventos** — `AvaliadorDeAlarme` (a regra, função pura),
   `MotorDeAlarmes` (estado, gravação e projeção) e a tabela `evento_alarme`.

   ✅ **Tela de ajuste de limites**, em `/app/limites-alarme`, com os perfis de monitoramento —
   inclusive `CLIENTE` (RN-069), e não os de configuração. Monta-se a partir do documento de cards
   da unidade, valida do lado do cliente as mesmas regras do servidor e trata o `409` recarregando.

   ✅ **Destaque na tela de tempo real** — o canal decidido em §2. A projeção viaja **dentro da
   mensagem de leituras** ([websocket-realtime §3](../../software/apis/websocket-realtime.md#alarmes-é-a-única-coisa-que-o-servidor-acrescenta--decidido-2026-09-09)),
   e `GET /api/sondas/{id}/alarmes` cobre o intervalo até a primeira mensagem e a sonda que não está
   publicando. Aviso no topo, com a lista do mais grave para o mais antigo, e o card da grandeza
   marcado — com o nível escrito, porque cor sozinha não informa quem não a distingue.
3. ✅ **Avaliação na borda** — entregue em 2026-09-09.
   `AvaliadorLocalDeAlarme` (a regra, função pura), `AlarmesLocais` (estado e som) e o destaque no
   card do dashboard. **Sinaliza, não registra** ([RN-104](../regras/business-rules.md#rn-104--a-estação-sinaliza-o-alarme-o-servidor-o-registra)):
   sem `episodioId`, sem os quatro fatos, sem gravação — só que severidade vale agora.

   ⚠️ **O bloqueio era de *rollout*, e continua de pé.** O código está escrito e testado; chegar à
   frota exige visita a cada unidade enquanto o auto-update não existir
   ([product-context §8](product-context.md#8-capacidades-decididas-que-ainda-não-existem), item 6).
4. ✅ **Histórico na tela** — entregue em 2026-09-09, em `/app/historico-alarmes`.
   `GET /api/sondas/{id}/alarmes/historico` devolve **excursões**, não linhas de log: um episódio que
   abriu em atenção, escalou e fechou são três fatos e uma excursão
   ([RN-056](../regras/business-rules.md#rn-056--um-evento-por-excursão-não-por-leitura)). Devolver os fatos
   soltos faria cada tela reconstruir o agrupamento, e a primeira que errasse contaria três alarmes.

   ⚠️ **A janela é obrigatória e o resultado tem teto declarado** — 200 excursões, período de até 92
   dias. O log é *append-only* e não tem retenção ([OQ-051](open-questions.md#oq-051--retenção-do-log-de-eventos-de-alarme)):
   uma consulta sem limite funcionaria bem por meses e depois derrubaria a tela de uma sonda
   movimentada. Quando corta, a tela **diz** — lista incompleta que se apresenta como completa é pior
   que lista curta.

   ⚠️ **Os fatos de um episódio vêm inteiros**, mesmo os anteriores à janela: recortá-los faria uma
   excursão que abriu ontem aparecer começando por `ESCALOU`, sem a abertura que a explica.

⚠️ O passo 3 depende de **auto-update do Desktop**, que não existe
([product-context §4](product-context.md#4-realidade-de-campo)). Os passos 1, 2 e 4 entregam valor
sem tocar na frota.

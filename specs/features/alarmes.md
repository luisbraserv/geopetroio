# Alarmes de Telemetria — Spec de Feature

> **[DECIDIDO 2026-09-05]** · Spec-first · **[FATO 2026-09-07] Canal de configuração implementado; motor e interfaces de alarmes pendentes.**
>
> Feature de nível de sistema: atravessa Geopetro-Desktop, Geopetro-Backend e Front. Por isso mora aqui, e
> não dentro de um repositório — a mesma razão que colocou os contratos em [`../contracts/`](../contracts/).
>
> Contexto de produto em [`../product-context.md`](../product-context.md#3-alarmes--o-que-faltava-para-o-produto-cumprir-o-papel).

## 1. Por que existe

**[DECIDIDO 2026-09-05]** O público principal das telas é **supervisão remota e cliente**
([product-context §2](../product-context.md#2-quem-usa-cada-superfície)) — gente que não está olhando
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

**[FATO]** Avaliar nos dois lados é o que dá **alarme local sem internet** e **alarme remoto para quem
não está na sonda**. Mas cria a pergunta: se os dois lados avaliam a mesma excursão, quantos eventos
isso gera?

**[PENDENTE — proposta a confirmar]** Uma única fonte de verdade para o histórico:

| Lado | Papel |
|---|---|
| **Desktop (borda)** | **Sinaliza localmente** — som e destaque na tela da sonda. **Não gera evento.** Funciona sem rede |
| **Backend (servidor)** | **Único produtor do histórico de eventos.** É o que a supervisão e o cliente consultam |

**Por quê:** dois produtores do mesmo evento exigiriam deduplicação por janela de tempo, com relógios
diferentes nos dois lados. O custo aceito é que uma excursão ocorrida com a sonda offline **alerta o
operador local mas não entra no histórico** — coerente com a decisão de que o histórico remoto vive do
que chega ao servidor.

⚠️ Se o buffer de contingência ([OQ-019](../open-questions.md#oq-019--perda-de-telemetria-em-falha-de-mqtt-é-aceitável))
reenviar a telemetria acumulada, o servidor avaliará os pontos atrasados e o evento **nasce depois** do
fato. Ver [OQ-031](../open-questions.md#oq-031--o-consumidor-tolera-telemetria-fora-de-ordem).

## 4. Modelo de dados proposto

**[FATO 2026-09-07]** Configuração e limites já são persistidos por unidade; ver [contrato implementado](../contracts/configuracao-sonda.md). Eventos e avaliação abaixo continuam propostos.

### Limite

**[FATO 2026-09-07]** Um documento por **Unidade/Sonda**, com até um limite por grandeza, no MySQL do Geopetro-Backend. A lista é substituída integralmente e a autoria corresponde à última gravação do documento. A proposta original previa um registro por Unidade/Sonda × grandeza.

```
LimiteAlarme
  unidadeSondaId       (FK)
  dispositivoId        (vocabulário fechado — mqtt-telemetria.md §4)
  minimoAtencao        (opcional)
  maximoAtencao        (opcional)
  minimoCritico        (opcional)
  maximoCritico        (opcional)
  segundosParaAbrir    (tempo mínimo fora da faixa)
  segundosParaFechar   (tempo mínimo dentro da faixa)
  ativo                (boolean)
  atualizadoPor / atualizadoEm
```

**[DECIDIDO 2026-09-05]** Dois níveis — **atenção** e **crítico** ([RN-071](../business-rules.md#rn-071--o-alarme-tem-dois-níveis-atenção-e-crítico))
— e os tempos são **por sonda**, editados junto do limite, não constantes do sistema
([RN-068](../business-rules.md#rn-068--alarme-abre-e-fecha-por-tempo-mínimo)).

⚠️ **São 6 parâmetros por grandeza.** Com cinco grandezas, **30 campos por sonda**, e mais de 10 sondas.
Ninguém preenche isso do zero a cada cadastro — e alarme mal configurado é pior que alarme nenhum,
porque ensina o operador a ignorar.

❌ **[DECIDIDO 2026-09-05] Sem perfil padrão por tipo.** A proposta foi recusada: **cada sonda é
configurada individualmente**, e os limites começam vazios.

**Consequência aceita:** uma sonda recém-cadastrada **não alarma até alguém configurar** — e isso é
estado normal, não pendência sinalizada. O sistema não avisa que uma sonda está sem alarme.

**[DECIDIDO 2026-09-05]** O limite ajustado vale **até alguém trocar**. Não expira, não volta a padrão
nenhum. O valor definido para o trabalho de hoje continua valendo semana que vem, para outro trabalho —
por isso o registro de autoria (§6) é o que permite entender depois por que o limite era aquele.

**Por que no Geopetro-Backend e não no serviço de Telemetria:** o limite é configuração de cadastro,
editada por gente autenticada, sujeita à mesma autorização por sonda. O serviço de Telemetria
deliberadamente **não conhece usuários** ([spec do Geopetro-Telemetria](../../Geopetro-Telemetria/specs/README.md)).

### Evento

**[DECIDIDO 2026-09-05]** A ocorrência é registrada como **sequência de eventos** (*event sourcing*),
não como linha mutável. Uma excursão que atravessa a atenção e chega à crítica é **um episódio que
escala** — a escalada é mais um fato, não um `UPDATE`.

```
EventoAlarme  (append-only)
  episodioId       (agrupa os fatos da mesma excursão)
  unidadeSondaId · dispositivoId
  tipo             (ABRIU | ESCALOU | REDUZIU | FECHOU)
  severidade       (ATENCAO | CRITICO)
  ocorridoEm
  valor            (leitura que provocou o fato)
  limiteViolado    (MIN | MAX)
```

**Projeção para a tela** — derivada, reconstruível a partir do log:

```
AlarmeAtivo  (projeção)
  unidadeSondaId · dispositivoId
  episodioId · severidadeAtual
  desde · valorExtremo
```

### Por que aqui, e só aqui

**[DECIDIDO 2026-09-05]** O alarme é **a única fatia** do sistema orientada a eventos.

O que se quer guardar já é uma sequência de fatos, o histórico já foi decidido append-only
([RN-056](../business-rules.md#rn-056--um-evento-por-excursão-não-por-leitura)), e a escalada cabe
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

## 5. Como o limite chega à sonda

**[DECIDIDO 2026-09-05]** Pela **conexão WebSocket/STOMP que já existe**.

**[FATO 2026-09-07]** O Desktop publica em `/app/realtime/estado` e agora recebe configurações na mesma conexão autenticada. Snapshot inicial, reconexão, revisão e permissões estão no [contrato de configuração](../contracts/configuracao-sonda.md). Ajuste pela tela e avaliação dos limites continuam pendentes; o fluxo abaixo é o desenho completo previsto.

```
Supervisão ajusta o limite na tela
        │
        ▼
Geopetro-Backend grava e publica em /topic/config/unidades-sondas/{id}
        │
        ▼
Geopetro-Desktop (já assinante) aplica na hora
```

**Regra obrigatória:** ao **conectar** e ao **reconectar**, o Desktop pede a configuração vigente. Sem
isso, um limite alterado enquanto a sonda estava fora nunca chegaria — e a sonda operaria com um valor
velho sem que ninguém percebesse.

**Por que não um tópico MQTT de comando:** exigiria que o Geopetro-Backend voltasse a falar MQTT, revertendo
a decisão de 2026-08-26 que deixou **um produtor e um consumidor** no broker
([`mqtt-telemetria.md §6`](../contracts/mqtt-telemetria.md#6-remoção-do-consumidor-do-geopetro-backend)).
A retenção do broker entregaria a configuração após um período offline — vantagem real —, mas o pedido
no reconnect resolve o mesmo problema sem um segundo mecanismo.

⚠️ **Este canal é a base do auto-update** ([product-context §8](../product-context.md#8-capacidades-decididas-que-ainda-não-existem),
item 6). Vale desenhá-lo como *canal de configuração*, não como *canal de limites*.

## 6. Autorização

**[DECIDIDO 2026-09-05]** Sem modelo novo. Vale [RN-047](../business-rules.md#rn-047--escopo-de-sondas-por-perfil):

| Ação | Quem |
|---|---|
| Ver estado atual e **histórico** de alarmes | Quem já enxerga a sonda — inclusive `CLIENTE`, nas concedidas |
| **Ajustar o limite** | **Os mesmos** — inclusive `CLIENTE` |

**[DECIDIDO 2026-09-05]** Não há role própria para alarme: quem vê a sonda vê e ajusta o alarme dela.
Ver [RN-069](../business-rules.md#rn-069--quem-vê-a-sonda-vê-e-ajusta-o-alarme-dela).

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
| **Histerese** | **Tempo mínimo fora e dentro** da faixa — [RN-068](../business-rules.md#rn-068--alarme-abre-e-fecha-por-tempo-mínimo) |
| **Sonda que parou de publicar** | **Não é alarme.** Permanece só o aviso visual de 5s da tela — [RN-070](../business-rules.md#rn-070--ausência-de-dado-não-é-alarme) |
| **Cliente vê alarme?** | **Vê tudo**, estado e histórico, e ainda ajusta o limite — §6 |

### Continuam abertos

✅ **Resolvidos nas rodadas 3 e 4:** tempo mínimo **configurável por sonda** (OQ-037), **dois níveis** de
severidade (OQ-038) e o tipo da unidade **não** altera as variáveis monitoradas por ora (OQ-041) — a
telemetria segue exclusiva de sonda.

✅ **Resolvidos na rodada final:** escalada é **um episódio que escala**, registrado como log de eventos
(§4); **sem perfil padrão** — cada sonda é configurada; sonda sem limite **não alarma**, e isso é estado
normal; o limite vale **até alguém trocar**.

| # | Questão que continua aberta | Por que importa |
|---|---|---|
| 1 | **Retenção do log de eventos** | O log é append-only e cresce sem parar. Precisa de política própria — a de 5 anos vale para a série, não foi discutida para alarmes |
| 2 | **Reconstrução da projeção** | Quando `AlarmeAtivo` diverge do log (bug, deploy no meio de um episódio), reconstrói-se do zero? Um log pequeno permite; convém decidir antes de crescer |
| 3 | **Episódio que nunca fecha** | Sonda que para de publicar durante uma excursão deixa o episódio aberto para sempre — e silêncio **não é alarme** ([RN-070](../business-rules.md#rn-070--ausência-de-dado-não-é-alarme)), então nada o encerra |

**O item 4 é consequência direta** de o limite ser por sonda e ajustável na hora, sem entidade que
delimite a operação: o valor ajustado para o trabalho de hoje continua valendo semana que vem, para
outro trabalho, até alguém lembrar de mudar. Não há "fim do trabalho" que o sistema reconheça.

## 8. Ordem de implementação sugerida

1. **Canal de configuração** (§5) — **implementado em código em 2026-09-07**, incluindo persistência e transporte dos limites; distribuição à frota pendente
2. **Interface de limites + avaliação no servidor + evento** — próxima etapa; entrega alarme para supervisão e cliente
3. **Avaliação na borda** — exige a frota atualizada, logo depende do auto-update
4. **Histórico na tela**

⚠️ O passo 3 depende de **auto-update do Desktop**, que não existe
([product-context §4](../product-context.md#4-realidade-de-campo)). Os passos 1, 2 e 4 entregam valor
sem tocar na frota.

# Contrato de Telemetria MQTT

> Contrato de integração entre aplicações · **[DECIDIDO 2026-08-26]** ·
> **§3, §4, §9 e §10 reescritos em 2026-09-08 para cards por unidade**
>
> Este documento é **normativo**: define o contrato-alvo. Onde o código atual diverge, o código está
> em dívida — não o contrato.

## Partes

**[DECIDIDO 2026-08-26]** Papéis definidos. Há **exatamente um produtor e um consumidor**.

| Papel | Aplicação | Estado |
|---|---|---|
| **Produtor** | `Geopetro-Desktop` | Existe — publica formato antigo, a migrar |
| **Broker** | a definir | [OQ-023](../open-questions.md#oq-023--qual-broker-mqtt-será-usado-em-produção) |
| **Consumidor** | `Geopetro-Telemetria` | ✅ **Implementado em 2026-08-27** |

```
┌──────────────────────┐  publish   ┌────────┐  subscribe  ┌────────────────────────┐
│ Geopetro-Desktop        │───────────►│ BROKER │────────────►│ Geopetro-Telemetria     │
│ (agente na sonda)    │            │  MQTT  │             │ (a implementar)        │
└──────────────────────┘            └────────┘             └───────────┬────────────┘
                                                                       │ InfluxDB
                                                           ┌───────────▼────────────┐
                                                           │ Geopetro-Backend          │
                                                           │ consulta via REST      │
                                                           └────────────────────────┘
```

**[FATO]** `Geopetro-Backend` **não participa do MQTT**. O consumidor no-op que existia foi
**removido em 2026-08-26** — ver [§6](#6-remoção-do-consumidor-do-geopetro-backend). Sua única relação
com telemetria é **consultar séries já processadas** via REST, contrato em
[`rest-monitoramento.md`](rest-monitoramento.md).

---

## 1. Decisão e justificativa

**[DECIDIDO 2026-08-26]** Formato **batch com payload rico**.

Duas propostas concorriam:

| Proposta | Origem | Volume | Informação |
|---|---|---|---|
| Batch simples | Código atual do Geopetro-Desktop | 1 msg/ciclo | Mínima (`dispositivo`, `valor`) |
| Por sensor | `docs/documentacao-sistema.html` | **5 msg/ciclo** | Rica |
| **Batch rico** ← escolhido | Síntese | **1 msg/ciclo** | Rica |

**Justificativa registrada:** o formato batch foi introduzido deliberadamente no Geopetro-Desktop com
justificativa de custo — comentário no código cita redução de ~5× no número de mensagens e cobrança
por mensagem em brokers como AWS IoT Core. O formato por sensor traria a informação descritiva
desejada, mas multiplicaria o volume por 5 em toda a frota (5 dispositivos × 1 msg/s × N sondas).

O formato escolhido **preserva o custo atual** (1 mensagem por ciclo) e **incorpora os campos
descritivos** da documentação dentro do array de leituras.

---

## 2. Tópico

```
telemetria/{idSondaUnidade}/batch
```

| Elemento | Regra |
|---|---|
| `{idSondaUnidade}` | **[FATO]** É o `UnidadeSonda.nome` do cadastro (ex.: `SPT-144`, `UC-01`). Ver [RN-018](../business-rules.md#rn-018--nome-da-unidadesonda-é-chave-de-integração) |
| Wildcard do subscriber | `telemetria/+/batch` — **[MUDANÇA]** mais restrito que o atual `telemetria/+/+` |
| QoS | **1** (at least once) |
| Retained | **Não** |

⚠️ **Regra crítica:** renomear uma Unidade/Sonda no cadastro **quebra a continuidade do histórico de
telemetria**. Nada no sistema hoje impede ou avisa sobre isso. Ver [OQ-001](#8-pontos-em-aberto).

---

## 3. Payload

**[DECIDIDO 2026-09-08]** Reescrito para cards por unidade. O que mudou e por quê está em
[§4](#4-o-conjunto-de-dispositivos-é-por-unidade).

### Estrutura

```json
{
  "idSondaUnidade": "SPT-144",
  "dataHora": "2026-09-08T14:32:05.120",
  "leituras": [
    {
      "dispositivoId": "PESO_01",
      "tipo": "PESO",
      "unidade": "lbf",
      "enderecoDb": "DBW4",
      "valor": 184300.5,
      "valorBruto": 412
    },
    {
      "dispositivoId": "CONTADOR_STROKE_01",
      "serie": "vazao",
      "tipo": "CONTADOR_STROKE",
      "unidade": "bbl/min",
      "enderecoDb": "DBD0",
      "valor": 1.52,
      "valorBruto": 148320
    }
  ]
}
```

### A mensagem se descreve

**[DECIDIDO 2026-09-08]** Cada leitura carrega **o que é preciso para interpretá-la**: o tipo e a
unidade viajam junto do valor.

⚠️ **É isso que permite cards por unidade.** Com o conjunto variando de sonda para sonda, um
consumidor que dependesse de tabela fixa precisaria conhecer a configuração de cada unidade para
gravar uma leitura — e ficaria sem saber o que fazer com o primeiro card de um tipo novo. Ver
[§4](#4-o-conjunto-de-dispositivos-é-por-unidade).

**Alternativa recusada:** a Telemetria consultar `/api/sondas/{id}/cards` no Backend e manter cache.
Criaria dependência da VM-2 para a VM-1 no caminho de ingestão: com o Backend fora, a Telemetria
gravaria dado que não sabe interpretar.

### Campos do envelope

| Campo | Tipo | Obrigatório | Regra |
|---|---|---|---|
| `idSondaUnidade` | string | Sim | Igual ao segmento do tópico. Se vazio, **não publicar** |
| `dataHora` | string ISO-8601 | Sim | `yyyy-MM-dd'T'HH:mm:ss.SSS`, hora local da sonda. Ver [§7](#7-fuso-horário) |
| `leituras` | array | Sim | Mínimo 1 elemento. Só cards **ativos e visíveis**, e só grandezas **com valor** |

### Campos de cada leitura

| Campo | Tipo | Obrigatório | Regra |
|---|---|---|---|
| `dispositivoId` | string | Sim | `<TIPO>_<NN>`, gerado pelo sistema e imutável — [RN-081](../business-rules.md#rn-081--o-id-do-card-é-gerado-o-nome-é-rótulo) |
| `serie` | string | Só multi-série | Ausente para card de uma grandeza. Ver [§4](#as-três-séries-do-contador-de-stroke) |
| `tipo` | string | Sim | `PESO` · `TORQUE` · `PRESSAO` · `TEMPERATURA` · `NIVEL_TANQUE` · `CONTADOR_STROKE` |
| `unidade` | string | Sim | Unidade de engenharia do `valor` |
| `enderecoDb` | string | Sim | Onde foi lido neste ciclo: `DBW10`, `DBD0`. Substitui `codigoOrigem` |
| `valor` | number | Sim | Grandeza convertida |
| `valorBruto` | number | Sim | O que veio do CLP antes da conversão |

### O campo `nome` saiu do contrato

**[DECIDIDO 2026-09-08]** O rótulo de tela **não** viaja. Ele é editável: renomear "Bomba de Lama"
para "Bomba 1" faria a mesma série aparecer com dois nomes na mesma linha do tempo, e nada diria
qual valia quando.

Quem identifica a série é o `dispositivoId`, que é gerado e nunca muda. Quem quiser exibir o rótulo
atual busca o documento de cards da unidade — que é onde ele vive, e onde tem uma revisão que o
data.

### `enderecoDb` no lugar de `codigoOrigem`

**[DECIDIDO 2026-09-08]** `B001..B005` eram códigos de um mapeamento fixo que deixou de existir.

⚠️ **O endereço vai na mensagem de propósito, mesmo estando no documento de cards.** O documento
guarda o endereço **atual**; nada impede alguém de mudar o `byteInicial` de um card. Sem o endereço
gravado em cada leitura, o histórico anterior à mudança seria atribuído ao endereço novo — e um
reprocessamento futuro leria os bytes errados.

### Grandeza sem valor não é publicada

**[DECIDIDO 2026-09-08]** Um card de peso sem geometria calibrada lê o CLP mas não tem como
converter. Nesse ciclo ele **não entra** no array.

| Opção | Consequência |
|---|---|
| **Escolhida:** não publicar | Lacuna no gráfico. Honesta: não houve medição válida. O motivo fica no log do Desktop e na tela de cards, que mostra "ainda não calibrado" |
| Publicar o bruto marcado | O histórico registraria que o sensor estava vivo — mais informação, mais complexidade no schema |
| Publicar zero | ⚠️ **Recusada.** Zero é um número: entra no histórico, aparece no gráfico e passa por medição real. Um alarme de peso baixo poderia disparar |

---

## 4. O conjunto de dispositivos é por unidade

**[DECIDIDO 2026-09-08]** ⚠️ **Não existe mais vocabulário de dispositivos do sistema.** Cada
Unidade/Sonda declara o seu conjunto na [configuração de cards](../features/cards-configuraveis.md),
e é ele que define o que aquela unidade publica.

| Antes (até 2026-09-07) | Agora |
|---|---|
| Cinco `dispositivoId` fixos, iguais em toda a frota | Conjunto **por unidade**, declarado na configuração |
| Endereço no DB1 é premissa global | Endereço, rack, slot e DB vêm da configuração da unidade |
| Tipos: `VAZAO`, `PESO`, `TORQUE`, `PRESSAO` | Mais `TEMPERATURA`, `NIVEL_TANQUE`, `CONTADOR_STROKE` |
| `CatalogoDispositivos` descrevia as leituras na ingestão | A mensagem se descreve; o catálogo **deixa de existir** |

### O que segura o esquema

Sem vocabulário fechado, o que impede a tag `dispositivoId` do InfluxDB de crescer sem limite — com
5 anos de retenção — são três regras que continuam valendo:

| Regra | Efeito |
|---|---|
| [RN-081](../business-rules.md#rn-081--o-id-do-card-é-gerado-o-nome-é-rótulo) | O id é **gerado** no formato `<TIPO>_<NN>` e **nunca muda**. O usuário não digita id |
| [RN-091](../business-rules.md#rn-091--card-se-desativa-nunca-se-exclui) | Card **não se exclui, se desativa** — e o número não se reaproveita. Um id nunca aponta para duas coisas |
| Limite de 100 cards por unidade | Teto por unidade, verificado no backend |

⚠️ **RN-091 é o que sustenta o histórico.** "Remover um card" significa **desativar**: ele some da
tela e para de publicar, mas continua no documento com tipo e nome. A série gravada continua tendo
o que a explique. Se cards fossem excluídos de verdade, um gráfico de seis meses atrás mostraria um
`dispositivoId` órfão, sem nada no sistema que dissesse o que ele media.

### As três séries do contador de stroke

**[DECIDIDO 2026-09-08]** Um card `CONTADOR_STROKE` publica **três** grandezas
([cards-configuraveis §3](../features/cards-configuraveis.md#o-contador-de-stroke-produz-três-séries)).
Elas se distinguem pelo campo **`serie`**, mantendo **um** `dispositivoId` — o do card.

| `dispositivoId` | `serie` | `unidade` | O que é |
|---|---|---|---|
| `CONTADOR_STROKE_01` | `stroke` | `stroke` | Contagem no ciclo |
| `CONTADOR_STROKE_01` | `vazao` | `bbl/min` | Delta × constante da bomba, no intervalo |
| `CONTADOR_STROKE_01` | `volumeAcumulado` | `bbl` | Contagem cumulativa × constante da bomba |

`serie` é **ausente** para todo card de uma grandeza só — não há `serie: "valor"` genérico poluindo
as outras leituras.

**Por que não três `dispositivoId`.** A alternativa era gerar `CONTADOR_STROKE_01`, `VAZAO_01` e
`VOLUME_01` juntos. Ela quebra duas coisas:

1. **A regra do id.** `<TIPO>_<NN>` só faz sentido se `<TIPO>` for um tipo de card. `VAZAO_01` seria
   um id de um tipo que não existe no vocabulário de cards — e ninguém poderia criar um card de
   vazão, porque vazão é derivada.
2. **A relação entre as três.** Com duas bombas haveria `VAZAO_01` e `VAZAO_02`, e nada no id diria
   qual bomba é qual. Só o documento saberia, e a consulta ao InfluxDB precisaria dele para responder
   "qual foi a vazão da bomba 2".

Com `serie`, `WHERE dispositivoId = 'CONTADOR_STROKE_02' AND serie = 'vazao'` responde sozinho.

⚠️ **Consequência para quem consulta:** uma query por `dispositivoId` de um card de stroke traz as
**três** séries se não filtrar por `serie`.

✅ **[FATO 2026-09-08]** O contrato de leitura expõe o filtro —
[rest-monitoramento §2](rest-monitoramento.md#o-filtro-serie--fato-2026-09-08). Lá a ausência do
parâmetro significa **a série única**, não "todas": um card de stroke consultado sem `serie` devolve
vazio, em vez de três grandezas de unidades diferentes somadas na mesma escala.

### O conjunto inicial da frota atual

**[FATO]** Para referência, o mapeamento que era fixo até 2026-09-07 corresponde a estes cards:

| Card | Endereço | Era |
|---|---|---|
| `PESO_01` | `DBW4` | `PESO_COLUNA_01` / B002 |
| `TORQUE_01` | `DBW6` | `TORQUE_01` / B003 |
| `TORQUE_02` | `DBW8` | `TORQUE_02` / B004 |
| `PRESSAO_01` | `DBW10` | `PRESSAO_01` / B005 |
| `PRESSAO_02` | `DBW10` | ⚠️ Novo: a duplicação Bomba/ESCP era apresentação, agora é card |
| `CONTADOR_STROKE_01` | `DBD0` | `VAZAO_01` / B001 |

⚠️ **Os ids mudam, e a continuidade das séries quebra.** `PESO_COLUNA_01` vira `PESO_01`; `VAZAO_01`
deixa de existir como dispositivo. **[DECIDIDO 2026-09-08]** Aceito: não há dado relevante no
InfluxDB ainda. Se houvesse, a virada exigiria um mapa de equivalência na Telemetria para os
gráficos não cortarem ao meio.

⚠️ **A frota nasce vazia**, e esta tabela **não** é semeada automaticamente — cada unidade é
configurada pela tela de cards do Desktop. Ver
[cards-configuraveis §10](../features/cards-configuraveis.md#a-frota-nasce-vazia) e
[§10 deste documento](#10-o-que-a-virada-quebra).

---

## 5. Regras de publicação

| # | Regra | Origem |
|---|---|---|
| P-01 | 1 mensagem por ciclo de leitura (**1 segundo**) | **[FATO]** comportamento atual |
| P-02 | Publicar apenas cards **visíveis** na configuração | **[FATO]** [RN-037](../business-rules.md#rn-037) |
| P-08 | ⚠️ **Sem cards ativos, não publicar — e nem ler o CLP** | **[DECIDIDO 2026-09-08]** [RN-088](../business-rules.md#rn-088--sem-configuração-a-unidade-não-lê-nada) |
| P-09 | Grandeza **sem valor** (falta calibração) não entra no array | **[DECIDIDO 2026-09-08]** [§3](#grandeza-sem-valor-não-é-publicada) |
| P-10 | Card **ativo** é lido; card **visível** é publicado. São coisas diferentes | **[FATO]** RN-037 e RN-091 |
| P-03 | Se `idSondaUnidade` vazio, **não publicar** | **[FATO]** [RN-038](../business-rules.md#rn-038--sem-publicação-sem-identificador-de-sonda) |
| P-04 | Persistir localmente **independente** do sucesso da publicação | **[FATO]** H2 local é a fonte de verdade da sonda |
| P-05 | `automaticReconnect = true`, `cleanSession = true`, timeout 3s | **[FATO]** configuração atual |
| P-06 | Client ID único por instalação | **[FATO]** hoje `geopetro-sonda-desktop-{user.name}` |

### ⚠️ P-07 · Buffer de contingência — **[PENDENTE]**

**[FATO]** Hoje, falha de publicação = leitura **perdida** para telemetria remota (permanece só no H2
local). A documentação interna descreve um `telemetria-buffer.json` que **nunca existiu**.

Este contrato **não define** o comportamento de contingência até que
[OQ-019](../open-questions.md#oq-019--perda-de-telemetria-em-falha-de-mqtt-é-aceitável) seja
respondida. Se o negócio não tolerar lacunas no histórico remoto, uma fila de reenvio precisa entrar
na spec do Geopetro-Desktop — e o subscriber precisará tratar mensagens **fora de ordem** e
**duplicadas** (QoS 1 já permite duplicata).

---

## 6. Remoção do consumidor do Geopetro-Backend

**[DECIDIDO 2026-08-26]** ✅ **Resolvido.** O Geopetro-Backend **não é mais consumidor MQTT**.

**Estado anterior [FATO]:** assinava `telemetria/+/+` e o handler
(`MonitoramentoTelemetriaService.processar`) apenas logava — nenhum dado era persistido. Com o novo
serviço de telemetria, haveria **dois consumidores no mesmo tópico**.

**O que foi removido:**

| Item | Detalhe |
|---|---|
| `com.geopetro.telemetria` | 6 classes: `MqttSondaConfig`, `MqttSondaProperties`, `MqttTelemetriaConsumer`, `MonitoramentoTelemetriaService`, 2 DTOs |
| `org.eclipse.paho.client.mqttv3` | Dependência em `app/pom.xml` |
| `mqtt.*` | 6 propriedades em `application.properties` |

O Geopetro-Backend mantém **apenas** o papel de cliente REST (`com.geopetro.monitoramento`), consultando
séries já processadas. A separação de responsabilidades ficou limpa: **quem captura publica, quem
persiste consome, quem autoriza consulta**.

---

## 7. Fuso horário

**[DECIDIDO 2026-08-27]** Resolvido na implementação do consumidor, sem exigir mudança no produtor.

| Camada | Convenção |
|---|---|
| **MQTT** (este contrato) | Hora local da sonda, **sem offset** — é o que o produtor publica hoje |
| **InfluxDB** | **UTC** — o consumidor converte na ingestão |
| **REST** | **UTC** (`Instant`) — ver [`rest-monitoramento.md`](rest-monitoramento.md) |

A conversão usa a propriedade `telemetria.zona-sonda` (default `America/Sao_Paulo`). Se um payload
vier com offset explícito, ele é respeitado — o que permite ao produtor migrar para UTC no futuro
**sem quebrar nada**.

**Por que armazenar em UTC:** séries temporais sem timezone explícito produzem descontinuidade nas
transições de horário e ficam ambíguas se a frota se espalhar por fusos. Como a conversão acontece na
borda de entrada, o histórico já nasce correto — não haverá migração cara depois.

⚠️ **Limitação conhecida:** a zona é **global do serviço**, não por sonda. Se a frota operar em mais
de um fuso, será preciso derivar a zona da unidade. Hoje não há evidência disso.

---

## 8. Pontos em aberto

| Item | Referência |
|---|---|
| ~~Consumidor legado~~ | ✅ **Resolvido 2026-08-26** — ver [§6](#6-remoção-do-consumidor-do-geopetro-backend) |
| Broker de produção e autenticação | [OQ-023](../open-questions.md#oq-023--qual-broker-mqtt-será-usado-em-produção) · [SEC-009](../security-findings.md#sec-009--broker-mqtt-sem-autenticação) |
| Buffer de contingência | [OQ-019](../open-questions.md#oq-019--perda-de-telemetria-em-falha-de-mqtt-é-aceitável) |
| Fuso horário | [§7](#7-fuso-horário) |
| Escala bruta do CLP não confirmada | [OQ-016](../open-questions.md#oq-016--a-escala-analógica-do-clp-foi-confirmada) |
| Proteção contra rename de Unidade/Sonda | [RN-018](../business-rules.md#rn-018--nome-da-unidadesonda-é-chave-de-integração) |
| ⚠️ Como saber quais unidades da frota já foram configuradas | [§10](#o-que-reduz-o-risco-e-já-existe) · OQ-049 |
| Filtro por `serie` no contrato de leitura | [§4](#as-três-séries-do-contador-de-stroke) · [rest-monitoramento.md](rest-monitoramento.md) |

---

## 9. Migração a partir do formato atual

**[DECIDIDO 2026-09-08]** ⚠️ **A migração gradual foi abandonada.** O plano anterior — o consumidor
aceitar os dois formatos até a frota inteira atualizar — deixou de fazer sentido.

**Por quê:** aquele plano existia para desacoplar o cronograma da frota (instaladores `.exe` em
campo) do deploy do serviço. Com cards por unidade, o produtor **não tem como** publicar o formato
antigo: os `dispositivoId` fixos não existem mais, e o conjunto varia de unidade para unidade. Não há
formato antigo a manter.

**[DECIDIDO 2026-09-08] Não há dado relevante no InfluxDB**, então a quebra de continuidade das
séries é aceita — ver [§4](#o-conjunto-inicial-da-frota-atual).

### O que sai do código

| Item | Onde | Por quê |
|---|---|---|
| `CatalogoDispositivos` | `Geopetro-Telemetria` | Enriquecia mensagens do formato antigo com `nome`, `codigoOrigem`, `tipo` e `unidade`. A mensagem agora se descreve |
| Detecção de formato na ingestão | `Geopetro-Telemetria` | Só existe um formato |
| Campo `nome` na leitura | Contrato | É rótulo editável — ver [§3](#o-campo-nome-saiu-do-contrato) |
| Campo `codigoOrigem` | Contrato | `B001..B005` eram códigos de um mapeamento fixo que acabou. Substituído por `enderecoDb` |

⚠️ **A colisão de nomes que o teste cobria some junto:** no formato antigo, `unidade` no envelope era
o id da sonda; no novo, `unidade` na leitura é a unidade de medida. Sem o formato antigo, não há
ambiguidade — mas o teste que a cobria deve ser **removido junto com o código**, não deixado passando
por acidente sobre um caminho morto.

---

## 10. O que a virada quebra

**[DECIDIDO 2026-09-08]** Esta seção existe porque a virada **não é retrocompatível em três frentes ao
mesmo tempo**, e isso precisa estar à vista de quem for fazer o deploy.

| # | O que quebra | Quando volta |
|---|---|---|
| 1 | ⚠️ **Toda unidade sem cards para de produzir telemetria** — P-08 / [RN-088](../business-rules.md#rn-088--sem-configuração-a-unidade-não-lê-nada) | Unidade a unidade, conforme cada uma for configurada pela tela de cards do Desktop |
| 2 | ~~O consumidor Angular do tempo real deixa de entender o payload~~ | ✅ **Resolvido 2026-09-08** — Front atualizado (passo 8), com as telas montadas a partir do documento de cards |
| 3 | As séries antigas do InfluxDB ficam com os nomes antigos | Não volta — aceito, não há dado relevante |

### Isto é um deploy coordenado, não três independentes

O produtor (Desktop), o consumidor (Telemetria) e o Front mudam de contrato **juntos**. Subir a
Telemetria nova com Desktops antigos, ou o contrário, não funciona — não há mais formato comum.

**Alternativas recusadas, com o motivo registrado:**

| Alternativa | Por que não |
|---|---|
| Desktop cai no mapeamento fixo enquanto não houver cards | Manteria dois caminhos de leitura vivos, e alguém precisaria lembrar de matar o antigo. **[DECIDIDO 2026-09-08]** contra |
| Semear a frota com os cards equivalentes numa migration | Assume que toda unidade tem o mesmo mapeamento, e o range do sensor e a constante da bomba seriam chutados. Contraria "a frota nasce vazia" |
| Tempo real manter os campos fixos por ora | Temperatura e tanque não teriam por onde aparecer. **[DECIDIDO 2026-09-08]** contra |

### O que reduz o risco, e já existe

| Mitigação | Estado |
|---|---|
| Tela de configuração de cards no Desktop, com login ADMIN/SUPORTE | ✅ Entregue 2026-09-07 |
| Cópia da configuração de outra unidade já configurada | ✅ Entregue 2026-09-07 |
| Cache em disco da configuração, para o Desktop não depender de rede a cada reinício | ✅ Entregue 2026-09-07 |
| Calibração preservada por `dispositivoId`, migrada dos slots posicionais | ✅ Entregue 2026-09-07 |

**[FATO]** A tela de Prontidão da Frota foi removida em 2026-09-10:
contagens de cards e limites não provavam que a unidade publicava nem que havia
cobertura de alarme. Configuração da frota e silêncio de publicação permanecem
sem visão remota confiável ([OQ-049](../open-questions.md#oq-049--como-saber-quais-unidades-da-frota-já-foram-configuradas)).

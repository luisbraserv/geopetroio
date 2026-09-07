# Contrato de Telemetria MQTT

> Contrato de integração entre aplicações · **[DECIDIDO 2026-08-26]**
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

### Estrutura

```json
{
  "idSondaUnidade": "SPT-144",
  "dataHora": "2026-08-26T14:32:05.120",
  "leituras": [
    {
      "dispositivoId": "PESO_COLUNA_01",
      "nome": "Peso da Coluna",
      "codigoOrigem": "B002",
      "tipo": "PESO",
      "unidade": "lbf",
      "valor": 12450.75,
      "valorBruto": 512,
      "unidadeValorBruto": "mA_ESCALADO_0_1000"
    }
  ]
}
```

### Campos do envelope

| Campo | Tipo | Obrigatório | Regra |
|---|---|---|---|
| `idSondaUnidade` | string | Sim | Igual ao segmento do tópico. Se vazio, **não publicar** |
| `dataHora` | string ISO-8601 | Sim | `yyyy-MM-dd'T'HH:mm:ss.SSS`, hora local da sonda. Ver [§7](#7-fuso-horário) |
| `leituras` | array | Sim | Mínimo 1 elemento. Contém apenas dispositivos **habilitados** |

### Campos de cada leitura

| Campo | Tipo | Obrigatório | Regra |
|---|---|---|---|
| `dispositivoId` | string | Sim | Vocabulário fechado — ver [§4](#4-vocabulário-de-dispositivos) |
| `nome` | string | Sim | Rótulo legível |
| `codigoOrigem` | string | Sim | Código físico no CLP (`B001`..`B005`) — rastreabilidade |
| `tipo` | string | Sim | `PESO` · `TORQUE` · `PRESSAO` · `VAZAO` |
| `unidade` | string | Sim | Unidade de engenharia do `valor` |
| `valor` | number | Sim | Grandeza convertida. Ver [RN-030..RN-033](../business-rules.md#telemetria--conversão-de-sinal) |
| `valorBruto` | number | Não | Valor lido do CLP antes da conversão |
| `unidadeValorBruto` | string | Não | Obrigatório se `valorBruto` presente |

**`valorBruto` é a adição de maior valor operacional deste contrato:** permite reprocessar o
histórico se uma fórmula de conversão ou uma calibração for corrigida — hoje impossível, porque só o
valor convertido é transmitido. Dado o [OQ-016](../open-questions.md#oq-016--a-escala-analógica-do-clp-foi-confirmada)
(escala 0–1000 não confirmada no CLP), isso é uma proteção concreta.

---

## 4. Vocabulário de dispositivos

**[FATO]** Alinhado ao mapeamento físico do CLP e aos identificadores já usados pelo frontend.

| `dispositivoId` | `codigoOrigem` | Endereço DB1 | `tipo` | `unidade` |
|---|---|---|---|---|
| `VAZAO_01` | B001 | `DBD0` | `VAZAO` | `bbl/min` |
| `PESO_COLUNA_01` | B002 | `DBW4` | `PESO` | `lbf` |
| `TORQUE_01` | B003 | `DBW6` | `TORQUE` | `lbf.ft` |
| `TORQUE_02` | B004 | `DBW8` | `TORQUE` | `lbf.ft` |
| `PRESSAO_01` | B005 | `DBW10` | `PRESSAO` | `psi` |

**[FATO]** B005 alimenta dois indicadores na UI (Bomba de Lama e ESCP) com o mesmo valor físico.
No contrato há **um único** `PRESSAO_01` — a duplicação é apresentação, não dado.

### ⚠️ Este vocabulário deixa de ser fechado

**[DECIDIDO 2026-09-07]** Com os [cards configuráveis](../features/cards-configuraveis.md), a tabela
acima passa a descrever **o conjunto inicial da frota atual**, não o vocabulário do sistema.

| Antes | Depois |
|---|---|
| Cinco `dispositivoId` fixos, iguais em toda a frota | Conjunto **por unidade**, declarado na configuração |
| Endereço no DB1 é premissa global | Endereço, rack, slot e DB vêm da configuração |
| Tipos: `VAZAO`, `PESO`, `TORQUE`, `PRESSAO` | Mais `TEMPERATURA` e `NIVEL_TANQUE` |

**O que continua valendo, e é o que segura o esquema:** o `dispositivoId` segue **gerado pelo
sistema** no formato `<TIPO>_<NN>` e **nunca muda** — [RN-081](../business-rules.md#rn-081--o-id-do-card-é-gerado-o-nome-é-rótulo).
O nome que o usuário digita é rótulo de tela e **não entra no contrato**. Sem isso, a tag
`dispositivoId` do InfluxDB ficaria sem limite de cardinalidade, com 5 anos de retenção.

⚠️ **`CatalogoDispositivos` perde a fonte.** A classe tem os cinco fixos e serve para enriquecer
mensagens no formato antigo com `nome`, `codigoOrigem`, `tipo` e `unidade`
([§9](#9-migração-a-partir-do-formato-atual)). Com cards por unidade, o enriquecimento precisa de
outra fonte — ou o produtor passa a publicar o formato-alvo, que já traz esses campos, e o problema
desaparece junto com o formato antigo. Ver
[`cards-configuraveis.md §10`](../features/cards-configuraveis.md#11-pontos-que-continuam-em-aberto), item 4.

---

## 5. Regras de publicação

| # | Regra | Origem |
|---|---|---|
| P-01 | 1 mensagem por ciclo de leitura (**1 segundo**) | **[FATO]** comportamento atual |
| P-02 | Publicar apenas dispositivos **habilitados** na configuração | **[FATO]** [RN-037](../business-rules.md#rn-037---visibilidade-de-card-controla-publicação-não-gravação) |
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

---

## 9. Migração a partir do formato atual

**[FATO]** Formato publicado hoje pelo Geopetro-Desktop:

```json
{
  "unidade": "UC-01",
  "dataHora": "2026-08-26T14:32:05.120",
  "leituras": [ { "dispositivo": "VAZAO_01", "valor": 0.523 } ]
}
```

### Diferenças

| Atual | Alvo |
|---|---|
| `unidade` | `idSondaUnidade` |
| `dispositivo` | `dispositivoId` |
| — | `nome`, `codigoOrigem`, `tipo`, `unidade`, `valorBruto`, `unidadeValorBruto` |

### Ordem

| # | Passo | Estado |
|---|---|---|
| 1 | Consumidor aceita **ambos** os formatos (detecção pela presença de `idSondaUnidade`) | ✅ **Feito em 2026-08-27** |
| 2 | Geopetro-Desktop passa a publicar o formato alvo | ⏳ Pendente |
| 3 | Após toda a frota atualizada, remover o suporte ao formato antigo | ⏳ Pendente |

O passo 1 evita acoplar o cronograma de atualização da frota (instaladores `.exe` per-user em campo)
ao deploy do serviço.

**[FATO]** Mensagens no formato antigo são **enriquecidas pelo catálogo de dispositivos** na ingestão:
`nome`, `codigoOrigem`, `tipo` e `unidade` são preenchidos a partir do `dispositivoId`. Sem isso, o
histórico ficaria dividido em dois esquemas de tags conforme a versão do produtor que publicou — e
consultas sobre o período de transição ficariam inconsistentes.

⚠️ **Cuidado com a colisão de nomes:** no formato antigo, `unidade` no **envelope** é o id da sonda;
no formato novo, `unidade` dentro de cada **leitura** é a unidade de medida. A detecção olha
`idSondaUnidade` no envelope, nunca `unidade`. Há teste cobrindo isso.

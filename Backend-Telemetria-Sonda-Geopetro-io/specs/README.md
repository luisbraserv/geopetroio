# Specs — Backend de Telemetria

> Serviço de ingestão e consulta de telemetria de sondas · Spring Boot 3.4.5 · Java 21
>
> **[FATO]** Implementado em 2026-08-27. Antes disso, a pasta continha apenas um scaffold vazio.
>
> Specs de **sistema** em [`../../specs/`](../../specs/).

## Papel no sistema

Fecha a cadeia de telemetria, que estava quebrada no meio:

```
Desktop-Sonda ──MQTT──► Broker ──► ESTE SERVIÇO ──► InfluxDB
  PRODUTOR                          CONSUMIDOR          │
                                                        │ REST
                              Front ◄── Backend-Sonda ◄─┘
                                        (autoriza)
```

**[DECIDIDO 2026-08-26]** Há **exatamente um produtor e um consumidor**. O Backend-Sonda não
participa do MQTT — apenas consulta séries já processadas.

## Responsabilidades

| # | Responsabilidade | Onde | Contrato |
|---|---|---|---|
| R-01 | Assinar o broker e ingerir telemetria | `infrastructure/mqtt` | [`mqtt-telemetria.md`](../../specs/contracts/mqtt-telemetria.md) |
| R-02 | Normalizar os dois formatos de payload | `TelemetriaPayloadParser` | idem, §9 |
| R-03 | Persistir séries no InfluxDB | `infrastructure/influx` | ver §Esquema |
| R-04 | Expor API REST de consulta | `adapter/in/web` | [`rest-monitoramento.md`](../../specs/contracts/rest-monitoramento.md) |

### Fora de escopo — deliberadamente

- **Autorização de usuário.** O Backend-Sonda valida o vínculo usuário↔sonda antes de chamar. Este serviço não conhece usuários nem regionais.
- **Cálculo de grandezas.** A conversão 4-20mA acontece no Desktop-Sonda. Aqui chegam valores já convertidos — e opcionalmente o bruto, para permitir reprocessamento.

## Estrutura

```
com.braservpetroleo.telemetria.geopetroio
├── TelemetriaGeopetroioApplication
├── domain/                    ← modelo canônico, sem dependência de framework
│   ├── TelemetriaBatch        · um ciclo de leitura
│   ├── LeituraTelemetria      · uma grandeza medida
│   └── CatalogoDispositivos   · vocabulário fechado B001..B005
├── application/service/
│   ├── IngestaoTelemetriaService
│   └── ConsultaSerieService
├── adapter/in/web/            ← porta de entrada REST
│   ├── MonitoramentoController
│   ├── ApiExceptionHandler
│   └── dto/
├── infrastructure/
│   ├── mqtt/                  · MqttTelemetriaSubscriber, TelemetriaPayloadParser
│   └── influx/                · InfluxTelemetriaRepository
└── config/                    · propriedades e beans
```

Hexagonal: a camada `domain` não conhece MQTT nem InfluxDB, e `application` orquestra sem saber de
qual borda o dado veio. É o que permite testar o fluxo sem broker nem banco.

## Esquema no InfluxDB

```
measurement: telemetria
tags:   idSondaUnidade · dispositivoId · tipo · codigoOrigem · unidade
fields: valor (double) · valorBruto (double, opcional) · nome (string)
time:   instante da leitura, em UTC
```

**Por que essas tags [FATO]:** todas são de baixa cardinalidade — dezenas de sondas, 5 dispositivos,
4 tipos. Cardinalidade alta em tags degrada o InfluxDB seriamente. `nome` fica como field por ser 1:1
com `dispositivoId` e não servir a filtro.

**Idempotência [FATO]:** o InfluxDB sobrescreve pontos com mesma measurement, tags e timestamp. Como
QoS 1 permite entrega duplicada, uma mensagem reentregue regrava o mesmo ponto — **sem duplicar a
série**. A idempotência é propriedade do esquema; não há deduplicação explícita.

## Seed sintético de desenvolvimento

**[FATO 2026-08-27]** O ambiente local pode popular o InfluxDB com séries sintéticas da
`SPT-145` para validar a cadeia InfluxDB → Telemetria → Backend-Sonda → Front sem depender do CLP.

O seed deve obedecer às seguintes guardas e regras:

- só existe com o profile Spring `dev` **e** `telemetria.seed.habilitado=true`; o default é `false`;
- o `start-dev.cmd` ativa as duas guardas explicitamente;
- gera exatamente **28.800 pontos por variável** no dia corrente — **144.000 pontos** nas cinco
  séries do vocabulário oficial;
- distribui os pontos uniformemente entre 00:00 (inclusivo) e 00:00 do dia seguinte (exclusivo) na
  zona `telemetria.zona-sonda`; num dia de 24 horas, o intervalo é de 3 segundos;
- antes de gravar, remove somente os pontos da `SPT-145` no intervalo do dia corrente, garantindo a
  contagem exata mesmo após reexecuções ou mudança da configuração;
- persiste timestamps UTC e valores determinísticos, permitindo reexecução idempotente;
- grava pelo mesmo `InfluxTelemetriaRepository` da ingestão MQTT, preservando measurement, tags e fields;
- usa lotes bloqueantes limitados durante o seed, de forma que o término da carga confirme a
  persistência de todos os 144.000 pontos sem descarte por pressão do buffer assíncrono;
- a `SPT-145` deve existir no MySQL do Backend-Sonda pela migration idempotente
  `V2026.06.15__unidades_spt144_spt145.sql`; ela não é injetada estaticamente no frontend.

Essa dupla guarda é obrigatória por causa da [DT-013](../../specs/technical-debt.md#dt-013--seed-de-dados-sintéticos-sem-guarda):
uma instalação de campo ou produção nunca pode receber dados fabricados por padrão.

## Decisões de implementação

### Escrita em lote

**[FATO]** A ingestão MQTT usa a `WriteApi` assíncrona (batch 500 pontos, flush 1s). O seed de
desenvolvimento, por ser uma carga finita e muito maior, usa `WriteApiBlocking` em blocos limitados.

**Motivo:** a ingestão recebe 1 mensagem/s por sonda, continuamente. Escrita bloqueante por mensagem
geraria uma requisição HTTP por mensagem — com 20 sondas, 20 req/s só de telemetria.

**Contrapartida aceita:** pontos em buffer se perdem se o processo cair. É aceitável porque o
Desktop-Sonda mantém cópia local em H2 de toda leitura (F-16), então a fonte de verdade da sonda não
depende deste buffer.

No seed, a prioridade é concluir somente depois que cada bloco foi aceito pelo InfluxDB, evitando
ultrapassar o limite interno da fila assíncrona ao produzir 144.000 pontos em poucos segundos.

### Downsampling na consulta

**[FATO]** Acima de `telemetria.max-pontos-por-serie` (default **2000**), a consulta agrega por
janela (`aggregateWindow` com `mean`) em vez de devolver bruto.

**Motivo:** 6h a 1 leitura/s = 21.600 pontos por série, e a tela pede até 5 séries em paralelo.

Usa média, não min/max: a tela já suaviza para exibição, e a média reduz volume sem distorcer a forma
da curva.

### Fuso horário

**[FATO]** Duas convenções diferentes, e isso é intencional:

| Camada | Formato | Motivo |
|---|---|---|
| MQTT (entrada) | Hora local sem offset | É o que o produtor publica hoje |
| InfluxDB | UTC | Séries sem timezone ficam ambíguas nas transições de horário |
| REST (saída) | UTC (`Instant`) | O `MonitoramentoClient` do Backend-Sonda já usa `Instant` |

A conversão entrada→UTC usa `telemetria.zona-sonda` (default `America/Sao_Paulo`). Se um payload
vier com offset explícito, ele é respeitado.

### Tolerância a falhas

**[FATO]** Três decisões que priorizam continuidade:

1. **O callback MQTT nunca lança exceção.** No Paho, exceção propagada da `messageArrived` derruba a conexão — uma única mensagem malformada tiraria a telemetria da frota inteira do ar.
2. **Leitura inválida não descarta o ciclo.** As demais grandezas medidas no mesmo instante continuam válidas.
3. **Broker fora não impede o startup.** A API de consulta segue útil, e o `automaticReconnect` assume quando o broker voltar. Configurável via `mqtt.falhar-se-broker-indisponivel`.

### Dispositivo fora do catálogo

**[FATO]** É aceito e gravado com metadados genéricos, com log de aviso. Descartar seria perder dado
real quando um produtor mais novo publicar um sensor que este serviço ainda não conhece.

## Configuração

Tudo por variável de ambiente. Ver `src/main/resources/application.yml`.

| Variável | Default | Observação |
|---|---|---|
| `SERVER_PORT` | `8081` | Porta esperada pelo `nginx.conf` e pelo Backend-Sonda |
| `MQTT_BROKER_URL` | `tcp://localhost:1883` | |
| `MQTT_TOPICO` | `telemetria/+/batch` | Mais restrito que o antigo `telemetria/+/+` |
| `MQTT_USERNAME` / `MQTT_PASSWORD` | vazio | ⚠️ Ver [SEC-009](../../specs/security-findings.md#sec-009--broker-mqtt-sem-autenticação) |
| `INFLUX_URL` | `http://localhost:8086` | |
| `INFLUX_TOKEN` | **sem default** | Falha no startup se ausente — melhor que descartar telemetria em silêncio |
| `INFLUX_ORG` / `INFLUX_BUCKET` | `braserv` / `telemetria` | |
| `TELEMETRIA_ZONA_SONDA` | `America/Sao_Paulo` | |
| `TELEMETRIA_MAX_PONTOS` | `2000` | Teto por série antes de agregar |
| `TELEMETRIA_SEED_HABILITADO` | `false` | Exige também o profile `dev`; gera séries sintéticas para a `SPT-145` |
| `TELEMETRIA_SEED_PONTOS_POR_VARIAVEL` | `28800` | Quantidade exata em cada uma das cinco séries no dia corrente |

## Build e execução

```bash
./mvnw test          # 24 testes
./mvnw package       # target/Backend-Telemetria-Sonda-Geopetro-IO.jar
docker build -t geopetro/telemetria .
```

**[FATO]** Spring Boot **3.4.5**, não 4.0.5 como o Backend-Sonda. A comunicação entre os dois é só
HTTP, então a versão não precisa casar, e 3.4.5 tem Paho e o cliente InfluxDB comprovadamente
testados. **Decisão revisável** se houver preferência por uniformidade de stack.

## Testes

**[FATO]** 24 testes, todos passando.

| Classe | Cobre |
|---|---|
| `TelemetriaPayloadParserTest` (13) | Os dois formatos, conversão de fuso, precedência do tópico, colisão do campo `unidade`, leitura inválida, dispositivo desconhecido, payloads malformados |
| `MqttTelemetriaSubscriberTest` (4) | Extração da unidade do tópico, encaminhamento, **e que exceções não propagam** |
| `ConsultaSerieServiceTest` (3) | Mapeamento de pontos, série vazia, repasse do teto configurado |
| `TelemetriaDevSeederTest` (3) | 28.800 pontos por variável no dia local, cinco séries da SPT-145, limpeza prévia, timestamps alinhados, valores positivos e lotes bloqueantes limitados |
| `TelemetriaGeopetroioApplicationTests` (1) | Smoke: contexto sobe com a fiação real |

O parser recebe a maior parte da cobertura por ser a peça de maior risco: é a fronteira com um
produtor que está em campo e será migrado aos poucos.

### Lacunas de teste conhecidas

⚠️ **Não há teste de integração com InfluxDB real.** `InfluxTelemetriaRepository` — incluindo a
montagem do Flux e o cálculo da janela de agregação — não é exercitado por nenhum teste. Um
Testcontainer de InfluxDB fecharia essa lacuna e é a próxima adição recomendada.

⚠️ **Não há teste HTTP do controller** (`@WebMvcTest`).

## Pontos em aberto

| # | Item | Referência |
|---|---|---|
| 1 | Broker de produção e **autenticação** | [SEC-009](../../specs/security-findings.md#sec-009--broker-mqtt-sem-autenticação) · [OQ-023](../../specs/open-questions.md#oq-023--qual-broker-mqtt-será-usado-em-produção) |
| 2 | Autenticação serviço-a-serviço na API REST | Hoje aberta; o `WebClient` do Backend-Sonda não envia credencial |
| 3 | Política de retenção do InfluxDB | Não definida — afeta crescimento de armazenamento |
| 4 | Buffer de contingência no produtor | [OQ-019](../../specs/open-questions.md#oq-019--perda-de-telemetria-em-falha-de-mqtt-é-aceitável) |
| 5 | Endpoint que aceite múltiplos `dispositivoId` numa chamada | Hoje a tela faz 5 requisições em paralelo |
| 6 | Migração do produtor para o formato alvo | O serviço aceita ambos até lá |

## Riscos herdados

| Risco | Mitigação atual |
|---|---|
| **[FATO]** Broker sem autenticação — qualquer host da rede pode publicar telemetria forjada | Nenhuma. Ver ponto 1 acima |
| **[FATO]** Renomear Unidade/Sonda quebra a continuidade do histórico | Nenhuma — [RN-018](../../specs/business-rules.md#rn-018--nome-da-unidadesonda-é-chave-de-integração) |
| **[FATO]** Escala bruta 0–1000 do CLP não confirmada | `valorBruto` é persistido, permitindo reprocessar se a fórmula mudar — [OQ-016](../../specs/open-questions.md#oq-016--a-escala-analógica-01000-do-clp-foi-confirmada) |
| **[FATO]** OneDrive corrompeu o `.git` deste projeto uma vez | Nenhuma — [DT-004](../../specs/technical-debt.md#dt-004--risco-de-onedrive-sobre-repositórios-git) |

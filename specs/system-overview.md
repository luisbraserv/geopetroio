# Visão Geral do Sistema — GeopetroIO

> Levantamento por engenharia reversa · 2026-08-26 · ver [convenção de marcação](README.md#convenção-de-marcação)

## 1. O que é o sistema

**[INFERÊNCIA]** GeopetroIO é uma plataforma da Braserv Petróleo para operações de **sondas de
perfuração** e **cimentação de poços**. Cobre a coleta de telemetria em campo (leitura direta de
CLP na sonda), a engenharia de cimentação (simulador de squeeze e tampão) e a administração de
identidade e organização (usuários, empresas, regionais, setores, unidades/sondas).

**[DECIDIDO 2026-08-26]** O escopo foi reduzido: os domínios de Operação (projetos, processos,
observações) e Suprimentos (químicos, almoxarifado, compras) foram removidos do sistema.

**[DECIDIDO 2026-09-05]** *Para quem* o sistema existe e *quem usa cada superfície* estão em
[`product-context.md`](product-context.md) — inclusive a decisão de que o público principal das telas
web é **supervisão remota e cliente**, o que reposiciona o Geopetro-Desktop como sensor do sistema, não
como produto final.

O nome "GeopetroIO" é a marca de usuário final. **[FATO]** "Horus" é codinome interno de
desenvolvimento do módulo de Cimentação Desktop — o produto se apresenta como
`"GeoPetro IO - Cimentação"` (`Braserv-Horus-Desktop/src/main/java/.../JavaFxApp.java:24`).

## 2. Aplicações

**[FATO]** Cinco repositórios Git **independentes**, cada um com remote próprio no GitHub. O
diretório `GeopetroIO/` que os agrupa **não é** um repositório — é apenas uma pasta do OneDrive.

| Aplicação | Stack | Repositório | Papel |
|---|---|---|---|
| **Geopetro-Backend** | Spring Boot 4.0.5 · Java 21 · Maven multi-módulo | `luisbraserv/geopetro-io-back-end` | API REST central, autenticação, todo o domínio administrativo |
| **Geopetro-Front** | Angular 21.2.7 · Taiga UI 5.2 · NGXS 21 | `luisbraserv/geopetro-io-front` | SPA web — cadastros, monitoramento, simulador de cimentação |
| **Geopetro-Desktop** | JavaFX 21 + Spring Boot 4.0.5 · Maven | `luisbraserv/geopetro-io-sonda-desktop` | Agente de borda na sonda: lê CLP, publica telemetria via MQTT |
| **Braserv-Horus-Desktop** | JavaFX 21 · Gradle 9.3 | `luisbraserv/geopetro-io-cimentacao-desktop` | Desktop de Cimentação: lê CLP da bomba, gera Carta de Operação |
| **Geopetro-Telemetria** | Spring Boot 3.4.5 · Java 21 · Maven | — | Ingestão MQTT → InfluxDB e API de consulta de séries. ✅ **Implementado em 2026-08-27** |

## 3. Topologia de execução

```
      SONDA (campo)                          NUVEM / SERVIDOR
 ┌────────────────────┐
 │  CLP Siemens S7    │
 │  (DB1: B001..B005) │
 └─────────┬──────────┘
           │ S7/Snap7 (TCP 102, rack 0 slot 1)
           │ leitura a cada 1s
 ┌─────────▼──────────┐  MQTT publish        ┌──────────────────────┐
 │ Geopetro-Desktop      ├─ telemetria/{u}/batch ─►  Broker MQTT :1883  │
 │ (JavaFX + H2 local)│  QoS 1                └──────────┬───────────┘
 │ PRODUTOR           │                                  │ subscribe
 └────────────────────┘                                  │ telemetria/+/batch
                                              ┌──────────▼───────────┐
 ┌────────────────────┐                       │  Telemetria :8081    │
 │ Horus / Cimentação │  (sem rede — local)   │  CONSUMIDOR          │
 │ (JavaFX + JSONL)   │                       │  (IMPLEMENTADO)      │
 └────────────────────┘                       │  InfluxDB            │
                                              └──────────┬───────────┘
                                                         │ REST
 ┌────────────────────┐   HTTPS /api, /auth   ┌──────────▼───────────┐
 │ Front Angular      ├──────────────────────►│  Geopetro-Backend :8080 │
 │ nginx SPA          │   (nunca direto p/    │  MySQL geopetro_io   │
 │                    │    telemetria)        │  autoriza e consulta │
 │                    │◄──WebSocket /ws ─────►│                      │
 └────────────────────┘   tempo real          └──────────▲───────────┘
                                                         │ WebSocket
                                              ┌──────────┴───────────┐
                                              │ Geopetro-Desktop        │
                                              │ (mesmo produtor)     │
                                              └──────────────────────┘
```

**[FATO 2026-08-27]** A telemetria segue por **dois caminhos independentes** a partir do
Geopetro-Desktop:

| Caminho | Responsabilidade | Destino |
|---|---|---|
| **MQTT** | Histórico, persistido | Broker → Geopetro-Telemetria → InfluxDB |
| **WebSocket** | Estado atual, efêmero | Geopetro-Backend → Angular |

Falha em um não bloqueia o outro nem interrompe a leitura do CLP. Ver
[`contracts/websocket-realtime.md`](contracts/websocket-realtime.md).

**[DECIDIDO 2026-08-26]** Papéis MQTT definidos: **um produtor** (Geopetro-Desktop) e **um consumidor**
(Geopetro-Telemetria). O Geopetro-Backend **não participa do MQTT** — seu consumidor no-op foi removido.
Ver [`contracts/mqtt-telemetria.md`](contracts/mqtt-telemetria.md).

**[FATO]** O frontend **nunca** consulta o serviço de telemetria diretamente. Comentário explícito
em `Front/src/app/features/monitoramento/services/monitoramento-sonda.service.ts`: *"O front não
fala direto com o telemetria; sempre passa pelo backend para respeitar o vínculo do usuário às
sondas"*. O Geopetro-Backend valida acesso antes de fazer proxy.

## 4. Geopetro-Backend — módulos Maven

**[FATO]** `pom.xml` raiz (packaging `pom`) declara **9 módulos** após as remoções de 2026-08-26
(eram 13). Grafo de dependências extraído dos `pom.xml`:

```
core  (kernel: exceções, PaginaResponse, ports de desacoplamento)
├── empresa        (+core)
├── regional       (+core)
├── setor          (+core, regional)
├── unidade-sonda  (+core, setor)
├── usuario        (+core, empresa, regional, setor)
├── simulador      (+core)              ← isolado, genérico
├── security       (+core, usuario)
└── app            (+todos) — executável, main(), integrações
```

**[DECIDIDO 2026-08-26]** Removidos: `projeto`, `processo`, `observacao`, `quimico`.

**[FATO]** `core` funciona como hub de *ports* (`RegionalConsultaPort`, `SetorConsultaPort`,
`EmpresaConsultaPort`, `RegionalBuscaPort`) para inverter dependências que seriam cíclicas. Exemplo:
`regional` não depende de `setor`/`unidade-sonda`, mas precisa saber se há vínculo antes de permitir
exclusão — resolvido injetando `List<RegionalConsultaPort>` com uma implementação por módulo.

**[FATO]** Com a saída de `quimico`, a **única violação conhecida desse desenho deixou de existir** —
era `EmailQuimicoService`, que executava SQL nativo contra `usuarios`/`usuario_roles` sem declarar
dependência Maven de `usuario`. **O grafo de dependências está hoje íntegro.**

## 5. Persistência

| Aplicação | Banco | Estratégia de schema |
|---|---|---|
| Geopetro-Backend | **MySQL 8** (`geopetro_io`, TZ `America/Sao_Paulo`) | `ddl-auto=update` em dev · `validate` em prod |
| Geopetro-Desktop | **H2** em arquivo (`~/.geopetro-io/data/sonda_geopetro`) | `ddl-auto=update` |
| Horus/Cimentação | **JSONL** em arquivo (`%LOCALAPPDATA%\GeopetroIO\data\registros_operacao.jsonl`) | — |
| Telemetria | **InfluxDB** (measurement `telemetria`) | Sem migrations — o esquema é definido pelas tags/fields na escrita |

**[FATO] Não há Flyway nem Liquibase.** Os scripts em
`app/src/main/resources/db/migration/V*.sql` **imitam** a convenção Flyway sem o mecanismo. O
cabeçalho de `V2026.06.02__base_regionais_setores.sql:6-10` diz literalmente: *"O projeto NAO usa
Flyway/Liquibase. Esta migration e um script SQL IDEMPOTENTE... Rode manualmente em producao ANTES de
subir a aplicacao"*.

✅ **[FATO 2026-09-06] Isso mudou: o projeto adotou Flyway.** As migrations rodam sozinhas no startup
do backend, `ddl-auto=validate` passou a valer em **todos** os perfis, e os `V2026.06.*` foram
arquivados em `db/historico/` — seus efeitos estão dentro do baseline `V2026.09.04`. O texto acima
descreve o estado até 2026-09-05 e fica como registro. Ver
[DT-002](technical-debt.md#dt-002--estratégias-conflitantes-de-evolução-de-schema).

**[FATO]** Existia ainda uma terceira via — `ProcessoSchemaInitializer`, um `ApplicationRunner` que
executava `ALTER TABLE processos` a cada startup com falhas engolidas em log `debug`. Foi **removido**
em 2026-08-26 junto com o módulo `processo`.

⚠️ **[FATO]** As migrations existentes referenciam tabelas de módulos removidos (`projetos`,
`processos`). Continuam válidas historicamente, mas um ambiente novo criaria tabelas sem uso — ver
[DT-002](technical-debt.md#dt-002--estratégias-conflitantes-de-evolução-de-schema).

## 6. Autenticação e autorização

**[FATO]** JWT stateless (`io.jsonwebtoken:jjwt 0.12.6`), `SessionCreationPolicy.STATELESS`, CSRF
desabilitado (correto para API JWT sem cookies).

- `POST /auth/login` aceita **username OU e-mail** (detecção pela presença de `@`).
- Falha de usuário inexistente e senha errada retornam a **mesma** exceção — não revela qual campo errou. **Boa prática.**
- Token: HMAC-SHA, `subject=username`, claim `roles`. Expiração padrão **3600s (1h)**.
- **Sem refresh token, sem logout, sem revogação.** Token vazado vale até expirar.
- O filtro extrai roles **do próprio token**, sem reconsultar o banco — usuário desativado mantém acesso até o token expirar.

Detalhamento das regras de acesso por rota em [`current-features.md`](current-features.md).
**Falhas exploráveis** em [`security-findings.md`](security-findings.md).

## 7. Serviço de Telemetria

**[FATO]** ✅ **Implementado em 2026-08-27**, spec-first — foi o primeiro componente do GeopetroIO a
nascer sob SDD. Até então a pasta continha apenas um scaffold vazio (4 arquivos, zero `.java`), e a
tela de Monitoramento sempre retornava `502`.

### O que faz

| Responsabilidade | Implementação |
|---|---|
| Assina `telemetria/+/batch` no broker | `MqttTelemetriaSubscriber` |
| Normaliza os **dois formatos** de payload | `TelemetriaPayloadParser` |
| Persiste no InfluxDB, em lote | `InfluxTelemetriaRepository` |
| Expõe `GET /api/monitoramentos/sondas/{id}/series` | `MonitoramentoController` |

**[FATO]** 24 testes passando. JAR de 35 MB gerado. Dockerfile multi-stage expondo `8081`.

### Decisões de implementação relevantes ao sistema

| Decisão | Motivo |
|---|---|
| **Escrita assíncrona em lote** (500 pontos / 1s) | A 1 msg/s por sonda, escrita bloqueante geraria uma requisição HTTP por mensagem |
| **Downsampling acima de 2000 pontos/série** | 6h a 1 leitura/s = 21.600 pontos, e a tela pede 5 séries em paralelo |
| **Armazenamento em UTC** | Séries sem timezone ficam ambíguas nas transições de horário |
| **Aceita ambos os formatos MQTT** | A frota é atualizada por instalador em campo; esse cronograma não pode bloquear o deploy |
| **Broker fora não impede o startup** | A API de consulta continua útil; `automaticReconnect` assume depois |

### Configuração de infraestrutura já existente

**[FATO]** O serviço encaixa em referências que já apontavam para ele:
- `Front/nginx.conf`: `location /telemetria/ { proxy_pass http://telemetria:8081/; }`
- `Front/src/environments/environment.prod.ts`: `telemetriaUrl: 'https://telemetria.geopetro-io.braserv.com.br'`
- `Geopetro-Backend/.../application.properties`: `monitoramento.base-url` default `:8081`

**[FATO]** O remote `luisbraserv/telemetria-backend-geopetroio` respondia `Repository not found` no
levantamento. **[PENDENTE]** O repositório precisa ser criado — preferencialmente **fora do OneDrive**
([DT-004](technical-debt.md#dt-004--risco-de-onedrive-sobre-repositórios-git)).

Detalhes em [`Geopetro-Telemetria/specs/`](../Geopetro-Telemetria/specs/).

## 8. Integrações externas

| Integração | Direção | Tecnologia | Estado |
|---|---|---|---|
| CLP Siemens S7 (sonda) | Entrada | Moka7/Snap7, TCP 102 | **[FATO]** Ativo — Geopetro-Desktop |
| CLP Siemens LOGO! (bomba) | Entrada | Moka7/Snap7, TCP 102 | **[FATO]** Ativo — Horus |
| Broker MQTT | Saída (produtor) | Eclipse Paho 1.2.5, QoS 1 | **[FATO]** Ativo — Geopetro-Desktop. Ver §9 |
| Serviço Monitoramento :8081 | Saída | Spring WebClient (Netty), timeout 5s | **[FATO]** Ativo — cliente e servidor implementados |
| WebSocket/STOMP `/ws` | Ambas | Spring WebSocket, broker em memória | **[FATO 2026-08-27]** Ativo — Desktop publica, Angular assina |
| Broker MQTT | Entrada (consumidor) | Eclipse Paho 1.2.5, QoS 1 | **[FATO]** Ativo — Geopetro-Telemetria |
| InfluxDB | Saída | influxdb-client-java 6.12.0 | **[FATO]** Ativo — Geopetro-Telemetria |
| ViaCEP | Saída | `https://viacep.com.br/ws/{cep}/json/` | **[FATO]** Chamado **direto do browser** ⚠️ |

**[FATO]** A integração SMTP **deixou de existir** com a remoção do módulo `quimico` —
`spring-boot-starter-mail` era dependência exclusiva dele, e o job diário das 08:00 era o único
`@Scheduled` do sistema.

## 9. Mensageria — MQTT

**[DECIDIDO 2026-08-26]** Papéis definidos. **Um produtor, um consumidor.**

| Ator | Papel | Tópico | Estado |
|---|---|---|---|
| **Geopetro-Desktop** | **Produtor** | publica `telemetria/{unidade}/batch` — 1 msg/ciclo (1s), QoS 1, não retida | Ativo |
| **Geopetro-Telemetria** | **Consumidor** | assina `telemetria/+/batch` | ✅ **Implementado em 2026-08-27** |
| ~~Geopetro-Backend~~ | ~~Subscriber~~ | — | ✅ **Removido em 2026-08-26** |

**[FATO]** O Geopetro-Backend tinha um consumidor **no-op** (`MonitoramentoTelemetriaService.processar()`
apenas logava, com comentário *"Ponto de extensão: salvar no banco, encaminhar para InfluxDB..."*).
Foi removido junto com a dependência Paho e as propriedades `mqtt.*` — o backend não participa mais do
broker.

✅ **[FATO] Cadeia fechada em 2026-08-27.** Com o Geopetro-Telemetria implementado, a telemetria
publicada passa a ser persistida no InfluxDB e fica disponível para consulta. Ver
[DT-003](technical-debt.md#dt-003--telemetria-capturada-mas-nunca-persistida).

⚠️ **Pendências operacionais antes de valer em produção:** provisionar broker e InfluxDB, definir
`INFLUX_TOKEN`, e resolver a autenticação do broker
([SEC-009](security-findings.md#sec-009--broker-mqtt-sem-autenticação)).

**[DECIDIDO 2026-08-26]** Contrato-alvo: **batch com payload rico** — mantém 1 mensagem por ciclo
(custo atual) com os campos descritivos dentro do array de leituras. Especificação em
[`contracts/mqtt-telemetria.md`](contracts/mqtt-telemetria.md).

## 10. Deploy e infraestrutura

**[FATO]**

- **Geopetro-Backend**: Docker multi-stage (`maven:3.9-eclipse-temurin-21` → `eclipse-temurin:21-jre-jammy`), compila só `-pl app -am`, expõe `8080`.
- **Front**: Docker (`node:22-alpine` → `nginx:alpine`), build `--configuration k8s`, expõe `80`. nginx faz proxy reverso same-origin para `geopetro-backend:8080` e `telemetria:8081`.
- **Front alternativo**: Cloudflare Pages (`wrangler.toml`, `public/_redirects`).
- **Desktops**: instalador Windows `.exe` via `jpackage` (Horus exige WiX Toolset), instalação per-user, execução em bandeja do sistema.
- **Domínios de produção**: `api.geopetro-io.braserv.com.br` · `telemetria.geopetro-io.braserv.com.br`.

**[FATO]** O build do frontend usa `--configuration k8s`, mas **não há nenhum manifesto Kubernetes
no workspace** (busca por `*.yaml`/`*.yml` de deploy/helm/kustomize não retornou nada).
**[PENDENTE]** Onde vivem os manifestos de deploy?

## 11. Riscos estruturais de ambiente

**[FATO]** Todo o workspace está sob `OneDrive - BRASERV PETROLEO LTDA`, com atributo NTFS
`ReparsePoint` (Files On-Demand) em todos os arquivos. Isso já causou dano observável: o `.git` do
projeto de telemetria perdeu `HEAD`, `index` e todos os objetos.

**[INFERÊNCIA]** O OneDrive interfere em operações atômicas do Git (criação/renomeação de `HEAD` e
`index`, muitos arquivos pequenos como hooks). Manter repositórios Git ativos dentro de pasta
sincronizada é um risco recorrente de perda de histórico — e provavelmente contribuiu para a perda
do código-fonte de `almoxarifado`/`compra` documentada em [`technical-debt.md`](technical-debt.md).

## 12. Testes

| Aplicação | Framework | Cobertura |
|---|---|---|
| Geopetro-Backend | JUnit 5 + Mockito + AssertJ | Parcial — ver abaixo |
| Front | **Vitest** (não Karma) | Mínima — 2 services de 5 |
| Geopetro-Desktop | JUnit 5 | 3 classes |
| Horus | JUnit 5 | 7 arquivos |

**[FATO]** No Geopetro-Backend: **43 testes**, todos unitários. **Zero** testes de controller/HTTP,
**zero** `@DataJpaTest`, **zero** testes de `security`. Módulos sem cobertura: `empresa`, `simulador`,
`security`, `monitoramento`.

**[FATO]** As falhas de autorização corrigidas em
[`security-findings.md`](security-findings.md) **não são cobertas por nenhum teste** — uma alteração
futura na ordem dos `requestMatchers` as reintroduziria silenciosamente. É a lacuna de teste mais
relevante do sistema.

**Nota:** a contagem caiu de 61 para 43 testes com as remoções, mas **a proporção não piorou** — os
testes removidos cobriam exatamente os módulos removidos.

## Design system

**[FATO]** A fonte normativa é [`specs/index.html`](index.html) — tokens, componentes e princípios.
Os dois desktops JavaFX transcrevem esses tokens em `geopetro-design-system.css`, arquivo idêntico
em Geopetro-Desktop e Horus. Detalhes e lista de classes em
[`Braserv-Horus-Desktop/specs/README.md`](../Braserv-Horus-Desktop/specs/README.md#design-system-revisão-2026-08-31).

⚠️ **[DECIDIDO 2026-08-31]** Ação primária é **azul-marinho** `#051833`. Vermelho ficou reservado a
ação destrutiva e estado de erro; o acento de destaque é o **laranja** `#d4852f`. Antes o vermelho
era a cor de toda ação comum, o que anulava seu valor como alerta numa tela de operação.

**[FATO]** JavaFX CSS não tem custom properties: os tokens vivem como valores literais num único
arquivo, e o `rem` da fonte normativa é convertido para `px` na base 16.

### Ícones dos aplicativos (2026-08-31)

**[FATO]** Fonte: `specs/image/Icon-fundo-branco.png`. Gerados em 256×256 com canal alfa preservado
(o ícone tem cantos transparentes) e distribuídos para os três aplicativos:

| Aplicação | Arquivos |
|---|---|
| Geopetro-Desktop | `icon/logo.png` · `icon/logo.ico` |
| Horus | `icons/logo.png` · `icons/app.ico` |
| Front | `public/logo.png` · `public/favicon.ico` |

⚠️ **[FATO] `logo2.png` (472×143) é o logotipo horizontal, não um ícone.** Aparece no cabeçalho das
duas telas desktop, no splash e no PDF da carta de operação. Trocá-lo pelo ícone quadrado deixaria a
marca esticada no cabeçalho. **Não substituir junto.**

⚠️ **[FATO]** Os `.ico` são multi-resolução de verdade (256→16 px, seis entradas, assinatura
`00000100`). O `jpackage` exige ICO real: o `logo.ico` anterior do Geopetro-Desktop era um **PNG
renomeado**, e o instalador sairia com ícone quebrado. Ao trocar o logo, regenere com
`Braserv-Horus-Desktop/scripts/create-windows-icon.ps1` ou equivalente — nunca renomeie um PNG.

**[FATO]** O PNG de origem tem 907 KB, tamanho de ilustração. Os derivados ficam em ~58 KB; carregar
o original como ícone de janela seria desperdício em cada inicialização.


## GeoPetro Vision — integração prevista (11/09/2026)

**[DECIDIDO 2026-09-11]** O GeoPetro Vision monitorará localmente as câmeras de cada unidade e alimentará o Geopetro-Backend com registros de não conformidade SMS e fotos. O Geopetro-Front existente disponibilizará o histórico sincronizado; não haverá nova central nem vídeo ao vivo remoto nesta etapa. ADMIN/SUPORTE poderão consultar todas as unidades; os demais acessos respeitarão o escopo autorizado. Retenção do Vision é indefinida e distinta da telemetria. Requisitos ainda não implementados.

Decisões, permissões, operação offline e contrato pendente: [GeoPetro Vision](features/geopetro-vision.md).

**[DECIDIDO 2026-09-11 — entrevista encerrada]** Frontend somente consulta histórico; avaliações/correções e configuração de turnos/zonas exclusivamente no desktop. Câmeras cadastradas manualmente, quantidade variável. Tempos por zona e turnos definidos localmente. Offline-first mantém consulta/avaliação da sessão já iniciada; ao reconectar com token expirado exige relogin na interface sem parar monitoramento/transporte. Não enviar e-mail ao SMS por falha de câmera/IA. Especificações atualizadas, sem implementação.

## Decisão final de sessão e executor — revisão 11/09/2026

**[DECIDIDO 2026-09-11]** Esta decisão substitui a previsão anterior de retomada automática após reboot offline. Monitoramento somente inicia após login online autorizado no Vision, inclusive depois de reiniciar Windows. Bloquear tela mantém a captura; trocar usuário Windows ou encerrar sessão Windows para a captura. Fechar janela mantém execução na conta atual. Logout Vision bloqueia a instalação inteira até qualquer usuário autorizado fazer novo login online.

**[DECIDIDO 2026-09-11]** Cada pessoa tem sua conta Windows; unidade/câmeras são configuração compartilhada de todos os usuários daquele computador. Sessão humana não é compartilhada. Executor separado da UI na sessão atual, sem serviço Windows permanente de monitoramento; uma captura ativa por instalação.

**[DECIDIDO 2026-09-11]** SUPORTE/ADMIN seleciona unidade consultando GeoPetro IO dentro do próprio app desktop. Não haverá liberação manual em portal ou cadastro externo. Ao salvar vínculo, app obtém automaticamente credencial técnica da instalação; mecanismo remoto ainda precisa de contrato/implementação. Essa credencial permite transporte independente do token humano durante execução, mas não substitui login exigido para iniciar monitoramento ou usar interface.

**[PENDENTE]** Cofre compartilhado entre contas Windows, rotação/revogação da credencial técnica e comportamento do transporte após logoff/logout; não prometer envio local com todos os processos encerrados nem reintroduzir serviço permanente implicitamente. Nenhum endpoint/papel/código alterado nesta entrega documental.
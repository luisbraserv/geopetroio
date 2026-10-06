# Visão Geral do Sistema — GeopetroIO

> Levantamento por engenharia reversa · 2026-08-26 · ver [convenção de marcação](../README.md#convenção-de-marcação)

## 1. O que é o sistema

**[INFERÊNCIA]** GeopetroIO é uma plataforma da Braserv Petróleo para operações de **sondas de
perfuração** e **cimentação de poços**. Cobre a coleta de telemetria em campo (leitura direta de
CLP na unidade), a engenharia de cimentação (simulador de squeeze e tampão) e consome do
Braserv-Core a identidade e a estrutura organizacional compartilhadas pela empresa.

**[DECIDIDO 2026-08-26]** O escopo foi reduzido: os domínios de Operação (projetos, processos,
observações) e Suprimentos (químicos, almoxarifado, compras) foram removidos do sistema.

**[DECIDIDO 2026-09-05]** *Para quem* o sistema existe e *quem usa cada superfície* estão em
[`product-context.md`](../negocio/requisitos/product-context.md) — inclusive a decisão de que o público principal das telas
web é **supervisão remota e cliente**, o que reposiciona o Geopetro-Desktop como sensor do sistema, não
como produto final.

O nome "GeopetroIO" é a marca de usuário final. **[FATO]** "Horus" é codinome interno de
desenvolvimento do módulo de Cimentação Desktop — o produto se apresenta como
`"GeoPetro IO - Cimentação"` (`apps/horus-desktop/src/main/java/.../JavaFxApp.java:24`).

## 2. Aplicações

**[FATO 2026-10-06]** Seis aplicações independentes compõem o ambiente. O
diretório `GeopetroIO/` que os agrupa **não é** um repositório — é apenas uma pasta do OneDrive.

| Aplicação | Stack | Repositório | Papel |
|---|---|---|---|
| **Braserv-Core** | Spring Boot · Java 21 · Maven multi-módulo | `apps/core` | Identidade, login, cadastro organizacional e tokens de usuário/serviço |
| **Geopetro-Backend** | Spring Boot 4.0.5 · Java 21 · Maven multi-módulo | `luisbraserv/geopetro-io-back-end` | Monitoramento, alarmes, tempo real e simulador; valida tokens emitidos pelo Core |
| **Geopetro-Front** | Angular 21.2.7 · Taiga UI 5.2 · NGXS 21 | `luisbraserv/geopetro-io-front` | SPA web — cadastros, monitoramento, simulador de cimentação |
| **Geopetro-Desktop** | JavaFX 21 + Spring Boot 4.0.5 · Maven | `luisbraserv/geopetro-io-sonda-desktop` | Agente de borda na sonda: lê CLP, publica telemetria via MQTT |
| **Braserv-Horus-Desktop** | JavaFX 21 · Gradle 9.3 | `luisbraserv/geopetro-io-cimentacao-desktop` | Desktop de Cimentação: lê CLP da bomba, gera Carta de Operação |
| **Geopetro-Telemetria** | Spring Boot 3.4.5 · Java 21 · Maven | — | Ingestão MQTT → InfluxDB e API interna de consulta de séries |

## 3. Topologia de execução

```text
CAMPO                                      SERVIDOR
CLP ──S7──> Geopetro-Desktop
              ├── MQTT telemetria/{idUnidade}/batch ──> Broker ──> Telemetria ──> InfluxDB
              └── STOMP /app/realtime/unidades/{id} ─────────────────────────────┐
                                                                                  │
Browser ──HTTPS──> nginx do Front                                                 │
                   ├── identidade e cadastros ──> Braserv-Core :8082 ──> braserv_core
                   ├── monitoramento/simulador ──> Geopetro-Backend :8080 ──> geopetro_io
                   └── /ws ─────────────────────> Geopetro-Backend <──────────────┘
                                                     │
                                                     └── REST interno ──> Telemetria :8081
```

**[FATO 2026-10-06]** O nginx mantém uma origem única para o browser e separa as rotas públicas:
autenticação, usuários, empresas, regionais, setores, unidades e clientes de serviço seguem para o
Braserv-Core; monitoramento, simulador e WebSocket seguem para o Geopetro-Backend. Rotas
`/internal/**` e `/.well-known/**` não são publicadas.

A telemetria percorre dois caminhos independentes. MQTT persiste o histórico no InfluxDB; WebSocket
entrega o estado atual, efêmero, pelo Backend. O Front nunca consulta a Telemetria diretamente: usa
`/api/monitoramento/unidades/{id}/series`, e o Backend valida o acesso, traduz o id numérico da
unidade para `Unidade.nome` e consulta a API interna de séries.

O Backend valida os tokens RS256 com o JWKS do Core e usa tokens de serviço para consultar acesso e
catálogo. O Core, ao excluir uma unidade, consulta no Backend os vínculos de monitoramento.

## 4. Serviços Java e módulos Maven

**[FATO 2026-10-06]** A separação do cadastro organizacional reduziu o Geopetro-Backend a quatro
módulos:

```text
comum       kernel, contratos e portas compartilhadas
simulador   poços, pastas e cenários
security    validação RS256/JWKS e autorização
app         executável; monitoramento, alarmes, tempo real e integrações HTTP
```

O Braserv-Core possui os módulos `comum`, `regional`, `setor`, `unidade`, `empresa`,
`usuario`, `identidade`, `interno` e `app`. Ele é o único dono das entidades organizacionais
e o único emissor de tokens. O Backend não mantém cópia desses cadastros: lê acesso e unidades pelas
rotas internas do Core, com cache limitado conforme a spec de arquitetura.

## 5. Persistência

| Aplicação | Banco | Estratégia de schema |
|---|---|---|
| Braserv-Core | **MySQL 8** (`braserv_core`) | Flyway no startup · `ddl-auto=validate` |
| Geopetro-Backend | **MySQL 8** (`geopetro_io`) | Flyway no startup · `ddl-auto=validate` |
| Geopetro-Desktop | **H2** em arquivo | `ddl-auto=update` |
| Horus/Cimentação | **JSONL** em arquivo | Sem schema versionado |
| Telemetria | **InfluxDB** (measurement `telemetria`) | Esquema definido pelas tags e fields na escrita |

Os dois serviços MySQL usam o mesmo servidor, databases e usuários distintos. As tabelas de
identidade e organização ficam apenas em `braserv_core`; monitoramento, alarmes e simulador ficam
em `geopetro_io`. As colunas `unidade_id` do Backend são referências lógicas ao Core, sem FK
entre databases. A guarda de exclusão consulta os vínculos pelo contrato interno antes de apagar uma
unidade.

## 6. Autenticação e autorização

**[FATO 2026-10-06]** O Braserv-Core é o único emissor de tokens. Tokens de usuário têm validade de
uma hora; tokens de serviço, quinze minutos. Ambos usam RS256 e levam `iss=braserv-core`, `kid` e
o claim `tipo`, que impede um token de pessoa de abrir uma rota interna e um token de serviço de
abrir uma rota pública.

Os consumidores validam assinatura e expiração pelo JWKS do Core. O Backend consulta
`/internal/v1/usuarios/{username}/acesso` para conta ativa, roles e unidades concedidas, com cache
normal de 10 s. Se o Core ficar indisponível, pode usar o último acesso conhecido por até cinco
minutos, registrando cada uso; depois disso nega. O catálogo de unidades tem cache de 60 s, mas
escritas de configuração confirmam a unidade sem cache.

A autorização combina tipo de conta com permissões de módulo. A gestão de unidades exige `ADMIN`
ou `INTERNO` + `UNIDADE`.

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
| Expõe `GET /api/monitoramentos/unidades/{idUnidade}/series` | `MonitoramentoController` |

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
- `apps/geopetro-backend/.../application.properties`: `monitoramento.base-url` default `:8081`

**[FATO]** O remote `luisbraserv/telemetria-backend-geopetroio` respondia `Repository not found` no
levantamento. **[PENDENTE]** O repositório precisa ser criado — preferencialmente **fora do OneDrive**
([DT-004](technical-debt.md#dt-004--risco-de-onedrive-sobre-repositórios-git)).

Detalhes em [`apps/geopetro-telemetria/specs/`](../../../apps/geopetro-telemetria/specs/).

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
| Braserv-Core | Backend ↔ Core | HTTP interno, token de serviço, RS256/JWKS | **[FATO 2026-10-06]** Ativo |
| SMTP | Saída | Spring Mail | **[FATO]** Recuperação de senha e teste de configuração no Braserv-Core |
| ViaCEP | Saída | `https://viacep.com.br/ws/{cep}/json/` | **[FATO]** Chamado **direto do browser** ⚠️ |

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
([SEC-009](seguranca/security-findings.md#sec-009--broker-mqtt-sem-autenticação)).

**[DECIDIDO 2026-08-26]** Contrato-alvo: **batch com payload rico** — mantém 1 mensagem por ciclo
(custo atual) com os campos descritivos dentro do array de leituras. Especificação em
[`contracts/mqtt-telemetria.md`](mqtt/mqtt-telemetria.md).

## 10. Deploy e infraestrutura

**[FATO]**

- **Braserv-Core**: container Java, expõe `8082`, possui healthcheck próprio e database `braserv_core`.
- **Geopetro-Backend**: Docker multi-stage (`maven:3.9-eclipse-temurin-21` → `eclipse-temurin:21-jre-jammy`), compila só `-pl app -am`, expõe `8080`.
- **Front**: Docker (`node:22-alpine` → `nginx:alpine`), build `--configuration k8s`, expõe `80`. O nginx separa as rotas públicas entre `braserv-core:8082` e `geopetro-backend:8080`; a Telemetria permanece interna ao Backend.
- **Front alternativo**: Cloudflare Pages (`wrangler.toml`, `public/_redirects`).
- **Desktops**: instalador Windows `.exe` via `jpackage` (Horus exige WiX Toolset), instalação per-user, execução em bandeja do sistema.
- **Deploy de VM única**: Compose, MySQL compartilhado com dois databases, rede interna entre Core, Backend e Telemetria e volumes separados para segredos/chaves.

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
[`security-findings.md`](seguranca/security-findings.md) **não são cobertas por nenhum teste** — uma alteração
futura na ordem dos `requestMatchers` as reintroduziria silenciosamente. É a lacuna de teste mais
relevante do sistema.

**Nota:** a contagem caiu de 61 para 43 testes com as remoções, mas **a proporção não piorou** — os
testes removidos cobriam exatamente os módulos removidos.

## Design system

**[FATO]** A fonte normativa é [`specs/SDD/software/frontend/index.html`](frontend/index.html) — tokens, componentes e princípios.
Os dois desktops JavaFX transcrevem esses tokens em `geopetro-design-system.css`, arquivo idêntico
em Geopetro-Desktop e Horus. Detalhes e lista de classes em
[`apps/horus-desktop/specs/README.md`](../../../apps/horus-desktop/specs/README.md#design-system-revisão-2026-08-31).

⚠️ **[DECIDIDO 2026-08-31]** Ação primária é **azul-marinho** `#051833`. Vermelho ficou reservado a
ação destrutiva e estado de erro; o acento de destaque é o **laranja** `#d4852f`. Antes o vermelho
era a cor de toda ação comum, o que anulava seu valor como alerta numa tela de operação.

**[FATO]** JavaFX CSS não tem custom properties: os tokens vivem como valores literais num único
arquivo, e o `rem` da fonte normativa é convertido para `px` na base 16.

### Ícones dos aplicativos (2026-08-31)

**[FATO]** Fonte: `specs/SDD/software/frontend/image/Icon-fundo-branco.png`. Gerados em 256×256 com canal alfa preservado
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
`apps/horus-desktop/scripts/create-windows-icon.ps1` ou equivalente — nunca renomeie um PNG.

**[FATO]** O PNG de origem tem 907 KB, tamanho de ilustração. Os derivados ficam em ~58 KB; carregar
o original como ícone de janela seria desperdício em cada inicialização.


## GeoPetro Vision — integração prevista (11/09/2026)

**[DECIDIDO 2026-09-11]** O Vision fará captura e avaliação local por
unidade; enviará ocorrências e fotos ao Backend para consulta no Front. Não
haverá central nem vídeo remoto nesta etapa. Requisitos e pendências estão na
[feature Vision](../negocio/requisitos/geopetro-vision.md) e no
[contrato proposto](apis/geopetro-vision.md). A integração ainda não foi
implementada.

## Decisão final de sessão e executor — revisão 11/09/2026

**[DECIDIDO 2026-09-11]** Após reiniciar Windows, o monitoramento aguarda
novo login online no Vision. A execução fica na sessão Windows atual, com
captura única por instalação. Detalhes e pendências de credencial técnica estão
na [feature](../negocio/requisitos/geopetro-vision.md#decisão-final-de-sessão-e-executor--revisão-11092026).

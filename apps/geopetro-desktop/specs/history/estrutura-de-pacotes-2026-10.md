# Histórico — reorganização por assunto (2026-10-08)

Registro datado da refatoração que levou o Desktop à [estrutura de pacotes vigente](../estrutura-de-pacotes.md).

## Ponto de partida

**[FATO 2026-10-08]** O código estava dividido por **tipo de classe**:

| Pacote | Classes | O que tinha dentro |
|---|---|---|
| `services/` | 40 | CLP, conversão de sinal, cálculos, alarmes, MQTT, STOMP, login, PDF, cache de cards, poda do H2 |
| `controllers/` | 20 | Telas, diálogos, componentes visuais e um utilitário (`TsapPlc`) |
| `models/` | 17 | Documento de cards, configurações, entidade JPA, DTOs de PDF e de telemetria |
| `config/` | 6 | Bootstrap e um controller de janela |
| `repositories/` | 1 | `LeituraLocalRepository` |

O pacote raiz era `com.example.demo`, nome de scaffold, e os READMEs de pacote descreviam uma
arquitetura CRUD inexistente ([DT-009](../../../../specs/SDD/software/technical-debt.md#dt-009--documentação-divergente-do-código)).

## Decisões

**[DECIDIDO 2026-10-08]** Tomadas em entrevista com a equipe.

| # | Decisão | Motivo |
|---|---|---|
| D1 | Pacote raiz `com.geopetro.desktop` | Alinhado ao `com.geopetro.*` do Backend. A [renomeação de projetos](../../../../specs/SDD/software/renomeacao-projetos.md#4-o-que-não-mudou) tinha adiado essa troca |
| D2 | `DesktopSondaGeopetroIoApplication` → `GeopetroDesktopApplication` | Nome de antes da renomeação do projeto |
| D3 | Remover as telas de bomba e de sensor | Nenhum código as abria |
| D4 | Escopo: só pastas e pacotes | Layout das telas fora |
| D5 | Branch `refactor/desktop-pacotes`, a partir de `feat/simulador-poco-geometria` | Partir do trabalho em andamento |
| D6 | Remover `spring-boot-starter-websocket` se os testes passassem | O STOMP usa `java.net.http.WebSocket` |
| D7 | Proteger a estrutura com ArchUnit | Regra quebrada falha no build |
| D8 | Execução em três blocos, com pausa para teste manual | |

**Descartado:** vários módulos Maven (custo de build sem ganho com ~12,8 mil linhas) e
compartilhar código com o Horus ([DT-010](../../../../specs/SDD/software/technical-debt.md#dt-010--duplicação-entre-os-dois-desktops)).

## Execução

Linha de base: **284 testes**, 13 pulados. Cada passo terminou com a suíte verde e o mesmo total.

| Commit | Passo |
|---|---|
| `aa96f09` | Limpeza: `ApplicationService`, `SondaData`, telas de bomba e sensor, READMEs de pacote, `webmvc`, `webmvc-test`, `websocket`, `h2console` |
| `b280cf8` | `com.example.demo` → `com.geopetro.desktop` e classe principal renomeada (115 arquivos reconhecidos como renomeação) |
| `8b4480e` | `conversao/` e `calculos/` |
| `b724996` | `historico/` |
| `d0c1cbb` | `cartaoperacao/` |
| `3e03a9f` | `alarmes/` |
| `df404d9` | `telemetria/` |
| `53dcafb` | Imagem sem uso removida dos recursos |
| `e832e81` | `sessao/`, `configuracoes/`, `comum/` |
| `4e2e124` | `cards/` e `cards/calibracao/` |
| `a4678b8` | `aquisicao/` |
| `155b71f` | `monitoramento/` e `monitoramento/componentes/` |
| `c1e295d` | `app/`; os pacotes por tipo deixam de existir |
| `12aee95` | ArchUnit: 4 regras, conferidas com violações de propósito. Total: 288 testes |

Pausas 1 e 2: a equipe seguiu para o bloco seguinte sem relatar problema. O roteiro manual não foi
registrado aqui.

Pausa 3: instalador **0.1.0.13** gerado do branch e conferido por dentro (nenhuma classe de
`com.example`, nenhum PDF de teste, os 13 FXML nas pastas novas, sem WebMVC/WebSocket/H2 Console).
Instalado sobre a versão anterior, com dados, e aprovado pela equipe no roteiro completo da spec.

## O que apareceu no caminho

- **`SondaService` maior que o previsto como morto.** Além dos getters apontados em DT-015, peso,
  torques, status, `atualizarDados`, `atualizarValoresConvertidos` e `updateFlowRate` não tinham
  chamador. A classe ficou só com as grandezas do ciclo e os valores brutos.
- **Construtores de teste tornados `public`:** `CardsStore(Path)`, `TelemetriaRealtimeService(CardsState)`
  e `CalibracaoDeCards(Path)`. Os testes que os usam cruzam dois assuntos, então um dos lados sempre
  fica em outro pacote.
- **`@import` relativo no `settings.css`.** Ao mover o CSS para `views/configuracoes/`, o import do
  design system passou a apontar para um arquivo inexistente. Nenhum teste falhou; o JavaFX só
  registra `Could not import` no log. Corrigido para `../geopetro-design-system.css`.
- **Classes compiladas antigas em `target/`.** O VS Code segura `target/` e o `mvnw clean` falha.
  Cópias antigas de testes em `target/test-classes` seriam executadas pelo surefire. Os testes rodaram
  com o compilado apagado antes de cada execução; o total de 284 confirmou que nenhuma cópia antiga
  rodou.
- **Recursos de teste no JAR.** `generated-operation-charts/` (5 PDFs) não era versionado, mas entrava
  no JAR de quem buildava, porque o `pom.xml` inclui `*.pdf` e `*.tsv`. Apagado da máquina de
  desenvolvimento.
- **Senha do broker.** As alterações pendentes do branch de origem traziam a senha MQTT no
  `ambiente-producao.properties` e no `AmbienteTest`. Por decisão da equipe, ela ficou fora do
  controle de versão; o teste passou a comparar com o valor que o build define.

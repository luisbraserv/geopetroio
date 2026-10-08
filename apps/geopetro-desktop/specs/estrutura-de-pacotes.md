# Estrutura de pacotes — Geopetro-Desktop

> **Estado: DECIDIDO, a executar** · 2026-10-08 · refatoração estrutural, **sem mudança de comportamento**
>
> Convenção de marcação: [SDD](../../../specs/SDD/README.md#convenção-de-marcação)

## 1. Problema

**[FATO]** O código está dividido por **tipo de classe**, não por assunto:

| Pacote | Classes | O que tem dentro |
|---|---|---|
| `services/` | 40 | CLP, conversão de sinal, cálculos, alarmes, MQTT, STOMP, login, PDF, cache de cards, poda do H2 |
| `controllers/` | 20 | Telas, diálogos, componentes visuais (`TanqueView`, `TermometroView`, `DashboardGrid`) e um utilitário (`TsapPlc`) |
| `models/` | 17 | Documento de cards, configurações, entidade JPA, DTOs de PDF e de telemetria |
| `config/` | 6 | Bootstrap e um controller de janela (`MainViewController`) |
| `repositories/` | 1 | `LeituraLocalRepository` |

Para mexer em um assunto, por exemplo alarme local, é preciso abrir três pastas e saber de cor quais
classes pertencem a ele. O pacote raiz ainda é `com.example.demo`, nome de scaffold. Os READMEs de
pacote descrevem uma arquitetura CRUD que não existe ([DT-009](../../../specs/SDD/software/technical-debt.md#dt-009--documentação-divergente-do-código)).

## 2. Decisão proposta

O Desktop continua **um único app e um único módulo Maven** (monolito). Dentro dele, o código passa a
ser organizado **por funcionalidade**: cada pacote reúne a tela, o FXML, a regra e os dados do mesmo
assunto.

**Fora de escopo:**
- **Vários módulos Maven:** com ~12,8 mil linhas, o custo de build não se paga.
- **Compartilhar código com o Horus:** os dois produtos continuam separados ([DT-010](../../../specs/SDD/software/technical-debt.md#dt-010--duplicação-entre-os-dois-desktops)).
- **Layout das telas, nomes de classes e lógica interna:** só pacotes e arquivos mudam de lugar.
  Exceção: a remoção de código morto listada em §5.

## 3. Estrutura alvo

Pacote raiz: **`com.geopetro.desktop`** ([D1](#7-decisões)).

```text
com.geopetro.desktop
├── GeopetroDesktopApplication
│
├── app/             Sobe o processo e a janela principal
│                    JavaFXConfiguration, InstanciaUnica, GeometriaDaJanela,
│                    MainViewController, MainViewFxmlController, SplashController
│
├── comum/           O que todos usam e que não pertence a nenhum assunto
│                    AppPaths
│
├── configuracoes/   Arquivo app-settings.json, ambiente e tela da engrenagem
│                    AppSettings, Ambiente, SettingsService, SettingsController, TsapPlc
│                    (PumpSettingsController e SensorSettingsController saem — D3)
│
├── sessao/          Login no Braserv-Core e escolha da Unidade — RN-086, RN-087
│                    BackendLogin, SessaoConfiguracao, ConfiguracaoLoginController,
│                    UnidadeSondaCatalogoService, UnidadeSondaOpcao
│
├── cards/           Documento de cards da Unidade — RN-080, RN-088
│   │                CardsDaUnidade, DocumentoDaUnidade, EstadoDeDocumento, SnapshotStore,
│   │                CardsState, CardsStore, ConfiguracaoCardsClient, CopiaDeCards,
│   │                CardsConfigController
│   └── calibracao/  Calibração por card (peso e torque)
│                    CalibracaoDeCards, CalibracaoCardService, CalibracaoCardDialog,
│                    PesoColunaSettingsController, ChaveSettingsController
│
├── aquisicao/       Ciclo de leitura do CLP
│                    PlcConnectionService, BlocoDeLeitura, LeituraDeCards, SondaService
│
├── conversao/       Sinal analógico → grandeza de engenharia (regra pura)
│                    ConversaoSinalAnalogico, ConversaoPressao, ConversaoTemperatura,
│                    ConversaoTanque, SensorPressaoConfig
│
├── calculos/        Grandezas derivadas (regra pura)
│                    PesoColunaCalculator, PesoColunaCalculo, PesoColunaConfig,
│                    HydraulicTorqueCalculator, ChaveHidraulicaConfig, TipoMovimento,
│                    FlowRateCalculatorService, StrokeCalculatorService
│
├── monitoramento/   Dashboard
│   │                MonitoringController, CardsDoMonitoramento, DashboardGrid, IndicatorCardView
│   └── componentes/ TanqueView, TermometroView
│
├── alarmes/         Alarme da estação (sininho) — RN-068, RN-071
│                    AlarmesDaEstacao, AlarmesLocais, AvaliadorLocalDeAlarme, SinalSonoro,
│                    AlarmeLocalDialog
│
├── telemetria/      Publicação MQTT e tempo real (STOMP)
│                    TelemetriaMqttService, TelemetriaRealtimeService, StompRealtimeClient,
│                    CanalConfiguracaoLifecycle, LeituraPublicada, EstadoAtual
│
├── historico/       Registro local em H2 e tela de gráficos — RN-100
│                    LeituraLocal, LeituraLocalRepository, SeriesLocais, PodaDeLeiturasLocais,
│                    GraficosController
│
└── cartaoperacao/   Carta de Operação em PDF
                     OperationChartController, GenerateOperationChartController,
                     ChartPreviewController, OperationChartPdfService,
                     OperationChartRequest, GeneratedOperationChart
```

### 3.1 Recursos (FXML e CSS)

Os FXML seguem os mesmos pacotes. O CSS compartilhado e os ícones não mudam de lugar.

```text
resources/
├── views/
│   ├── geopetro-design-system.css   (não muda)
│   ├── app/            main-view.fxml, splash.fxml
│   ├── configuracoes/  settings.fxml, settings.css
│   ├── sessao/         configuracao-login.fxml
│   ├── cards/          cards-config.fxml, chave-settings.fxml, peso-coluna-settings.fxml
│   ├── monitoramento/  monitoring.fxml
│   ├── historico/      graficos.fxml
│   └── cartaoperacao/  operation-chart.fxml, generate-operation-chart.fxml, chart-preview.fxml
└── icon/               (não muda)
```

Ao mover um FXML, os caminhos relativos dentro dele mudam:
- `@geopetro-design-system.css` vira `@../geopetro-design-system.css`;
- `@../icon/...` vira `@../../icon/...`.

### 3.2 Testes

`src/test/java` espelha `src/main/java`: cada teste fica no mesmo pacote da classe que testa, porque
vários testes usam membros package-private. Testes que atravessam telas (`CarregamentoDasTelasTest`,
`FxmlLigadoAoControllerTest`, `EngrenagemAbreDeVerdadeTest`, `MenuEmTelaPequenaTest`) ficam em `app/`.

## 4. Regras da nova estrutura

As regras 2 a 4 são verificadas por testes ArchUnit ([D7](#7-decisões)); a 1 e a 5 dependem de revisão.

1. **Uma pasta por assunto.** Uma tela nova fica no pacote do assunto dela, com o controller e o FXML
   na mesma pasta lógica (`<assunto>/` em Java, `views/<assunto>/` em recursos).
2. **Regra pura não conhece tela.** `conversao/` e `calculos/` não importam `javafx.*`.
3. **`comum/` só recebe o que pelo menos três assuntos usam.** Na dúvida, a classe fica no assunto
   que a usa.
4. **Package-private por padrão.** Uma classe só fica `public` quando outro pacote a usa.
5. **Subpacote quando passar de ~12 classes.** É o caso de `cards/calibracao/` e `monitoramento/componentes/`.

## 5. Limpeza que vai junto

| Item | Motivo | Estado |
|---|---|---|
| `services/ApplicationService.java` | Sem nenhum uso | [FATO] |
| READMEs de `controllers/`, `services/`, `models/`, `repositories/`, `utils/`, `views/` | Descrevem classes inexistentes ([DT-009](../../../specs/SDD/software/technical-debt.md#dt-009--documentação-divergente-do-código)) | [FATO] |
| `resources/generated-operation-charts/` (5 PDFs + `index.tsv`) | Saída de teste de 2026-04. O app grava em `AppPaths`, não no classpath | [FATO 2026-10-08] **Não versionado** (`.gitignore`); existe só na máquina de quem builda e entra no JAR, porque o `pom.xml` inclui `*.pdf` e `*.tsv`. Apagar localmente fica a critério do dono |
| `resources/static/WhatsApp Image ….jpeg` | Nenhuma referência | [FATO 2026-10-08] **Não versionado**; mesma situação |
| `spring-boot-starter-webmvc`, `-webmvc-test`, `spring-boot-h2console` e as propriedades `spring.h2.console.*` | Inertes com `web-application-type=none` ([DT-015](../../../specs/SDD/software/technical-debt.md#dt-015--código-morto-inventário)) | [FATO] |
| `spring-boot-starter-websocket` | O STOMP usa `java.net.http.WebSocket`; nenhum import Spring de messaging/web | [DECIDIDO 2026-10-08] Remover se `mvnw test` e o teste manual de tempo real passarem; senão, volta (D6) |
| `PumpSettingsController`, `SensorSettingsController`, `pump-settings.fxml`, `sensor-settings.fxml` | Nenhum código carrega esses FXML | [DECIDIDO 2026-10-08] Remover (D3) |
| `SondaData` e os getters sem chamador de `SondaService` | Código morto ([DT-015](../../../specs/SDD/software/technical-debt.md#dt-015--código-morto-inventário)) | [FATO 2026-10-08] Foi além dos getters: peso, torques, status, `atualizarDados`, `atualizarValoresConvertidos` e `updateFlowRate` também não tinham chamador. `SondaService` ficou só com grandezas do ciclo e valores brutos |

## 6. O que **não** pode mudar

| Item | Por quê |
|---|---|
| `%USERPROFILE%\.geopetro-io\` (H2, logs, PDFs gerados) | Instalações em campo perderiam banco e configuração |
| Arquivos em `config/` (`app-settings.json`, `cards-da-unidade.json`, `alarmes-locais.json`…) | Mesmo motivo. Os nomes de campo no JSON vêm de getters e records, não do pacote |
| Tabela `leitura_local` | O nome está fixo em `@Table`; trocar o pacote da entidade não o altera |
| Contratos MQTT e STOMP | São definidos pelos payloads, que não mudam |

**[FATO]** Nenhum código usa nome de classe em dado persistido (sem `@JsonTypeInfo` nem `Class.forName`).
Por isso, mover pacotes não invalida arquivos já gravados.

## 7. Decisões

**[DECIDIDO 2026-10-08]** Tomadas em entrevista com a equipe.

| # | Decisão | Motivo |
|---|---|---|
| D1 | Pacote raiz **`com.geopetro.desktop`** | Alinhado ao `com.geopetro.*` do Backend. A [renomeação de projetos](../../../specs/SDD/software/renomeacao-projetos.md#4-o-que-não-mudou) adiou essa troca para não misturar mudanças; aqui ela tem commit próprio (passo 2) |
| D2 | `DesktopSondaGeopetroIoApplication` vira **`GeopetroDesktopApplication`** | O nome antigo vem de antes da renomeação do projeto. Entra no commit do pacote raiz |
| D3 | **Remover** as telas de bomba e de sensor | Nenhum código as abre; o Git guarda o histórico |
| D4 | Escopo: **só pastas e pacotes** | O layout das telas não faz parte deste trabalho |
| D5 | Branch **`refactor/desktop-pacotes`**, criado a partir de `feat/simulador-poco-geometria` depois que as alterações pendentes forem commitadas | A refatoração parte do trabalho atual, sem conflito posterior |
| D6 | Remover `spring-boot-starter-websocket` **se os testes passarem** | Tudo indica que está sem uso; o teste manual de tempo real confirma |
| D7 | Proteger a estrutura com **ArchUnit** (dependência de teste) | Regras de dependência entre pacotes falham no build, em vez de depender de revisão |
| D8 | Execução **em três blocos, com pausa** para teste manual | Ver §8 |

## 8. Ordem de execução

Cada passo é **um commit**, com `mvnw test` verde antes de seguir. Mover arquivos e trocar o pacote
raiz ficam em commits separados, para o Git reconhecer as renomeações e o diff continuar legível.

A execução para em três pontos (**⏸**) para o teste manual da §9.5 no app rodando (D8).

| Passo | Commit | Conteúdo |
|---|---|---|
| 0 | — | Alterações pendentes commitadas em `feat/simulador-poco-geometria`; criar `refactor/desktop-pacotes` (D5). Registrar a contagem de testes como linha de base |
| 1 | `chore(desktop): remove código morto e dependências inertes` | Itens da §5 |
| 2 | `refactor(desktop): renomeia pacote raiz` | `com.example.demo` → `com.geopetro.desktop` e classe principal (D1, D2), junto com `@ComponentScan`, `mainClass` do `pom.xml`, `fx:controller`, `<?import?>` do `monitoring.fxml` e `logging.level` (main e test) |
| ⏸ | | **Pausa 1:** testar o app com a limpeza, a remoção do WebSocket e o novo pacote raiz |
| 3 | `refactor(desktop): agrupa conversao e calculos` | Regra pura primeiro: são folhas, ninguém nelas depende de tela |
| 4 | `… historico` | Inclui `graficos.fxml` |
| 5 | `… cartaoperacao` | Inclui os três FXML |
| 6 | `… alarmes` | |
| 7 | `… telemetria` | `StompRealtimeClient` é package-private: vai junto com `TelemetriaRealtimeService` |
| ⏸ | | **Pausa 2:** testar gráficos, carta de operação, alarme local e publicação |
| 8 | `… sessao`, `configuracoes` e `comum` | `TsapPlc` é package-private: vai junto com `SettingsController` |
| 9 | `… cards` e `cards/calibracao` | |
| 10 | `… aquisicao` | `BlocoDeLeitura` é package-private: vai junto com `LeituraDeCards` e `PlcConnectionService` |
| 11 | `… monitoramento` | `IndicatorCardView` é package-private: vai junto com `MonitoringController` |
| 12 | `… app` | Remove os pacotes vazios `config/`, `controllers/`, `services/`, `models/`, `repositories/`, `utils/` |
| 13 | `test(desktop): protege a estrutura de pacotes com ArchUnit` | Dependência `archunit-junit5` em escopo de teste. Regras: nenhuma classe fora de `com.geopetro.desktop`; `conversao` e `calculos` sem `javafx..` e dependendo só um do outro e de `cards` (o documento traz os parâmetros de tanque e temperatura); `comum` não depende de nenhum assunto (D7) |
| 14 | `docs(desktop): estrutura de pacotes vigente` | Marca esta spec como vigente; atualiza o [README das specs](README.md), DT-009 e DT-015 |
| ⏸ | | **Pausa 3:** roteiro completo da §9.5 com o app empacotado |

**Atenção no Windows:** os language servers Java e Spring Boot do VS Code seguram `target/` e podem
fazer `git mv` falhar com `Permission denied` (já aconteceu na [renomeação](../../../specs/SDD/software/renomeacao-projetos.md#5-o-que-aconteceu-na-execução)).
Feche o VS Code ou rode `mvnw clean` antes dos passos de mover arquivos.

## 9. Critérios de aceite

1. `mvnw test` verde, com **o mesmo número de testes** da linha de base, mais os testes ArchUnit (o
   passo 1 pode reduzir esse número só se remover testes de código morto, e o commit deve dizer quais).
2. Nenhuma ocorrência de `com.example` em `apps/geopetro-desktop` (código, FXML, `pom.xml`, propriedades).
3. Nenhuma classe fora da árvore da §3 e nenhum pacote vazio.
4. As regras ArchUnit do passo 13 passam.
5. Teste manual com o app empacotado sobre uma instalação existente (`.geopetro-io` com dados):
   - splash → janela principal → dashboard com os cards da Unidade;
   - menu Gráficos mostra o histórico já gravado;
   - Carta de Operação gera PDF com logo;
   - engrenagem pede login e abre configurações e cards;
   - calibração de peso e de torque abre a partir do card;
   - sininho abre o alarme local sem login;
   - publicação MQTT e tempo real continuam chegando ao Backend.

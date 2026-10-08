# Estrutura de pacotes — Geopetro-Desktop

> **Estado: VIGENTE** desde 2026-10-08 · teste manual com o app empacotado **[PENDENTE]** (§6)
>
> Convenção de marcação: [SDD](../../../specs/SDD/README.md#convenção-de-marcação) ·
> [Histórico da reorganização](history/estrutura-de-pacotes-2026-10.md)

## 1. Princípio

**[DECIDIDO 2026-10-08]** O Desktop é **um único app e um único módulo Maven**, organizado **por
assunto**: cada pacote reúne a tela, o FXML, a regra e os dados do mesmo assunto. Para mexer no alarme
local, por exemplo, abre-se só `alarmes/`.

## 2. Pacotes

Pacote raiz: **`com.geopetro.desktop`**. Na raiz fica só `GeopetroDesktopApplication`.

```text
com.geopetro.desktop
├── app/             Sobe o processo e a janela principal
│                    JavaFXConfiguration, InstanciaUnica, GeometriaDaJanela,
│                    MainViewController, MainViewFxmlController, SplashController
│
├── comum/           O que todos usam e que não pertence a nenhum assunto
│                    AppPaths
│
├── configuracoes/   Arquivo app-settings.json, ambiente e tela da engrenagem
│                    AppSettings, Ambiente, SettingsService, SettingsController, TsapPlc
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

### 2.1 Recursos

```text
resources/
├── views/
│   ├── geopetro-design-system.css
│   ├── app/            main-view.fxml, splash.fxml
│   ├── configuracoes/  settings.fxml, settings.css
│   ├── sessao/         configuracao-login.fxml
│   ├── cards/          cards-config.fxml, chave-settings.fxml, peso-coluna-settings.fxml
│   ├── monitoramento/  monitoring.fxml
│   ├── historico/      graficos.fxml
│   └── cartaoperacao/  operation-chart.fxml, generate-operation-chart.fxml, chart-preview.fxml
└── icon/
```

Dentro de `views/<assunto>/`, o design system é `@../geopetro-design-system.css` e os ícones são
`@../../icon/...`. Um CSS em subpasta que importa o design system usa `@import "../geopetro-design-system.css"`.

⚠️ Caminho relativo errado em FXML ou CSS **não falha o teste**: o JavaFX só registra
`Could not find stylesheet` ou `Could not import` no log. Ao mover um FXML ou CSS, procure esses avisos.

### 2.2 Testes

`src/test/java` espelha `src/main/java`: cada teste fica no pacote da classe que testa, porque vários
usam membros package-private. Os testes que atravessam telas (`CarregamentoDasTelasTest`,
`FxmlLigadoAoControllerTest`, `EngrenagemAbreDeVerdadeTest`, `MenuEmTelaPequenaTest`) ficam em `app/`.

## 3. Regras

| # | Regra | Como é garantida |
|---|---|---|
| 1 | **Uma pasta por assunto.** Classe nova fica no pacote do assunto; tela nova tem o controller em `<assunto>/` e o FXML em `views/<assunto>/` | ArchUnit: toda classe mora em um dos assuntos da §2. Escolher o assunto certo é revisão |
| 2 | **Regra pura não conhece tela.** `conversao/` e `calculos/` não importam `javafx.*` | ArchUnit |
| 3 | **Regra pura só depende de si mesma e de `cards`**, que traz os parâmetros de tanque e temperatura | ArchUnit |
| 4 | **`comum/` não depende de nenhum assunto**, e só recebe o que pelo menos três assuntos usam | ArchUnit para a dependência; revisão para o critério de uso |
| 5 | **Package-private por padrão.** `public` só quando outro pacote usa | Revisão |
| 6 | **Subpacote quando passar de ~12 classes**, como `cards/calibracao/` e `monitoramento/componentes/` | Revisão |

As regras automáticas estão em `EstruturaDePacotesTest`. Assunto novo entra na lista `ASSUNTOS` desse
teste e na árvore da §2.

**Construtores de teste públicos:** `CardsStore(Path)`, `TelemetriaRealtimeService(CardsState)` e
`CalibracaoDeCards(Path)` são `public` porque testes de outro assunto os usam. Fora dos testes,
use o construtor sem argumentos.

## 4. O que a estrutura não pode mudar

| Item | Por quê |
|---|---|
| `%USERPROFILE%\.geopetro-io\` (H2, logs, PDFs gerados) | Instalações em campo perderiam banco e configuração |
| Arquivos em `config/` | Mesmo motivo. Os nomes de campo no JSON vêm de getters e records, não do pacote |
| Tabela `leitura_local` | O nome está fixo em `@Table` |
| Contratos MQTT e STOMP | São definidos pelos payloads |

**[FATO 2026-10-08]** Nenhum código usa nome de classe em dado persistido (sem `@JsonTypeInfo` nem
`Class.forName`). Mover classes entre pacotes não invalida arquivos já gravados.

## 5. Build no Windows

Os language servers Java e Spring Boot do VS Code seguram `target/`, e `mvnw clean` pode falhar.
Depois de mover classes, **apague `target/classes/com` e `target/test-classes/com`** antes de rodar os
testes: o surefire executa qualquer teste compilado que encontrar ali, inclusive cópias de um pacote
antigo.

## 6. Verificação

1. **[FATO 2026-10-08]** `mvnw test`: 288 testes (284 da linha de base + 4 regras ArchUnit), sem falhas.
2. **[FATO 2026-10-08]** Nenhuma ocorrência de `com.example` no Desktop e nenhum pacote vazio.
3. **[FATO 2026-10-08]** Todo `@caminho` em FXML/CSS, todo `"/views/..."` e `"/icon/..."` no Java e todo
   `fx:controller` aponta para algo que existe (58 referências).
4. **[PENDENTE]** Teste manual com o app **empacotado** sobre uma instalação existente
   (`.geopetro-io` com dados):
   - splash → janela principal → dashboard com os cards da Unidade;
   - menu Gráficos mostra o histórico já gravado;
   - Carta de Operação gera PDF com logo;
   - engrenagem pede login e abre configurações (com o estilo do design system) e cards;
   - calibração de peso e de torque abre a partir do card;
   - sininho abre o alarme local sem login;
   - publicação MQTT e tempo real continuam chegando ao Backend.

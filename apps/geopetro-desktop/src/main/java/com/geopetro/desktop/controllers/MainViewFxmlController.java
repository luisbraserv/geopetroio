package com.geopetro.desktop.controllers;

import com.geopetro.desktop.services.PlcConnectionService;
import javafx.application.Platform;
import javafx.concurrent.Task;
import javafx.fxml.FXML;
import javafx.fxml.FXMLLoader;
import javafx.geometry.Insets;
import javafx.geometry.Pos;
import javafx.scene.Parent;
import javafx.scene.Scene;
import javafx.scene.control.Alert;
import javafx.scene.control.Button;
import javafx.scene.control.Label;
import javafx.scene.control.ProgressIndicator;
import javafx.scene.image.Image;
import javafx.scene.image.ImageView;
import javafx.scene.layout.StackPane;
import javafx.scene.layout.VBox;
import javafx.scene.paint.Color;
import javafx.scene.shape.Circle;
import javafx.scene.shape.Rectangle;
import javafx.stage.Modality;
import javafx.stage.Stage;
import javafx.stage.StageStyle;

import java.net.InetSocketAddress;
import java.net.Socket;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.ApplicationContext;
import org.springframework.stereotype.Controller;

import java.io.IOException;
import java.io.InputStream;

@Controller
public class MainViewFxmlController {

    private static final Logger logger = LoggerFactory.getLogger(MainViewFxmlController.class);
    // Aba ativa conforme o design system: sublinhado no laranja de acento, sem preenchimento.
    // O vermelho anterior competia com os alertas de estado — a mesma cor dizia "voce esta aqui"
    // e "algo esta errado".
    // Menu sobre a barra azul: texto claro, ativo sublinhado no laranja de acento.
    // A borda inferior existe também no inativo, transparente, para o texto não saltar 3px
    // ao trocar de aba.
    private static final String ACTIVE_MENU_STYLE = "-fx-background-color: transparent; -fx-border-color: transparent transparent #d4852f transparent; -fx-border-width: 0 0 3 0; -fx-text-fill: #ffffff; -fx-font-weight: bold; -fx-padding: 10 16;";
    private static final String INACTIVE_MENU_STYLE = "-fx-background-color: transparent; -fx-border-color: transparent; -fx-border-width: 0 0 3 0; -fx-text-fill: rgba(255,255,255,0.72); -fx-font-weight: bold; -fx-padding: 10 16;";

    @Autowired
    private ApplicationContext applicationContext;

    @Autowired
    private PlcConnectionService plcConnectionService;

    private Stage stage;
    private String currentPage = "/views/monitoring.fxml";

    @FXML
    private StackPane contentPane;

    @FXML
    private Label plcStatusLabel;

    @FXML
    private Circle plcStatusCircle;

    @FXML
    private Label internetStatusLabel;

    @FXML
    private Circle internetStatusCircle;

    private ScheduledExecutorService internetChecker;

    @FXML
    private Button btnSettings;

    @FXML
    private Button btnCards;

    @FXML
    private Button btnMonitoring;

    @FXML
    private Button btnGraficos;

    @FXML
    private Button btnOperationChart;

    @FXML
    private Button btnPlcConnection;

    @FXML
    public void initialize() {
        logger.info("Inicializando MainViewFxmlController");
        recortarConteudo();
        setupActions();
        plcConnectionService.setStatusListener(connected -> Platform.runLater(this::updatePlcStatus));
        updatePlcStatus();
        startInternetChecker();
        loadPage("/views/monitoring.fxml");
        setActiveMenu(btnMonitoring);
    }

    public void setStage(Stage stage) {
        this.stage = stage;
    }

    private void setupActions() {
        btnSettings.setOnAction(event -> openSettingsWindow());
        btnCards.setOnAction(event -> openCardsWindow());
        btnMonitoring.setOnAction(event -> {
            loadPage("/views/monitoring.fxml");
            setActiveMenu(btnMonitoring);
        });
        btnGraficos.setOnAction(event -> {
            loadPage("/views/historico/graficos.fxml");
            setActiveMenu(btnGraficos);
        });
        btnOperationChart.setOnAction(event -> {
            loadPage("/views/operation-chart.fxml");
            setActiveMenu(btnOperationChart);
        });
        btnPlcConnection.setOnAction(event -> togglePlcConnection());
    }

    private void updatePlcStatus() {
        boolean connected = plcConnectionService.isConnected();
        plcStatusLabel.setText(connected ? "PLC Conectado" : "PLC Desconectado");
        plcStatusCircle.setFill(connected ? Color.web("#2e8b3a") : Color.web("#d92d20"));
        btnPlcConnection.setText(connected ? "\u23fb Desconectar" : "\u26d3 Conectar");
        // Conectar e acao comum (primario azul); desconectar interrompe a leitura em curso, entao
        // usa o estilo de acao destrutiva. Antes os dois eram vermelhos e nada distinguia um do
        // outro alem do texto.
        btnPlcConnection.getStyleClass().removeAll("botao-primario", "botao-perigo");
        btnPlcConnection.getStyleClass().add(connected ? "botao-perigo" : "botao-primario");
    }

    private void togglePlcConnection() {
        if (plcConnectionService.isConnected()) {
            btnPlcConnection.setDisable(true);
            Thread.ofVirtual().name("plc-disconnect").start(() -> {
                try { plcConnectionService.disconnect(); }
                finally { Platform.runLater(() -> {
                    btnPlcConnection.setDisable(false);
                    updatePlcStatus();
                }); }
            });
            return;
        }

        Stage connectingStage = showConnectingModal();
        btnPlcConnection.setDisable(true);

        Task<PlcConnectionService.Resultado> connectionTask = new Task<>() {
            @Override
            protected PlcConnectionService.Resultado call() {
                return plcConnectionService.connectUsingSavedIp();
            }
        };

        connectionTask.setOnSucceeded(event -> {
            closeModal(connectingStage);
            btnPlcConnection.setDisable(false);
            updatePlcStatus();

            switch (connectionTask.getValue()) {
                case PlcConnectionService.Resultado.Conectado ignorado ->
                    showResultModal(Alert.AlertType.INFORMATION, "Conectado", "PLC conectado e primeira leitura dos cards recebida.");
                // Nao e erro: e uma unidade que ainda nao foi configurada (RN-092), e a saida
                // esta na propria tela. Mandar chamar o suporte aqui gastaria uma visita.
                case PlcConnectionService.Resultado.SemConfiguracao motivo ->
                    showResultModal(Alert.AlertType.WARNING, "Sem configuração",
                            "Não há o que ler: " + motivo.oQueFalta()
                                    + ".\n\nAbra \"Cards\" na barra superior para configurar a unidade.");
                case PlcConnectionService.Resultado.Falhou falha ->
                    showResultModal(Alert.AlertType.ERROR, "Erro ao conectar",
                            falha.motivo());
            }
        });

        connectionTask.setOnFailed(event -> {
            closeModal(connectingStage);
            btnPlcConnection.setDisable(false);
            updatePlcStatus();
            logger.error("Erro ao conectar ao PLC", connectionTask.getException());
            showResultModal(Alert.AlertType.ERROR, "Erro ao conectar",
                    "Não foi possível iniciar a leitura do PLC: " + connectionTask.getException().getMessage());
        });

        Thread connectionThread = new Thread(connectionTask, "plc-connection-task");
        connectionThread.setDaemon(true);
        connectionThread.start();
    }

    private Stage showConnectingModal() {
        Stage modal = new Stage(StageStyle.UTILITY);
        modal.setTitle("Conectando");
        modal.initModality(Modality.APPLICATION_MODAL);
        modal.setResizable(false);
        if (stage != null) {
            modal.initOwner(stage);
        }

        VBox content = new VBox(14);
        content.setAlignment(Pos.CENTER);
        content.setPadding(new Insets(24));
        content.setStyle("-fx-background-color: white; -fx-background-radius: 7; -fx-border-color: #d6deeb; -fx-border-radius: 7;");

        content.getChildren().add(createLoadingGraphic());

        Label label = new Label("Conectando e verificando a leitura...");
        label.setWrapText(true);
        label.setAlignment(Pos.CENTER);
        label.setStyle("-fx-font-size: 16; -fx-font-weight: bold; -fx-text-fill: #051833;");
        content.getChildren().add(label);

        modal.setScene(new Scene(content, 260, 170));
        modal.setOnCloseRequest(event -> event.consume());
        modal.show();
        return modal;
    }

    private Parent createLoadingGraphic() {
        try (InputStream gifStream = getClass().getResourceAsStream("/icon/loading.gif")) {
            if (gifStream != null) {
                ImageView imageView = new ImageView(new Image(gifStream));
                imageView.setFitWidth(52);
                imageView.setFitHeight(52);
                imageView.setPreserveRatio(true);
                return new StackPane(imageView);
            }
        } catch (IOException e) {
            logger.warn("Nao foi possivel carregar loading.gif", e);
        }

        ProgressIndicator progressIndicator = new ProgressIndicator();
        progressIndicator.setPrefSize(52, 52);
        return new StackPane(progressIndicator);
    }

    private void closeModal(Stage modal) {
        if (modal != null && modal.isShowing()) {
            modal.close();
        }
    }

    private void showResultModal(Alert.AlertType alertType, String title, String message) {
        Alert alert = new Alert(alertType);
        alert.setTitle(title);
        alert.setHeaderText(null);
        alert.setContentText(message);
        if (stage != null) {
            alert.initOwner(stage);
        }
        alert.showAndWait();
    }

    private void openSettingsWindow() {
        try {
            FXMLLoader loader = new FXMLLoader(getClass().getResource("/views/settings.fxml"));
            loader.setControllerFactory(applicationContext::getBean);
            Parent root = loader.load();

            Stage settingsStage = new Stage();
            settingsStage.setTitle("Configuracoes");
            settingsStage.setScene(new Scene(root));
            settingsStage.setMinWidth(560);
            settingsStage.setMinHeight(560);
            settingsStage.initModality(Modality.APPLICATION_MODAL);
            if (stage != null) {
                settingsStage.initOwner(stage);
            }
            settingsStage.setResizable(true);
            settingsStage.showAndWait();
            loadPage(currentPage);
        } catch (IOException e) {
            // ⚠️ Nao basta logar: quem clicou nao le log. Antes disto, uma LoadException — que e uma
            // IOException — fazia o botao da engrenagem nao fazer NADA, sem alerta e sem mensagem, e
            // o unico rastro ficava num terminal que ninguem tem aberto na sonda.
            logger.error("Erro ao abrir tela de configuracoes", e);
            showResultModal(Alert.AlertType.ERROR, "Configuracoes",
                    "Nao foi possivel abrir as Configuracoes: " + e.getMessage()
                            + "\n\nSe o app foi atualizado com ele aberto, feche e abra de novo.");
        }
    }

    /**
     * Abre a configuracao de cards da unidade — RN-086.
     *
     * <p>A janela pede login antes de abrir, e nao abre se a pessoa desistir, errar a credencial,
     * nao tiver perfil ou estiver sem rede. Nos quatro casos o resto do app segue funcionando: so a
     * configuracao fica restrita.
     *
     * <p>Recarrega a pagina ao fechar, como {@link #openSettingsWindow()}, porque o conjunto de
     * cards muda o que o dashboard mostra.
     */
    private void openCardsWindow() {
        CardsConfigController.abrir(stage, applicationContext);
        loadPage(currentPage);
    }

    private void startInternetChecker() {
        internetChecker = Executors.newSingleThreadScheduledExecutor(r -> {
            Thread t = new Thread(r, "internet-checker");
            t.setDaemon(true);
            return t;
        });
        internetChecker.scheduleAtFixedRate(() -> {
            boolean online = checkInternet();
            Platform.runLater(() -> updateInternetStatus(online));
        }, 0, 15, TimeUnit.SECONDS);
    }

    private boolean checkInternet() {
        try (Socket socket = new Socket()) {
            socket.connect(new InetSocketAddress("8.8.8.8", 53), 2000);
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    private void updateInternetStatus(boolean online) {
        internetStatusLabel.setText(online ? "Internet conectada" : "Sem internet");
        internetStatusCircle.setFill(online ? Color.web("#2e8b3a") : Color.web("#d92d20"));
    }

    /**
     * Prende o desenho das páginas dentro da área do centro.
     *
     * <p>O JavaFX não recorta nada por padrão: um filho maior que o pai desenha para fora dele, por
     * cima do que estiver em volta. Foi assim que o menu sumia em tela pequena — o monitoramento com
     * seis cards ficava mais alto que o espaço disponível e pintava seu fundo opaco sobre a barra de
     * marca (ver o comentário no {@code main-view.fxml}).
     *
     * <p>O {@code minHeight="0"} do FXML já impede o centro de subir. O recorte é a segunda tranca:
     * vale para <b>qualquer</b> página, inclusive as que ainda não existem, e não depende de nenhuma
     * delas se comportar.
     */
    private void recortarConteudo() {
        Rectangle recorte = new Rectangle();
        recorte.widthProperty().bind(contentPane.widthProperty());
        recorte.heightProperty().bind(contentPane.heightProperty());
        contentPane.setClip(recorte);
    }

    private void loadPage(String fxmlPath) {
        try {
            FXMLLoader loader = new FXMLLoader(getClass().getResource(fxmlPath));
            loader.setControllerFactory(applicationContext::getBean);
            Parent page = loader.load();
            contentPane.getChildren().setAll(page);
            currentPage = fxmlPath;
        } catch (IOException e) {
            // Mesmo motivo da engrenagem: sem isto o item de menu clicado deixa a pagina ANTERIOR na
            // tela, e quem clicou conclui que errou o clique — nao que a tela quebrou.
            logger.error("Erro ao carregar pagina {}", fxmlPath, e);
            showResultModal(Alert.AlertType.ERROR, "Tela indisponivel",
                    "Nao foi possivel abrir esta tela: " + e.getMessage()
                            + "\n\nSe o app foi atualizado com ele aberto, feche e abra de novo.");
        }
    }

    private void setActiveMenu(Button activeButton) {
        btnMonitoring.setStyle(INACTIVE_MENU_STYLE);
        btnGraficos.setStyle(INACTIVE_MENU_STYLE);
        btnOperationChart.setStyle(INACTIVE_MENU_STYLE);
        activeButton.setStyle(ACTIVE_MENU_STYLE);
    }
}

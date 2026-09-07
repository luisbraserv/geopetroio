package com.example.demo.controllers;

import com.example.demo.services.PlcConnectionService;
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
        btnMonitoring.setOnAction(event -> {
            loadPage("/views/monitoring.fxml");
            setActiveMenu(btnMonitoring);
        });
        btnGraficos.setOnAction(event -> {
            loadPage("/views/graficos.fxml");
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
            plcConnectionService.disconnect();
            updatePlcStatus();
            return;
        }

        Stage connectingStage = showConnectingModal();
        btnPlcConnection.setDisable(true);

        Task<Boolean> connectionTask = new Task<>() {
            @Override
            protected Boolean call() {
                return plcConnectionService.connectUsingSavedIp();
            }
        };

        connectionTask.setOnSucceeded(event -> {
            closeModal(connectingStage);
            btnPlcConnection.setDisable(false);
            updatePlcStatus();

            if (Boolean.TRUE.equals(connectionTask.getValue())) {
                showResultModal(Alert.AlertType.INFORMATION, "Conectado", "Conectado ao PLC com sucesso.");
            } else {
                showResultModal(Alert.AlertType.ERROR, "Erro ao conectar", "Erro ao conectar! Entre em contato com suporte se a falha persistir.");
            }
        });

        connectionTask.setOnFailed(event -> {
            closeModal(connectingStage);
            btnPlcConnection.setDisable(false);
            updatePlcStatus();
            logger.error("Erro ao conectar ao PLC", connectionTask.getException());
            showResultModal(Alert.AlertType.ERROR, "Erro ao conectar", "Erro ao conectar! Entre em contato com suporte se a falha persistir.");
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

        Label label = new Label("Conectando...");
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
            logger.error("Erro ao abrir tela de configuracoes", e);
        }
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

    private void loadPage(String fxmlPath) {
        try {
            FXMLLoader loader = new FXMLLoader(getClass().getResource(fxmlPath));
            loader.setControllerFactory(applicationContext::getBean);
            Parent page = loader.load();
            contentPane.getChildren().setAll(page);
            currentPage = fxmlPath;
        } catch (IOException e) {
            logger.error("Erro ao carregar pagina {}", fxmlPath, e);
        }
    }

    private void setActiveMenu(Button activeButton) {
        btnMonitoring.setStyle(INACTIVE_MENU_STYLE);
        btnGraficos.setStyle(INACTIVE_MENU_STYLE);
        btnOperationChart.setStyle(INACTIVE_MENU_STYLE);
        activeButton.setStyle(ACTIVE_MENU_STYLE);
    }
}

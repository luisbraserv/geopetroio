package com.example.demo.controllers;

import com.example.demo.models.AppSettings;
import com.example.demo.models.CardVisibilityConfig;
import com.example.demo.services.SettingsService;
import com.example.demo.services.SondaService;
import javafx.animation.KeyFrame;
import javafx.animation.Timeline;
import javafx.fxml.FXML;
import javafx.fxml.FXMLLoader;
import javafx.geometry.Insets;
import javafx.geometry.Pos;
import javafx.scene.Node;
import javafx.scene.Parent;
import javafx.scene.Scene;
import javafx.scene.control.Button;
import javafx.scene.control.Label;
import javafx.scene.layout.FlowPane;
import javafx.scene.layout.VBox;
import javafx.stage.Modality;
import javafx.stage.Stage;
import javafx.util.Duration;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.ApplicationContext;
import org.springframework.stereotype.Controller;

import java.io.IOException;
import java.util.LinkedHashMap;
import java.util.Map;

@Controller
public class MonitoringController {

    private static final Logger logger = LoggerFactory.getLogger(MonitoringController.class);

    // Ícones SVG (Material Design Icons, viewbox 24x24)
    private static final String ICON_WEIGHT = "M12,3A4,4 0 0,1 16,7C16,7.73 15.81,8.41 15.46,9H18.5C19.2,9 19.79,9.5 19.96,10.15L21.96,19.15C22.19,20.05 21.5,21 20.5,21H3.5C2.5,21 1.81,20.05 2.04,19.15L4.04,10.15C4.21,9.5 4.8,9 5.5,9H8.54C8.19,8.41 8,7.73 8,7A4,4 0 0,1 12,3M12,5A2,2 0 0,0 10,7A2,2 0 0,0 12,9A2,2 0 0,0 14,7A2,2 0 0,0 12,5Z";
    private static final String ICON_WRENCH = "M22.7,19L13.6,9.9C14.5,7.6 14,4.9 12.1,3C10.1,1 7.1,0.6 4.7,1.7L9,6L6,9L1.6,4.7C0.4,7.1 0.9,10.1 2.9,12.1C4.8,14 7.5,14.5 9.8,13.6L18.9,22.7C19.3,23.1 19.9,23.1 20.3,22.7L22.6,20.4C23.1,20 23.1,19.3 22.7,19Z";
    private static final String ICON_GAUGE  = "M12,16A3,3 0 0,1 9,13C9,11.88 9.61,10.9 10.5,10.39L20.21,4.77L14.68,14.35C14.18,15.33 13.17,16 12,16M12,3C13.81,3 15.5,3.5 16.97,4.32L14.87,5.53C14,5.19 13,5 12,5A8,8 0 0,0 4,13C4,15.21 4.89,17.21 6.34,18.65H6.35C6.74,19.04 6.74,19.67 6.35,20.06C5.96,20.45 5.32,20.45 4.93,20.07V20.07C3.12,18.26 2,15.76 2,13A10,10 0 0,1 12,3M22,13C22,15.76 20.88,18.26 19.07,20.07V20.07C18.68,20.45 18.05,20.45 17.66,20.06C17.27,19.67 17.27,19.04 17.66,18.65V18.65C19.11,17.2 20,15.21 20,13C20,12 19.81,11 19.46,10.1L20.67,8C21.5,9.5 22,11.18 22,13Z";
    private static final String ICON_DROP   = "M12,20A6,6 0 0,1 6,14C6,10 12,3.25 12,3.25C12,3.25 18,10 18,14A6,6 0 0,1 12,20Z";

    @Autowired private SondaService sondaService;
    @Autowired private SettingsService settingsService;
    @Autowired private ApplicationContext applicationContext;

    @FXML private FlowPane cardsPane;

    // Label references built in code
    private Label lblPesoColuna;
    private Label lblTubes;
    private Label lblFloating;
    private Label lblTubesStatus;
    private Label lblFloatingStatus;
    private Label lblBomba;
    private Label lblEscp;
    private Label lblVazao;

    // Valor bruto do CLP, exibido no rodapé de cada card
    private Label lblPesoRaw;
    private Label lblTubesRaw;
    private Label lblFloatingRaw;
    private Label lblBombaRaw;
    private Label lblEscpRaw;
    private Label lblVazaoRaw;

    // Card nodes built in code
    private Node cardPesoColuna;
    private Node cardChHidTubos;
    private Node cardChFlutuante;
    private Node cardBombaLama;
    private Node cardEscp;
    private Node cardVazao;

    // Ordered map to maintain display order
    private final Map<String, CardEntry> cards = new LinkedHashMap<>();

    @FXML
    public void initialize() {
        logger.info("Inicializando MonitoringController");
        buildCards();
        applyCardVisibility();
        Timeline timeline = new Timeline(new KeyFrame(Duration.seconds(1), event -> updateData()));
        timeline.setCycleCount(Timeline.INDEFINITE);
        timeline.play();
        updateData();
    }

    private void buildCards() {
        lblPesoColuna = new Label("0");
        lblTubes      = new Label("0");
        lblFloating   = new Label("0");
        lblBomba      = new Label("0");
        lblEscp       = new Label("0");
        lblVazao      = new Label("0");
        lblTubesStatus = buildHydraulicConfigStatusLabel();
        lblFloatingStatus = buildHydraulicConfigStatusLabel();

        Button btnSensorPeso     = new Button("⚙");
        Button btnSensorTubes    = new Button("⚙");
        Button btnSensorFloating = new Button("⚙");
        Button btnSensorBomba    = new Button("⚙");
        Button btnSensorEscp     = new Button("⚙");
        Button btnVazaoSettings  = new Button("⚙");

        // Valor cru lido do CLP, para diagnostico direto no card.
        lblPesoRaw     = buildRawLabel();
        lblTubesRaw    = buildRawLabel();
        lblFloatingRaw = buildRawLabel();
        lblBombaRaw    = buildRawLabel();
        lblEscpRaw     = buildRawLabel();
        lblVazaoRaw    = buildRawLabel();

        btnSensorPeso.setOnAction(e     -> openPesoColunaSettings(btnSensorPeso));
        btnSensorTubes.setOnAction(e    -> openChaveSettings(true,  btnSensorTubes));
        btnSensorFloating.setOnAction(e -> openChaveSettings(false, btnSensorFloating));
        btnSensorBomba.setOnAction(e    -> openSensorSettings(4, "P. Bomba de Lama / ESCP", false, btnSensorBomba));
        btnSensorEscp.setOnAction(e     -> openSensorSettings(4, "P. Bomba de Lama / ESCP", false, btnSensorEscp));
        btnVazaoSettings.setOnAction(e  -> openPumpSettingsWindow(btnVazaoSettings));

        cardPesoColuna  = buildCard("Peso da Coluna",                       "P", "lbf",     ICON_WEIGHT, lblPesoColuna, null,              btnSensorPeso, lblPesoRaw);
        cardChHidTubos  = buildCard("Torque Chave Hidráulico dos Tubos",    "τ", "lbf·ft",  ICON_WRENCH, lblTubes,      lblTubesStatus,    btnSensorTubes, lblTubesRaw);
        cardChFlutuante = buildCard("Torque da Chave Flutuante",            "τ", "lbf·ft",  ICON_WRENCH, lblFloating,   lblFloatingStatus, btnSensorFloating, lblFloatingRaw);
        cardBombaLama   = buildCard("P. Bomba de Lama",                     "P", "PSI",     ICON_GAUGE,  lblBomba,      null,              btnSensorBomba, lblBombaRaw);
        cardEscp        = buildCard("ESCP",                                 "P", "PSI",     ICON_GAUGE,  lblEscp,       null,              btnSensorEscp, lblEscpRaw);
        cardVazao       = buildCard("Vazão",                                "Q", "bbl/min", ICON_DROP,   lblVazao,      null,              btnVazaoSettings, lblVazaoRaw);

        cards.put("pesoColuna",  new CardEntry(cardPesoColuna,  () -> settingsService.getCardVisibility().isPesoColuna()));
        cards.put("chHidTubos",  new CardEntry(cardChHidTubos,  () -> settingsService.getCardVisibility().isChHidTubos()));
        cards.put("chFlutuante", new CardEntry(cardChFlutuante, () -> settingsService.getCardVisibility().isChFlutuante()));
        cards.put("bombaLama",   new CardEntry(cardBombaLama,   () -> settingsService.getCardVisibility().isBombaLama()));
        cards.put("escp",        new CardEntry(cardEscp,        () -> settingsService.getCardVisibility().isEscp()));
        cards.put("vazao",       new CardEntry(cardVazao,       () -> settingsService.getCardVisibility().isVazao()));
    }

    private Node buildCard(String title, String symbol, String unit, String iconSvg,
                           Label valueLabel, Label statusLabel, Button gearButton) {
        return buildCard(title, symbol, unit, iconSvg, valueLabel, statusLabel, gearButton, null);
    }

    /**
     * @param rawLabel rotulo do valor bruto do CLP, no canto inferior direito. {@code null} para
     *                 cards que nao vem de um endereco unico do CLP.
     */
    private Node buildCard(String title, String symbol, String unit, String iconSvg,
                           Label valueLabel, Label statusLabel, Button gearButton, Label rawLabel) {
        styleValueLabel(valueLabel);

        javafx.scene.shape.SVGPath icon = new javafx.scene.shape.SVGPath();
        icon.setContent(iconSvg);
        icon.setFill(javafx.scene.paint.Color.web("#5a667a"));
        icon.setScaleX(1.6);
        icon.setScaleY(1.6);
        javafx.scene.layout.StackPane iconBox = new javafx.scene.layout.StackPane(icon);
        iconBox.setMinSize(44, 44);
        iconBox.setPrefSize(44, 44);
        iconBox.setMaxSize(44, 44);

        Label titleLabel = new Label(title + " (" + symbol + ")");
        titleLabel.getStyleClass().add("card-grandeza-titulo");
        titleLabel.setWrapText(true);
        titleLabel.setTextAlignment(javafx.scene.text.TextAlignment.CENTER);
        titleLabel.setAlignment(Pos.CENTER);
        titleLabel.setMaxWidth(Double.MAX_VALUE);

        Label unitLabel = new Label(unit);
        unitLabel.getStyleClass().add("muted");

        styleGearButton(gearButton);

        VBox body = new VBox(10, iconBox, titleLabel, valueLabel, unitLabel);
        if (statusLabel != null) body.getChildren().add(statusLabel);
        body.setAlignment(Pos.CENTER);

        javafx.scene.layout.StackPane content = new javafx.scene.layout.StackPane(body, gearButton);
        javafx.scene.layout.StackPane.setAlignment(gearButton, Pos.TOP_RIGHT);

        if (rawLabel != null) {
            // Valor cru do CLP, sobreposto no rodapé do card. Fica no StackPane em vez de dentro do
            // body para não empurrar o valor principal do centro.
            content.getChildren().add(rawLabel);
            javafx.scene.layout.StackPane.setAlignment(rawLabel, Pos.BOTTOM_RIGHT);
        }

        content.setPadding(new Insets(20));
        content.getStyleClass().add("card-grandeza");
        content.setPrefHeight(260);

        // Máximo de 4 cards por linha: largura acompanha a tela
        content.prefWidthProperty().bind(cardsPane.widthProperty().subtract(61).divide(4));

        return content;
    }

    /**
     * Rotulo do valor cru do CLP.
     *
     * <p>Pequeno e discreto de proposito: e informacao de diagnostico, nao de operacao. Quem opera
     * le o numero grande no centro; quem instala confere este.
     */
    private Label buildRawLabel() {
        Label label = new Label("--");
        label.getStyleClass().add("valor-bruto");
        return label;
    }

    /**
     * Mostra o valor cru de um endereco do DB1.
     *
     * <p>O bruto e o unico jeito de separar "pressao zero de verdade" de "sem sinal": desde que a
     * conversao passou a limitar a faixa 4-20 mA, os dois casos aparecem como 0 PSI no numero
     * grande. Abaixo de 200 o laco esta fora da faixa util (4 mA equivale a ~200 nesta escala).
     *
     * @param nomeEndereco rotulo do endereco como aparece no LOGO! — {@code DBW} para as palavras
     *                     analogicas e {@code DBD} para o contador de stroke, que e DWord. Escrever
     *                     "DBW0" para o contador mandaria procurar no lugar errado.
     */
    private void updateRawLabel(Label label, String nomeEndereco, int endereco) {
        if (label == null) return;

        Long bruto = sondaService.getValorBruto(endereco);
        label.setText(nomeEndereco + endereco + " " + (bruto == null ? "--" : bruto));
    }

    private Label buildHydraulicConfigStatusLabel() {
        Label label = new Label("Configuração hidráulica da chave incompleta.");
        label.setWrapText(true);
        label.setTextAlignment(javafx.scene.text.TextAlignment.CENTER);
        label.setAlignment(Pos.CENTER);
        label.setMaxWidth(310);
        label.getStyleClass().add("estado-erro");
        label.setStyle("-fx-font-size: 12; -fx-font-weight: bold;");
        return label;
    }

    private void styleValueLabel(Label label) {
        label.setStyle("-fx-font-size: 64; -fx-font-weight: bold;");
        label.getStyleClass().add("card-grandeza-valor");
    }

    /**
     * O hover vem do CSS (`.botao-icone:hover`), nao de listeners de mouse.
     *
     * <p>A versao anterior reescrevia o style inteiro a cada entrada e saida do mouse, o que
     * significava repetir a paleta em tres lugares e mante-los em sincronia na mao — foi assim que
     * as cores antigas sobreviveram aqui depois de o design system mudar.
     */
    private void styleGearButton(Button btn) {
        btn.getStyleClass().add("botao-icone");
    }

    private void applyCardVisibility() {
        cardsPane.getChildren().clear();
        for (CardEntry entry : cards.values()) {
            if (entry.visibilitySupplier.get()) {
                cardsPane.getChildren().add(entry.node);
            }
        }
    }

    private void updateData() {
        AppSettings settings = settingsService.loadSettings();
        CardVisibilityConfig vis = settings.getCardVisibility();

        if (vis.isPesoColuna()) {
            lblPesoColuna.setText(sondaService.isPesoColunConfigurado()
                    ? String.format("%.0f", sondaService.getPesoColumLbf())
                    : "0");
        }

        if (vis.isChHidTubos()) {
            updateTorqueCard(lblTubes, lblTubesStatus, settings.getChaveTubos().isConfigurado(),
                    sondaService.getTorqueTubos());
        }

        if (vis.isChFlutuante()) {
            updateTorqueCard(lblFloating, lblFloatingStatus, settings.getChaveFlutuante().isConfigurado(),
                    sondaService.getTorqueFluante());
        }

        if (vis.isBombaLama())
            lblBomba.setText(formatDecimalValue(sondaService.getPressao04()));

        if (vis.isEscp())
            lblEscp.setText(formatDecimalValue(sondaService.getPressao04()));

        if (vis.isVazao())
            lblVazao.setText(formatFlowRateValue(sondaService.getVazao()));

        // Endereços conforme PlcConnectionService: B002=DBW4, B003=DBW6, B004=DBW8, B005=DBW10.
        // Bomba e ESCP saem do mesmo B005 — por isso os dois cards mostram o mesmo bruto.
        updateRawLabel(lblPesoRaw, "DBW", 4);
        updateRawLabel(lblTubesRaw, "DBW", 6);
        updateRawLabel(lblFloatingRaw, "DBW", 8);
        updateRawLabel(lblBombaRaw, "DBW", 10);
        updateRawLabel(lblEscpRaw, "DBW", 10);
        // Vazão vem do contador cumulativo de stroke, DWord em DBD0 — não é canal analógico.
        updateRawLabel(lblVazaoRaw, "DBD", 0);
    }

    private void updateTorqueCard(Label valueLabel, Label statusLabel, boolean configured, double torque) {
        valueLabel.setText(configured ? String.format("%.0f", torque) : "0");
        statusLabel.setManaged(!configured);
        statusLabel.setVisible(!configured);
    }

    private void openSensorSettings(int sensorIndex, String nomeSensor, boolean ignored, Button ownerButton) {
        try {
            FXMLLoader loader = new FXMLLoader(getClass().getResource("/views/sensor-settings.fxml"));
            loader.setControllerFactory(applicationContext::getBean);
            Parent root = loader.load();

            SensorSettingsController controller = loader.getController();
            controller.configurarSensor(sensorIndex, nomeSensor);

            Stage stage = new Stage();
            stage.setTitle("Configuração do Sensor");
            stage.setScene(new Scene(root));
            stage.setMinWidth(440);
            stage.setMinHeight(300);
            stage.initModality(Modality.APPLICATION_MODAL);
            stage.initOwner((Stage) ownerButton.getScene().getWindow());
            stage.setResizable(true);
            stage.showAndWait();
        } catch (IOException e) {
            logger.error("Erro ao abrir configuracao do sensor {}", sensorIndex, e);
        }
    }

    private void openPesoColunaSettings(Button ownerButton) {
        try {
            FXMLLoader loader = new FXMLLoader(getClass().getResource("/views/peso-coluna-settings.fxml"));
            loader.setControllerFactory(applicationContext::getBean);
            Parent root = loader.load();

            Stage stage = new Stage();
            stage.setTitle("Configuração — Peso da Coluna");
            stage.setScene(new Scene(root));
            stage.setMinWidth(460);
            stage.setMinHeight(420);
            stage.initModality(Modality.APPLICATION_MODAL);
            stage.initOwner((Stage) ownerButton.getScene().getWindow());
            stage.setResizable(false);
            stage.showAndWait();
        } catch (IOException e) {
            logger.error("Erro ao abrir configuracao de peso da coluna", e);
        }
    }

    private void openChaveSettings(boolean tubos, Button ownerButton) {
        try {
            FXMLLoader loader = new FXMLLoader(getClass().getResource("/views/chave-settings.fxml"));
            loader.setControllerFactory(applicationContext::getBean);
            Parent root = loader.load();

            ChaveSettingsController controller = loader.getController();
            controller.configurar(tubos);

            Stage stage = new Stage();
            stage.setTitle("Configuração da Chave Hidráulica");
            stage.setScene(new Scene(root));
            stage.setMinWidth(460);
            stage.setMinHeight(650);
            stage.initModality(Modality.APPLICATION_MODAL);
            stage.initOwner((Stage) ownerButton.getScene().getWindow());
            stage.setResizable(true);
            stage.showAndWait();
        } catch (IOException e) {
            logger.error("Erro ao abrir configuracao da chave", e);
        }
    }

    private void openPumpSettingsWindow(Button ownerButton) {
        try {
            FXMLLoader loader = new FXMLLoader(getClass().getResource("/views/pump-settings.fxml"));
            loader.setControllerFactory(applicationContext::getBean);
            Parent root = loader.load();

            Stage settingsStage = new Stage();
            settingsStage.setTitle("Configuracao da Bomba");
            settingsStage.setScene(new Scene(root, 420, 180));
            settingsStage.initModality(Modality.APPLICATION_MODAL);
            settingsStage.initOwner((Stage) ownerButton.getScene().getWindow());
            settingsStage.setResizable(false);
            settingsStage.showAndWait();
        } catch (IOException e) {
            logger.error("Erro ao abrir configuracao da bomba", e);
        }
    }

    private String formatDecimalValue(Double value) {
        if (value == null || value == 0.0) return "0";
        return String.format("%.1f", value);
    }

    private String formatFlowRateValue(Double value) {
        if (value == null || value == 0.0) return "0";
        return String.format("%.2f", value);
    }

    private static class CardEntry {
        final Node node;
        final java.util.function.Supplier<Boolean> visibilitySupplier;

        CardEntry(Node node, java.util.function.Supplier<Boolean> visibilitySupplier) {
            this.node = node;
            this.visibilitySupplier = visibilitySupplier;
        }
    }
}

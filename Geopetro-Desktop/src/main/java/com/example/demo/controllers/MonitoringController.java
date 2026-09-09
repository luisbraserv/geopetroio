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
import com.example.demo.models.CardsDaUnidade;
import com.example.demo.services.AlarmesLocais;
import com.example.demo.services.AvaliadorLocalDeAlarme;
import com.example.demo.services.ConversaoTanque;
import com.example.demo.services.ConversaoTemperatura;
import com.example.demo.services.LeituraDeCards;
import com.example.demo.services.TelemetriaRealtimeService;
import java.util.List;
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
    @Autowired private TelemetriaRealtimeService telemetriaRealtimeService;
    @Autowired private AlarmesLocais alarmesLocais;

    @FXML private FlowPane cardsPane;


    @FXML
    public void initialize() {
        logger.info("Inicializando MonitoringController");
        Timeline timeline = new Timeline(new KeyFrame(Duration.seconds(1), event -> updateData()));
        timeline.setCycleCount(Timeline.INDEFINITE);
        timeline.play();
        updateData();
    }

    /**
     * Um card na tela, ligado a uma grandeza do documento.
     *
     * @param visual termômetro ou tanque, quando o tipo tem desenho próprio; senão {@code null}
     */
    private record CardDinamico(Node no, Label valor, Label bruto, Label estado, Node visual,
                                Label alarme) {
    }

    /** Chave de um card: o dispositivo mais a série, porque o stroke produz três. */
    private static String chave(LeituraDeCards.Grandeza g) {
        return g.dispositivoId() + "|" + (g.serie() == null ? "" : g.serie());
    }

    private final Map<String, CardDinamico> cardsDinamicos = new LinkedHashMap<>();

    /**
     * Monta a tela a partir das grandezas do último ciclo — passo 7.
     *
     * <p>Antes eram seis cards fixos no código. Agora a tela é o que a unidade declarou: dois
     * tanques, três torques ou nenhum peso aparecem sem que este arquivo saiba de antemão.
     *
     * <p>Só reconstrói quando o <b>conjunto</b> muda. Refazer os nós a cada segundo faria a tela
     * piscar e perderia o foco de quem estivesse interagindo.
     */
    private void sincronizarCards(List<LeituraDeCards.Grandeza> grandezas) {
        List<String> chaves = grandezas.stream().map(MonitoringController::chave).toList();
        if (chaves.equals(List.copyOf(cardsDinamicos.keySet()))) {
            return;
        }

        cardsDinamicos.clear();
        cardsPane.getChildren().clear();
        for (LeituraDeCards.Grandeza g : grandezas) {
            CardDinamico card = construir(g);
            cardsDinamicos.put(chave(g), card);
            cardsPane.getChildren().add(card.no());
        }
        logger.info("Dashboard montado com {} grandezas.", grandezas.size());
    }

    private CardDinamico construir(LeituraDeCards.Grandeza g) {
        Label valor = new Label("--");
        Label bruto = buildRawLabel();
        Label estado = new Label();
        estado.getStyleClass().add("ajuda");
        estado.setWrapText(true);
        estado.setVisible(false);
        estado.setManaged(false);

        // ⚠️ O nivel vai ESCRITO, e nao so na cor da borda: numa sonda quem olha a tela pode estar
        // de oculos de seguranca, sob sol, ou nao distinguir vermelho de ambar.
        Label alarme = new Label();
        alarme.getStyleClass().add("card-grandeza-alarme");
        alarme.setVisible(false);
        alarme.setManaged(false);

        Node visual = visualDe(g);
        Button engrenagem = new Button("⚙");
        engrenagem.setOnAction(e -> abrirCalibracaoDoCard(g, engrenagem));

        Node no = buildCardDinamico(rotulo(g), g.unidade(), visual, iconeDe(g.tipo()),
                valor, estado, engrenagem, bruto, alarme);
        return new CardDinamico(no, valor, bruto, estado, visual, alarme);
    }

    /** O nome do card é o rótulo; a série entra entre parênteses quando há mais de uma. */
    private static String rotulo(LeituraDeCards.Grandeza g) {
        if (g.serie() == null || g.serie().isBlank()) {
            return g.nome();
        }
        String legivel = switch (g.serie()) {
            case LeituraDeCards.SERIE_STROKE -> "stroke";
            case LeituraDeCards.SERIE_VAZAO -> "vazão";
            case LeituraDeCards.SERIE_VOLUME -> "volume acumulado";
            default -> g.serie();
        };
        return g.nome() + " — " + legivel;
    }

    /**
     * Termômetro e tanque desenhados; os demais tipos ficam com o ícone de sempre.
     *
     * <p>O desenho não é enfeite: no tanque, é a conferência visual mais barata de que a distância
     * não foi confundida com o nível.
     */
    private Node visualDe(LeituraDeCards.Grandeza g) {
        var card = cardDoDocumento(g.dispositivoId());
        var p = card == null ? null : card.parametros();
        return switch (g.tipo()) {
            case TEMPERATURA -> p == null || p.minimoEscala() == null || p.maximoEscala() == null
                    ? null
                    : new TermometroView(p.minimoEscala(), p.maximoEscala(), ConversaoTemperatura.unidade(p));
            case NIVEL_TANQUE -> p == null ? null : new TanqueView(p.forma());
            default -> null;
        };
    }

    private static String iconeDe(CardsDaUnidade.Tipo tipo) {
        return switch (tipo) {
            case PESO -> ICON_WEIGHT;
            case TORQUE -> ICON_WRENCH;
            case PRESSAO, TEMPERATURA -> ICON_GAUGE;
            case CONTADOR_STROKE, NIVEL_TANQUE -> ICON_DROP;
        };
    }

    /** O card do documento, para chegar aos parâmetros de escala do desenho. */
    private CardsDaUnidade.Card cardDoDocumento(String dispositivoId) {
        return telemetriaRealtimeService.cardsAtuais(settingsService.loadSettings())
                .map(CardsDaUnidade::cards).orElse(List.of()).stream()
                .filter(c -> dispositivoId.equals(c.dispositivoId()))
                .findFirst().orElse(null);
    }

    private void atualizarCard(CardDinamico card, LeituraDeCards.Grandeza g) {
        if (g.temValor()) {
            card.valor().setText(formatar(g.valor(), g.tipo()));
            card.estado().setVisible(false);
            card.estado().setManaged(false);
        } else {
            // ⚠️ Traço, nao zero: zero pareceria medicao real. RN-099.
            card.valor().setText("--");
            card.estado().setText(g.semValorPorque());
            card.estado().setVisible(true);
            card.estado().setManaged(true);
        }
        card.bruto().setText(g.enderecoDb() + "  " + Math.round(g.bruto()));

        if (card.visual() instanceof TermometroView termometro) {
            termometro.setValor(g.temValor() ? g.valor() : null);
        } else if (card.visual() instanceof TanqueView tanque) {
            atualizarTanque(tanque, g);
        }

        aplicarAlarme(card, alarmesLocais.severidadeDe(g));
    }

    /**
     * O destaque do alarme local — passo 3 de {@code specs/features/alarmes.md}.
     *
     * <p>⚠️ Isto <b>sinaliza</b> e nao registra: o historico de eventos tem um produtor so, o
     * Backend. Aqui o objetivo e chamar quem esta ao lado do equipamento, inclusive sem rede.
     */
    private void aplicarAlarme(CardDinamico card, AvaliadorLocalDeAlarme.Severidade severidade) {
        var classes = card.no().getStyleClass();
        classes.removeAll("card-grandeza-atencao", "card-grandeza-critico");
        card.alarme().getStyleClass()
                .removeAll("card-grandeza-alarme-atencao", "card-grandeza-alarme-critico");

        if (severidade == null) {
            card.alarme().setVisible(false);
            card.alarme().setManaged(false);
            return;
        }

        boolean critico = severidade == AvaliadorLocalDeAlarme.Severidade.CRITICO;
        classes.add(critico ? "card-grandeza-critico" : "card-grandeza-atencao");
        card.alarme().getStyleClass()
                .add(critico ? "card-grandeza-alarme-critico" : "card-grandeza-alarme-atencao");
        card.alarme().setText(critico ? "CRÍTICO" : "ATENÇÃO");
        card.alarme().setVisible(true);
        card.alarme().setManaged(true);
    }

    private void atualizarTanque(TanqueView tanque, LeituraDeCards.Grandeza g) {
        var card = cardDoDocumento(g.dispositivoId());
        var p = card == null ? null : card.parametros();
        Double alturaM = p == null ? null : ConversaoTanque.alturaDoLiquidoM(g.bruto(), p);
        tanque.atualizar(alturaM == null ? 0 : ConversaoTanque.fracaoCheia(alturaM, p),
                alturaM != null && g.temValor());
    }

    /** Casas decimais por tipo: peso em lbf não precisa de fração; vazão em bbl/min precisa. */
    private static String formatar(double valor, CardsDaUnidade.Tipo tipo) {
        return switch (tipo) {
            case PESO, TORQUE -> String.format("%.0f", valor);
            case PRESSAO, TEMPERATURA -> String.format("%.1f", valor);
            case NIVEL_TANQUE -> String.format("%.1f", valor);
            case CONTADOR_STROKE -> String.format("%.2f", valor);
        };
    }

    /** A engrenagem abre a calibração do card — a mesma janela que a tela de Cards abre. */
    private void abrirCalibracaoDoCard(LeituraDeCards.Grandeza g, Button dono) {
        switch (g.tipo()) {
            case PESO -> openPesoColunaSettings(dono);
            case TORQUE -> openChaveSettings(true, dono);
            case CONTADOR_STROKE -> openPumpSettingsWindow(dono);
            // Pressao, temperatura e tanque tem a escala no DOCUMENTO, nao nesta estacao: quem
            // ajusta e a tela de Cards, com login. Mandar para a janela local seria oferecer um
            // ajuste que nao tem efeito.
            default -> CardsConfigController.abrir(dono.getScene().getWindow(), applicationContext);
        }
    }

    private Node buildCard(String title, String symbol, String unit, String iconSvg,
                           Label valueLabel, Label statusLabel, Button gearButton) {
        return buildCard(title, symbol, unit, iconSvg, valueLabel, statusLabel, gearButton, null, null);
    }

    /**
     * @param rawLabel rotulo do valor bruto do CLP, no canto inferior direito. {@code null} para
     *                 cards que nao vem de um endereco unico do CLP.
     */
    /**
     * Card com um visual proprio no lugar do icone — termometro ou tanque.
     *
     * <p>O desenho ocupa o espaco do icone de proposito: ele DIZ mais que o icone, e o layout do
     * card ja reservava aquele lugar para a identificacao visual da grandeza.
     */
    private Node buildCardDinamico(String titulo, String unidade, Node visual, String iconSvg,
                                   Label valor, Label estado, Button engrenagem, Label bruto, Label alarme) {
        if (visual == null) {
            return buildCard(titulo, "", unidade, iconSvg, valor, estado, engrenagem, bruto, alarme);
        }
        styleValueLabel(valor);

        Label titulos = new Label(titulo);
        titulos.getStyleClass().add("card-grandeza-titulo");
        titulos.setWrapText(true);
        titulos.setTextAlignment(javafx.scene.text.TextAlignment.CENTER);
        titulos.setAlignment(Pos.CENTER);
        titulos.setMaxWidth(Double.MAX_VALUE);

        Label unidades = new Label(unidade);
        unidades.getStyleClass().add("muted");
        styleGearButton(engrenagem);

        // Desenho a esquerda, numero a direita: o valor continua legivel de longe, e o desenho
        // responde a pergunta que o numero sozinho nao responde.
        VBox numeros = new VBox(6, titulos, valor, unidades, estado, alarme);
        numeros.setAlignment(Pos.CENTER);
        javafx.scene.layout.HBox corpo = new javafx.scene.layout.HBox(12, visual, numeros);
        corpo.setAlignment(Pos.CENTER);
        javafx.scene.layout.HBox.setHgrow(numeros, javafx.scene.layout.Priority.ALWAYS);

        javafx.scene.layout.StackPane conteudo = new javafx.scene.layout.StackPane(corpo, engrenagem, bruto);
        javafx.scene.layout.StackPane.setAlignment(engrenagem, Pos.TOP_RIGHT);
        javafx.scene.layout.StackPane.setAlignment(bruto, Pos.BOTTOM_RIGHT);
        conteudo.setPadding(new Insets(20));
        conteudo.getStyleClass().add("card-grandeza");
        conteudo.setPrefHeight(260);
        conteudo.prefWidthProperty().bind(cardsPane.widthProperty().subtract(61).divide(4));
        return conteudo;
    }

    private Node buildCard(String title, String symbol, String unit, String iconSvg,
                           Label valueLabel, Label statusLabel, Button gearButton, Label rawLabel,
                           Label alarmeLabel) {
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

        Label titleLabel = new Label(symbol == null || symbol.isBlank() ? title : title + " (" + symbol + ")");
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
        if (alarmeLabel != null) body.getChildren().add(alarmeLabel);
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

    /**
     * Atualiza a tela a cada ciclo a partir das grandezas convertidas.
     *
     * <p>⚠️ <b>A visibilidade nao filtra mais aqui.</b> Ela controla PUBLICACAO, nao exibicao
     * (RN-037), e quem a aplica e {@code LeituraDeCards.paraPublicar}. Filtrar tambem na tela
     * escondia da estacao um card que ela esta lendo e gravando — e o operador nao teria como
     * saber que ele existe.
     */
    private void updateData() {
        List<LeituraDeCards.Grandeza> grandezas = sondaService.grandezas();
        sincronizarCards(grandezas);
        for (LeituraDeCards.Grandeza g : grandezas) {
            CardDinamico card = cardsDinamicos.get(chave(g));
            if (card != null) {
                atualizarCard(card, g);
            }
        }
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

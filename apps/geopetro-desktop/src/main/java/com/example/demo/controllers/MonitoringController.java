package com.example.demo.controllers;

import com.example.demo.models.AppSettings;
import com.example.demo.services.SettingsService;
import com.example.demo.services.SondaService;
import javafx.animation.KeyFrame;
import javafx.animation.Timeline;
import javafx.fxml.FXML;
import javafx.geometry.Insets;
import javafx.geometry.Pos;
import javafx.scene.Node;
import javafx.scene.control.Button;
import javafx.scene.control.Label;
import javafx.scene.layout.FlowPane;
import javafx.scene.layout.VBox;
import javafx.util.Duration;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.ApplicationContext;
import org.springframework.stereotype.Controller;
import org.springframework.context.annotation.Scope;
import com.example.demo.services.CardsDoMonitoramento;
import com.example.demo.services.PlcConnectionService;

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
@Scope("prototype")
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
    @Autowired private PlcConnectionService plcConnectionService;
    @Autowired private com.example.demo.services.AlarmesDaEstacao alarmesDaEstacao;

    @FXML private DashboardGrid cardsPane;
    @FXML private Label estadoMonitoramento;
    @FXML private javafx.scene.layout.HBox paginas;
    @FXML private Label numeroPagina;
    @FXML private void paginaAnterior() { cardsPane.showPage(cardsPane.page()-1); atualizarPaginas(); }
    @FXML private void proximaPagina() { cardsPane.showPage(cardsPane.page()+1); atualizarPaginas(); }
    private void atualizarPaginas() {
        cardsPane.showPage(cardsPane.page());
        paginas.setVisible(cardsPane.pageCount()>1);
        paginas.setManaged(cardsPane.pageCount()>1);
        numeroPagina.setText((cardsPane.page()+1) + " / " + cardsPane.pageCount());
    }
    private Timeline timeline;
    private CardsDaUnidade documentoExibido;
    private CardsDaUnidade documentoAtual;


    @FXML
    public void initialize() {
        logger.info("Inicializando MonitoringController");
        timeline = new Timeline(new KeyFrame(Duration.seconds(1), event -> updateData()));
        timeline.setCycleCount(Timeline.INDEFINITE);
        cardsPane.sceneProperty().addListener((observable, anterior, atual) -> {
            if (atual == null) timeline.stop();
            else { updateData(); timeline.play(); }
        });
        updateData();
    }

    /**
     * Um card na tela, ligado a uma grandeza do documento.
     *
     * @param visual termômetro ou tanque, quando o tipo tem desenho próprio; senão {@code null}
     */
    private record CardDinamico(Node no, Label valor, Label bruto, Label estado, Node visual,
                                Label alarme, Button sininho) {
    }

    /** Chave de um card: o dispositivo mais a série, porque o stroke produz três. */
    private static String chave(LeituraDeCards.Grandeza g) {
        return g.dispositivoId() + "|" + (g.serie() == null ? "" : g.serie());
    }

    private final Map<String, CardDinamico> cardsDinamicos = new LinkedHashMap<>();

    /**
     * Monta a tela pelo documento, mesmo antes de haver uma leitura do CLP.
     *
     * <p>Antes eram seis cards fixos no código. Agora a tela é o que a unidade declarou: dois
     * tanques, três torques ou nenhum peso aparecem sem que este arquivo saiba de antemão.
     *
     * <p>Só reconstrói quando o <b>conjunto</b> muda. Refazer os nós a cada segundo faria a tela
     * piscar e perderia o foco de quem estivesse interagindo.
     */
    private void sincronizarCards(List<LeituraDeCards.Grandeza> grandezas) {
        List<String> chaves = grandezas.stream().map(MonitoringController::chave).toList();
        if (java.util.Objects.equals(documentoExibido, documentoAtual)
                && chaves.equals(List.copyOf(cardsDinamicos.keySet()))) {
            return;
        }

        cardsDinamicos.clear();
        cardsPane.clearCards();
        documentoExibido = documentoAtual;
        for (LeituraDeCards.Grandeza g : grandezas) {
            CardDinamico card = construir(g);
            cardsDinamicos.put(chave(g), card);
            int largura = g.tipo() == CardsDaUnidade.Tipo.TEMPERATURA || g.tipo() == CardsDaUnidade.Tipo.NIVEL_TANQUE ? 1 : 2;
            if (!cardsPane.addCard(settingsService.loadSettings().getUnidadeId() + "|" + chave(g), (javafx.scene.layout.Region) card.no(), largura)) {
                estadoMonitoramento.setText("A grade está cheia. Reduza o tamanho dos cards para liberar espaço.");
                estadoMonitoramento.setVisible(true);
                estadoMonitoramento.setManaged(true);
            }
        }
        atualizarPaginas();
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

        Button sininho = new Button();
        sininho.setOnAction(e -> abrirAlarmeDoCard(g, sininho));

        Node no = buildCardDinamico(rotulo(g), g.unidade(), visual, iconeDe(g.tipo()),
                valor, estado, engrenagem, bruto, alarme, sininho);
        var card = new CardDinamico(no, valor, bruto, estado, visual, alarme, sininho);
        atualizarSininho(card, g, null);
        return card;
    }

    /**
     * O sininho abre o ajuste do alarme desta estação — {@code configuracao-da-estacao.md §3.1}.
     *
     * <p>⚠️ <b>Sem login, e é o único assim.</b> Todo o resto da configuração do Desktop exige
     * {@code ADMIN} ou {@code SUPORTE}; aqui não, porque o alarme local existe justamente para a
     * sonda sem rede, e um portão de rede anularia a feature no cenário que a motiva (RN-109).
     */
    private void abrirAlarmeDoCard(LeituraDeCards.Grandeza g, Button dono) {
        boolean mudou = AlarmeLocalDialog.abrir(dono.getScene().getWindow(), alarmesDaEstacao,
                g.dispositivoId(), g.serie(), rotulo(g), g.unidade());
        if (mudou) {
            // Sem esperar o proximo ciclo: quem acabou de configurar precisa ver o sininho mudar,
            // ou vai clicar de novo achando que nao salvou.
            CardDinamico card = cardsDinamicos.get(chave(g));
            if (card != null) {
                atualizarSininho(card, g, alarmesLocais.severidadeDe(g));
            }
        }
    }

    /**
     * O estado do sininho, sem precisar clicar nele.
     *
     * <table>
     *   <tr><th>Aparência</th><th>Significa</th></tr>
     *   <tr><td>Apagado</td><td>Sem alarme configurado nesta estação</td></tr>
     *   <tr><td>Aceso</td><td>Vigiando, dentro da faixa</td></tr>
     *   <tr><td>Aceso e destacado</td><td>Disparado agora</td></tr>
     *   <tr><td>Riscado</td><td>Configurado e desligado — a faixa continua guardada</td></tr>
     * </table>
     *
     * <p>⚠️ <b>Ligado sem faixa nenhuma conta como apagado.</b> Marcar o alarme e sair sem digitar
     * número é o engano mais fácil de cometer; mostrar o sino aceso ali prometeria uma vigilância
     * que não existe (RN-108).
     */
    private void atualizarSininho(CardDinamico card, LeituraDeCards.Grandeza g,
                                  AvaliadorLocalDeAlarme.Severidade severidade) {
        var alarme = alarmesDaEstacao.para(g.dispositivoId(), g.serie());
        var classes = card.sininho().getStyleClass();
        classes.removeAll("sininho-aceso", "sininho-desligado", "sininho-disparado");
        classes.add("botao-icone");

        boolean temFaixa = alarme != null && (alarme.minimo() != null || alarme.maximo() != null);

        // ⚠️ Sem faixa e o mesmo que sem alarme, e a tela precisa dizer isso: um sino riscado
        // prometendo "a faixa continua guardada" quando nao ha faixa nenhuma seria pior que o sino
        // apagado — mandaria o operador procurar numeros que ninguem digitou.
        if (!temFaixa) {
            card.sininho().setText("🔔");
            card.sininho().setTooltip(new javafx.scene.control.Tooltip(
                    "Sem alarme nesta estação. Clique para informar mínimo ou máximo."));
            return;
        }

        if (!alarme.ativo()) {
            card.sininho().setText("🔕");
            classes.add("sininho-desligado");
            card.sininho().setTooltip(new javafx.scene.control.Tooltip(
                    "Alarme desligado nesta estação. A faixa continua guardada: "
                            + faixaLegivel(alarme, g.unidade())));
            return;
        }

        card.sininho().setText("🔔");
        classes.add(severidade == null ? "sininho-aceso" : "sininho-disparado");
        card.sininho().setTooltip(new javafx.scene.control.Tooltip(
                "Alarme desta estação: " + faixaLegivel(alarme, g.unidade())));
    }

    private static String faixaLegivel(com.example.demo.services.AlarmesDaEstacao.AlarmeLocal alarme,
                                       String unidade) {
        StringBuilder texto = new StringBuilder();
        if (alarme.minimo() != null) {
            texto.append("abaixo de ").append(alarme.minimo()).append(' ').append(unidade);
        }
        if (alarme.maximo() != null) {
            if (texto.length() > 0) {
                texto.append(" ou ");
            }
            texto.append("acima de ").append(alarme.maximo()).append(' ').append(unidade);
        }
        return texto.toString();
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
        return (documentoAtual == null ? List.<CardsDaUnidade.Card>of() : documentoAtual.cards()).stream()
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
        card.bruto().setText(g.enderecoDb() + "  " + (Double.isFinite(g.bruto()) ? Math.round(g.bruto()) : "--"));

        if (card.visual() instanceof TermometroView termometro) {
            termometro.setValor(g.temValor() ? g.valor() : null);
        } else if (card.visual() instanceof TanqueView tanque) {
            atualizarTanque(tanque, g);
        }

        // ⚠️ A severidade sai do MOTOR, e nao deste ciclo. Grandeza sem valor nao desmente alarme
        // nenhum (RN-099): condicionar o destaque a temValor() apagava o aviso por FALTA DE DADO,
        // desfazendo na tela exatamente o que o motor preserva.
        var severidade = alarmesLocais.severidadeDe(g);
        aplicarAlarme(card, severidade);
        atualizarSininho(card, g, severidade);
    }

    /**
     * O destaque do alarme local — passo 3 de {@code specs/SDD/negocio/requisitos/alarmes.md}.
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
        Double alturaM = p == null || !Double.isFinite(g.bruto()) ? null : ConversaoTanque.alturaDoLiquidoM(g.bruto(), p);
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

    /**
     * A engrenagem abre a calibração do card — a mesma janela que a tela de Cards abre.
     *
     * <p>⚠️ <b>Exige {@code ADMIN} ou {@code SUPORTE}</b> desde 2026-09-10
     * ({@code configuracao-da-estacao.md §5}). A calibração decide como o número bruto do CLP vira
     * a leitura que é gravada por cinco anos: errar aqui produz um <b>número plausível e errado</b>,
     * que é o defeito mais caro desta base.
     *
     * <p>Contrasta com o sininho, ao lado, que não pede login — ele só decide quando esta máquina
     * apita, e não altera dado nenhum (RN-109).
     *
     * <p>⚠️ <b>Custo aceito:</b> a calibração é medida em campo, com a unidade parada, e agora exige
     * rede ao menos uma vez. Está registrado na spec como a consequência mais provável de doer.
     */
    private void abrirCalibracaoDoCard(LeituraDeCards.Grandeza g, Button dono) {
        if (!ConfiguracaoLoginController.exigirSessao(dono.getScene().getWindow(), applicationContext)) {
            return;
        }
        CardsDaUnidade.Card card = cardDoDocumento(g.dispositivoId());
        if (card == null || documentoAtual == null) {
            return;
        }
        switch (g.tipo()) {
            case PESO, TORQUE -> CalibracaoCardDialog.abrir(dono.getScene().getWindow(),
                    applicationContext, documentoAtual, card, g.bruto());
            // Os demais tipos editam os parametros do documento; abrir ja no card clicado.
            default -> CardsConfigController.abrir(dono.getScene().getWindow(), applicationContext,
                    card.dispositivoId());
        }
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
                                   Label valor, Label estado, Button engrenagem, Label bruto, Label alarme, Button sininho) {
        styleValueLabel(valor);
        styleGearButton(engrenagem);
        boolean instrument = visual != null;
        if (visual == null) {
            var icon = new javafx.scene.shape.SVGPath();
            icon.setContent(iconSvg);
            icon.setFill(javafx.scene.paint.Color.web("#5a667a"));
            visual = icon;
        }
        return new IndicatorCardView(titulo, unidade, visual, instrument, valor, bruto, alarme, estado, sininho, engrenagem);
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
     * Atualiza os indicadores configurados e preenche as medições disponíveis a cada segundo.
     *
     * <p>⚠️ <b>A visibilidade nao filtra mais aqui.</b> Ela controla PUBLICACAO, nao exibicao
     * (RN-037), e quem a aplica e {@code LeituraDeCards.paraPublicar}. Filtrar tambem na tela
     * escondia da estacao um card que ela esta lendo e gravando — e o operador nao teria como
     * saber que ele existe.
     */
    void updateData() {
        AppSettings settings = settingsService.loadSettings();
        documentoAtual = telemetriaRealtimeService.cardsAtuais(settings).orElse(null);
        List<LeituraDeCards.Grandeza> grandezas = CardsDoMonitoramento.montar(documentoAtual,
                sondaService.grandezas(documentoAtual), plcConnectionService.isConnected());
        String mensagem = null;
        if (settings.getUnidadeId() == null) {
            mensagem = "Selecione a unidade em Configurações para carregar os cards.";
        } else if (telemetriaRealtimeService.unidadeIndisponivel(settings)) {
            mensagem = "A unidade configurada nesta estação não está disponível no servidor para este usuário. Selecione outra em Configurações.";
        } else if (documentoAtual == null) {
            mensagem = "A configuração dos cards ainda não está disponível nesta estação. Verifique a conexão e o acesso ao servidor em Configurações.";
        } else if (documentoAtual.cards().isEmpty()) {
            mensagem = "Esta unidade ainda não tem cards configurados. Abra Cards para adicionar ou copiar de outra unidade.";
        } else if (grandezas.isEmpty()) {
            mensagem = "Todos os cards desta unidade estão desativados. Abra Cards para ativar os que deseja monitorar.";
        } else if (!plcConnectionService.isConnected()) {
            String erro = plcConnectionService.getUltimoErro();
            mensagem = erro == null || erro.isBlank()
                    ? "PLC desconectado. Clique em Conectar para iniciar a leitura."
                    : "Leitura interrompida: " + erro;
        } else if (plcConnectionService.getUltimaLeitura() != null) {
            mensagem = "Última leitura do PLC: " + java.time.format.DateTimeFormatter.ofPattern("HH:mm:ss")
                    .withZone(java.time.ZoneId.systemDefault()).format(plcConnectionService.getUltimaLeitura())
                    + " · Valores brutos do DB no rodapé de cada card.";
        }
        estadoMonitoramento.setText(mensagem);
        estadoMonitoramento.setVisible(mensagem != null);
        estadoMonitoramento.setManaged(mensagem != null);
        sincronizarCards(grandezas);
        for (LeituraDeCards.Grandeza g : grandezas) {
            CardDinamico card = cardsDinamicos.get(chave(g));
            if (card != null) {
                atualizarCard(card, g);
            }
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

package com.geopetro.desktop.cards.calibracao;

import com.geopetro.desktop.calculos.ChaveHidraulicaConfig;
import com.geopetro.desktop.calculos.HydraulicTorqueCalculator;
import com.geopetro.desktop.calculos.TipoMovimento;
import com.geopetro.desktop.cards.CardsDaUnidade.Card;
import com.geopetro.desktop.cards.CardsDaUnidade;
import javafx.concurrent.Task;
import javafx.collections.FXCollections;
import javafx.fxml.FXML;
import javafx.scene.control.Button;
import javafx.scene.control.ComboBox;
import javafx.scene.control.Label;
import javafx.scene.control.Slider;
import javafx.scene.control.TextField;
import javafx.stage.Stage;
import javafx.util.StringConverter;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Scope;
import org.springframework.stereotype.Controller;

@Controller
@Scope("prototype")
public class ChaveSettingsController {

    private static final Logger logger = LoggerFactory.getLogger(ChaveSettingsController.class);

    @Autowired private CalibracaoDeCards calibracoes;
    @Autowired private CalibracaoCardService gravacao;

    @FXML private Label lblTitulo;
    @FXML private TextField txtRangeBar;
    @FXML private Slider sliderSensibilidade;
    @FXML private Label lblSensibilidade;
    @FXML private TextField txtDiametroPistaoIn;
    @FXML private TextField txtDiametroHasteIn;
    @FXML private TextField txtBracoFt;
    @FXML private ComboBox<TipoMovimento> cmbTipoMovimento;
    @FXML private Label lblAreaHidraulica;
    @FXML private Label lblValidacao;
    @FXML private Label lblStatus;
    @FXML private Button btnSalvar;

    private CardsDaUnidade documento;
    private Card card;

    @FXML
    public void initialize() {
        sliderSensibilidade.valueProperty().addListener((o, a, b) ->
                lblSensibilidade.setText(String.format("%.2f", b.doubleValue())));

        cmbTipoMovimento.setItems(FXCollections.observableArrayList(TipoMovimento.values()));
        cmbTipoMovimento.setConverter(new StringConverter<>() {
            @Override
            public String toString(TipoMovimento tipo) {
                if (tipo == null) return "";
                return tipo == TipoMovimento.AVANCO ? "Avanço" : "Recuo";
            }

            @Override
            public TipoMovimento fromString(String value) {
                return "Recuo".equals(value) ? TipoMovimento.RECUO : TipoMovimento.AVANCO;
            }
        });

        txtDiametroPistaoIn.textProperty().addListener((o, a, b) -> atualizarArea());
        txtDiametroHasteIn.textProperty().addListener((o, a, b) -> atualizarArea());
        cmbTipoMovimento.valueProperty().addListener((o, a, b) -> atualizarArea());
        ocultarValidacao();
    }

    public void configurar(CardsDaUnidade documento, Card card) {
        this.documento = documento;
        this.card = card;
        lblTitulo.setText("Calibração — " + card.nome() + " (" + card.dispositivoId() + ")");

        var calibracao = calibracoes.para(card.dispositivoId());
        Double range = card.parametros() == null ? null : card.parametros().rangeSensorBar();
        txtRangeBar.setText(range == null ? "" : String.valueOf(range));
        sliderSensibilidade.setValue(calibracao.sensibilidade());
        lblSensibilidade.setText(String.format("%.2f", calibracao.sensibilidade()));

        ChaveHidraulicaConfig cfg = calibracao.chave() == null
                ? new ChaveHidraulicaConfig() : calibracao.chave();

        txtDiametroPistaoIn.setText(formatConfiguredValue(cfg.getDiametroPistaoIn()));
        txtDiametroHasteIn.setText(cfg.getDiametroHasteIn() >= 0
                ? String.valueOf(cfg.getDiametroHasteIn()) : "");
        txtBracoFt.setText(formatConfiguredValue(cfg.getBracoAlavancaFt()));
        cmbTipoMovimento.setValue(cfg.getTipoMovimento());
        atualizarArea();
    }

    @FXML
    public void onSalvar() {
        if (card == null || documento == null) return;
        try {
            double rangeBar = parseNumber(txtRangeBar.getText());
            double diametroPistao = parseNumber(txtDiametroPistaoIn.getText());
            double diametroHaste = parseNumber(txtDiametroHasteIn.getText());
            double bracoFt = parseNumber(txtBracoFt.getText());
            TipoMovimento tipoMovimento = cmbTipoMovimento.getValue();

            String erro = validar(rangeBar, diametroPistao, diametroHaste, bracoFt, tipoMovimento);
            if (erro != null) {
                mostrarValidacao(erro);
                return;
            }

            ChaveHidraulicaConfig cfg = new ChaveHidraulicaConfig();
            cfg.setDiametroPistaoIn(diametroPistao);
            cfg.setDiametroHasteIn(diametroHaste);
            cfg.setBracoAlavancaFt(bracoFt);
            cfg.setTipoMovimento(tipoMovimento);

            var calibracao = calibracoes.para(card.dispositivoId())
                    .comSensibilidade(sliderSensibilidade.getValue()).comChave(cfg);
            btnSalvar.setDisable(true);
            lblStatus.setText("Salvando...");
            ocultarValidacao();
            Task<CardsDaUnidade> tarefa = new Task<>() {
                @Override protected CardsDaUnidade call() {
                    return gravacao.salvar(documento, card, rangeBar, calibracao);
                }
            };
            tarefa.setOnSucceeded(e -> {
                logger.info("Calibracao de torque salva para o card {}", card.dispositivoId());
                fechar();
            });
            tarefa.setOnFailed(e -> {
                btnSalvar.setDisable(false);
                lblStatus.setText("");
                mostrarValidacao(tarefa.getException().getMessage());
            });
            Thread worker = new Thread(tarefa, "calibracao-torque");
            worker.setDaemon(true);
            worker.start();
        } catch (NumberFormatException e) {
            mostrarValidacao("Preencha os campos numéricos usando valores válidos.");
        }
    }

    @FXML
    public void onCancelar() {
        fechar();
    }

    private String validar(double rangeBar, double pistao, double haste, double braco,
                           TipoMovimento movimento) {
        if (!Double.isFinite(rangeBar) || rangeBar <= 0) return "O limite do sensor deve ser maior que zero.";
        if (!Double.isFinite(pistao) || pistao <= 0) return "O diâmetro do pistão deve ser maior que zero.";
        if (!Double.isFinite(haste) || haste < 0) return "O diâmetro da haste deve ser maior ou igual a zero.";
        if (haste >= pistao) return "O diâmetro da haste deve ser menor que o diâmetro do pistão.";
        if (!Double.isFinite(braco) || braco <= 0) return "O comprimento do braço deve ser maior que zero.";
        if (movimento == null) return "Selecione o movimento utilizado no aperto.";
        return null;
    }

    private void atualizarArea() {
        try {
            double pistao = parseNumber(txtDiametroPistaoIn.getText());
            double haste = parseNumber(txtDiametroHasteIn.getText());
            TipoMovimento movimento = cmbTipoMovimento.getValue();
            if (pistao <= 0 || haste < 0 || haste >= pistao || movimento == null) {
                lblAreaHidraulica.setText("—");
                return;
            }

            double area = HydraulicTorqueCalculator.calculateHydraulicArea(pistao, haste, movimento);
            lblAreaHidraulica.setText(String.format("%.4f in²", area));
        } catch (IllegalArgumentException e) {
            lblAreaHidraulica.setText("—");
        }
    }

    private String formatConfiguredValue(double value) {
        return value > 0 ? String.valueOf(value) : "";
    }

    private double parseNumber(String text) {
        if (text == null || text.isBlank()) return 0.0;
        return Double.parseDouble(text.trim().replace(',', '.'));
    }

    private void mostrarValidacao(String mensagem) {
        lblValidacao.setText(mensagem);
        lblValidacao.setManaged(true);
        lblValidacao.setVisible(true);
    }

    private void ocultarValidacao() {
        lblValidacao.setManaged(false);
        lblValidacao.setVisible(false);
    }

    private void fechar() {
        Stage stage = (Stage) txtDiametroPistaoIn.getScene().getWindow();
        stage.close();
    }
}

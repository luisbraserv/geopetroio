package com.example.demo.controllers;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Scope;
import org.springframework.stereotype.Controller;

import com.example.demo.models.CardsDaUnidade;
import com.example.demo.models.CardsDaUnidade.Card;
import com.example.demo.models.PesoColunaCalculo;
import com.example.demo.models.PesoColunaConfig;
import com.example.demo.models.SensorPressaoConfig;
import com.example.demo.services.CalibracaoCardService;
import com.example.demo.services.CalibracaoDeCards;
import com.example.demo.services.ConversaoPressao;
import com.example.demo.services.PesoColunaCalculator;

import javafx.concurrent.Task;
import javafx.fxml.FXML;
import javafx.scene.control.Alert;
import javafx.scene.control.Button;
import javafx.scene.control.Label;
import javafx.scene.control.Slider;
import javafx.scene.control.TextField;
import javafx.stage.Stage;

/** Calibracao do peso ligada ao identificador do card, nunca a um slot fixo. */
@Controller
@Scope("prototype")
public class PesoColunaSettingsController {

    private static final Logger logger = LoggerFactory.getLogger(PesoColunaSettingsController.class);

    @Autowired private CalibracaoDeCards calibracoes;
    @Autowired private CalibracaoCardService gravacao;

    @FXML private TextField txtRangeBar;
    @FXML private TextField txtPressaoZero;
    @FXML private TextField txtAreaEfetiva;
    @FXML private TextField txtBracoSensor;
    @FXML private TextField txtDiametroTambor;
    @FXML private TextField txtDiametroCabo;
    @FXML private TextField txtNumeroLinhas;
    @FXML private TextField txtPesoCatarina;
    @FXML private Slider sliderSensibilidade;
    @FXML private Slider sliderFatorCalibracao;
    @FXML private Label lblTitulo;
    @FXML private Label lblSensibilidade;
    @FXML private Label lblFatorCalibracao;
    @FXML private Label lblDiagnostico;
    @FXML private Label lblStatus;
    @FXML private Button btnSalvar;

    private CardsDaUnidade documento;
    private Card card;
    private double bruto = Double.NaN;

    @FXML
    public void initialize() {
        sliderSensibilidade.valueProperty().addListener((obs, anterior, novo) -> {
            lblSensibilidade.setText(String.format("%.3f", novo.doubleValue()));
            atualizarDiagnostico();
        });
        sliderFatorCalibracao.valueProperty().addListener((obs, anterior, novo) -> {
            lblFatorCalibracao.setText(String.format("%.3f", novo.doubleValue()));
            atualizarDiagnostico();
        });
        for (TextField campo : new TextField[] { txtRangeBar, txtPressaoZero, txtAreaEfetiva,
                txtBracoSensor, txtDiametroTambor, txtDiametroCabo, txtNumeroLinhas, txtPesoCatarina }) {
            campo.textProperty().addListener((obs, anterior, novo) -> atualizarDiagnostico());
        }
    }

    public void configurar(CardsDaUnidade documento, Card card, double bruto) {
        this.documento = documento;
        this.card = card;
        this.bruto = bruto;
        lblTitulo.setText("Peso da coluna — " + card.nome() + " (" + card.dispositivoId() + ")");
        var calibracao = calibracoes.para(card.dispositivoId());
        PesoColunaConfig cfg = calibracao.peso() == null ? new PesoColunaConfig() : calibracao.peso();
        Double range = card.parametros() == null ? null : card.parametros().rangeSensorBar();
        txtRangeBar.setText(range == null ? "" : formatar(range));
        txtPressaoZero.setText(formatar(cfg.getPressaoZeroPsi()));
        txtAreaEfetiva.setText(formatar(cfg.getAreaEfetivaSensorPol2()));
        txtBracoSensor.setText(formatar(cfg.getBracoSensorPol()));
        txtDiametroTambor.setText(formatar(cfg.getDiametroTamborPol()));
        txtDiametroCabo.setText(formatar(cfg.getDiametroCaboPol()));
        txtNumeroLinhas.setText(String.valueOf(cfg.getNumeroLinhas()));
        txtPesoCatarina.setText(formatar(cfg.getPesoCatarinaLbf()));
        sliderSensibilidade.setValue(calibracao.sensibilidade());
        sliderFatorCalibracao.setValue(cfg.getFatorCalibracao());
        atualizarDiagnostico();
    }

    private void atualizarDiagnostico() {
        if (card == null) return;
        PesoColunaConfig cfg = lerFormulario();
        if (cfg == null) {
            lblDiagnostico.setText("Preencha os campos com números válidos.");
            return;
        }
        if (!cfg.isConfigurado()) {
            lblDiagnostico.setText("Geometria incompleta. Área, braço, raio efetivo e número de linhas precisam ser maiores que zero.");
            return;
        }
        if (!Double.isFinite(bruto)) {
            lblDiagnostico.setText("Sem leitura atual do CLP. A calibração pode ser salva mesmo assim.");
            return;
        }
        double range;
        try {
            range = numero(txtRangeBar);
        } catch (NumberFormatException e) {
            lblDiagnostico.setText("Informe um range do sensor válido.");
            return;
        }
        if (!Double.isFinite(range) || range <= 0) {
            lblDiagnostico.setText("Informe o range do sensor em bar para calcular a leitura atual.");
            return;
        }
        SensorPressaoConfig sensor = new SensorPressaoConfig();
        sensor.setRangeBar(range);
        sensor.setSensibilidade(sliderSensibilidade.getValue());
        double pressaoAtual = ConversaoPressao.axParaPsi((short) Math.round(bruto), sensor);
        PesoColunaCalculo c = PesoColunaCalculator.calcular(pressaoAtual, cfg);
        lblDiagnostico.setText(String.format(
                "Pressão:            %,.1f psi%n"
                        + "Pressão corrigida:  %,.1f psi%n"
                        + "Força do sensor:    %,.0f lbf%n"
                        + "Torque do sargento: %,.0f lbf·pol%n"
                        + "Raio efetivo:       %,.2f pol%n"
                        + "Tração da deadline: %,.0f lbf%n"
                        + "Linhas:             %d%n"
                        + "Carga suspensa:     %,.0f lbf%n"
                        + "Peso da Catarina:   %,.0f lbf%n%n"
                        + "Peso da coluna:     %,.0f lbf  ·  %,.0f kgf  ·  %,.2f tf",
                c.pressaoPsi(), c.pressaoCorrigidaPsi(), c.forcaSensorLbf(), c.torqueSargentoLbPol(),
                c.raioEfetivoPol(), c.tracaoDeadlineLbf(), cfg.getNumeroLinhas(),
                c.cargaSuspensaLbf(), c.pesoCatarinaLbf(),
                c.pesoColunaLbf(), c.pesoColunaKgf(), c.pesoColunaTf()));
    }

    private PesoColunaConfig lerFormulario() {
        try {
            PesoColunaConfig cfg = new PesoColunaConfig();
            cfg.setPressaoZeroPsi(numero(txtPressaoZero));
            cfg.setAreaEfetivaSensorPol2(numero(txtAreaEfetiva));
            cfg.setBracoSensorPol(numero(txtBracoSensor));
            cfg.setDiametroTamborPol(numero(txtDiametroTambor));
            cfg.setDiametroCaboPol(numero(txtDiametroCabo));
            String linhas = txtNumeroLinhas.getText();
            cfg.setNumeroLinhas(linhas == null || linhas.isBlank() ? 0 : Integer.parseInt(linhas.trim()));
            cfg.setPesoCatarinaLbf(numero(txtPesoCatarina));
            cfg.setFatorCalibracao(sliderFatorCalibracao.getValue());
            return cfg;
        } catch (NumberFormatException e) {
            return null;
        }
    }

    @FXML
    public void onSalvar() {
        if (card == null || documento == null) return;
        PesoColunaConfig cfg = lerFormulario();
        if (cfg == null) {
            alerta("Valores inválidos", "Preencha todos os campos com números válidos.");
            return;
        }
        if (!Double.isFinite(cfg.getPressaoZeroPsi()) || !Double.isFinite(cfg.getAreaEfetivaSensorPol2())
                || !Double.isFinite(cfg.getBracoSensorPol()) || !Double.isFinite(cfg.getDiametroTamborPol())
                || !Double.isFinite(cfg.getDiametroCaboPol()) || !Double.isFinite(cfg.getPesoCatarinaLbf())
                || !cfg.isConfigurado()) {
            alerta("Geometria incompleta", "Informe área, braço, diâmetro do tambor e número de linhas válidos.");
            return;
        }
        double rangeBar;
        try {
            rangeBar = numero(txtRangeBar);
        } catch (NumberFormatException e) {
            alerta("Range inválido", "Informe o range do sensor em bar.");
            return;
        }
        if (!Double.isFinite(rangeBar) || rangeBar <= 0) {
            alerta("Range inválido", "O range do sensor deve ser maior que zero.");
            return;
        }
        var calibracao = calibracoes.para(card.dispositivoId())
                .comSensibilidade(sliderSensibilidade.getValue()).comPeso(cfg);
        btnSalvar.setDisable(true);
        lblStatus.setText("Salvando...");
        Task<CardsDaUnidade> tarefa = new Task<>() {
            @Override protected CardsDaUnidade call() {
                return gravacao.salvar(documento, card, rangeBar, calibracao);
            }
        };
        tarefa.setOnSucceeded(e -> {
            logger.info("Calibracao de peso salva para o card {}", card.dispositivoId());
            fechar();
        });
        tarefa.setOnFailed(e -> {
            btnSalvar.setDisable(false);
            lblStatus.setText(tarefa.getException().getMessage());
        });
        Thread worker = new Thread(tarefa, "calibracao-peso");
        worker.setDaemon(true);
        worker.start();
    }

    @FXML public void onCancelar() { fechar(); }

    private static double numero(TextField campo) {
        String texto = campo.getText();
        return texto == null || texto.isBlank() ? 0 : Double.parseDouble(texto.trim().replace(',', '.'));
    }

    private static String formatar(double valor) {
        return valor == Math.rint(valor) ? String.valueOf((long) valor) : String.valueOf(valor);
    }

    private void alerta(String titulo, String mensagem) {
        Alert alert = new Alert(Alert.AlertType.WARNING);
        alert.setTitle(titulo);
        alert.setHeaderText(null);
        alert.setContentText(mensagem);
        alert.initOwner(txtAreaEfetiva.getScene().getWindow());
        alert.showAndWait();
    }

    private void fechar() {
        ((Stage) txtAreaEfetiva.getScene().getWindow()).close();
    }
}

package com.example.demo.controllers;

import com.example.demo.models.PesoColunaCalculo;
import com.example.demo.models.PesoColunaConfig;
import com.example.demo.services.PesoColunaCalculator;
import com.example.demo.services.SettingsService;
import com.example.demo.services.SondaService;
import javafx.fxml.FXML;
import javafx.scene.control.Alert;
import javafx.scene.control.Label;
import javafx.scene.control.Slider;
import javafx.scene.control.TextField;
import javafx.stage.Stage;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Controller;

@Controller
public class PesoColunaSettingsController {

    private static final Logger logger = LoggerFactory.getLogger(PesoColunaSettingsController.class);

    @Autowired private SettingsService settingsService;
    @Autowired private SondaService sondaService;

    @FXML private TextField txtPressaoZero;
    @FXML private TextField txtAreaEfetiva;
    @FXML private TextField txtBracoSensor;
    @FXML private TextField txtDiametroTambor;
    @FXML private TextField txtDiametroCabo;
    @FXML private TextField txtNumeroLinhas;
    @FXML private TextField txtPesoCatarina;
    @FXML private Slider    sliderFatorCalibracao;
    @FXML private Label     lblFatorCalibracao;
    @FXML private Label     lblDiagnostico;

    @FXML
    public void initialize() {
        sliderFatorCalibracao.valueProperty().addListener((obs, anterior, novo) -> {
            lblFatorCalibracao.setText(String.format("%.3f", novo.doubleValue()));
            atualizarDiagnostico();
        });

        PesoColunaConfig cfg = settingsService.getPesoColuna();
        txtPressaoZero.setText(formatar(cfg.getPressaoZeroPsi()));
        txtAreaEfetiva.setText(formatar(cfg.getAreaEfetivaSensorPol2()));
        txtBracoSensor.setText(formatar(cfg.getBracoSensorPol()));
        txtDiametroTambor.setText(formatar(cfg.getDiametroTamborPol()));
        txtDiametroCabo.setText(formatar(cfg.getDiametroCaboPol()));
        txtNumeroLinhas.setText(String.valueOf(cfg.getNumeroLinhas()));
        txtPesoCatarina.setText(formatar(cfg.getPesoCatarinaLbf()));
        sliderFatorCalibracao.setValue(cfg.getFatorCalibracao());
        lblFatorCalibracao.setText(String.format("%.3f", cfg.getFatorCalibracao()));

        // Recalcula enquanto o usuario digita: em campo, o ajuste e feito comparando o resultado
        // com uma carga conhecida, e esperar o "Salvar" para ver o efeito tornaria isso lento.
        for (TextField campo : new TextField[] {
                txtPressaoZero, txtAreaEfetiva, txtBracoSensor,
                txtDiametroTambor, txtDiametroCabo, txtNumeroLinhas, txtPesoCatarina }) {
            campo.textProperty().addListener((obs, anterior, novo) -> atualizarDiagnostico());
        }

        atualizarDiagnostico();
    }

    /**
     * Mostra a cadeia inteira com a leitura atual do CLP.
     *
     * <p>Durante a calibracao o que importa nao e o numero final, e sim <em>onde</em> ele se afasta
     * da carga conhecida: uma forca do sensor errada aponta a area, uma carga suspensa errada aponta
     * o numero de linhas.
     */
    private void atualizarDiagnostico() {
        PesoColunaConfig cfg = lerFormulario();
        if (cfg == null) {
            lblDiagnostico.setText("Preencha os campos com números válidos.");
            return;
        }

        double pressaoAtual = sondaService.getPressao01() == null ? 0.0 : sondaService.getPressao01();
        PesoColunaCalculo c = PesoColunaCalculator.calcular(pressaoAtual, cfg);

        if (!c.configurado()) {
            lblDiagnostico.setText(
                    "Geometria incompleta. Área, braço, raio efetivo e número de linhas precisam ser maiores que zero.");
            return;
        }

        lblDiagnostico.setText(String.format(
                "Pressão:            %,.1f psi%n"
                        + "Pressão corrigida:  %,.1f psi%n"
                        + "Força do sensor:    %,.0f lbf%n"
                        + "Torque do sargento: %,.0f lbf·pol%n"
                        + "Raio efetivo:       %,.2f pol%n"
                        + "Tração da deadline: %,.0f lbf%n"
                        + "Linhas:             %d%n"
                        + "Carga suspensa:     %,.0f lbf%n"
                        + "Peso da Catarina:   %,.0f lbf%n"
                        + "%n"
                        + "Peso da coluna:     %,.0f lbf  ·  %,.0f kgf  ·  %,.2f tf",
                c.pressaoPsi(), c.pressaoCorrigidaPsi(), c.forcaSensorLbf(), c.torqueSargentoLbPol(),
                c.raioEfetivoPol(), c.tracaoDeadlineLbf(), cfg.getNumeroLinhas(),
                c.cargaSuspensaLbf(), c.pesoCatarinaLbf(),
                c.pesoColunaLbf(), c.pesoColunaKgf(), c.pesoColunaTf()));
    }

    /** @return a configuração digitada, ou {@code null} se algum campo não for numérico. */
    private PesoColunaConfig lerFormulario() {
        try {
            PesoColunaConfig cfg = new PesoColunaConfig();
            cfg.setPressaoZeroPsi(numero(txtPressaoZero));
            cfg.setAreaEfetivaSensorPol2(numero(txtAreaEfetiva));
            cfg.setBracoSensorPol(numero(txtBracoSensor));
            cfg.setDiametroTamborPol(numero(txtDiametroTambor));
            cfg.setDiametroCaboPol(numero(txtDiametroCabo));
            cfg.setNumeroLinhas((int) Math.round(numero(txtNumeroLinhas)));
            cfg.setPesoCatarinaLbf(numero(txtPesoCatarina));
            cfg.setFatorCalibracao(sliderFatorCalibracao.getValue());
            return cfg;
        } catch (NumberFormatException e) {
            return null;
        }
    }

    @FXML
    public void onSalvar() {
        PesoColunaConfig cfg = lerFormulario();
        if (cfg == null) {
            alerta("Valores inválidos", "Preencha todos os campos com números válidos.");
            return;
        }

        if (cfg.getAreaEfetivaSensorPol2() <= 0 || cfg.getBracoSensorPol() <= 0) {
            alerta("Geometria incompleta", "Área efetiva e braço do sensor precisam ser maiores que zero.");
            return;
        }
        if (cfg.raioEfetivoPol() <= 0) {
            // Raio zero seria divisão por zero na tração da deadline.
            alerta("Geometria incompleta", "Informe o diâmetro do tambor — o raio efetivo não pode ser zero.");
            return;
        }
        if (cfg.getNumeroLinhas() <= 0) {
            alerta("Geometria incompleta", "Informe quantas linhas sustentam a Catarina (ex.: 8).");
            return;
        }

        settingsService.updatePesoColuna(cfg);
        logger.info("PesoColuna salvo: zero={} area={} braco={} tambor={} cabo={} linhas={} catarina={} fator={}",
                cfg.getPressaoZeroPsi(), cfg.getAreaEfetivaSensorPol2(), cfg.getBracoSensorPol(),
                cfg.getDiametroTamborPol(), cfg.getDiametroCaboPol(), cfg.getNumeroLinhas(),
                cfg.getPesoCatarinaLbf(), cfg.getFatorCalibracao());
        fechar();
    }

    @FXML
    public void onCancelar() {
        fechar();
    }

    private double numero(TextField campo) {
        String texto = campo.getText();
        if (texto == null || texto.isBlank()) return 0.0;
        // Aceita vírgula decimal, como o resto do aplicativo.
        return Double.parseDouble(texto.trim().replace(',', '.'));
    }

    private String formatar(double valor) {
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
        Stage stage = (Stage) txtAreaEfetiva.getScene().getWindow();
        stage.close();
    }
}

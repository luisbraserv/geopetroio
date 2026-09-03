package com.example.braservhorusdesktop.controller;

import java.net.URL;
import java.util.ResourceBundle;

import com.example.braservhorusdesktop.model.UnidadePressao;
import com.example.braservhorusdesktop.service.ConfiguracaoService;

import javafx.event.ActionEvent;
import javafx.fxml.FXML;
import javafx.fxml.Initializable;
import javafx.collections.FXCollections;
import javafx.scene.control.Alert;
import javafx.scene.control.Alert.AlertType;
import javafx.scene.control.ComboBox;
import javafx.scene.control.Label;
import javafx.scene.control.Slider;
import javafx.scene.control.TextField;
import javafx.stage.Stage;

public class ConfiguracaoController implements Initializable {

    @FXML
    private TextField ipPlcField;

    @FXML
    private TextField constanteBombaField;

    @FXML
    private TextField rangePressaoBarField;

    @FXML
    private ComboBox<UnidadePressao> unidadePressaoCombo;

    @FXML
    private Slider sensibilidadePressaoSlider;

    @FXML
    private Label sensibilidadePressaoLabel;

    private ConfiguracaoService configuracaoService;

    public ConfiguracaoController() {
    }

    @Override
    public void initialize(URL location, ResourceBundle resources) {
        if (this.configuracaoService == null) {
            this.configuracaoService = new ConfiguracaoService();
        }
        unidadePressaoCombo.setItems(FXCollections.observableArrayList(UnidadePressao.values()));
        sensibilidadePressaoSlider.valueProperty().addListener((obs, oldValue, newValue) ->
                atualizarLabelSensibilidade(newValue.doubleValue()));
        carregarValores();
    }

    public void setConfiguracaoService(ConfiguracaoService configuracaoService) {
        if (configuracaoService == null) {
            return;
        }

        this.configuracaoService = configuracaoService;
        carregarValores();
    }

    private void carregarValores() {
        var config = configuracaoService.getConfiguracao();
        if (config != null) {
            ipPlcField.setText(config.getIpPlc());
            constanteBombaField.setText(String.valueOf(config.getConstante()));
            rangePressaoBarField.setText(String.valueOf(config.getRangePressaoBar()));
            sensibilidadePressaoSlider.setValue(config.getSensibilidadePressao());
            atualizarLabelSensibilidade(config.getSensibilidadePressao());
            unidadePressaoCombo.setValue(
                    config.getUnidadePressao() == null ? UnidadePressao.PSI : config.getUnidadePressao());
        }
    }

    @FXML
    public void onSalvar(ActionEvent event) {
        try {
            String ipPlc = ipPlcField.getText() == null ? "" : ipPlcField.getText().trim();
            double constante = converterNumero(constanteBombaField.getText(), "Constante da bomba");
            double rangePressaoBar = converterNumero(rangePressaoBarField.getText(), "Range de pressão");
            double sensibilidadePressao = sensibilidadePressaoSlider.getValue();
            UnidadePressao unidadePressao = unidadePressaoCombo.getValue() == null
                    ? UnidadePressao.PSI
                    : unidadePressaoCombo.getValue();

            if (ipPlc.isBlank()) {
                exibirAlerta(AlertType.WARNING, "Campo obrigatório", "Informe o IP do PLC.");
                return;
            }

            if (!Double.isFinite(constante) || !Double.isFinite(rangePressaoBar)
                    || constante < 0 || rangePressaoBar <= 0) {
                exibirAlerta(
                        AlertType.WARNING,
                        "Valores inválidos",
                        "A constante deve ser maior ou igual a zero e o range de pressão deve ser maior que zero."
                );
                return;
            }

            configuracaoService.atualizarConfiguracao(
                    ipPlc,
                    constante,
                    rangePressaoBar,
                    sensibilidadePressao,
                    unidadePressao
            );
            System.out.println("[CONFIG] Configuracao salva: IP=" + ipPlc
                    + ", Constante=" + constante
                    + ", RangePressaoBar=" + rangePressaoBar
                    + ", SensibilidadePressao=" + sensibilidadePressao
                    + ", UnidadePressao=" + unidadePressao);

            exibirAlerta(
                    AlertType.INFORMATION,
                    "Configurações salvas",
                    "As configurações foram salvas e já estão sendo utilizadas pelo aplicativo."
            );

            Stage stage = (Stage) constanteBombaField.getScene().getWindow();
            stage.close();

        } catch (NumberFormatException e) {
            exibirAlerta(AlertType.WARNING, "Valor inválido", e.getMessage());
        } catch (RuntimeException e) {
            System.err.println("[CONFIG] Erro ao salvar: " + e.getMessage());
            exibirAlerta(
                    AlertType.ERROR,
                    "Erro ao salvar",
                    "Não foi possível gravar as configurações.\n\nDetalhes: " + e.getMessage()
            );
        }
    }

    static double converterNumero(String texto, String nomeCampo) {
        if (texto == null || texto.isBlank()) {
            throw new NumberFormatException(nomeCampo + " deve ser preenchida.");
        }

        String numero = texto.trim().replace(" ", "");
        int ultimaVirgula = numero.lastIndexOf(',');
        int ultimoPonto = numero.lastIndexOf('.');

        if (ultimaVirgula >= 0 && ultimoPonto >= 0) {
            if (ultimaVirgula > ultimoPonto) {
                numero = numero.replace(".", "").replace(',', '.');
            } else {
                numero = numero.replace(",", "");
            }
        } else {
            numero = numero.replace(',', '.');
        }

        try {
            return Double.parseDouble(numero);
        } catch (NumberFormatException e) {
            throw new NumberFormatException(
                    nomeCampo + " deve conter um número válido. Exemplos: 0,0235 ou 0.0235."
            );
        }
    }

    private void atualizarLabelSensibilidade(double valor) {
        sensibilidadePressaoLabel.setText(String.format("%.2f", valor));
    }

    @FXML
    public void onCancelar(ActionEvent event) {
        Stage stage = (Stage) constanteBombaField.getScene().getWindow();
        stage.close();
    }

    private void exibirAlerta(AlertType tipo, String titulo, String mensagem) {
        Alert alert = new Alert(tipo);
        alert.setTitle(titulo);
        alert.setHeaderText(null);
        alert.setContentText(mensagem);
        alert.initOwner(constanteBombaField.getScene().getWindow());
        alert.showAndWait();
    }
}

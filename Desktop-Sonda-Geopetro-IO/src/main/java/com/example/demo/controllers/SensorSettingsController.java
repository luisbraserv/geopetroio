package com.example.demo.controllers;

import com.example.demo.models.SensorPressaoConfig;
import com.example.demo.services.SettingsService;
import javafx.fxml.FXML;
import javafx.scene.control.Label;
import javafx.scene.control.Slider;
import javafx.scene.control.TextField;
import javafx.stage.Stage;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Controller;

@Controller
public class SensorSettingsController {

    private static final Logger logger = LoggerFactory.getLogger(SensorSettingsController.class);

    @Autowired private SettingsService settingsService;

    @FXML private Label     lblTitulo;
    @FXML private TextField txtRangeBar;
    @FXML private Slider    sliderSensibilidade;
    @FXML private Label     lblSensibilidade;

    private int sensorIndex;

    @FXML
    public void initialize() {
        sliderSensibilidade.valueProperty().addListener((obs, oldVal, newVal) ->
                lblSensibilidade.setText(String.format("%.2f", newVal.doubleValue())));
    }

    public void configurarSensor(int index, String nomeSensor) {
        this.sensorIndex = index;
        lblTitulo.setText("Configuração — " + nomeSensor);

        SensorPressaoConfig config = settingsService.getSensorConfig(index);
        txtRangeBar.setText(String.valueOf(config.getRangeBar()));
        sliderSensibilidade.setValue(config.getSensibilidade());
        lblSensibilidade.setText(String.format("%.2f", config.getSensibilidade()));
    }

    @FXML
    public void onSalvar() {
        try {
            double rangeBar = Double.parseDouble(txtRangeBar.getText().trim());
            if (rangeBar <= 0) {
                logger.warn("Range invalido: {}", rangeBar);
                return;
            }
            SensorPressaoConfig cfg = settingsService.getSensorConfig(sensorIndex);
            cfg.setRangeBar(rangeBar);
            cfg.setSensibilidade(sliderSensibilidade.getValue());
            settingsService.updateSensorConfig(sensorIndex, cfg);
            logger.info("Sensor {} salvo: rangeBar={}, sensibilidade={}", sensorIndex, rangeBar, cfg.getSensibilidade());
            fechar();
        } catch (NumberFormatException e) {
            logger.warn("Valor invalido no formulario do sensor {}", sensorIndex);
        }
    }

    @FXML
    public void onCancelar() { fechar(); }

    private void fechar() {
        Stage stage = (Stage) txtRangeBar.getScene().getWindow();
        stage.close();
    }
}

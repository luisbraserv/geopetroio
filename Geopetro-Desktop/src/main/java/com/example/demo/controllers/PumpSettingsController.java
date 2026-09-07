package com.example.demo.controllers;

import com.example.demo.services.SettingsService;
import javafx.fxml.FXML;
import javafx.scene.control.Button;
import javafx.scene.control.TextField;
import javafx.stage.Stage;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Controller;

@Controller
public class PumpSettingsController {

    private static final Logger logger = LoggerFactory.getLogger(PumpSettingsController.class);

    @Autowired
    private SettingsService settingsService;

    @FXML
    private TextField txtPumpConstant;

    @FXML
    private Button btnSave;

    @FXML
    private Button btnCancel;

    @FXML
    public void initialize() {
        txtPumpConstant.setText(String.valueOf(settingsService.getPumpConstant()));
        btnSave.setOnAction(event -> saveSettings());
        btnCancel.setOnAction(event -> closeWindow());
    }

    private void saveSettings() {
        try {
            String value = txtPumpConstant.getText() == null ? "0" : txtPumpConstant.getText().trim().replace(",", ".");
            double pumpConstant = Double.parseDouble(value);
            if (pumpConstant < 0) {
                pumpConstant = 0.0;
            }

            settingsService.updatePumpConstant(pumpConstant);
            closeWindow();
        } catch (NumberFormatException e) {
            logger.warn("Constante da bomba invalida: {}", txtPumpConstant.getText());
            txtPumpConstant.requestFocus();
        }
    }

    private void closeWindow() {
        Stage stage = (Stage) txtPumpConstant.getScene().getWindow();
        stage.close();
    }
}

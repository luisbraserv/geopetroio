package com.example.braservhorusdesktop.controller;

import java.io.File;
import java.io.IOException;

import javafx.event.ActionEvent;
import javafx.fxml.FXML;
import javafx.fxml.FXMLLoader;
import javafx.scene.Parent;
import javafx.scene.Scene;
import javafx.scene.control.TextField;
import javafx.stage.FileChooser;
import javafx.stage.Stage;

public class CarregarCsvController {

    @FXML
    private TextField filePathField;

    private File selectedFile;

    @FXML
    public void onSelectCsv(ActionEvent event) {
        FileChooser chooser = new FileChooser();
        chooser.setTitle("Selecione o arquivo CSV");
        chooser.getExtensionFilters().add(
                new FileChooser.ExtensionFilter("Arquivo CSV (*.csv)", "*.csv")
        );

        Stage stage = (Stage) filePathField.getScene().getWindow();
        File file = chooser.showOpenDialog(stage);

        if (file != null) {
            selectedFile = file;
            filePathField.setText(file.getAbsolutePath());
            abrirCartaOperacao(stage);
        }
    }

    private void abrirCartaOperacao(Stage stage) {
        if (selectedFile == null) {
            throw new IllegalStateException("Nenhum arquivo CSV foi selecionado.");
        }

        try {
            FXMLLoader loader = new FXMLLoader(
                    getClass().getResource("/carta.operacao.fxml")
            );

            Parent root = loader.load();

            CartaOperacao controller = loader.getController();
            controller.carregarCsv(selectedFile);

            Scene scene = new Scene(root);
            stage.setScene(scene);
            stage.setMaximized(true);
            stage.show();

        } catch (IOException e) {
            throw new RuntimeException("Erro ao abrir a tela carta.operacao.fxml", e);
        }
    }

    @FXML
    public void onLoadCsv(ActionEvent event) {
        if (selectedFile == null) {
            System.out.println("Nenhum arquivo CSV selecionado.");
            return;
        }

        Stage stage = (Stage) filePathField.getScene().getWindow();
        abrirCartaOperacao(stage);
    }
}
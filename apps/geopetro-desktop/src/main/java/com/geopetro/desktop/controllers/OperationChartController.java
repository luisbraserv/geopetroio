package com.geopetro.desktop.controllers;

import com.geopetro.desktop.models.GeneratedOperationChart;
import com.geopetro.desktop.services.OperationChartPdfService;
import javafx.beans.property.SimpleStringProperty;
import javafx.collections.FXCollections;
import javafx.collections.ObservableList;
import javafx.fxml.FXML;
import javafx.fxml.FXMLLoader;
import javafx.scene.Parent;
import javafx.scene.Scene;
import javafx.scene.control.Alert;
import javafx.scene.control.Button;
import javafx.scene.control.TableColumn;
import javafx.scene.control.TableView;
import javafx.stage.FileChooser;
import javafx.stage.Modality;
import javafx.stage.Stage;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.ApplicationContext;
import org.springframework.stereotype.Controller;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.StandardCopyOption;
import java.time.format.DateTimeFormatter;

@Controller
public class OperationChartController {

    private static final Logger logger = LoggerFactory.getLogger(OperationChartController.class);
    private static final DateTimeFormatter DATE_TIME_FORMAT = DateTimeFormatter.ofPattern("dd/MM/yyyy HH:mm:ss");

    @Autowired private ApplicationContext applicationContext;
    @Autowired private OperationChartPdfService operationChartPdfService;

    @FXML private Button btnNewChart;
    @FXML private Button btnExportPdf;
    @FXML private TableView<GeneratedOperationChart> tableCharts;
    @FXML private TableColumn<GeneratedOperationChart, String> colTitle;
    @FXML private TableColumn<GeneratedOperationChart, String> colWell;
    @FXML private TableColumn<GeneratedOperationChart, String> colCreatedAt;

    private final ObservableList<GeneratedOperationChart> generatedCharts = FXCollections.observableArrayList();

    @FXML
    public void initialize() {
        colTitle.setCellValueFactory(data -> new SimpleStringProperty(data.getValue().getTitle()));
        colWell.setCellValueFactory(data -> new SimpleStringProperty(data.getValue().getWellName()));
        colCreatedAt.setCellValueFactory(data -> new SimpleStringProperty(DATE_TIME_FORMAT.format(data.getValue().getCreatedAt())));
        tableCharts.setItems(generatedCharts);
        btnNewChart.setOnAction(event -> openNewChartWindow());
        btnExportPdf.setOnAction(event -> exportSelectedPdf());
        refreshTable();
    }

    private void openNewChartWindow() {
        try {
            FXMLLoader loader = new FXMLLoader(getClass().getResource("/views/generate-operation-chart.fxml"));
            loader.setControllerFactory(applicationContext::getBean);
            Parent root = loader.load();
            GenerateOperationChartController controller = loader.getController();
            controller.setOnGenerated(chart -> { refreshTable(); tableCharts.getSelectionModel().select(chart); });
            Stage chartStage = new Stage();
            chartStage.setTitle("Gerar nova carta");
            chartStage.setScene(new Scene(root));
            chartStage.setMinWidth(580);
            chartStage.setMinHeight(500);
            chartStage.initModality(Modality.APPLICATION_MODAL);
            chartStage.setResizable(false);
            chartStage.showAndWait();
        } catch (IOException e) {
            logger.error("Erro ao abrir formulario de carta operacao", e);
            showAlert(Alert.AlertType.ERROR, "Erro", "Nao foi possivel abrir o formulario da carta.");
        }
    }

    private void exportSelectedPdf() {
        GeneratedOperationChart selectedChart = tableCharts.getSelectionModel().getSelectedItem();
        if (selectedChart == null) { showAlert(Alert.AlertType.WARNING, "Selecione uma carta", "Selecione uma carta na tabela para gerar o PDF."); return; }
        if (Files.notExists(selectedChart.getPdfPath())) { showAlert(Alert.AlertType.ERROR, "Arquivo nao encontrado", "O PDF arquivado nao foi encontrado."); return; }
        FileChooser fileChooser = new FileChooser();
        fileChooser.setTitle("Salvar PDF da carta");
        fileChooser.setInitialFileName(selectedChart.getTitle().replaceAll("[^a-zA-Z0-9.-]+", "-") + ".pdf");
        fileChooser.getExtensionFilters().add(new FileChooser.ExtensionFilter("PDF", "*.pdf"));
        java.io.File destination = fileChooser.showSaveDialog(tableCharts.getScene().getWindow());
        if (destination == null) { return; }
        try {
            Files.copy(selectedChart.getPdfPath(), destination.toPath(), StandardCopyOption.REPLACE_EXISTING);
            showAlert(Alert.AlertType.INFORMATION, "PDF salvo", "PDF salvo com sucesso.");
        } catch (IOException e) {
            logger.error("Erro ao exportar PDF", e);
            showAlert(Alert.AlertType.ERROR, "Erro", "Nao foi possivel salvar o PDF.");
        }
    }

    private void refreshTable() { generatedCharts.setAll(operationChartPdfService.listGeneratedCharts()); }

    private void showAlert(Alert.AlertType type, String title, String message) {
        Alert alert = new Alert(type);
        alert.setTitle(title);
        alert.setHeaderText(null);
        alert.setContentText(message);
        alert.showAndWait();
    }
}

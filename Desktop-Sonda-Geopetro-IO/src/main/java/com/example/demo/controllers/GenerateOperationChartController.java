package com.example.demo.controllers;

import com.example.demo.models.GeneratedOperationChart;
import com.example.demo.models.OperationChartRequest;
import com.example.demo.services.OperationChartPdfService;
import javafx.fxml.FXML;
import javafx.fxml.FXMLLoader;
import javafx.scene.Parent;
import javafx.scene.Scene;
import javafx.scene.control.Alert;
import javafx.scene.control.Button;
import javafx.scene.control.CheckBox;
import javafx.scene.control.DatePicker;
import javafx.scene.control.TextField;
import javafx.stage.FileChooser;
import javafx.stage.Modality;
import javafx.stage.Stage;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.ApplicationContext;
import org.springframework.stereotype.Controller;

import java.io.IOException;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.function.Consumer;

@Controller
public class GenerateOperationChartController {

    private static final Logger logger = LoggerFactory.getLogger(GenerateOperationChartController.class);

    @Autowired private OperationChartPdfService operationChartPdfService;
    @Autowired private ApplicationContext        applicationContext;

    @FXML private DatePicker dateStart;
    @FXML private DatePicker dateEnd;
    @FXML private TextField  timeStart;
    @FXML private TextField  timeEnd;
    @FXML private TextField  txtTitle;
    @FXML private TextField  txtWellName;
    @FXML private CheckBox   chkPesoColuna;
    @FXML private CheckBox   chkTorqueTubos;
    @FXML private CheckBox   chkTorqueFlutuante;
    @FXML private CheckBox   chkPressaoBomba;
    @FXML private CheckBox   chkFlowRate;
    @FXML private Button     btnGenerate;
    @FXML private Button     btnPreview;
    @FXML private Button     btnCancel;

    private Consumer<GeneratedOperationChart> onGenerated;

    @FXML
    public void initialize() {
        LocalDate today = LocalDate.now();
        dateStart.setValue(today);
        dateEnd.setValue(today);
        timeStart.setText("00:00:00");
        timeEnd.setText("23:59:59");
        chkFlowRate.setSelected(true);
        chkPesoColuna.setSelected(true);
        btnGenerate.setOnAction(e -> generateChart());
        btnPreview.setOnAction(e  -> openPreview());
        btnCancel.setOnAction(e   -> closeWindow());
    }

    public void setOnGenerated(Consumer<GeneratedOperationChart> onGenerated) {
        this.onGenerated = onGenerated;
    }

    private void openPreview() {
        try {
            OperationChartRequest request = buildRequest();
            FXMLLoader loader = new FXMLLoader(getClass().getResource("/views/chart-preview.fxml"));
            loader.setControllerFactory(applicationContext::getBean);
            Parent root = loader.load();

            ChartPreviewController controller = loader.getController();
            controller.configurar(request);

            Stage stage = new Stage();
            stage.setTitle("Visualização — " + request.getTitle());
            stage.setScene(new Scene(root, 960, 700));
            stage.initModality(Modality.WINDOW_MODAL);
            stage.initOwner(btnPreview.getScene().getWindow());
            stage.show();
        } catch (IllegalArgumentException e) {
            showAlert(Alert.AlertType.WARNING, "Dados invalidos", e.getMessage());
        } catch (IOException e) {
            logger.error("Erro ao abrir preview", e);
            showAlert(Alert.AlertType.ERROR, "Erro", "Nao foi possivel abrir a visualizacao.");
        }
    }

    private void generateChart() {
        try {
            OperationChartRequest request = buildRequest();
            FileChooser fileChooser = new FileChooser();
            fileChooser.setTitle("Salvar carta operacao");
            fileChooser.setInitialFileName(request.getTitle().replaceAll("[^a-zA-Z0-9.-]+", "-") + ".pdf");
            fileChooser.getExtensionFilters().add(new FileChooser.ExtensionFilter("PDF", "*.pdf"));
            java.io.File destination = fileChooser.showSaveDialog(btnGenerate.getScene().getWindow());
            if (destination == null) return;
            GeneratedOperationChart generatedChart = operationChartPdfService.generate(request, destination.toPath());
            if (onGenerated != null) onGenerated.accept(generatedChart);
            closeWindow();
            showAlert(Alert.AlertType.INFORMATION, "Carta gerada", "Carta gerada com sucesso.");
        } catch (IllegalArgumentException e) {
            showAlert(Alert.AlertType.WARNING, "Dados invalidos", e.getMessage());
        } catch (IOException e) {
            logger.error("Erro ao gerar carta operacao", e);
            showAlert(Alert.AlertType.ERROR, "Erro", "Nao foi possivel gerar a carta em PDF.");
        }
    }

    private OperationChartRequest buildRequest() {
        String title    = txtTitle.getText()    == null ? "" : txtTitle.getText().trim();
        String wellName = txtWellName.getText() == null ? "" : txtWellName.getText().trim();
        if (title.isBlank())    throw new IllegalArgumentException("Informe o Titulo da Carta.");
        if (wellName.isBlank()) throw new IllegalArgumentException("Informe o Nome do Poco.");

        boolean anySelected = chkPesoColuna.isSelected() || chkTorqueTubos.isSelected()
                || chkTorqueFlutuante.isSelected() || chkPressaoBomba.isSelected()
                || chkFlowRate.isSelected();
        if (!anySelected) throw new IllegalArgumentException("Selecione ao menos uma variavel.");

        LocalDate startDate = dateStart.getValue();
        LocalDate endDate   = dateEnd.getValue();
        if (startDate == null || endDate == null) throw new IllegalArgumentException("Informe Data inicio e Data fim.");

        LocalDateTime start = LocalDateTime.of(startDate, parseTime(timeStart.getText(), "Hora inicio"));
        LocalDateTime end   = LocalDateTime.of(endDate,   parseTime(timeEnd.getText(),   "Hora fim"));
        if (end.isBefore(start)) throw new IllegalArgumentException("Data/Hora fim deve ser maior ou igual a Data/Hora inicio.");

        return new OperationChartRequest(title, wellName, start, end,
                chkPesoColuna.isSelected(), chkTorqueTubos.isSelected(),
                chkTorqueFlutuante.isSelected(), chkPressaoBomba.isSelected(),
                chkFlowRate.isSelected());
    }

    private LocalTime parseTime(String value, String fieldName) {
        try { return LocalTime.parse(value == null ? "" : value.trim()); }
        catch (Exception e) { throw new IllegalArgumentException("Informe " + fieldName + " no formato HH:mm:ss."); }
    }

    private void closeWindow() { ((Stage) btnCancel.getScene().getWindow()).close(); }

    private void showAlert(Alert.AlertType type, String title, String message) {
        Alert alert = new Alert(type);
        alert.setTitle(title);
        alert.setHeaderText(null);
        alert.setContentText(message);
        alert.showAndWait();
    }
}

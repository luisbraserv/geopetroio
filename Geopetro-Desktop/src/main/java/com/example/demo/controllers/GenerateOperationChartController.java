package com.example.demo.controllers;

import com.example.demo.models.GeneratedOperationChart;
import com.example.demo.models.OperationChartRequest;
import com.example.demo.services.OperationChartPdfService;
import javafx.scene.control.Label;
import javafx.scene.layout.VBox;
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
    @Autowired private com.example.demo.services.SeriesLocais seriesLocais;

    @FXML private VBox       painelSeries;
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

        // As series sao as que existem no periodo escolhido, entao a lista se refaz quando ele muda.
        atualizarSeries();
        dateStart.valueProperty().addListener((o, a, b) -> atualizarSeries());
        dateEnd.valueProperty().addListener((o, a, b) -> atualizarSeries());
        timeStart.focusedProperty().addListener((o, a, b) -> { if (!b) atualizarSeries(); });
        timeEnd.focusedProperty().addListener((o, a, b) -> { if (!b) atualizarSeries(); });

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

    /** Uma caixa por serie encontrada no periodo, com a chave {@code dispositivoId|serie}. */
    private final java.util.Map<String, CheckBox> caixas = new java.util.LinkedHashMap<>();

    /**
     * Refaz a lista de variaveis a partir do que a unidade gravou no periodo.
     *
     * <p>⚠️ Antes eram cinco caixas fixas no FXML. Uma unidade com dois tanques nao tinha como
     * inclui-los na carta — e a carta e entregavel ao cliente.
     */
    private void atualizarSeries() {
        java.util.Map<String, Boolean> marcadas = new java.util.LinkedHashMap<>();
        caixas.forEach((chave, caixa) -> marcadas.put(chave, caixa.isSelected()));

        caixas.clear();
        painelSeries.getChildren().clear();
        try {
            for (var serie : seriesLocais.carregar(inicio(), fim())) {
                CheckBox caixa = new CheckBox(serie.rotulo() + " (" + serie.unidade() + ")");
                caixa.setStyle("-fx-font-size: 13;");
                caixa.setSelected(marcadas.getOrDefault(serie.chave(), true));
                caixas.put(serie.chave(), caixa);
                painelSeries.getChildren().add(caixa);
            }
        } catch (RuntimeException e) {
            // Periodo meio digitado, por exemplo. A lista fica vazia ate o campo ficar valido.
            caixas.clear();
        }
        if (caixas.isEmpty()) {
            Label vazio = new Label("Nenhum dado gravado no periodo escolhido.");
            vazio.setStyle("-fx-font-size: 12; -fx-text-fill: #5a667a;");
            painelSeries.getChildren().add(vazio);
        }
    }

    private java.util.List<String> seriesEscolhidas() {
        return caixas.entrySet().stream().filter(e -> e.getValue().isSelected())
                .map(java.util.Map.Entry::getKey).toList();
    }

    private LocalDateTime inicio() {
        return LocalDateTime.of(dateStart.getValue(), parseTime(timeStart.getText(), "Hora inicio"));
    }

    private LocalDateTime fim() {
        return LocalDateTime.of(dateEnd.getValue(), parseTime(timeEnd.getText(), "Hora fim"));
    }

    private OperationChartRequest buildRequest() {
        String title    = txtTitle.getText()    == null ? "" : txtTitle.getText().trim();
        String wellName = txtWellName.getText() == null ? "" : txtWellName.getText().trim();
        if (title.isBlank())    throw new IllegalArgumentException("Informe o Titulo da Carta.");
        if (wellName.isBlank()) throw new IllegalArgumentException("Informe o Nome do Poco.");

        if (seriesEscolhidas().isEmpty()) {
            throw new IllegalArgumentException(caixas.isEmpty()
                    ? "Nao ha dados gravados no periodo escolhido."
                    : "Selecione ao menos uma variavel.");
        }

        LocalDate startDate = dateStart.getValue();
        LocalDate endDate   = dateEnd.getValue();
        if (startDate == null || endDate == null) throw new IllegalArgumentException("Informe Data inicio e Data fim.");

        LocalDateTime start = LocalDateTime.of(startDate, parseTime(timeStart.getText(), "Hora inicio"));
        LocalDateTime end   = LocalDateTime.of(endDate,   parseTime(timeEnd.getText(),   "Hora fim"));
        if (end.isBefore(start)) throw new IllegalArgumentException("Data/Hora fim deve ser maior ou igual a Data/Hora inicio.");

        return new OperationChartRequest(title, wellName, start, end, seriesEscolhidas());
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

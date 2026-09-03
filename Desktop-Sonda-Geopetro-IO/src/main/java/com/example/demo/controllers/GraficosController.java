package com.example.demo.controllers;

import com.example.demo.models.SondaReading;
import com.example.demo.repositories.SondaReadingRepository;
import javafx.fxml.FXML;
import javafx.geometry.Insets;
import javafx.geometry.Pos;
import javafx.scene.canvas.Canvas;
import javafx.scene.canvas.GraphicsContext;
import javafx.scene.control.CheckBox;
import javafx.scene.control.DatePicker;
import javafx.scene.control.Label;
import javafx.scene.control.ScrollPane;
import javafx.scene.control.TextField;
import javafx.scene.layout.HBox;
import javafx.scene.layout.VBox;
import javafx.scene.paint.Color;
import javafx.scene.text.Font;
import javafx.scene.text.FontWeight;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Controller;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.function.Function;

@Controller
public class GraficosController {

    private static final Logger logger = LoggerFactory.getLogger(GraficosController.class);
    private static final DateTimeFormatter TIME_FMT = DateTimeFormatter.ofPattern("HH:mm");
    private static final double BASE_WIDTH  = 900;
    private static final double BASE_HEIGHT = 230;
    private static final double ZOOM_STEP   = 0.25;
    private static final double ZOOM_MIN    = 0.5;
    private static final double ZOOM_MAX    = 3.0;

    @Autowired private SondaReadingRepository sondaReadingRepository;

    @FXML private DatePicker dateStart;
    @FXML private DatePicker dateEnd;
    @FXML private TextField  timeStart;
    @FXML private TextField  timeEnd;
    @FXML private CheckBox   chkPesoColuna;
    @FXML private CheckBox   chkTorqueTubos;
    @FXML private CheckBox   chkTorqueFlutuante;
    @FXML private CheckBox   chkPressaoBomba;
    @FXML private CheckBox   chkFlowRate;
    @FXML private Label      lblZoom;
    @FXML private VBox       chartsContainer;
    @FXML private ScrollPane scrollPane;

    private double zoom = 1.0;
    private List<SondaReading> readings = List.of();

    @FXML
    public void initialize() {
        LocalDate today = LocalDate.now();
        dateStart.setValue(today);
        dateEnd.setValue(today);
        timeStart.setText("00:00:00");
        timeEnd.setText("23:59:59");
        chkPesoColuna.setSelected(true);
        chkTorqueTubos.setSelected(true);
        chkTorqueFlutuante.setSelected(true);
        chkPressaoBomba.setSelected(true);
        chkFlowRate.setSelected(true);

        // carrega automaticamente ao abrir a tela
        onAtualizar();
    }

    @FXML
    public void onAtualizar() {
        try {
            LocalDateTime start = LocalDateTime.of(dateStart.getValue(), LocalTime.parse(timeStart.getText().trim()));
            LocalDateTime end   = LocalDateTime.of(dateEnd.getValue(),   LocalTime.parse(timeEnd.getText().trim()));
            readings = sondaReadingRepository.findByTimestampBetweenOrderByTimestampAsc(start, end);
            renderAll();
        } catch (Exception e) {
            logger.warn("Erro ao carregar dados: {}", e.getMessage());
        }
    }

    @FXML public void onZoomIn()  { zoom = Math.min(zoom + ZOOM_STEP, ZOOM_MAX); renderAll(); }
    @FXML public void onZoomOut() { zoom = Math.max(zoom - ZOOM_STEP, ZOOM_MIN); renderAll(); }
    @FXML public void onReset()   { zoom = 1.0; renderAll(); }

    private void renderAll() {
        lblZoom.setText(String.format("Zoom: %.0f%%", zoom * 100));
        chartsContainer.getChildren().clear();

        if (readings.isEmpty()) {
            Label lbl = new Label("Nenhum dado encontrado. Ajuste o periodo e clique em Atualizar.");
            lbl.setStyle("-fx-font-size: 13; -fx-text-fill: #5a667a;");
            chartsContainer.getChildren().add(lbl);
            return;
        }

        if (chkPesoColuna.isSelected())
            chartsContainer.getChildren().add(buildChartBox("Peso da Coluna", "lbf",
                    r -> r.getPesoColunLbf(), Color.web("#7c3aed"), Color.web("#f59e0b")));

        if (chkTorqueTubos.isSelected())
            chartsContainer.getChildren().add(buildChartBox("Torque Ch. Hid. Tubos", "lbf·ft",
                    r -> r.getTorqueTubos(), Color.web("#d97706"), Color.web("#06b6d4")));

        if (chkTorqueFlutuante.isSelected())
            chartsContainer.getChildren().add(buildChartBox("Torque Ch. Flutuante", "lbf·ft",
                    r -> r.getTorqueFluante(), Color.web("#0891b2"), Color.web("#f97316")));

        if (chkPressaoBomba.isSelected())
            chartsContainer.getChildren().add(buildChartBox("Pressão Bomba / ESCP", "psi",
                    r -> r.getPressaoBomba(), Color.web("#dc2626"), Color.web("#16a34a")));

        if (chkFlowRate.isSelected())
            chartsContainer.getChildren().add(buildChartBox("Vazão", "bbl/min",
                    r -> r.getVazaoBblMin(), Color.web("#1e5a96"), Color.web("#c50d15")));
    }

    private VBox buildChartBox(String title, String unit,
                                Function<SondaReading, Double> extractor,
                                Color lineColor, Color smoothColor) {
        List<Double> values = readings.stream()
                .map(r -> { Double v = extractor.apply(r); return v != null ? v : 0.0; })
                .toList();

        double w = BASE_WIDTH  * zoom;
        double h = BASE_HEIGHT * zoom;

        Canvas canvas = new Canvas(w, h);
        CheckBox chkOriginal = new CheckBox("Original");
        CheckBox chkSmooth = new CheckBox("Suavizada");
        chkOriginal.setSelected(true);
        chkSmooth.setSelected(true);
        chkOriginal.setStyle("-fx-font-size: 12; -fx-text-fill: #061c39;");
        chkSmooth.setStyle("-fx-font-size: 12; -fx-text-fill: #061c39;");
        drawChart(canvas.getGraphicsContext2D(), w, h, values, unit, lineColor, smoothColor,
                chkOriginal.isSelected(), chkSmooth.isSelected());

        // zoom via scroll do mouse
        canvas.setOnScroll(e -> {
            if (e.getDeltaY() > 0) onZoomIn(); else onZoomOut();
        });
        chkOriginal.setOnAction(e -> drawChart(canvas.getGraphicsContext2D(), w, h, values, unit, lineColor, smoothColor,
                chkOriginal.isSelected(), chkSmooth.isSelected()));
        chkSmooth.setOnAction(e -> drawChart(canvas.getGraphicsContext2D(), w, h, values, unit, lineColor, smoothColor,
                chkOriginal.isSelected(), chkSmooth.isSelected()));

        Label titleLabel = new Label(title);
        titleLabel.setFont(Font.font("System", FontWeight.BOLD, 14));
        titleLabel.setTextFill(Color.web("#000c4b"));

        HBox header = new HBox(14, titleLabel, chkOriginal, chkSmooth);
        header.setAlignment(Pos.CENTER_LEFT);

        VBox box = new VBox(6, header, canvas);
        box.setPadding(new Insets(16));
        box.setStyle("-fx-background-color: white; -fx-background-radius: 12;"
                + "-fx-effect: dropshadow(gaussian, rgba(0,0,0,0.08), 8, 0, 0, 2);");
        box.setAlignment(Pos.TOP_LEFT);
        return box;
    }

    private void drawChart(GraphicsContext gc, double w, double h,
                            List<Double> values, String unit,
                            Color lineColor, Color smoothColor,
                            boolean showOriginal, boolean showSmooth) {
        double pad    = 52 * zoom;
        double chartX = pad;
        double chartY = 14 * zoom;
        double chartW = w - pad - 14 * zoom;
        double chartH = h - chartY - 36 * zoom;

        gc.setFill(Color.WHITE);
        gc.fillRect(0, 0, w, h);

        if (values.isEmpty() || values.stream().allMatch(v -> v == 0.0)) {
            gc.setFill(Color.web("#9ca3af"));
            gc.setFont(Font.font("System", 13 * zoom));
            gc.fillText("Sem dados", chartX + 10, chartY + chartH / 2);
            return;
        }

        double min = values.stream().mapToDouble(Double::doubleValue).min().orElse(0);
        double max = values.stream().mapToDouble(Double::doubleValue).max().orElse(1);
        if (Math.abs(max - min) < 0.0001) { max = min + 1; }

        // grade horizontal
        gc.setStroke(Color.web("#e5e7eb"));
        gc.setLineWidth(0.5 * zoom);
        int gridLines = 5;
        for (int i = 0; i <= gridLines; i++) {
            double gy  = chartY + chartH - chartH * i / gridLines;
            double val = min + (max - min) * i / gridLines;
            gc.strokeLine(chartX, gy, chartX + chartW, gy);
            gc.setFill(Color.web("#9ca3af"));
            gc.setFont(Font.font("System", 9 * zoom));
            gc.fillText(String.format("%.1f", val), 2, gy + 4 * zoom);
        }

        // borda
        gc.setStroke(Color.web("#d1d5db"));
        gc.setLineWidth(1.0 * zoom);
        gc.strokeRect(chartX, chartY, chartW, chartH);

        List<double[]> pts    = toPoints(values,                     chartX, chartY, chartW, chartH, min, max);
        List<double[]> smooth = toPoints(smoothTrendValues(values), chartX, chartY, chartW, chartH, min, max);
        if (showOriginal) {
            gc.setStroke(lineColor);
            gc.setLineWidth(2.0 * zoom);
            drawPolyline(gc, pts);
        }

        if (showSmooth) {
            gc.setStroke(smoothColor);
            gc.setLineWidth(2.6 * zoom);
            drawSmoothCurve(gc, smooth);
        }

        // labels de tempo
        gc.setFill(Color.web("#5a667a"));
        gc.setFont(Font.font("System", 9 * zoom));
        int labelCount = Math.min(6, readings.size());
        for (int i = 0; i < labelCount; i++) {
            int idx = labelCount == 1 ? 0 : (int) Math.round((readings.size() - 1.0) * i / (labelCount - 1));
            if (idx >= pts.size()) continue;
            double[] pt  = pts.get(idx);
            String   lbl = readings.get(idx).getTimestamp() != null
                    ? readings.get(idx).getTimestamp().format(TIME_FMT) : "";
            gc.fillText(lbl, pt[0] - 12 * zoom, chartY + chartH + 14 * zoom);
            gc.setStroke(Color.web("#d1d5db"));
            gc.setLineWidth(0.5 * zoom);
            gc.strokeLine(pt[0], chartY + chartH, pt[0], chartY + chartH + 4 * zoom);
        }

        // legenda
        gc.setFill(lineColor);
        gc.fillRect(chartX, chartY + chartH + 20 * zoom, 12 * zoom, 4 * zoom);
        gc.setFill(Color.web("#061c39"));
        gc.setFont(Font.font("System", 10 * zoom));
        gc.fillText("Original", chartX + 16 * zoom, chartY + chartH + 25 * zoom);

        gc.setFill(smoothColor);
        gc.fillRect(chartX + 80 * zoom, chartY + chartH + 20 * zoom, 12 * zoom, 4 * zoom);
        gc.setFill(Color.web("#061c39"));
        gc.fillText("Suavizada", chartX + 96 * zoom, chartY + chartH + 25 * zoom);

        // unidade no canto
        gc.setFill(Color.web("#9ca3af"));
        gc.setFont(Font.font("System", 9 * zoom));
        gc.fillText(unit, chartX + chartW - 32 * zoom, chartY - 2 * zoom);
    }

    private void drawPolyline(GraphicsContext gc, List<double[]> pts) {
        if (pts.size() < 2) return;
        gc.beginPath();
        gc.moveTo(pts.get(0)[0], pts.get(0)[1]);
        for (int i = 1; i < pts.size(); i++) gc.lineTo(pts.get(i)[0], pts.get(i)[1]);
        gc.stroke();
    }

    private void drawSmoothCurve(GraphicsContext gc, List<double[]> pts) {
        if (pts.size() < 2) return;
        gc.beginPath();
        gc.moveTo(pts.get(0)[0], pts.get(0)[1]);
        for (int i = 1; i < pts.size(); i++) {
            double[] previous = pts.get(i - 1);
            double[] current = pts.get(i);
            double midX = (previous[0] + current[0]) / 2.0;
            double midY = (previous[1] + current[1]) / 2.0;
            gc.quadraticCurveTo(previous[0], previous[1], midX, midY);
        }
        double[] last = pts.get(pts.size() - 1);
        gc.lineTo(last[0], last[1]);
        gc.stroke();
    }

    private List<double[]> toPoints(List<Double> values, double x, double y,
                                     double w, double h, double min, double max) {
        List<double[]> pts = new ArrayList<>();
        int n = values.size();
        for (int i = 0; i < n; i++) {
            double px = n == 1 ? x : x + w * i / (n - 1);
            double py = y + h - h * ((values.get(i) - min) / (max - min));
            pts.add(new double[]{px, py});
        }
        return pts;
    }

    private List<Double> smoothTrendValues(List<Double> values) {
        if (values.size() < 3) return values;

        int baseWindow = Math.max(5, (int) Math.round(values.size() * 0.045));
        int window = Math.min(17, baseWindow % 2 == 0 ? baseWindow + 1 : baseWindow);
        int radius = window / 2;
        List<Double> smoothed = new ArrayList<>(values);

        for (int pass = 0; pass < 2; pass++) {
            List<Double> next = new ArrayList<>(smoothed.size());
            for (int i = 0; i < smoothed.size(); i++) {
                int start = Math.max(0, i - radius);
                int end = Math.min(smoothed.size() - 1, i + radius);
                double sum = 0;
                for (int j = start; j <= end; j++) sum += smoothed.get(j);
                next.add(sum / (end - start + 1));
            }
            smoothed = next;
        }

        return smoothed;
    }
}

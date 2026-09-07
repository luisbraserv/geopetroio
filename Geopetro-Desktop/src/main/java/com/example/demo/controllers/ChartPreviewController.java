package com.example.demo.controllers;

import com.example.demo.models.OperationChartRequest;
import com.example.demo.models.SondaReading;
import com.example.demo.repositories.SondaReadingRepository;
import javafx.fxml.FXML;
import javafx.geometry.Insets;
import javafx.geometry.Pos;
import javafx.scene.canvas.Canvas;
import javafx.scene.canvas.GraphicsContext;
import javafx.scene.control.CheckBox;
import javafx.scene.control.Label;
import javafx.scene.control.ScrollPane;
import javafx.scene.layout.HBox;
import javafx.scene.layout.VBox;
import javafx.scene.paint.Color;
import javafx.scene.text.Font;
import javafx.scene.text.FontWeight;
import javafx.stage.Stage;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Controller;

import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.function.Function;

@Controller
public class ChartPreviewController {

    private static final DateTimeFormatter TIME_FMT = DateTimeFormatter.ofPattern("HH:mm");
    private static final double BASE_WIDTH  = 860;
    private static final double BASE_HEIGHT = 220;
    private static final double ZOOM_STEP   = 0.25;
    private static final double ZOOM_MIN    = 0.5;
    private static final double ZOOM_MAX    = 3.0;

    @Autowired private SondaReadingRepository sondaReadingRepository;

    @FXML private Label      lblTitulo;
    @FXML private Label      lblZoom;
    @FXML private VBox       chartsContainer;
    @FXML private ScrollPane scrollPane;

    private double zoom = 1.0;
    private OperationChartRequest request;
    private List<SondaReading>    readings;

    public void configurar(OperationChartRequest request) {
        this.request  = request;
        this.readings = sondaReadingRepository.findByTimestampBetweenOrderByTimestampAsc(
                request.getStart(), request.getEnd());
        lblTitulo.setText("Visualização — " + request.getTitle());
        renderAll();
    }

    @FXML public void onZoomIn()  { zoom = Math.min(zoom + ZOOM_STEP, ZOOM_MAX); renderAll(); }
    @FXML public void onZoomOut() { zoom = Math.max(zoom - ZOOM_STEP, ZOOM_MIN); renderAll(); }
    @FXML public void onReset()   { zoom = 1.0; renderAll(); }
    @FXML public void onFechar()  { ((Stage) chartsContainer.getScene().getWindow()).close(); }

    private void renderAll() {
        lblZoom.setText(String.format("Zoom: %.0f%%", zoom * 100));
        chartsContainer.getChildren().clear();

        if (readings.isEmpty()) {
            Label empty = new Label("Nenhum dado encontrado no período selecionado.");
            empty.setStyle("-fx-font-size: 14; -fx-text-fill: #5a667a;");
            chartsContainer.getChildren().add(empty);
            return;
        }

        if (request.isIncludePesoColuna())
            chartsContainer.getChildren().add(buildChart("Peso da Coluna", "lbf",
                    r -> r.getPesoColunLbf(), Color.web("#7c3aed"), Color.web("#f59e0b")));

        if (request.isIncludeTorqueTubos())
            chartsContainer.getChildren().add(buildChart("Torque Ch. Hid. Tubos", "lbf·ft",
                    r -> r.getTorqueTubos(), Color.web("#d97706"), Color.web("#06b6d4")));

        if (request.isIncludeTorqueFlutuante())
            chartsContainer.getChildren().add(buildChart("Torque Ch. Flutuante", "lbf·ft",
                    r -> r.getTorqueFluante(), Color.web("#0891b2"), Color.web("#f97316")));

        if (request.isIncludePressaoBomba())
            chartsContainer.getChildren().add(buildChart("Pressão Bomba / ESCP", "psi",
                    r -> r.getPressaoBomba(), Color.web("#dc2626"), Color.web("#16a34a")));

        if (request.isIncludeFlowRate())
            chartsContainer.getChildren().add(buildChart("Vazão", "bbl/min",
                    r -> r.getVazaoBblMin(), Color.web("#1e5a96"), Color.web("#c50d15")));
    }

    private VBox buildChart(String title, String unit,
                             Function<SondaReading, Double> extractor,
                             Color lineColor, Color smoothColor) {
        List<Double> values = readings.stream()
                .map(r -> { Double v = extractor.apply(r); return v != null ? v : 0.0; })
                .toList();

        double w = BASE_WIDTH  * zoom;
        double h = BASE_HEIGHT * zoom;

        Canvas canvas = new Canvas(w, h);
        GraphicsContext gc = canvas.getGraphicsContext2D();
        CheckBox chkOriginal = new CheckBox("Original");
        CheckBox chkSmooth = new CheckBox("Suavizada");
        chkOriginal.setSelected(true);
        chkSmooth.setSelected(true);
        chkOriginal.setStyle("-fx-font-size: 12; -fx-text-fill: #061c39;");
        chkSmooth.setStyle("-fx-font-size: 12; -fx-text-fill: #061c39;");
        drawChart(gc, w, h, values, title, unit, lineColor, smoothColor,
                chkOriginal.isSelected(), chkSmooth.isSelected());

        // zoom via scroll do mouse
        canvas.setOnScroll(e -> {
            if (e.getDeltaY() > 0) onZoomIn(); else onZoomOut();
        });
        chkOriginal.setOnAction(e -> drawChart(canvas.getGraphicsContext2D(), w, h, values, title, unit, lineColor, smoothColor,
                chkOriginal.isSelected(), chkSmooth.isSelected()));
        chkSmooth.setOnAction(e -> drawChart(canvas.getGraphicsContext2D(), w, h, values, title, unit, lineColor, smoothColor,
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
                            List<Double> values, String title, String unit,
                            Color lineColor, Color smoothColor,
                            boolean showOriginal, boolean showSmooth) {
        double pad = 48 * zoom;
        double chartX = pad;
        double chartY = 12 * zoom;
        double chartW = w - pad - 12 * zoom;
        double chartH = h - chartY - 32 * zoom;

        // fundo
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

        // grade
        gc.setStroke(Color.web("#e5e7eb"));
        gc.setLineWidth(0.5 * zoom);
        int gridLines = 5;
        for (int i = 0; i <= gridLines; i++) {
            double gy = chartY + chartH - (chartH * i / gridLines);
            gc.strokeLine(chartX, gy, chartX + chartW, gy);
            double val = min + (max - min) * i / gridLines;
            gc.setFill(Color.web("#9ca3af"));
            gc.setFont(Font.font("System", 9 * zoom));
            gc.fillText(String.format("%.1f", val), 2, gy + 4 * zoom);
        }

        // borda
        gc.setStroke(Color.web("#d1d5db"));
        gc.setLineWidth(1.0 * zoom);
        gc.strokeRect(chartX, chartY, chartW, chartH);

        List<double[]> pts = toPoints(values, chartX, chartY, chartW, chartH, min, max);
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

        // rótulos de tempo (6 labels)
        gc.setFill(Color.web("#5a667a"));
        gc.setFont(Font.font("System", 9 * zoom));
        int labelCount = Math.min(6, readings.size());
        for (int i = 0; i < labelCount; i++) {
            int idx = labelCount == 1 ? 0 : (int) Math.round((readings.size() - 1.0) * i / (labelCount - 1));
            if (idx >= pts.size()) continue;
            double[] pt = pts.get(idx);
            String time = readings.get(idx).getTimestamp() != null
                    ? readings.get(idx).getTimestamp().format(TIME_FMT) : "";
            gc.fillText(time, pt[0] - 12 * zoom, chartY + chartH + 14 * zoom);
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

        // unidade
        gc.setFill(Color.web("#5a667a"));
        gc.setFont(Font.font("System", 9 * zoom));
        gc.fillText(unit, chartX + chartW - 30 * zoom, chartY - 2 * zoom);
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

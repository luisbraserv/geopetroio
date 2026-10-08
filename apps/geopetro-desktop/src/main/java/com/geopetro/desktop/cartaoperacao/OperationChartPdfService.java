package com.geopetro.desktop.cartaoperacao;

import com.geopetro.desktop.historico.SeriesLocais;
import org.springframework.stereotype.Service;

import java.awt.Graphics2D;
import java.awt.RenderingHints;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Locale;
import java.util.Objects;
import java.util.Optional;
import java.util.stream.Collectors;
import javax.imageio.ImageIO;

@Service
public class OperationChartPdfService {

    private static final DateTimeFormatter DATE_TIME_FORMAT = DateTimeFormatter.ofPattern("dd/MM/yyyy HH:mm:ss");
    private static final DateTimeFormatter FILE_DATE_FORMAT = DateTimeFormatter.ofPattern("yyyyMMdd-HHmmss");
    private static final DateTimeFormatter INDEX_DATE_FORMAT = DateTimeFormatter.ISO_LOCAL_DATE_TIME;
    private static final String APP_NAME = "Geopetro Desktop";
    private static final String LOGO_PATH = "/icon/logo2.png";
    private static final double PAGE_WIDTH = 842;
    private static final double PAGE_HEIGHT = 595;
    private static final double HEADER_MARGIN = 40;
    private static final double HEADER_LOGO_MAX_WIDTH = 110;
    private static final double HEADER_LOGO_MAX_HEIGHT = 42;
    private static final double HEADER_SPACING = 12;
    private static final double CHART_X = 55;
    private static final double CHART_Y = 74;
    private static final double CHART_WIDTH = 732;
    private static final double CHART_HEIGHT = 386;

    private final SeriesLocais seriesLocais;

    public OperationChartPdfService(
                                     SeriesLocais seriesLocais) {
        this.seriesLocais = seriesLocais;
    }

    public GeneratedOperationChart generate(OperationChartRequest request, Path savePath) throws IOException {
        byte[] pdfBytes = buildPdf(request);
        Path parent = savePath.toAbsolutePath().getParent();
        if (parent != null) {
            Files.createDirectories(parent);
        }
        Files.write(savePath, pdfBytes);

        Path archiveDirectory = getArchiveDirectory();
        Files.createDirectories(archiveDirectory);
        LocalDateTime createdAt = LocalDateTime.now();
        Path archivePath = archiveDirectory.resolve(slug(request.getTitle()) + "-" + FILE_DATE_FORMAT.format(createdAt) + ".pdf");
        Files.copy(savePath, archivePath, StandardCopyOption.REPLACE_EXISTING);

        GeneratedOperationChart chart = new GeneratedOperationChart(request.getTitle(), request.getWellName(), createdAt, archivePath);
        appendToIndex(chart);
        return chart;
    }

    public List<GeneratedOperationChart> listGeneratedCharts() {
        Path indexPath = getIndexPath();
        if (Files.notExists(indexPath)) {
            return new ArrayList<>();
        }
        try {
            return Files.readAllLines(indexPath, StandardCharsets.UTF_8).stream()
                    .filter(line -> !line.isBlank())
                    .map(this::parseIndexLine)
                    .filter(Optional::isPresent)
                    .map(Optional::get)
                    .collect(Collectors.toCollection(ArrayList::new));
        } catch (Exception e) {
            return new ArrayList<>();
        }
    }

    /**
     * Monta o PDF a partir das séries que a unidade gravou — uma página por série escolhida.
     *
     * <p>⚠️ Antes eram cinco blocos {@code if} com o nome, a unidade e o extrator escritos no
     * código. Uma unidade com dois tanques não tinha como incluí-los — e a carta é entregável ao
     * cliente.
     *
     * <p>Cada série carrega <b>os seus</b> instantes: grandeza sem valor não é gravada (RN-099),
     * então os tamanhos diferem, e um eixo de tempo compartilhado desalinharia os pontos.
     */
    private byte[] buildPdf(OperationChartRequest request) throws IOException {
        List<SeriesLocais.SerieLocal> series = seriesLocais
                .carregar(request.getStart(), request.getEnd()).stream()
                .filter(s -> request.inclui(s.chave()))
                .toList();
        int pontos = series.stream().mapToInt(s -> s.valores().size()).sum();

        LogoImage logoImage = loadLogoImage();
        List<String> pages = new ArrayList<>();
        StringBuilder content = new StringBuilder();
        drawSummaryPage(content, request, logoImage, pontos, series.size());

        if (series.isEmpty()) {
            text(content, 50, 398, 13, "Nao existem dados no periodo selecionado.");
        } else {
            for (SeriesLocais.SerieLocal serie : series) {
                pages.add(buildChartPage(request, logoImage, serie.rotulo(),
                        serie.valores(), serie.unidade(), serie.instantes()));
            }
        }
        pages.add(0, content.toString());
        addPageNumbers(pages);
        return writePdf(pages, logoImage);
    }

    private void drawSummaryPage(StringBuilder content, OperationChartRequest request, LogoImage logoImage,
                                 int sondaCount, int flowCount) {
        fillRect(content, 0, 0, PAGE_WIDTH, PAGE_HEIGHT, 0.96, 0.97, 0.99);
        fillRect(content, 0, 505, PAGE_WIDTH, 90, 0.04, 0.14, 0.32);
        drawHeader(content, logoImage);
        textColor(content, 50, 552, 22, request.getTitle(), 1, 1, 1);
        textColor(content, 50, 526, 12, "Carta de operacao", 0.82, 0.88, 1);

        fillRect(content, 45, 340, 752, 130, 1, 1, 1);
        setStroke(content, 0.75, 0.80, 0.88, 1.1);
        rect(content, 45, 340, 752, 130);
        text(content, 62, 445, 12, "Poco: " + request.getWellName());
        text(content, 62, 422, 11, "Periodo: " + DATE_TIME_FORMAT.format(request.getStart()) + " ate " + DATE_TIME_FORMAT.format(request.getEnd()));
        text(content, 62, 400, 11, "Criado em: " + DATE_TIME_FORMAT.format(LocalDateTime.now()));
        text(content, 62, 376, 11, "Amostras de sonda: " + sondaCount + "   |   Amostras de vazao: " + flowCount);

        fillRect(content, 45, 210, 752, 96, 0.90, 0.95, 1.0);
        setStroke(content, 0.31, 0.49, 0.72, 1.0);
        rect(content, 45, 210, 752, 96);
        text(content, 62, 276, 13, "Layout do PDF");
        text(content, 62, 252, 11, "Resumo na primeira pagina e um grafico por pagina para melhorar a leitura.");
        text(content, 62, 230, 11, "Linha azul: valores originais. Linha laranja: linha suavizada para tendencia.");
    }

    private String buildChartPage(OperationChartRequest request, LogoImage logoImage, String title,
                                  List<Double> values, String unit, List<LocalDateTime> timestamps) {
        StringBuilder page = new StringBuilder();
        fillRect(page, 0, 0, PAGE_WIDTH, PAGE_HEIGHT, 0.98, 0.99, 1.0);
        fillRect(page, 0, 520, PAGE_WIDTH, 75, 0.04, 0.14, 0.32);
        drawHeader(page, logoImage);
        textColor(page, 50, 552, 18, title, 1, 1, 1);
        textColor(page, 50, 530, 10, request.getWellName() + " | " + DATE_TIME_FORMAT.format(request.getStart()) + " ate " + DATE_TIME_FORMAT.format(request.getEnd()), 0.82, 0.88, 1);
        drawChart(page, CHART_X, CHART_Y, CHART_WIDTH, CHART_HEIGHT, title, values, unit, timestamps, false);
        return page.toString();
    }

    /**
     * Divide o espaço útil da página entre os gráficos selecionados.
     * Retorna lista de [y_base, height] para cada slot.
     */
    private List<double[]> buildChartSlots(int count) {
        // Uma pagina por serie, entao um slot por pagina. O metodo ficou com a assinatura antiga
        // por enquanto: quem chama passa quantas series ha.
        if (count <= 0) return List.of();

        double usableHeight = 420;
        double gap          = 30;
        double chartH       = (usableHeight - gap * (count - 1)) / count;
        double startY       = 55;

        List<double[]> slots = new ArrayList<>();
        for (int i = count - 1; i >= 0; i--) {
            double y = startY + i * (chartH + gap);
            slots.add(new double[]{y, chartH});
        }
        return slots;
    }

    private void drawHeader(StringBuilder content, LogoImage logoImage) {
        double textSize = 12;
        double textWidth = estimateTextWidth(APP_NAME, textSize);
        double availableWidth = Math.max(0, PAGE_WIDTH - (HEADER_MARGIN * 2) - textWidth - HEADER_SPACING);
        double logoWidth = 0;
        double logoHeight = 0;

        if (logoImage != null && logoImage.width() > 0 && logoImage.height() > 0 && availableWidth > 0) {
            double widthScale = Math.min(HEADER_LOGO_MAX_WIDTH, availableWidth) / logoImage.width();
            double heightScale = HEADER_LOGO_MAX_HEIGHT / logoImage.height();
            double scale = Math.min(widthScale, heightScale);
            logoWidth = logoImage.width() * scale;
            logoHeight = logoImage.height() * scale;
            double logoX = PAGE_WIDTH - HEADER_MARGIN - textWidth - HEADER_SPACING - logoWidth;
            double centerY = 520 + (HEADER_LOGO_MAX_HEIGHT / 2);
            double logoY = centerY - (logoHeight / 2);
            drawImage(content, "Im1", logoX, logoY, logoWidth, logoHeight);
        }

        double textX = PAGE_WIDTH - HEADER_MARGIN - textWidth;
        double textY = 520 + ((HEADER_LOGO_MAX_HEIGHT - textSize) / 2);
        textColor(content, textX, textY, (int) textSize, APP_NAME, 1, 1, 1);
    }

    private void drawChart(StringBuilder content, double x, double y, double width, double height, String title, List<Double> values, String unit, List<LocalDateTime> timestamps, boolean showPoints) {
        fillRect(content, x, y, width, height, 1, 1, 1);
        setStroke(content, 0.48, 0.55, 0.66, 1.2);
        rect(content, x, y, width, height);
        textColor(content, x, y + height + 20, 13, title, 0.08, 0.11, 0.18);
        textColor(content, x, y + height + 5, 9, "Variavel: " + title + " (" + unit + ")", 0.20, 0.25, 0.34);
        textColor(content, x + width - 58, y - 28, 8, "Eixo X: hora", 0.20, 0.25, 0.34);
        textColor(content, x + 8, y + height - 30, 8, "Eixo Y: " + unit, 0.20, 0.25, 0.34);
        if (values.isEmpty()) { text(content, x + 16, y + height / 2, 10, "Sem dados para exibir."); return; }
        double min = values.stream().mapToDouble(Double::doubleValue).min().orElse(0);
        double max = values.stream().mapToDouble(Double::doubleValue).max().orElse(0);
        if (Math.abs(max - min) < 0.000001) { max = min + 1; }
        double plotX = x + 64;
        double plotY = y + 48;
        double plotWidth = width - 92;
        double plotHeight = height - 86;
        drawAxisLabels(content, plotX, plotY, plotWidth, plotHeight, min, max, unit, timestamps);
        List<Point> originalPoints = toPoints(values, plotX, plotY, plotWidth, plotHeight, min, max);
        List<Point> smoothPoints = toPoints(smoothTrendValues(values), plotX, plotY, plotWidth, plotHeight, min, max);
        drawPolyline(content, originalPoints, 0.00, 0.20, 0.62, 2.2);
        drawSmoothCurve(content, smoothPoints, 0.93, 0.31, 0.04, 2.6);
        if (showPoints) {
            drawPoints(content, originalPoints, 2.2, 0.10, 0.32, 0.78);
        }
        drawLegend(content, x + width - 276, y + height + 18);
    }

    private void drawAxisLabels(StringBuilder content, double x, double y, double width, double height,
                                double min, double max, String unit, List<LocalDateTime> timestamps) {
        setStroke(content, 0.22, 0.28, 0.38, 1.1);
        line(content, x, y, x + width, y);
        line(content, x, y, x, y + height);

        int yTicks = 5;
        for (int i = 0; i <= yTicks; i++) {
            double ratio = i / (double) yTicks;
            double gy = y + (height * ratio);
            double value = min + ((max - min) * ratio);
            setStroke(content, i == 0 ? 0.22 : 0.86, i == 0 ? 0.28 : 0.89, i == 0 ? 0.38 : 0.94, i == 0 ? 1.0 : 0.6);
            line(content, x, gy, x + width, gy);
            line(content, x - 4, gy, x, gy);
            textColor(content, x - 58, gy - 3, 7, formatAxisValue(value) + " " + unit, 0.13, 0.17, 0.24);
        }

        int dataSize = timestamps == null ? 0 : timestamps.size();
        int xTicks = Math.min(6, Math.max(2, dataSize == 0 ? 2 : dataSize));
        for (int i = 0; i < xTicks; i++) {
            double ratio = i / (double) Math.max(1, xTicks - 1);
            int index = dataSize <= 1 ? 0 : (int) Math.round((dataSize - 1) * ratio);
            double px = x + (width * ratio);
            String label = axisTimeLabel(timestamps, index, i);
            setStroke(content, 0.82, 0.86, 0.91, 0.5);
            line(content, px, y, px, y + height);
            setStroke(content, 0.22, 0.28, 0.38, 0.8);
            line(content, px, y, px, y - 4);
            textColor(content, px - 16, y - 18, 7, label, 0.13, 0.17, 0.24);
        }
    }

    private String axisTimeLabel(List<LocalDateTime> timestamps, int index, int fallbackIndex) {
        if (timestamps == null || timestamps.isEmpty()) {
            return String.valueOf(fallbackIndex + 1);
        }
        LocalDateTime timestamp = timestamps.get(Math.min(index, timestamps.size() - 1));
        return timestamp == null ? String.valueOf(index + 1) : timestamp.toLocalTime().withNano(0).toString();
    }

    private String formatAxisValue(double value) {
        if (Math.abs(value) >= 100) {
            return String.format(Locale.US, "%.0f", value);
        }
        if (Math.abs(value) >= 10) {
            return String.format(Locale.US, "%.1f", value);
        }
        return String.format(Locale.US, "%.2f", value);
    }

    private void drawLegend(StringBuilder content, double x, double y) {
        fillRect(content, x - 8, y - 7, 258, 20, 1, 1, 1);
        setStroke(content, 0.78, 0.82, 0.89, 0.7);
        rect(content, x - 8, y - 7, 258, 20);
        setStroke(content, 0.00, 0.20, 0.62, 2.0);
        line(content, x, y + 3, x + 24, y + 3);
        textColor(content, x + 30, y, 8, "Valores originais", 0.08, 0.11, 0.18);
        setStroke(content, 0.93, 0.31, 0.04, 2.2);
        line(content, x + 128, y + 3, x + 152, y + 3);
        textColor(content, x + 158, y, 8, "Suavizada", 0.08, 0.11, 0.18);
    }

    private List<Point> toPoints(List<Double> values, double x, double y, double width, double height, double min, double max) {
        List<Point> points = new ArrayList<>();
        int size = values.size();
        for (int i = 0; i < size; i++) {
            double px = size == 1 ? x : x + (width * i / (size - 1));
            double py = y + (height * ((values.get(i) - min) / (max - min)));
            points.add(new Point(px, py));
        }
        return points;
    }

    private List<Double> smoothTrendValues(List<Double> values) {
        if (values.size() < 3) {
            return values;
        }

        int baseWindow = Math.max(5, (int) Math.round(values.size() * 0.045));
        int window = Math.min(17, baseWindow % 2 == 0 ? baseWindow + 1 : baseWindow);
        int radius = window / 2;
        List<Double> smoothed = new ArrayList<>(values);

        for (int pass = 0; pass < 2; pass++) {
            List<Double> next = new ArrayList<>(smoothed.size());
            for (int i = 0; i < smoothed.size(); i++) {
                int start = Math.max(0, i - radius);
                int end = Math.min(smoothed.size() - 1, i + radius);
                double total = 0;
                for (int j = start; j <= end; j++) { total += smoothed.get(j); }
                next.add(total / (end - start + 1));
            }
            smoothed = next;
        }

        return smoothed;
    }


    private void drawPoints(StringBuilder content, List<Point> points, double radius, double r, double g, double b) {
        content.append(format(r)).append(' ').append(format(g)).append(' ').append(format(b)).append(" rg\n");
        for (Point point : points) {
            circle(content, point.x, point.y, radius);
        }
    }

    private void circle(StringBuilder content, double cx, double cy, double radius) {
        double c = 0.5522847498 * radius;
        content.append(format(cx + radius)).append(' ').append(format(cy)).append(" m\n")
                .append(format(cx + radius)).append(' ').append(format(cy + c)).append(' ')
                .append(format(cx + c)).append(' ').append(format(cy + radius)).append(' ')
                .append(format(cx)).append(' ').append(format(cy + radius)).append(" c\n")
                .append(format(cx - c)).append(' ').append(format(cy + radius)).append(' ')
                .append(format(cx - radius)).append(' ').append(format(cy + c)).append(' ')
                .append(format(cx - radius)).append(' ').append(format(cy)).append(" c\n")
                .append(format(cx - radius)).append(' ').append(format(cy - c)).append(' ')
                .append(format(cx - c)).append(' ').append(format(cy - radius)).append(' ')
                .append(format(cx)).append(' ').append(format(cy - radius)).append(" c\n")
                .append(format(cx + c)).append(' ').append(format(cy - radius)).append(' ')
                .append(format(cx + radius)).append(' ').append(format(cy - c)).append(' ')
                .append(format(cx + radius)).append(' ').append(format(cy)).append(" c f\n");
    }

    private LogoImage loadLogoImage() throws IOException {
        try (InputStream inputStream = getClass().getResourceAsStream(LOGO_PATH)) {
            if (inputStream == null) {
                return null;
            }
            BufferedImage source = ImageIO.read(inputStream);
            if (source == null) {
                return null;
            }
            BufferedImage rgbImage = new BufferedImage(source.getWidth(), source.getHeight(), BufferedImage.TYPE_INT_RGB);
            Graphics2D graphics = rgbImage.createGraphics();
            graphics.setRenderingHint(RenderingHints.KEY_RENDERING, RenderingHints.VALUE_RENDER_QUALITY);
            graphics.drawImage(source, 0, 0, java.awt.Color.WHITE, null);
            graphics.dispose();
            ByteArrayOutputStream outputStream = new ByteArrayOutputStream();
            ImageIO.write(rgbImage, "jpg", outputStream);
            return new LogoImage(outputStream.toByteArray(), rgbImage.getWidth(), rgbImage.getHeight());
        }
    }

    private void drawImage(StringBuilder content, String imageName, double x, double y, double width, double height) {
        content.append("q\n")
                .append(format(width)).append(" 0 0 ").append(format(height)).append(' ')
                .append(format(x)).append(' ').append(format(y)).append(" cm\n/")
                .append(imageName).append(" Do\nQ\n");
    }

    private double estimateTextWidth(String value, double fontSize) {
        return Optional.ofNullable(value).orElse("").length() * (fontSize * 0.52);
    }

    private void addPageNumbers(List<String> pages) {
        int total = pages.size();
        for (int i = 0; i < total; i++) {
            StringBuilder content = new StringBuilder(pages.get(i));
            textColor(content, PAGE_WIDTH - 92, 28, 8, "Pagina " + (i + 1) + " de " + total, 0.28, 0.33, 0.41);
            pages.set(i, content.toString());
        }
    }

    private byte[] writePdf(List<String> pages, LogoImage logoImage) throws IOException {
        List<byte[]> objects = new ArrayList<>();
        int pageCount = pages.size();
        int firstPageObject = 4;
        int firstContentObject = firstPageObject + pageCount;
        int imageObject = firstContentObject + pageCount;

        String kids = java.util.stream.IntStream.range(0, pageCount)
                .mapToObj(i -> (firstPageObject + i) + " 0 R")
                .collect(Collectors.joining(" "));
        objects.add("<< /Type /Catalog /Pages 2 0 R >>".getBytes(StandardCharsets.ISO_8859_1));
        objects.add(("<< /Type /Pages /Kids [" + kids + "] /Count " + pageCount + " >>").getBytes(StandardCharsets.ISO_8859_1));
        objects.add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>".getBytes(StandardCharsets.ISO_8859_1));

        String imageResource = logoImage == null ? "" : " /XObject << /Im1 " + imageObject + " 0 R >>";
        for (int i = 0; i < pageCount; i++) {
            int contentObject = firstContentObject + i;
            objects.add(("<< /Type /Page /Parent 2 0 R /MediaBox [0 0 " + (int) PAGE_WIDTH + " " + (int) PAGE_HEIGHT + "] /Resources << /Font << /F1 3 0 R >>" + imageResource + " >> /Contents " + contentObject + " 0 R >>").getBytes(StandardCharsets.ISO_8859_1));
        }

        for (String page : pages) {
            byte[] contentBytes = page.getBytes(StandardCharsets.ISO_8859_1);
            objects.add(("<< /Length " + contentBytes.length + " >>\nstream\n" + page + "\nendstream").getBytes(StandardCharsets.ISO_8859_1));
        }

        if (logoImage != null) {
            ByteArrayOutputStream image = new ByteArrayOutputStream();
            image.write(("<< /Type /XObject /Subtype /Image /Width " + logoImage.width() + " /Height " + logoImage.height() + " /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length " + logoImage.bytes().length + " >>\nstream\n").getBytes(StandardCharsets.ISO_8859_1));
            image.write(logoImage.bytes());
            image.write("\nendstream".getBytes(StandardCharsets.ISO_8859_1));
            objects.add(image.toByteArray());
        }

        return writeObjects(objects);
    }

    private byte[] writeSinglePagePdf(String content, LogoImage logoImage) throws IOException {
        List<byte[]> objects = new ArrayList<>();
        byte[] contentBytes = content.getBytes(StandardCharsets.ISO_8859_1);
        objects.add("<< /Type /Catalog /Pages 2 0 R >>".getBytes(StandardCharsets.ISO_8859_1));
        objects.add("<< /Type /Pages /Kids [3 0 R] /Count 1 >>".getBytes(StandardCharsets.ISO_8859_1));
        String imageResource = logoImage == null ? "" : " /XObject << /Im1 6 0 R >>";
        objects.add(("<< /Type /Page /Parent 2 0 R /MediaBox [0 0 " + (int) PAGE_WIDTH + " " + (int) PAGE_HEIGHT + "] /Resources << /Font << /F1 4 0 R >>" + imageResource + " >> /Contents 5 0 R >>").getBytes(StandardCharsets.ISO_8859_1));
        objects.add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>".getBytes(StandardCharsets.ISO_8859_1));
        objects.add(("<< /Length " + contentBytes.length + " >>\nstream\n" + content + "\nendstream").getBytes(StandardCharsets.ISO_8859_1));
        if (logoImage != null) {
            ByteArrayOutputStream imageObject = new ByteArrayOutputStream();
            imageObject.write(("<< /Type /XObject /Subtype /Image /Width " + logoImage.width() + " /Height " + logoImage.height() + " /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length " + logoImage.bytes().length + " >>\nstream\n").getBytes(StandardCharsets.ISO_8859_1));
            imageObject.write(logoImage.bytes());
            imageObject.write("\nendstream".getBytes(StandardCharsets.ISO_8859_1));
            objects.add(imageObject.toByteArray());
        }
        return writeObjects(objects);
    }

    private byte[] writeObjects(List<byte[]> objects) throws IOException {
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        output.write("%PDF-1.4\n".getBytes(StandardCharsets.ISO_8859_1));
        List<Integer> offsets = new ArrayList<>();
        for (int i = 0; i < objects.size(); i++) {
            offsets.add(output.size());
            output.write(((i + 1) + " 0 obj\n").getBytes(StandardCharsets.ISO_8859_1));
            output.write(objects.get(i));
            output.write("\nendobj\n".getBytes(StandardCharsets.ISO_8859_1));
        }
        int xref = output.size();
        output.write(("xref\n0 " + (objects.size() + 1) + "\n0000000000 65535 f \n").getBytes(StandardCharsets.ISO_8859_1));
        for (Integer offset : offsets) {
            output.write(String.format(Locale.US, "%010d 00000 n \n", offset).getBytes(StandardCharsets.ISO_8859_1));
        }
        output.write(("trailer\n<< /Size " + (objects.size() + 1) + " /Root 1 0 R >>\nstartxref\n" + xref + "\n%%EOF").getBytes(StandardCharsets.ISO_8859_1));
        return output.toByteArray();
    }

    private void drawPolyline(StringBuilder content, List<Point> points, double r, double g, double b, double width) {
        if (points.isEmpty()) { return; }
        setStroke(content, r, g, b, width);
        Point first = points.get(0);
        content.append(format(first.x)).append(' ').append(format(first.y)).append(" m\n");
        for (int i = 1; i < points.size(); i++) { Point point = points.get(i); content.append(format(point.x)).append(' ').append(format(point.y)).append(" l\n"); }
        content.append("S\n");
    }

    private void drawSmoothCurve(StringBuilder content, List<Point> points, double r, double g, double b, double width) {
        if (points.isEmpty()) { return; }
        if (points.size() == 1) {
            drawPolyline(content, points, r, g, b, width);
            return;
        }

        setStroke(content, r, g, b, width);
        Point first = points.get(0);
        content.append(format(first.x)).append(' ').append(format(first.y)).append(" m\n");
        for (int i = 1; i < points.size(); i++) {
            Point previous = points.get(i - 1);
            Point current = points.get(i);
            double middleX = (previous.x + current.x) / 2.0;
            double middleY = (previous.y + current.y) / 2.0;
            content.append(format(previous.x)).append(' ').append(format(previous.y)).append(' ')
                    .append(format(middleX)).append(' ').append(format(middleY)).append(" q\n");
        }
        Point last = points.get(points.size() - 1);
        content.append(format(last.x)).append(' ').append(format(last.y)).append(" l\nS\n");
    }

    private void line(StringBuilder content, double x1, double y1, double x2, double y2) { content.append(format(x1)).append(' ').append(format(y1)).append(" m ").append(format(x2)).append(' ').append(format(y2)).append(" l S\n"); }
    private void setStroke(StringBuilder content, double r, double g, double b, double width) { content.append(format(width)).append(" w\n").append(format(r)).append(' ').append(format(g)).append(' ').append(format(b)).append(" RG\n"); }
    private void setFill(StringBuilder content, double r, double g, double b) { content.append(format(r)).append(' ').append(format(g)).append(' ').append(format(b)).append(" rg\n"); }
    private void rect(StringBuilder content, double x, double y, double width, double height) { content.append(format(x)).append(' ').append(format(y)).append(' ').append(format(width)).append(' ').append(format(height)).append(" re S\n"); }
    private void fillRect(StringBuilder content, double x, double y, double width, double height, double r, double g, double b) { setFill(content, r, g, b); content.append(format(x)).append(' ').append(format(y)).append(' ').append(format(width)).append(' ').append(format(height)).append(" re f\n"); }
    private void text(StringBuilder content, double x, double y, int size, String text) { textColor(content, x, y, size, text, 0.08, 0.11, 0.18); }
    private void textColor(StringBuilder content, double x, double y, int size, String text, double r, double g, double b) {
        content.append("q\n");
        setFill(content, r, g, b);
        content.append("BT /F1 ").append(size).append(" Tf ").append(format(x)).append(' ').append(format(y)).append(" Td (").append(escape(text)).append(") Tj ET\n");
        content.append("Q\n");
    }
    private String escape(String text) { return Optional.ofNullable(text).orElse("").replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)"); }
    private String format(double value) { return String.format(Locale.US, "%.2f", value); }

    private void appendToIndex(GeneratedOperationChart chart) throws IOException {
        Path indexPath = getIndexPath(); Files.createDirectories(indexPath.getParent());
        String line = String.join("\t", cleanIndex(chart.getTitle()), cleanIndex(chart.getWellName()), INDEX_DATE_FORMAT.format(chart.getCreatedAt()), chart.getPdfPath().toAbsolutePath().toString());
        Files.writeString(indexPath, line + System.lineSeparator(), StandardCharsets.UTF_8, Files.exists(indexPath) ? java.nio.file.StandardOpenOption.APPEND : java.nio.file.StandardOpenOption.CREATE);
    }

    private Optional<GeneratedOperationChart> parseIndexLine(String line) {
        String[] parts = line.split("\t", -1);
        if (parts.length < 4) { return Optional.empty(); }
        return Optional.of(new GeneratedOperationChart(parts[0], parts[1], LocalDateTime.parse(parts[2], INDEX_DATE_FORMAT), Path.of(parts[3])));
    }

    private Path getIndexPath() { return getArchiveDirectory().resolve("index.tsv"); }
    private Path getArchiveDirectory() { return com.geopetro.desktop.comum.AppPaths.archiveDir(); }
    private String cleanIndex(String value) { return Optional.ofNullable(value).orElse("").replace("\t", " ").replace("\n", " ").replace("\r", " "); }
    private String slug(String value) { String sanitized = Optional.ofNullable(value).orElse("carta-operacao").toLowerCase(Locale.ROOT).replaceAll("[^a-z0-9]+", "-").replaceAll("(^-|-$)", ""); return sanitized.isBlank() ? "carta-operacao" : sanitized; }
    private record Point(double x, double y) {}
    private record LogoImage(byte[] bytes, int width, int height) {}
}

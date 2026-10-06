package com.example.braservhorusdesktop.service;

import java.awt.image.BufferedImage;
import java.io.File;
import java.time.LocalDateTime;
import java.util.List;

import javax.imageio.ImageIO;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.PDPageContentStream.AppendMode;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.font.PDType1Font;
import org.apache.pdfbox.pdmodel.graphics.image.PDImageXObject;

import com.example.braservhorusdesktop.model.UnidadePressao;
import com.example.braservhorusdesktop.repository.JsonRegistroService;

/**
 * Serviço para gerar PDF com 4 gráficos em A4 paisagem
 */
public class PdfService {

    private static final float PAGE_WIDTH = 842f;   // A4 paisagem
    private static final float PAGE_HEIGHT = 595f;  // A4 paisagem

    private static final float PAGE_MARGIN = 15f;
    private static final float CONTENT_MARGIN = 30f;
    private static final float GRID_GAP = 20f;

    private static final float HEADER_TOP_OFFSET = 35f;
    private static final float TITLE_Y_OFFSET = 60f;
    private static final float PERIOD_Y_OFFSET = 82f;

    private static final float HEADER_RESERVED_HEIGHT = 110f;
    private static final float FOOTER_RESERVED_HEIGHT = 45f;

    private static final int BLUE_R = 52;
    private static final int BLUE_G = 152;
    private static final int BLUE_B = 219;

    private static final int DARK_TEXT = 60;
    private static final int GRAY_TEXT = 100;

    /** Etapas reportadas ao progresso; o denominador da barra. */
    private static final int TOTAL_ETAPAS = 8;

    private final GraficoService graficoService;

    public PdfService() {
        this.graficoService = new GraficoService();
    }

    /**
     * Recebe o andamento da geracao.
     *
     * <p>Chamado na thread que esta gerando o PDF — nunca na thread de UI. Quem implementa e
     * responsavel por passar a atualizacao para a interface.
     */
    @FunctionalInterface
    public interface ProgressoListener {
        void aoAvancar(String etapa, int concluidas, int total);
    }

    /** Falha na geracao do relatorio. */
    public static class PdfGeracaoException extends RuntimeException {
        public PdfGeracaoException(String mensagem, Throwable causa) {
            super(mensagem, causa);
        }
    }

    private void notificar(ProgressoListener progresso, String etapa, int concluidas, int total) {
        if (progresso != null) {
            progresso.aoAvancar(etapa, concluidas, total);
        }
    }

    /**
     * Gera PDF com 4 gráficos em A4 paisagem
     */
    public void gerarPdfComGraficos(
            String nomePoco,
            LocalDateTime dataInicio,
            LocalDateTime dataFim,
            String horaInicio,
            String horaFim,
            String caminhoSaida) {

        gerarPdfComGraficos(nomePoco, dataInicio, dataFim, horaInicio, horaFim, caminhoSaida,
                UnidadePressao.PSI, null);
    }

    /**
     * Gera o relatorio, reportando o andamento e propagando falhas.
     *
     * @param unidadePressao unidade dos graficos de pressao; os registros seguem em PSI
     * @param progresso      chamado a cada etapa concluida; pode ser {@code null}
     * @throws PdfGeracaoException se qualquer etapa falhar — quem chama precisa saber que o arquivo
     *                             nao foi produzido. Antes as excecoes eram apenas impressas, e a
     *                             tela anunciava "PDF gerado com sucesso" mesmo quando nada fora
     *                             gravado.
     */
    public void gerarPdfComGraficos(
            String nomePoco,
            LocalDateTime dataInicio,
            LocalDateTime dataFim,
            String horaInicio,
            String horaFim,
            String caminhoSaida,
            UnidadePressao unidadePressao,
            ProgressoListener progresso) {

        UnidadePressao unidade = unidadePressao == null ? UnidadePressao.PSI : unidadePressao;
        PDDocument document = new PDDocument();

        try {
            notificar(progresso, "Preparando o documento...", 0, TOTAL_ETAPAS);

            PDPage page = new PDPage(new PDRectangle(PAGE_WIDTH, PAGE_HEIGHT));
            document.addPage(page);

            float pageWidth = page.getMediaBox().getWidth();
            float pageHeight = page.getMediaBox().getHeight();

            desenharBorda(document, page, pageWidth, pageHeight);
            escreverCabecalho(document, page, pageWidth, pageHeight, nomePoco, dataInicio, dataFim, horaInicio, horaFim);

            notificar(progresso, "Lendo os registros do período...", 1, TOTAL_ETAPAS);
            List<JsonRegistroService.RegistroJson> registros =
                    graficoService.obterRegistrosNoPeriodo(dataInicio, dataFim);

            notificar(progresso, "Gerando gráfico de pressão...", 2, TOTAL_ETAPAS);
            BufferedImage imagePressao =
                    graficoService.gerarGraficoPressao(registros, dataInicio, dataFim, unidade);

            notificar(progresso, "Gerando gráfico de strokes...", 3, TOTAL_ETAPAS);
            BufferedImage imageStroke =
                    graficoService.gerarGraficoStrokeMinuto(registros, dataInicio, dataFim);

            notificar(progresso, "Gerando gráfico de vazão...", 4, TOTAL_ETAPAS);
            BufferedImage imageVazao =
                    graficoService.gerarGraficoVazaoBBL(registros, dataInicio, dataFim);

            notificar(progresso, "Gerando gráfico de volume...", 5, TOTAL_ETAPAS);
            BufferedImage imageVolume =
                    graficoService.gerarGraficoVolumeAcumulado(registros, dataInicio, dataFim);

            // Área útil dos gráficos
            float areaX = CONTENT_MARGIN;
            float areaWidth = pageWidth - (CONTENT_MARGIN * 2);

            float areaTop = pageHeight - HEADER_RESERVED_HEIGHT;
            float areaBottom = FOOTER_RESERVED_HEIGHT;
            float areaHeight = areaTop - areaBottom;

            float chartWidth = (areaWidth - GRID_GAP) / 2f;
            float chartHeight = (areaHeight - GRID_GAP) / 2f;

            // Colunas
            float xEsquerda = areaX;
            float xDireita = areaX + chartWidth + GRID_GAP;

            // Linhas
            float yTopo = areaTop;
            float yBaixo = areaBottom + chartHeight;

            notificar(progresso, "Montando a página...", 6, TOTAL_ETAPAS);
            adicionarGraficoAoPdf(document, page, imagePressao, xEsquerda, yTopo, chartWidth, chartHeight);
            adicionarGraficoAoPdf(document, page, imageStroke, xDireita, yTopo, chartWidth, chartHeight);
            adicionarGraficoAoPdf(document, page, imageVazao, xEsquerda, yBaixo, chartWidth, chartHeight);
            adicionarGraficoAoPdf(document, page, imageVolume, xDireita, yBaixo, chartWidth, chartHeight);

            escreverRodape(document, page, dataInicio, dataFim, unidade);

            notificar(progresso, "Gravando o arquivo...", 7, TOTAL_ETAPAS);
            document.save(caminhoSaida);
            notificar(progresso, "Concluído.", TOTAL_ETAPAS, TOTAL_ETAPAS);
            System.out.println("[PDF] Arquivo gerado com sucesso: " + caminhoSaida);

        } catch (Exception e) {
            System.err.println("[PDF] Erro ao gerar PDF: " + e.getMessage());
            throw new PdfGeracaoException("Não foi possível gerar o PDF: " + e.getMessage(), e);
        } finally {
            try {
                document.close();
            } catch (Exception e) {
                System.err.println("[PDF] Erro ao fechar documento: " + e.getMessage());
            }
        }
    }

    private void desenharBorda(PDDocument document, PDPage page, float pageWidth, float pageHeight) throws Exception {
        try (PDPageContentStream contentStream =
                     new PDPageContentStream(document, page, AppendMode.APPEND, true, true)) {

            contentStream.setStrokingColor(BLUE_R, BLUE_G, BLUE_B);
            contentStream.setLineWidth(2f);
            contentStream.addRect(
                    PAGE_MARGIN,
                    PAGE_MARGIN,
                    pageWidth - (PAGE_MARGIN * 2),
                    pageHeight - (PAGE_MARGIN * 2));
            contentStream.stroke();
        }
    }

    private void escreverCabecalho(
            PDDocument document,
            PDPage page,
            float pageWidth,
            float pageHeight,
            String nomePoco,
            LocalDateTime dataInicio,
            LocalDateTime dataFim,
            String horaInicio,
            String horaFim) throws Exception {

        PDType1Font fontBold = PDType1Font.HELVETICA_BOLD;
        PDType1Font fontRegular = PDType1Font.HELVETICA;

        String empresa = "Geopetro IO - Braserv";

        String periodo = String.format(
                "Período: %s %s até %s %s",
                dataInicio.toLocalDate(),
                horaInicio,
                dataFim.toLocalDate(),
                horaFim);

        try (PDPageContentStream contentStream =
                     new PDPageContentStream(document, page, AppendMode.APPEND, true, true)) {

            float empresaFontSize = 10f;
            float empresaWidth = fontBold.getStringWidth(empresa) / 1000f * empresaFontSize;

            // Empresa - canto superior direito
            contentStream.beginText();
            contentStream.setFont(fontBold, empresaFontSize);
            contentStream.setNonStrokingColor(GRAY_TEXT, GRAY_TEXT, GRAY_TEXT);
            contentStream.newLineAtOffset(pageWidth - empresaWidth - 25f, pageHeight - HEADER_TOP_OFFSET);
            contentStream.showText(empresa);
            contentStream.endText();

            // Nome do poço
            contentStream.beginText();
            contentStream.setFont(fontBold, 18f);
            contentStream.setNonStrokingColor(BLUE_R, BLUE_G, BLUE_B);
            contentStream.newLineAtOffset(30f, pageHeight - TITLE_Y_OFFSET);
            contentStream.showText(nomePoco != null && !nomePoco.isBlank() ? nomePoco : "-");
            contentStream.endText();

            // Período
            contentStream.beginText();
            contentStream.setFont(fontRegular, 11f);
            contentStream.setNonStrokingColor(DARK_TEXT, DARK_TEXT, DARK_TEXT);
            contentStream.newLineAtOffset(30f, pageHeight - PERIOD_Y_OFFSET);
            contentStream.showText(periodo);
            contentStream.endText();
        }
    }

    private void escreverRodape(
            PDDocument document,
            PDPage page,
            LocalDateTime dataInicio,
            LocalDateTime dataFim,
            UnidadePressao unidade) throws Exception {

        PDType1Font fontRegular = PDType1Font.HELVETICA;
        String estatisticas = graficoService.obterEstatisticas(dataInicio, dataFim, unidade);

        if (estatisticas == null) {
            estatisticas = "";
        }

        try (PDPageContentStream contentStream =
                     new PDPageContentStream(document, page, AppendMode.APPEND, true, true)) {

            contentStream.beginText();
            contentStream.setFont(fontRegular, 9f);
            contentStream.setNonStrokingColor(DARK_TEXT, DARK_TEXT, DARK_TEXT);
            contentStream.newLineAtOffset(30f, 25f);
            contentStream.showText(estatisticas);
            contentStream.endText();
        }
    }

    /**
     * Adiciona um gráfico ao PDF.
     * O parâmetro topY representa o topo da área do gráfico.
     */
    private void adicionarGraficoAoPdf(
            PDDocument document,
            PDPage page,
            BufferedImage imagem,
            float x,
            float topY,
            float width,
            float height) {

        File tempFile = null;

        try {
            tempFile = File.createTempFile("grafico_", ".png");
            ImageIO.write(imagem, "PNG", tempFile);

            PDImageXObject pdImage = PDImageXObject.createFromFile(tempFile.getAbsolutePath(), document);

            try (PDPageContentStream contentStream =
                         new PDPageContentStream(document, page, AppendMode.APPEND, true, true)) {

                float drawY = topY - height;
                contentStream.drawImage(pdImage, x, drawY, width, height);
            }

        } catch (Exception e) {
            // Sem relancar, um grafico ausente passaria despercebido e o relatorio sairia
            // incompleto anunciado como bem-sucedido.
            System.err.println("[PDF] Erro ao adicionar gráfico: " + e.getMessage());
            throw new PdfGeracaoException("Falha ao inserir um dos gráficos no PDF: " + e.getMessage(), e);
        } finally {
            if (tempFile != null && tempFile.exists() && !tempFile.delete()) {
                System.err.println("[PDF] Não foi possível remover o arquivo temporário: " + tempFile.getAbsolutePath());
            }
        }
    }
}

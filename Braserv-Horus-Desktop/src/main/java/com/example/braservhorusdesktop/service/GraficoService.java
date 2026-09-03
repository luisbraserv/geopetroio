package com.example.braservhorusdesktop.service;

import java.awt.BasicStroke;
import java.awt.Color;
import java.awt.Font;
import java.awt.FontMetrics;
import java.awt.Graphics2D;
import java.awt.RenderingHints;
import java.awt.image.BufferedImage;
import java.time.Duration;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;

import com.example.braservhorusdesktop.model.UnidadePressao;
import com.example.braservhorusdesktop.repository.JsonRegistroService;

/**
 * Serviço para gerar gráficos com design minimalista
 */
public class GraficoService {

    private final JsonRegistroService jsonRegistroService;
    
    private static final Color COR_FUNDO = new Color(250, 250, 250);
    private static final Color COR_LINHA = new Color(52, 152, 219);
    private static final Color COR_LINHA_SUAVIZADA = new Color(220, 53, 69);
    private static final Color COR_GRID = new Color(230, 230, 230);
    private static final Color COR_TEXTO = new Color(60, 60, 60);
    private static final Color COR_EIXO = new Color(100, 100, 100);
    private static final long INTERVALO_MAXIMO_CONEXAO_SEGUNDOS = 5L;

    public GraficoService() {
        this.jsonRegistroService = new JsonRegistroService();
    }

    /**
     * Gera imagem de gráfico de Pressão vs Tempo
     */
    public BufferedImage gerarGraficoPressao(LocalDateTime dataInicio, LocalDateTime dataFim) {
        return gerarGraficoPressao(obterRegistrosNoPeriodo(dataInicio, dataFim), dataInicio, dataFim);
    }

    public BufferedImage gerarGraficoPressao(
            List<JsonRegistroService.RegistroJson> registros,
            LocalDateTime dataInicio,
            LocalDateTime dataFim
    ) {
        return gerarGraficoPressao(registros, dataInicio, dataFim, UnidadePressao.PSI);
    }

    /**
     * Gera o grafico de pressao na unidade pedida.
     *
     * <p>A conversao acontece aqui, na geracao — os registros continuam em PSI. Assim o mesmo
     * historico pode ser plotado nas duas unidades sem reprocessar nada, e o arquivo de dados nunca
     * fica ambiguo sobre em que unidade foi gravado.
     */
    public BufferedImage gerarGraficoPressao(
            List<JsonRegistroService.RegistroJson> registros,
            LocalDateTime dataInicio,
            LocalDateTime dataFim,
            UnidadePressao unidadePressao
    ) {
        UnidadePressao unidade = unidadePressao == null ? UnidadePressao.PSI : unidadePressao;
        return gerarGrafico("Pressão (" + unidade.getRotulo() + ")", registros, dataInicio, dataFim, 0, unidade);
    }

    /**
     * Gera imagem de gráfico de Stroke/min vs Tempo
     */
    public BufferedImage gerarGraficoStrokeMinuto(LocalDateTime dataInicio, LocalDateTime dataFim) {
        return gerarGraficoStrokeMinuto(obterRegistrosNoPeriodo(dataInicio, dataFim), dataInicio, dataFim);
    }

    public BufferedImage gerarGraficoStrokeMinuto(
            List<JsonRegistroService.RegistroJson> registros,
            LocalDateTime dataInicio,
            LocalDateTime dataFim
    ) {
        return gerarGrafico("Strokes/min", registros, dataInicio, dataFim, 1, UnidadePressao.PSI);
    }

    /**
     * Gera imagem de gráfico de Vazão BBL/min vs Tempo
     */
    public BufferedImage gerarGraficoVazaoBBL(LocalDateTime dataInicio, LocalDateTime dataFim) {
        return gerarGraficoVazaoBBL(obterRegistrosNoPeriodo(dataInicio, dataFim), dataInicio, dataFim);
    }

    public BufferedImage gerarGraficoVazaoBBL(
            List<JsonRegistroService.RegistroJson> registros,
            LocalDateTime dataInicio,
            LocalDateTime dataFim
    ) {
        return gerarGrafico("Vazão (BBL/min)", registros, dataInicio, dataFim, 2, UnidadePressao.PSI);
    }

    /**
     * Gera imagem de gráfico de Volume Acumulado vs Tempo
     */
    public BufferedImage gerarGraficoVolumeAcumulado(LocalDateTime dataInicio, LocalDateTime dataFim) {
        return gerarGraficoVolumeAcumulado(obterRegistrosNoPeriodo(dataInicio, dataFim), dataInicio, dataFim);
    }

    public BufferedImage gerarGraficoVolumeAcumulado(
            List<JsonRegistroService.RegistroJson> registros,
            LocalDateTime dataInicio,
            LocalDateTime dataFim
    ) {
        return gerarGrafico("Volume (BBL)", registros, dataInicio, dataFim, 3, UnidadePressao.PSI);
    }

    public List<JsonRegistroService.RegistroJson> obterRegistrosNoPeriodo(
            LocalDateTime dataInicio,
            LocalDateTime dataFim
    ) {
        List<JsonRegistroService.RegistroJson> registrosFiltrados = new ArrayList<>();

        for (JsonRegistroService.RegistroJson registro : jsonRegistroService.obterRegistros()) {
            LocalDateTime timestamp = obterTimestamp(registro);

            if (timestamp != null
                    && !timestamp.isBefore(dataInicio)
                    && !timestamp.isAfter(dataFim)) {
                registrosFiltrados.add(registro);
            }
        }

        registrosFiltrados.sort(Comparator.comparing(this::obterTimestamp));
        return registrosFiltrados;
    }

    /**
     * Gera uma imagem de gráfico com design minimalista
     */
    private BufferedImage gerarGrafico(
            String labelY,
            List<JsonRegistroService.RegistroJson> registros,
            LocalDateTime dataInicio,
            LocalDateTime dataFim,
            int tipoGrafico,
            UnidadePressao unidadePressao
    ) {
        
        int largura = 420;
        int altura = 240;
        BufferedImage imagem = new BufferedImage(largura, altura, BufferedImage.TYPE_INT_RGB);
        Graphics2D g2d = imagem.createGraphics();

        // Ativa antialiasing para melhor qualidade
        g2d.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
        g2d.setRenderingHint(RenderingHints.KEY_TEXT_ANTIALIASING, RenderingHints.VALUE_TEXT_ANTIALIAS_ON);

        // Fundo
        g2d.setColor(COR_FUNDO);
        g2d.fillRect(0, 0, largura, altura);

        // Margens
        int margem = 60;
        int areaLargura = largura - (margem * 2);
        int areaAltura = altura - margem - 50;

        List<PontoGrafico> pontos = new ArrayList<>();
        double maximo = 0.0;

        for (JsonRegistroService.RegistroJson registro : registros) {
            LocalDateTime timestamp = obterTimestamp(registro);
            if (timestamp != null) {
                double valor = obterValor(registro, tipoGrafico, unidadePressao);
                pontos.add(new PontoGrafico(timestamp, valor));
                maximo = Math.max(maximo, valor);
            }
        }

        if (pontos.isEmpty()) {
            g2d.setColor(COR_TEXTO);
            g2d.setFont(new Font("Arial", Font.PLAIN, 12));
            g2d.drawString("Sem dados para o período", margem + 20, altura / 2);
            g2d.dispose();
            return imagem;
        }

        double minimo = 0.0;
        maximo = maximo > 0.0 ? maximo * 1.1 : 1.0;
        double range = maximo - minimo;

        // Desenha grid horizontal leve
        g2d.setColor(COR_GRID);
        g2d.setStroke(new BasicStroke(0.5f));
        int numLinhasGrid = 5;
        for (int i = 0; i <= numLinhasGrid; i++) {
            int y = (int) (margem + areaAltura - (i * areaAltura / (double) numLinhasGrid));
            g2d.drawLine(margem, y, margem + areaLargura, y);
        }

        // Desenha eixos
        g2d.setColor(COR_EIXO);
        g2d.setStroke(new BasicStroke(1.5f));
        g2d.drawLine(margem, margem, margem, margem + areaAltura);
        g2d.drawLine(margem, margem + areaAltura, margem + areaLargura, margem + areaAltura);

        // Desenha valores no eixo Y
        g2d.setFont(new Font("Arial", Font.PLAIN, 9));
        g2d.setColor(COR_EIXO);
        for (int i = 0; i <= numLinhasGrid; i++) {
            double valor = minimo + (i * range / (double) numLinhasGrid);
            int y = (int) (margem + areaAltura - (i * areaAltura / (double) numLinhasGrid));
            String texto = String.format("%.1f", valor);
            FontMetrics metrics = g2d.getFontMetrics();
            int stringWidth = metrics.stringWidth(texto);
            g2d.drawString(texto, margem - stringWidth - 8, y + 4);
        }

        // Desenha valores no eixo X respeitando o intervalo de tempo real
        g2d.setColor(COR_EIXO);
        int numValoresX = 5;
        Duration duracao = Duration.between(dataInicio, dataFim);
        DateTimeFormatter formatoEixoX = duracao.toHours() >= 24
                ? DateTimeFormatter.ofPattern("dd/MM HH:mm")
                : DateTimeFormatter.ofPattern("HH:mm:ss");

        for (int i = 0; i < numValoresX; i++) {
            double proporcao = i / (double) (numValoresX - 1);
            int x = margem + (int) Math.round(proporcao * areaLargura);
            g2d.drawLine(x, margem + areaAltura, x, margem + areaAltura + 5);

            LocalDateTime horario = dataInicio.plus(
                    duracao.multipliedBy(i).dividedBy(numValoresX - 1)
            );
            String texto = horario.format(formatoEixoX);
            FontMetrics metrics = g2d.getFontMetrics();
            int stringWidth = metrics.stringWidth(texto);
            g2d.drawString(texto, x - stringWidth / 2, margem + areaAltura + 18);
        }

        // Mantém a série original e sobrepõe uma tendência suavizada em alto contraste.
        desenharLinha(
                g2d,
                pontos,
                dataInicio,
                dataFim,
                margem,
                areaLargura,
                areaAltura,
                minimo,
                range,
                COR_LINHA,
                1.6f
        );

        List<PontoGrafico> pontosSuavizados = suavizarPontos(pontos);
        if (pontosSuavizados.size() >= 3) {
            desenharLinha(
                    g2d,
                    pontosSuavizados,
                    dataInicio,
                    dataFim,
                    margem,
                    areaLargura,
                    areaAltura,
                    minimo,
                    range,
                    COR_LINHA_SUAVIZADA,
                    3.0f
            );
        }

        if (pontos.size() <= areaLargura) {
            g2d.setColor(COR_LINHA);
            for (PontoGrafico ponto : pontos) {
                int x = calcularPosicaoX(ponto.timestamp, dataInicio, dataFim, margem, areaLargura);
                int y = (int) calcularPosicaoY(ponto.valor, minimo, range, margem, areaAltura);
                g2d.fillOval(x - 2, y - 2, 4, 4);
            }
        }

        // Título
        g2d.setColor(COR_TEXTO);
        g2d.setFont(new Font("Arial", Font.BOLD, 13));
        g2d.drawString(labelY, margem, 25);

        if (pontosSuavizados.size() >= 3) {
            g2d.setColor(COR_LINHA_SUAVIZADA);
            g2d.setStroke(new BasicStroke(3.0f));
            g2d.drawLine(292, 21, 316, 21);
            g2d.setColor(COR_TEXTO);
            g2d.setFont(new Font("Arial", Font.PLAIN, 9));
            g2d.drawString("Tendência", 321, 24);
        }

        // Label do eixo X (tempo)
        g2d.setFont(new Font("Arial", Font.PLAIN, 9));
        g2d.setColor(COR_EIXO);
        g2d.drawString("Horário →", margem + areaLargura - 50, margem + areaAltura + 40);

        g2d.dispose();
        return imagem;
    }

    private void desenharLinha(
            Graphics2D g2d,
            List<PontoGrafico> pontos,
            LocalDateTime dataInicio,
            LocalDateTime dataFim,
            int margem,
            int areaLargura,
            int areaAltura,
            double minimo,
            double range,
            Color cor,
            float espessura
    ) {
        if (pontos.isEmpty()) {
            return;
        }

        g2d.setColor(cor);
        g2d.setStroke(new BasicStroke(espessura, BasicStroke.CAP_ROUND, BasicStroke.JOIN_ROUND));

        PontoGrafico primeiroPonto = pontos.get(0);
        int xAnterior = calcularPosicaoX(
                primeiroPonto.timestamp,
                dataInicio,
                dataFim,
                margem,
                areaLargura
        );
        double yAnterior = calcularPosicaoY(
                primeiroPonto.valor,
                minimo,
                range,
                margem,
                areaAltura
        );

        for (int i = 1; i < pontos.size(); i++) {
            PontoGrafico ponto = pontos.get(i);
            PontoGrafico pontoAnterior = pontos.get(i - 1);
            int xAtual = calcularPosicaoX(
                    ponto.timestamp,
                    dataInicio,
                    dataFim,
                    margem,
                    areaLargura
            );
            double yAtual = calcularPosicaoY(
                    ponto.valor,
                    minimo,
                    range,
                    margem,
                    areaAltura
            );

            long intervaloSegundos = Math.abs(
                    Duration.between(pontoAnterior.timestamp, ponto.timestamp).getSeconds()
            );
            if (intervaloSegundos <= INTERVALO_MAXIMO_CONEXAO_SEGUNDOS) {
                g2d.drawLine(xAnterior, (int) yAnterior, xAtual, (int) yAtual);
            }

            xAnterior = xAtual;
            yAnterior = yAtual;
        }
    }

    private List<PontoGrafico> suavizarPontos(List<PontoGrafico> pontos) {
        if (pontos.size() < 3) {
            return List.of();
        }

        int tamanhoJanela = calcularTamanhoJanelaSuavizacao(pontos.size());
        int raioJanela = tamanhoJanela / 2;
        List<PontoGrafico> suavizados = new ArrayList<>(pontos.size());
        int inicioSegmento = 0;

        for (int i = 1; i <= pontos.size(); i++) {
            boolean fimDaSerie = i == pontos.size();
            boolean existeLacuna = !fimDaSerie
                    && Math.abs(Duration.between(
                            pontos.get(i - 1).timestamp,
                            pontos.get(i).timestamp
                    ).getSeconds()) > INTERVALO_MAXIMO_CONEXAO_SEGUNDOS;

            if (fimDaSerie || existeLacuna) {
                suavizarSegmento(pontos, suavizados, inicioSegmento, i - 1, raioJanela);
                inicioSegmento = i;
            }
        }

        return suavizados;
    }

    private void suavizarSegmento(
            List<PontoGrafico> pontos,
            List<PontoGrafico> suavizados,
            int inicioSegmento,
            int fimSegmento,
            int raioJanela
    ) {
        int tamanhoSegmento = fimSegmento - inicioSegmento + 1;
        double[] somaPrefixada = new double[tamanhoSegmento + 1];

        for (int i = 0; i < tamanhoSegmento; i++) {
            somaPrefixada[i + 1] = somaPrefixada[i] + pontos.get(inicioSegmento + i).valor;
        }

        for (int i = 0; i < tamanhoSegmento; i++) {
            int inicioJanela = Math.max(0, i - raioJanela);
            int fimJanela = Math.min(tamanhoSegmento - 1, i + raioJanela);
            double soma = somaPrefixada[fimJanela + 1] - somaPrefixada[inicioJanela];
            double media = soma / (fimJanela - inicioJanela + 1);
            PontoGrafico pontoOriginal = pontos.get(inicioSegmento + i);

            suavizados.add(new PontoGrafico(pontoOriginal.timestamp, media));
        }
    }

    static int calcularTamanhoJanelaSuavizacao(int totalPontos) {
        if (totalPontos < 3) {
            return 1;
        }

        int tamanhoJanela = Math.max(5, Math.min(101, totalPontos / 20));
        if (tamanhoJanela % 2 == 0) {
            tamanhoJanela++;
        }

        return Math.min(tamanhoJanela, totalPontos % 2 == 0 ? totalPontos - 1 : totalPontos);
    }

    static int calcularPosicaoX(
            LocalDateTime timestamp,
            LocalDateTime dataInicio,
            LocalDateTime dataFim,
            int xInicial,
            int largura
    ) {
        long duracaoMillis = Math.max(1L, Duration.between(dataInicio, dataFim).toMillis());
        long decorridoMillis = Duration.between(dataInicio, timestamp).toMillis();
        double proporcao = Math.max(0.0, Math.min(1.0, decorridoMillis / (double) duracaoMillis));
        return xInicial + (int) Math.round(proporcao * largura);
    }

    private double calcularPosicaoY(
            double valor,
            double minimo,
            double range,
            int yInicial,
            int altura
    ) {
        return yInicial + altura - ((valor - minimo) / range) * altura;
    }

    private LocalDateTime obterTimestamp(JsonRegistroService.RegistroJson registro) {
        try {
            return LocalDateTime.parse(registro.timestamp, DateTimeFormatter.ISO_LOCAL_DATE_TIME);
        } catch (Exception e) {
            System.err.println("[GRAFICO] Timestamp inválido ignorado: " + registro.timestamp);
            return null;
        }
    }

    private static class PontoGrafico {
        final LocalDateTime timestamp;
        final double valor;

        PontoGrafico(LocalDateTime timestamp, double valor) {
            this.timestamp = timestamp;
            this.valor = valor;
        }
    }

    /**
     * Obtém o valor do gráfico conforme tipo
     */
    /**
     * Valor de um registro na escala em que sera plotado.
     *
     * <p>So a pressao consulta a unidade: as demais grandezas nao tem unidade alternativa.
     */
    private double obterValor(JsonRegistroService.RegistroJson reg, int tipo, UnidadePressao unidadePressao) {
        switch (tipo) {
            case 0: {                                          // Pressão
                UnidadePressao unidade = unidadePressao == null ? UnidadePressao.PSI : unidadePressao;
                return unidade.converterDePsi(Math.max(0, reg.pressao));
            }
            case 1: return Math.max(0, reg.strokeAtual);       // Stroke/min
            case 2: return Math.max(0, reg.vazaoAtual);        // Vazão BBL/min
            case 3: return Math.max(0, reg.volumeBombeado);    // Volume
            default: return 0;
        }
    }

    /**
     * Obtém estatísticas dos registros no intervalo
     */
    public String obterEstatisticas(LocalDateTime dataInicio, LocalDateTime dataFim) {
        return obterEstatisticas(dataInicio, dataFim, UnidadePressao.PSI);
    }

    /**
     * Estatisticas do rodape, com a pressao media na mesma unidade dos graficos.
     *
     * <p>Se o rodape ficasse fixo em PSI enquanto os graficos mostram kgf/cm2, o mesmo relatorio
     * traria dois numeros diferentes para a mesma grandeza.
     */
    public String obterEstatisticas(
            LocalDateTime dataInicio,
            LocalDateTime dataFim,
            UnidadePressao unidadePressao
    ) {
        UnidadePressao unidade = unidadePressao == null ? UnidadePressao.PSI : unidadePressao;
        List<JsonRegistroService.RegistroJson> registros = obterRegistrosNoPeriodo(dataInicio, dataFim);

        double pressaoMedia = 0;
        double vazaoMedia = 0;
        double volumeTotal = 0;
        int count = 0;

        for (JsonRegistroService.RegistroJson reg : registros) {
            pressaoMedia += reg.pressao;
            vazaoMedia += reg.vazaoAtual;
            volumeTotal = reg.volumeBombeado;
            count++;
        }

        if (count > 0) {
            pressaoMedia /= count;
            vazaoMedia /= count;
        }

        return String.format(
                "Registros: %d | Pressão Média: %." + unidade.getCasasDecimais() + "f %s"
                        + " | Vazão Média: %.2f BBL/min | Volume Total: %.2f BBL",
                count, unidade.converterDePsi(pressaoMedia), unidade.getRotulo(), vazaoMedia, volumeTotal
        );
    }
}

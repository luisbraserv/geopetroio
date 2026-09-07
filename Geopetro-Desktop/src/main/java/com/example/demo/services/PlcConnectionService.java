package com.example.demo.services;

import com.example.demo.models.AppSettings;
import com.example.demo.models.EstadoAtual;
import com.example.demo.models.FlowRateReading;
import com.example.demo.models.SensorPressaoConfig;
import com.example.demo.models.SondaReading;
import com.example.demo.repositories.FlowRateReadingRepository;
import com.example.demo.repositories.SondaReadingRepository;
import com.sourceforge.snap7.moka7.S7;
import com.sourceforge.snap7.moka7.S7Client;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.time.LocalDateTime;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import java.util.function.Consumer;

@Service
public class PlcConnectionService {

    private static final Logger logger = LoggerFactory.getLogger(PlcConnectionService.class);

    private static final int PLC_RACK  = 0;
    private static final int PLC_SLOT  = 1;
    private static final int DB_NUMBER = 1;

    // B001 addr=0 DWord (4 bytes) — Stroke Counter (Up/Down)
    private static final int STROKE_START = 0;
    private static final int STROKE_SIZE  = 4;

    /**
     * Id do unico card de stroke de hoje. Vira o dispositivoId real quando a leitura passar a ser
     * dirigida pelo documento de cards; ate la, nomeia o estado por card dos calculadores.
     */
    private static final String CARD_STROKE = "CONTADOR_STROKE_01";

    // B002..B005 addr=4,6,8,10 Word (2 bytes cada) — Ax do Analog Amplifier, ja em bar
    private static final int B002_PESO_START    = 4;  // B002 - Peso da Coluna
    private static final int B003_TORQUE1_START = 6;  // B003 - T. Ch. Hid. Tubos
    private static final int B004_TORQUE2_START = 8;  // B004 - T. Ch. Flutuante
    private static final int B005_PRESSAO_START = 10; // B005 - P. Bomba de Lama / ESCP



    private final SettingsService settingsService;
    private final StrokeCalculatorService strokeCalculatorService;
    private final FlowRateCalculatorService flowRateCalculatorService;
    private final FlowRateReadingRepository flowRateReadingRepository;
    private final SondaReadingRepository sondaReadingRepository;
    private final SondaService sondaService;
    private final TelemetriaMqttService telemetriaMqttService;
    private final TelemetriaRealtimeService telemetriaRealtimeService;

    private ScheduledExecutorService scheduler;
    private S7Client client;
    private volatile boolean connected;
    private Consumer<Boolean> statusListener;

    public PlcConnectionService(
            SettingsService settingsService,
            StrokeCalculatorService strokeCalculatorService,
            FlowRateCalculatorService flowRateCalculatorService,
            FlowRateReadingRepository flowRateReadingRepository,
            SondaReadingRepository sondaReadingRepository,
            SondaService sondaService,
            TelemetriaMqttService telemetriaMqttService,
            TelemetriaRealtimeService telemetriaRealtimeService) {
        this.settingsService = settingsService;
        this.strokeCalculatorService = strokeCalculatorService;
        this.flowRateCalculatorService = flowRateCalculatorService;
        this.flowRateReadingRepository = flowRateReadingRepository;
        this.sondaReadingRepository = sondaReadingRepository;
        this.sondaService = sondaService;
        this.telemetriaMqttService = telemetriaMqttService;
        this.telemetriaRealtimeService = telemetriaRealtimeService;
    }

    public synchronized boolean connectUsingSavedIp() {
        AppSettings settings = settingsService.loadSettings();
        String plcIp = settings.getPlcIp();
        if (plcIp == null || plcIp.isBlank()) {
            updateStatus(false);
            logger.info("IP do PLC nao configurado.");
            return false;
        }
        return connect(plcIp.trim());
    }

    public synchronized boolean connect(String ip) {
        disconnectSilently();
        strokeCalculatorService.reset();
        flowRateCalculatorService.reset();

        try {
            client = new S7Client();
            int result = client.ConnectTo(ip, PLC_RACK, PLC_SLOT);
            if (result != 0) {
                updateStatus(false);
                logger.warn("Falha ao conectar ao PLC {}. Codigo: {}", ip, result);
                return false;
            }
            updateStatus(true);
            logger.info("Conectado ao PLC {}", ip);
            startReading();
            return true;
        } catch (Exception e) {
            updateStatus(false);
            logger.error("Erro ao conectar ao PLC {}", ip, e);
            return false;
        }
    }

    public synchronized void disconnect() {
        connected = false;
        if (scheduler != null && !scheduler.isShutdown()) scheduler.shutdownNow();
        scheduler = null;
        if (client != null) {
            try { client.Disconnect(); } catch (Exception e) { logger.warn("Erro ao desconectar", e); }
        }
        client = null;
        notifyStatus();
    }

    public boolean isConnected() { return connected; }

    public void setStatusListener(Consumer<Boolean> statusListener) {
        this.statusListener = statusListener;
    }

    /**
     * Inicia a leitura ciclica do CLP.
     *
     * <p>Uma unica Virtual Thread agendada a cada segundo — nao se cria thread por leitura. Os
     * envios (MQTT e tempo real) sao entregues a workers proprios, de modo que a lentidao de
     * qualquer canal de rede nao atrase o ciclo de leitura.
     */
    private void startReading() {
        scheduler = Executors.newSingleThreadScheduledExecutor(
                Thread.ofVirtual().name("plc-reader").factory());
        scheduler.scheduleAtFixedRate(this::readAll, 0, 1, TimeUnit.SECONDS);
    }

    private void readAll() {
        if (!connected || client == null) return;

        try {
            AppSettings settings = settingsService.loadSettings();

            // UMA ida ao CLP por ciclo, fatiada em memoria — RN-095. Antes eram cinco, e cinco
            // leituras sequenciais podem pegar o CLP em estados diferentes: o ciclo resultante
            // misturava instantes e nunca existiu de fato.
            BlocoDeLeitura bloco = readBlock();

            double b002Peso    = pressaoPsi(bloco, B002_PESO_START,    settings.getSensor01()); // Peso Coluna
            double b003Torque1 = pressaoPsi(bloco, B003_TORQUE1_START, settings.getSensor02()); // T. Ch. Hid. Tubos
            double b004Torque2 = pressaoPsi(bloco, B004_TORQUE2_START, settings.getSensor03()); // T. Ch. Flutuante
            double b005Pressao = pressaoPsi(bloco, B005_PRESSAO_START, settings.getSensor04()); // P. Bomba / ESCP

            long cumulativeStroke = strokeCumulativo(bloco);
            long currentStroke = strokeCalculatorService.calculateCurrentStroke(CARD_STROKE, cumulativeStroke);
            double pumpConstant = settings.getPumpConstant();
            double flowRateBblMin = flowRateCalculatorService.calculateBblPerMinute(CARD_STROKE, currentStroke, pumpConstant);

            // peso, pressao01=B002Peso, pressao02=B003Torque1, pressao03=B004Torque2, pressao04=B005Pressao
            sondaService.atualizarDados(b002Peso, b002Peso, b003Torque1, b004Torque2, b005Pressao, (double) currentStroke);
            sondaService.updateFlowRate(flowRateBblMin, (double) currentStroke);

            if (settings.getCardVisibility().isVazao()) {
                saveFlowRateReading(currentStroke, cumulativeStroke, pumpConstant, flowRateBblMin);
            }

            saveSondaReading(currentStroke, flowRateBblMin);

            // HISTORICO: vai para a fila do worker MQTT. Cada leitura importa.
            telemetriaMqttService.enviarLeitura(
                    settings,
                    b002Peso, b003Torque1, b004Torque2, b005Pressao, flowRateBblMin);

            // TEMPO REAL: sobrescreve o estado atual. Se o canal estiver lento, os estados
            // intermediarios sao descartados de proposito — a tela quer o "agora", nao a fila.
            telemetriaRealtimeService.publicarEstado(settings, new EstadoAtual(
                    settings.getUnidadeSondaId(),
                    Instant.now(),
                    sondaService.getPesoColumLbf(),
                    sondaService.getTorqueTubos(),
                    sondaService.getTorqueFluante(),
                    b005Pressao,
                    flowRateBblMin,
                    currentStroke));

            logger.debug("PLC lido: B002={}, B003={}, B004={}, B005={}, stroke={}, vazao={}",
                    b002Peso, b003Torque1, b004Torque2, b005Pressao, currentStroke, flowRateBblMin);

        } catch (Exception e) {
            logger.error("Erro na leitura do PLC", e);
            disconnect();
        }
    }

    /** Enderecos e tamanhos que o ciclo precisa. Vira configuracao quando os cards entrarem. */
    private static final int[] ENDERECOS = { STROKE_START, B002_PESO_START, B003_TORQUE1_START, B004_TORQUE2_START, B005_PRESSAO_START };
    private static final int[] TAMANHOS  = { STROKE_SIZE, BlocoDeLeitura.TAMANHO_WORD, BlocoDeLeitura.TAMANHO_WORD, BlocoDeLeitura.TAMANHO_WORD, BlocoDeLeitura.TAMANHO_WORD };

    /** Le de uma vez a faixa que cobre todos os enderecos do ciclo. */
    private BlocoDeLeitura readBlock() {
        BlocoDeLeitura.Faixa faixa = BlocoDeLeitura.faixaQueCobre(ENDERECOS, TAMANHOS);
        byte[] buffer = new byte[faixa.tamanho()];
        int result = client.ReadArea(S7.S7AreaDB, DB_NUMBER, faixa.inicio(), faixa.tamanho(), buffer);
        if (result != 0) {
            throw new IllegalStateException("Falha ao ler DB%d [%d..%d). Codigo: %d"
                    .formatted(DB_NUMBER, faixa.inicio(), faixa.inicio() + faixa.tamanho(), result));
        }
        return BlocoDeLeitura.de(buffer, faixa.inicio());
    }

    /**
     * Converte um canal analogico do bloco em pressao PSI.
     *
     * <p>O valor publicado pelo LOGO! ({@code Ax, amplified}) e o laco 4-20 mA reescalonado para
     * -50..750 pelo bloco Analog Amplifier — nao e pressao. A faixa do transmissor, configurada em
     * "Range do sensor (bar)", e o que traduz essa posicao em pressao.
     */
    private double pressaoPsi(BlocoDeLeitura bloco, int startByte, SensorPressaoConfig config) {
        short ax = bloco.word(startByte);

        // O bruto vai para a tela: e ele que revela um canal mudo ou uma escala diferente da
        // esperada, casos em que a pressao convertida pareceria plausivel.
        sondaService.registrarValorBruto(startByte, ax);

        if (ConversaoPressao.foraDaFaixa(ax)) {
            logger.warn("[PLC] Ax fora do range esperado ({}..{}) em DB1.DBW{}: {}",
                    ConversaoPressao.AX_MIN, ConversaoPressao.AX_MAX, startByte, ax);
        }

        return ConversaoPressao.axParaPsi(ax, config);
    }

    private long strokeCumulativo(BlocoDeLeitura bloco) {
        long cumulativo = bloco.dword(STROKE_START);
        // Alimenta o rodapé do card de Vazão: ela é derivada deste contador, não de um canal
        // analógico, então é este o número cru que explica uma vazão parada ou estranha.
        sondaService.registrarValorBruto(STROKE_START, cumulativo);
        return cumulativo;
    }

    private void saveSondaReading(long currentStroke, double flowRateBblMin) {
        try {
            sondaReadingRepository.save(new SondaReading(
                    LocalDateTime.now(),
                    sondaService.getPesoColumLbf(),
                    sondaService.getTorqueTubos(),
                    sondaService.getTorqueFluante(),
                    sondaService.getPressao04(),
                    flowRateBblMin,
                    currentStroke));
        } catch (Exception e) {
            logger.error("Erro ao salvar SondaReading no H2", e);
        }
    }

    private void saveFlowRateReading(long currentStroke, long cumulativeStroke, double pumpConstant, double flowRateBblMin) {
        try {
            flowRateReadingRepository.save(new FlowRateReading(
                    LocalDateTime.now(), currentStroke, cumulativeStroke, pumpConstant, flowRateBblMin));
        } catch (Exception e) {
            logger.error("Erro ao salvar leitura no H2", e);
        }
    }

    private synchronized void disconnectSilently() {
        connected = false;
        if (scheduler != null && !scheduler.isShutdown()) scheduler.shutdownNow();
        scheduler = null;
        if (client != null) {
            try { client.Disconnect(); } catch (Exception ignored) {}
        }
        client = null;
    }

    private void updateStatus(boolean connected) {
        this.connected = connected;
        notifyStatus();
    }

    private void notifyStatus() {
        if (statusListener != null) statusListener.accept(connected);
    }
}

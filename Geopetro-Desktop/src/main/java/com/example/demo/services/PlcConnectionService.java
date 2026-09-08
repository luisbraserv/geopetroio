package com.example.demo.services;

import com.example.demo.models.AppSettings;
import com.example.demo.models.CardsDaUnidade;
import com.example.demo.models.CardsDaUnidade.Card;
import com.example.demo.models.CardsDaUnidade.Tipo;
import com.example.demo.models.LeituraPublicada;
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
import java.util.List;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import java.util.function.Consumer;

@Service
public class PlcConnectionService {

    private static final Logger logger = LoggerFactory.getLogger(PlcConnectionService.class);

    /**
     * ⚠️ Os enderecos fixos sairam daqui — passo 3b.
     *
     * <p>Rack, slot, numero do DB, intervalo e o endereco de cada grandeza vem do documento de
     * cards da unidade. Sem documento, esta classe <b>nao le nada</b> (RN-088): e um caminho de
     * leitura so, sem o antigo vivo em paralelo.
     */
    private final SettingsService settingsService;
    private final StrokeCalculatorService strokeCalculatorService;
    private final FlowRateCalculatorService flowRateCalculatorService;
    private final FlowRateReadingRepository flowRateReadingRepository;
    private final SondaReadingRepository sondaReadingRepository;
    private final SondaService sondaService;
    private final TelemetriaMqttService telemetriaMqttService;
    private final TelemetriaRealtimeService telemetriaRealtimeService;
    private final LeituraDeCards leituraDeCards;
    private final CalibracaoDeCards calibracoes;

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
            TelemetriaRealtimeService telemetriaRealtimeService,
            LeituraDeCards leituraDeCards,
            CalibracaoDeCards calibracoes) {
        this.settingsService = settingsService;
        this.strokeCalculatorService = strokeCalculatorService;
        this.flowRateCalculatorService = flowRateCalculatorService;
        this.flowRateReadingRepository = flowRateReadingRepository;
        this.sondaReadingRepository = sondaReadingRepository;
        this.sondaService = sondaService;
        this.telemetriaMqttService = telemetriaMqttService;
        this.telemetriaRealtimeService = telemetriaRealtimeService;
        this.leituraDeCards = leituraDeCards;
        this.calibracoes = calibracoes;
    }

    /**
     * Conecta usando a configuração da unidade — RN-088.
     *
     * <p>⚠️ <b>Sem documento de cards, não conecta.</b> IP, rack, slot, número do DB e intervalo
     * vêm todos dele. Antes vinham do arquivo desta estação e de constantes no código; a mudança é
     * o passo 3b.
     *
     * <p>Unidade não configurada é <b>estado normal</b> (RN-092), não erro: a frota nasce vazia e
     * cada unidade vira quando alguém a configura pela tela de Cards.
     */
    public synchronized boolean connectUsingSavedIp() {
        var documento = telemetriaRealtimeService.cardsAtuais(settingsService.loadSettings()).orElse(null);
        if (documento == null || documento.conexao() == null
                || documento.conexao().ip() == null || documento.conexao().ip().isBlank()) {
            updateStatus(false);
            logger.info("Unidade sem configuracao de cards: nada a ler. Configure em Cards.");
            return false;
        }
        if (LeituraDeCards.ativos(documento.cards()).isEmpty()) {
            updateStatus(false);
            logger.info("Unidade sem card ativo: nada a ler.");
            return false;
        }
        return connect(documento.conexao().ip().trim());
    }

    public synchronized boolean connect(String ip) {
        disconnectSilently();
        strokeCalculatorService.reset();
        flowRateCalculatorService.reset();

        var conexao = conexaoAtual();
        if (conexao == null) {
            updateStatus(false);
            logger.info("Sem configuracao de cards: nao ha rack/slot/DB para conectar.");
            return false;
        }

        try {
            client = new S7Client();
            int result = client.ConnectTo(ip, conexao.rack(), conexao.slot());
            if (result != 0) {
                updateStatus(false);
                logger.warn("Falha ao conectar ao PLC {} (rack {}, slot {}). Codigo: {}",
                        ip, conexao.rack(), conexao.slot(), result);
                return false;
            }
            updateStatus(true);
            logger.info("Conectado ao PLC {} (rack {}, slot {}, DB{}, {} ms)",
                    ip, conexao.rack(), conexao.slot(), conexao.dbNumero(), conexao.intervaloLeituraMs());
            startReading(conexao.intervaloLeituraMs());
            return true;
        } catch (Exception e) {
            updateStatus(false);
            logger.error("Erro ao conectar ao PLC {}", ip, e);
            return false;
        }
    }

    /** A conexão declarada no documento da unidade, ou {@code null} se ainda não há documento. */
    private CardsDaUnidade.Conexao conexaoAtual() {
        return telemetriaRealtimeService.cardsAtuais(settingsService.loadSettings())
                .map(CardsDaUnidade::conexao)
                .orElse(null);
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
    private void startReading(int intervaloMs) {
        scheduler = Executors.newSingleThreadScheduledExecutor(
                Thread.ofVirtual().name("plc-reader").factory());
        scheduler.scheduleAtFixedRate(this::readAll, 0, Math.max(100, intervaloMs), TimeUnit.MILLISECONDS);
    }

    private void readAll() {
        if (!connected || client == null) return;

        try {
            AppSettings settings = settingsService.loadSettings();
            CardsDaUnidade documento = telemetriaRealtimeService.cardsAtuais(settings).orElse(null);
            List<Card> ativos = documento == null ? List.of() : LeituraDeCards.ativos(documento.cards());
            if (ativos.isEmpty()) {
                // RN-088: sem card ativo nao ha o que ler. Nao e erro — a unidade pode ter acabado
                // de ter o ultimo card desativado, e ai a resposta certa e nao ir ao CLP.
                return;
            }

            // A calibracao medida em campo migra dos slots posicionais na primeira vez que o
            // documento aparece. Nao apaga nada do app-settings.json.
            calibracoes.migrar(documento, settings);

            // UMA ida ao CLP por ciclo, fatiada em memoria — RN-095. Antes eram cinco, e cinco
            // leituras sequenciais podem pegar o CLP em estados diferentes: o ciclo resultante
            // misturava instantes e nunca existiu de fato.
            BlocoDeLeitura bloco = readBlock(ativos, documento.conexao());
            List<LeituraDeCards.Grandeza> grandezas = leituraDeCards.converter(ativos, bloco);

            // O bruto vai para a tela: e ele que revela um canal mudo ou uma escala diferente da
            // esperada, casos em que o valor convertido pareceria plausivel.
            for (Card card : ativos) {
                sondaService.registrarValorBruto(card.byteInicial(),
                        (long) grandezas.stream()
                                .filter(g -> card.dispositivoId().equals(g.dispositivoId()))
                                .mapToDouble(LeituraDeCards.Grandeza::bruto).findFirst().orElse(0));
            }

            atualizarTelaEHistoricoLocal(settings, grandezas);

            List<LeituraPublicada> leituras = LeituraDeCards.paraPublicar(grandezas);
            if (leituras.isEmpty()) {
                // Todo card invisivel, ou nenhum convertivel. Nada a publicar, e nada errado.
                return;
            }

            // HISTORICO: vai para a fila do worker MQTT. Cada leitura importa.
            telemetriaMqttService.enviarLeitura(settings, leituras);

            // TEMPO REAL: sobrescreve o estado atual. Se o canal estiver lento, os estados
            // intermediarios sao descartados de proposito — a tela quer o "agora", nao a fila.
            telemetriaRealtimeService.publicarEstado(settings,
                    new EstadoAtual(settings.getUnidadeSondaId(), Instant.now(), leituras));

            logger.debug("PLC lido: {} cards ativos, {} grandezas publicadas.", ativos.size(), leituras.size());

        } catch (Exception e) {
            logger.error("Erro na leitura do PLC", e);
            disconnect();
        }
    }

    /**
     * ⚠️ <b>Ponte transitória — morre no passo 7.</b>
     *
     * <p>A tela do Desktop e o H2 local ainda têm colunas fixas: peso, dois torques, uma pressão,
     * vazão e stroke. Enquanto for assim, os cards precisam ser <b>encaixados por posição</b> nelas
     * — exatamente o acoplamento que o passo 3b removeu do caminho de leitura.
     *
     * <p>É deliberado e tem prazo: o dashboard passa a montar do documento no passo 7, junto com o
     * termômetro e o desenho do tanque, e este método sai inteiro. Até lá, um terceiro card de
     * torque é lido e publicado corretamente, mas <b>não aparece</b> na tela desta estação.
     */
    private void atualizarTelaEHistoricoLocal(AppSettings settings, List<LeituraDeCards.Grandeza> grandezas) {
        Double peso = primeiro(grandezas, Tipo.PESO, 0);
        Double torque1 = primeiro(grandezas, Tipo.TORQUE, 0);
        Double torque2 = primeiro(grandezas, Tipo.TORQUE, 1);
        Double pressao = primeiro(grandezas, Tipo.PRESSAO, 0);

        var stroke = grandezas.stream()
                .filter(g -> g.tipo() == Tipo.CONTADOR_STROKE && LeituraDeCards.SERIE_STROKE.equals(g.serie()))
                .findFirst().orElse(null);
        var vazao = grandezas.stream()
                .filter(g -> g.tipo() == Tipo.CONTADOR_STROKE && LeituraDeCards.SERIE_VAZAO.equals(g.serie()))
                .findFirst().orElse(null);

        long strokeAtual = stroke != null && stroke.temValor() ? stroke.valor().longValue() : 0;
        double vazaoBblMin = vazao != null && vazao.temValor() ? vazao.valor() : 0;

        // A tela ja recebe os valores CONVERTIDOS: quem converte agora e LeituraDeCards, com a
        // calibracao por dispositivoId. O SondaService deixa de refazer a conta.
        sondaService.atualizarValoresConvertidos(peso, torque1, torque2, pressao, (double) strokeAtual);
        sondaService.updateFlowRate(vazaoBblMin, (double) strokeAtual);

        if (settings.getCardVisibility().isVazao() && stroke != null) {
            saveFlowRateReading(strokeAtual, (long) stroke.bruto(),
                    vazao != null && vazao.temValor() ? vazao.valor() / Math.max(1, strokeAtual) : 0, vazaoBblMin);
        }
        saveSondaReading(strokeAtual, vazaoBblMin);
    }

    /** A n-ésima grandeza de um tipo, ou {@code null} se não houver — ver a ⚠️ acima. */
    private static Double primeiro(List<LeituraDeCards.Grandeza> grandezas, Tipo tipo, int posicao) {
        return grandezas.stream()
                .filter(g -> g.tipo() == tipo)
                .skip(posicao)
                .findFirst()
                .filter(LeituraDeCards.Grandeza::temValor)
                .map(LeituraDeCards.Grandeza::valor)
                .orElse(null);
    }

    /** Lê de uma vez a faixa que cobre todos os cards ativos, no DB que o documento declara. */
    private BlocoDeLeitura readBlock(List<Card> ativos, CardsDaUnidade.Conexao conexao) {
        BlocoDeLeitura.Faixa faixa = LeituraDeCards.faixaDe(ativos);
        int db = conexao == null ? 1 : conexao.dbNumero();
        byte[] buffer = new byte[faixa.tamanho()];
        int result = client.ReadArea(S7.S7AreaDB, db, faixa.inicio(), faixa.tamanho(), buffer);
        if (result != 0) {
            throw new IllegalStateException("Falha ao ler DB%d [%d..%d). Codigo: %d"
                    .formatted(db, faixa.inicio(), faixa.inicio() + faixa.tamanho(), result));
        }
        return BlocoDeLeitura.de(buffer, faixa.inicio());
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

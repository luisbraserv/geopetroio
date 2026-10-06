package com.example.demo.services;

import com.example.demo.models.AppSettings;
import com.example.demo.models.CardsDaUnidade;
import com.example.demo.models.CardsDaUnidade.Card;
import com.example.demo.models.LeituraLocal;
import com.example.demo.models.LeituraPublicada;
import com.example.demo.models.EstadoAtual;
import com.example.demo.repositories.LeituraLocalRepository;
import com.sourceforge.snap7.moka7.S7;
import com.sourceforge.snap7.moka7.S7Client;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Objects;
import java.util.HexFormat;
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
    private final LeituraLocalRepository leituraLocalRepository;
    private final SondaService sondaService;
    private final TelemetriaMqttService telemetriaMqttService;
    private final TelemetriaRealtimeService telemetriaRealtimeService;
    private final LeituraDeCards leituraDeCards;
    private final CalibracaoDeCards calibracoes;
    private final AlarmesLocais alarmesLocais;

    private ScheduledExecutorService scheduler;
    private S7Client client;
    private volatile boolean connected;
    private volatile String ultimoErro;
    private volatile Instant ultimaLeitura;
    private CardsDaUnidade.Conexao conexaoEmUso;
    private long unidadeEmUso;
    private String backendEmUso;
    private Consumer<Boolean> statusListener;

    public PlcConnectionService(
            SettingsService settingsService,
            StrokeCalculatorService strokeCalculatorService,
            FlowRateCalculatorService flowRateCalculatorService,
            LeituraLocalRepository leituraLocalRepository,
            SondaService sondaService,
            TelemetriaMqttService telemetriaMqttService,
            TelemetriaRealtimeService telemetriaRealtimeService,
            LeituraDeCards leituraDeCards,
            CalibracaoDeCards calibracoes,
            AlarmesLocais alarmesLocais) {
        this.settingsService = settingsService;
        this.strokeCalculatorService = strokeCalculatorService;
        this.flowRateCalculatorService = flowRateCalculatorService;
        this.leituraLocalRepository = leituraLocalRepository;
        this.sondaService = sondaService;
        this.telemetriaMqttService = telemetriaMqttService;
        this.telemetriaRealtimeService = telemetriaRealtimeService;
        this.leituraDeCards = leituraDeCards;
        this.calibracoes = calibracoes;
        this.alarmesLocais = alarmesLocais;
    }

    /**
     * O que aconteceu ao tentar conectar.
     *
     * <p>⚠️ <b>Faltar configuração não é falha.</b> É o estado normal de uma unidade que ainda não
     * foi configurada (RN-092), e quem está diante da tela resolve em dois cliques. Um booleano
     * juntava os dois casos e a tela dizia "entre em contato com suporte" para alguém que só
     * precisava abrir a janela de Cards — o tipo de mensagem que gasta uma visita a campo.
     */
    public sealed interface Resultado {
        record Conectado() implements Resultado {
        }

        /** Unidade sem cards, ou sem IP no documento. A saída é configurar, não chamar suporte. */
        record SemConfiguracao(String oQueFalta) implements Resultado {
        }

        /** O CLP não respondeu, ou respondeu recusando. Aí sim é falha. */
        record Falhou(String motivo) implements Resultado {
        }
    }

    /**
     * Conecta usando a configuração da unidade — RN-088.
     *
     * <p>⚠️ <b>Sem documento de cards, não conecta.</b> IP, rack, slot, número do DB e intervalo
     * vêm todos dele. Antes vinham do arquivo desta estação e de constantes no código.
     *
     * <p>Unidade não configurada é <b>estado normal</b> (RN-092), não erro: a frota nasce vazia e
     * cada unidade vira quando alguém a configura pela tela de Cards.
     */
    public synchronized Resultado connectUsingSavedIp() {
        disconnectSilently();
        ultimoErro = null;
        AppSettings settings = settingsService.loadSettings();
        var documento = telemetriaRealtimeService.cardsAtuais(settings).orElse(null);
        if (documento == null || documento.cards().isEmpty()) {
            updateStatus(false);
            logger.info("Unidade sem configuracao de cards: nada a ler.");
            return new Resultado.SemConfiguracao("esta unidade ainda não tem cards configurados");
        }
        if (LeituraDeCards.ativos(documento.cards()).isEmpty()) {
            updateStatus(false);
            logger.info("Unidade sem card ativo: nada a ler.");
            return new Resultado.SemConfiguracao("todos os cards desta unidade estão desativados");
        }
        if (documento.conexao() == null || documento.conexao().ip() == null
                || documento.conexao().ip().isBlank()) {
            updateStatus(false);
            logger.info("Configuracao de cards sem IP do CLP.");
            return new Resultado.SemConfiguracao("falta o IP do CLP na configuração dos cards");
        }
        return conectar(documento.conexao().ip().trim(), documento, settings)
                ? new Resultado.Conectado()
                : new Resultado.Falhou(ultimoErro);
    }

    public synchronized boolean connect(String ip) {
        AppSettings settings = settingsService.loadSettings();
        return conectar(ip, telemetriaRealtimeService.cardsAtuais(settings).orElse(null), settings);
    }

    private boolean conectar(String ip, CardsDaUnidade documento, AppSettings settings) {
        disconnectSilently();
        ultimoErro = null;
        ultimaLeitura = null;
        strokeCalculatorService.reset();
        flowRateCalculatorService.reset();

        var conexao = documento == null ? null : documento.conexao();
        if (conexao == null || LeituraDeCards.ativos(documento.cards()).isEmpty()) {
            ultimoErro = "Configure a conexão e pelo menos um card ativo antes de conectar.";
            updateStatus(false);
            logger.info("Sem configuracao de cards: nao ha rack/slot/DB para conectar.");
            return false;
        }

        try {
            client = criarCliente();
            client.RecvTimeout = 2000;
            int result;
            if (conexao.usaTsap()) {
                if (conexao.tsapLocal() == null || conexao.tsapRemoto() == null
                        || conexao.tsapLocal() < 0 || conexao.tsapLocal() > 0xffff
                        || conexao.tsapRemoto() < 0 || conexao.tsapRemoto() > 0xffff) {
                    throw new IllegalArgumentException("Informe os dois TSAPs válidos na conexão do PLC.");
                }
                client.SetConnectionParams(ip, conexao.tsapLocal(), conexao.tsapRemoto());
                result = client.Connect();
            } else {
                result = client.ConnectTo(ip, conexao.rack(), conexao.slot());
            }
            if (result != 0) {
                throw new IllegalStateException("Não foi possível conectar a " + ip + ":102. "
                        + erroS7(result) + " Verifique a rede, o acesso S7 e os parâmetros de conexão do PLC.");
            }
            conexaoEmUso = conexao;
            unidadeEmUso = documento.unidadeSondaId();
            backendEmUso = settings.getBackendUrl();
            // Abrir a sessão S7 não prova que o DB pode ser lido. Só confirmar após receber
            // e converter a primeira amostra; a falha chega ao mesmo diálogo de conexão.
            lerCiclo(settings, documento);
            updateStatus(true);
            logger.info("Conectado ao PLC {} (rack {}, slot {}, DB{}, {} ms)",
                    ip, conexao.rack(), conexao.slot(), conexao.dbNumero(), conexao.intervaloLeituraMs());
            startReading(conexao.intervaloLeituraMs());
            return true;
        } catch (Exception e) {
            ultimoErro = e.getMessage() == null ? e.getClass().getSimpleName() : e.getMessage();
            disconnectSilently();
            updateStatus(false);
            logger.error("Erro ao conectar ao PLC {}", ip, e);
            return false;
        }
    }

    S7Client criarCliente() {
        return new S7Client();
    }

    public synchronized void disconnect() {
        disconnectSilently();
        notifyStatus();
    }

    public boolean isConnected() { return connected; }
    public String getUltimoErro() { return ultimoErro; }
    public Instant getUltimaLeitura() { return ultimaLeitura; }

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
    void startReading(int intervaloMs) {
        scheduler = Executors.newSingleThreadScheduledExecutor(
                Thread.ofVirtual().name("plc-reader").factory());
        scheduler.scheduleWithFixedDelay(this::readAll, Math.max(100, intervaloMs),
                Math.max(100, intervaloMs), TimeUnit.MILLISECONDS);
    }

    synchronized void readAll() {
        if (!connected || client == null) return;

        try {
            AppSettings settings = settingsService.loadSettings();
            CardsDaUnidade documento = telemetriaRealtimeService.cardsAtuais(settings).orElse(null);
            if (documento == null || documento.unidadeSondaId() != unidadeEmUso
                    || !Objects.equals(settings.getBackendUrl(), backendEmUso)
                    || !Objects.equals(documento.conexao(), conexaoEmUso)) {
                throw new IllegalStateException("A configuração da conexão ou a unidade mudou. Reconecte o PLC para ler os dados atuais.");
            }
            lerCiclo(settings, documento);
        } catch (Exception e) {
            ultimoErro = e.getMessage() == null ? e.getClass().getSimpleName() : e.getMessage();
            logger.error("Erro na leitura do PLC", e);
            disconnect();
        }
    }

    private void lerCiclo(AppSettings settings, CardsDaUnidade documento) {
            List<Card> ativos = documento == null ? List.of() : LeituraDeCards.ativos(documento.cards());
            if (ativos.isEmpty()) {
                throw new IllegalStateException("Não há cards ativos para ler. Ative um card e reconecte o PLC.");
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

            // A tela recebe as grandezas ja convertidas e monta os cards a partir delas.
            sondaService.atualizarGrandezas(documento, grandezas);
            ultimaLeitura = Instant.now();
            gravarHistoricoLocal(grandezas);
            avaliarAlarmeLocal(grandezas);

            List<LeituraPublicada> leituras = LeituraDeCards.paraPublicar(grandezas);
            if (leituras.isEmpty()) {
                // Todo card invisivel, ou nenhum convertivel. Nada a publicar, e nada errado.
                return;
            }

            // HISTORICO: vai para a fila do worker MQTT. Cada leitura importa.
            try {
                telemetriaMqttService.enviarLeitura(settings, leituras);
            } catch (RuntimeException e) {
                logger.error("Falha ao encaminhar MQTT; leitura local do PLC preservada", e);
            }

            // TEMPO REAL: sobrescreve o estado atual. Se o canal estiver lento, os estados
            // intermediarios sao descartados de proposito — a tela quer o "agora", nao a fila.
            try {
                telemetriaRealtimeService.publicarEstado(settings,
                        new EstadoAtual(settings.getUnidadeSondaId(), Instant.now(), leituras));
            } catch (RuntimeException e) {
                logger.error("Falha ao encaminhar tempo real; leitura local do PLC preservada", e);
            }

            logger.debug("PLC lido: {} cards ativos, {} grandezas publicadas.", ativos.size(), leituras.size());

    }

    /**
     * Grava no H2 local <b>uma linha por grandeza</b> — a ponte por posição saiu no passo 7.
     *
     * <p>Antes este método encaixava os cards em colunas fixas (peso, dois torques, uma pressão) e
     * um terceiro card de torque simplesmente não tinha onde caber. Agora cada grandeza é uma linha
     * com o próprio {@code dispositivoId}, e a tabela representa qualquer configuração.
     *
     * <p>⚠️ <b>Grandeza sem valor não é gravada</b>, pelo mesmo motivo de não ser publicada
     * (RN-099): zero entraria no gráfico e na carta de operação como medição real. Uma lacuna é
     * honesta.
     *
     * <p>Grava o que está <b>ativo</b>, não só o visível: visibilidade controla publicação, não
     * gravação (RN-037). O registro local é da estação.
     */
    /**
     * O alarme da estacao — passo 3 de {@code specs/SDD/negocio/requisitos/alarmes.md}.
     *
     * <p>⚠️ <b>Sinaliza, nao registra.</b> O historico de eventos tem um produtor so, o Backend.
     * Aqui a avaliacao existe para chamar quem esta ao lado do equipamento, e funciona sem rede
     * porque a faixa e configurada nesta estacao — nao vem de documento remoto nenhum.
     *
     * <p>Falha na avaliacao nao derruba o ciclo: perder o alarme local de um segundo e ruim, parar
     * de ler o CLP por causa dele seria pior — e o MQTT e o tempo real ja teriam sido publicados.
     */
    private void avaliarAlarmeLocal(List<LeituraDeCards.Grandeza> grandezas) {
        try {
            alarmesLocais.avaliar(grandezas, Instant.now());
        } catch (RuntimeException e) {
            logger.warn("Alarme local nao avaliado neste ciclo; a leitura seguiu normal.", e);
        }
    }

    private void gravarHistoricoLocal(List<LeituraDeCards.Grandeza> grandezas) {
        LocalDateTime instante = LocalDateTime.now();
        List<LeituraLocal> linhas = grandezas.stream()
                .filter(LeituraDeCards.Grandeza::temValor)
                .map(g -> new LeituraLocal(instante, g.dispositivoId(),
                        g.serie() == null || g.serie().isBlank() ? null : g.serie(),
                        g.tipo().name(), g.unidade(), g.enderecoDb(), g.valor(), g.bruto()))
                .toList();
        if (linhas.isEmpty()) {
            return;
        }
        try {
            leituraLocalRepository.saveAll(linhas);
        } catch (Exception e) {
            // O H2 local nao pode derrubar a leitura: a sonda continua medindo e publicando.
            logger.error("Erro ao gravar o historico local", e);
        }
    }

    /** Lê de uma vez a faixa que cobre todos os cards ativos, no DB que o documento declara. */
    private BlocoDeLeitura readBlock(List<Card> ativos, CardsDaUnidade.Conexao conexao) {
        BlocoDeLeitura.Faixa faixa = LeituraDeCards.faixaDe(ativos);
        int db = conexao == null ? 1 : conexao.dbNumero();
        byte[] buffer = new byte[faixa.tamanho()];
        int result = client.ReadArea(S7.S7AreaDB, db, faixa.inicio(), faixa.tamanho(), buffer);
        if (result != 0) {
            throw new IllegalStateException("Sessão S7 aberta, mas a leitura do DB%d, bytes %d a %d, falhou. %s "
                    .formatted(db, faixa.inicio(), faixa.inicio() + faixa.tamanho() - 1, erroS7(result))
                    + "No LOGO!, confira o DB1 (memória V), o mapeamento VM e o acesso S7.");
        }
        logger.debug("PLC DB{} bytes {}..{}: {}", db, faixa.inicio(),
                faixa.inicio() + faixa.tamanho() - 1, HexFormat.ofDelimiter(" ").formatHex(buffer));
        return BlocoDeLeitura.de(buffer, faixa.inicio());
    }

    private static String erroS7(int codigo) {
        return "Código S7 %d: %s".formatted(codigo, S7Client.ErrorText(codigo));
    }

    private synchronized void disconnectSilently() {
        connected = false;
        sondaService.limparGrandezas();
        sondaService.limparValoresBrutos();
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

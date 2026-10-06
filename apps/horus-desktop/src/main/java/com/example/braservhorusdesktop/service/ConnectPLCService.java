package com.example.braservhorusdesktop.service;

import java.time.LocalDateTime;
import java.util.Objects;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.RejectedExecutionException;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import java.util.function.Consumer;

import com.example.braservhorusdesktop.dto.ConfiguracaoBomba;
import com.example.braservhorusdesktop.dto.OperacaoSnapshot;
import com.sourceforge.snap7.moka7.S7;
import com.sourceforge.snap7.moka7.S7Client;

public class ConnectPLCService {

    private static final double LOGO_ANALOGICO_MAX = 1000.0;
    private static final double CORRENTE_MIN_MA = 4.0;
    private static final double CORRENTE_MAX_MA = 20.0;
    private static final double PRESSAO_MIN_PSI = 0.0;
    private static final double BAR_PARA_PSI = 14.5037738;
    private static final int LOGO_RACK = 0;
    private static final int LOGO_SLOT = 0;
    private static final int DB_OPERACAO = 1;
    private static final int STROKE_START = 0;   // DB1.DBD0 - B001 Counter (DWord, 4 bytes)
    private static final int PRESSAO_START = 4;  // DB1.DBW4 - B002 Analog Amplifier, parametro "Ax, amplified" (Word, 2 bytes)
    private static final long INTERVALO_PRESSAO_MS = 250L;

    private final StrokeCalculatorService strokeCalculatorService;
    private final VazaoCalculatorService vazaoCalculatorService;
    private final StrokePorMinutoService strokePorMinutoService;
    private final RegistroOperacaoService registroOperacaoService;
    private final ConfiguracaoService configuracaoService;

    private ScheduledExecutorService scheduler;
    private ScheduledExecutorService heartbeatScheduler;
    private final ExecutorService persistenciaExecutor;
    private volatile boolean conectado;

    private String ip;
    private int port;

    private Consumer<OperacaoSnapshot> snapshotListener;
    private Consumer<Boolean> statusListener;
    private Consumer<String> logListener;

    private S7Client client;
    private long ultimoStrokeCumulativoValido;
    private volatile PressaoLeitura ultimaPressaoLeitura = PressaoLeitura.vazia();

    public ConnectPLCService() {
        this(new ConfiguracaoService());
    }

    public ConnectPLCService(ConfiguracaoService configuracaoService) {
        this(configuracaoService, new RegistroOperacaoService());
    }

    ConnectPLCService(
            ConfiguracaoService configuracaoService,
            RegistroOperacaoService registroOperacaoService
    ) {
        this.strokeCalculatorService = new StrokeCalculatorService();
        this.vazaoCalculatorService = new VazaoCalculatorService();
        this.strokePorMinutoService = new StrokePorMinutoService();
        this.registroOperacaoService =
                Objects.requireNonNull(registroOperacaoService, "registroOperacaoService");
        this.configuracaoService = Objects.requireNonNull(configuracaoService, "configuracaoService");
        this.persistenciaExecutor = Executors.newSingleThreadExecutor(runnable -> {
            Thread thread = new Thread(runnable, "registro-operacao-writer");
            thread.setDaemon(true);
            return thread;
        });
        this.port = 102;
    }

    private String obterMensagemErro(int codigoErro) {
        switch (codigoErro) {
            case 1:
                return "TIMEOUT - Conexão expirou. Verifique: 1) IP está correto? 2) PLC está ligado? 3) Máquina está na mesma rede? 4) Firewall não está bloqueando?";
            case 2:
                return "Erro ao conectar ao host. Host não encontrado ou não acessível.";
            case 3:
                return "Erro na comunicação ISO. Verifique parâmetros de conexão (Rack/Slot).";
            case 4:
                return "Protocolo S7 não suportado ou versão incompatível.";
            case 5:
                return "CPU não responde. PLC pode estar em modo offline.";
            case 6:
                return "PLC rejeitou a conexão. Verifique se IP/Rack/Slot estão corretos.";
            case 10:
                return "Já existe uma conexão ativa. Desconecte antes de conectar novamente.";
            default:
                return "Código de erro: " + codigoErro + ". Consulte documentação Snap7.";
        }
    }

    public synchronized void conectar(String ip, int port) {
        this.ip = ip;
        this.port = port;

        desconectarSilencioso();

        strokeCalculatorService.reset();
        vazaoCalculatorService.reset();
        strokePorMinutoService.reset();
        ultimoStrokeCumulativoValido = 0L;
        ultimaPressaoLeitura = PressaoLeitura.vazia();

        try {
            log("[PLC] Tentando conectar no LOGO! IP=" + ip + ":" + port
                    + " (Rack=" + LOGO_RACK + ", Slot=" + LOGO_SLOT + ")...");
            
            client = new S7Client();

            int resultado = client.ConnectTo(ip, LOGO_RACK, LOGO_SLOT);

            if (resultado != 0) {
                conectado = false;
                notificarStatus(false);
                String mensagem = obterMensagemErro(resultado);
                log("[PLC] Falha ao conectar. " + mensagem);
                return;
            }

            conectado = true;
            notificarStatus(true);
            log("[PLC] Conectado com sucesso no LOGO! IP=" + ip + ":" + port
                    + " (Rack=" + LOGO_RACK + ", Slot=" + LOGO_SLOT + ")");

            double constante = configuracaoService.getConstante();
            log("[PLC] Constante carregada: " + constante);

            diagnosticarMemoriaVM();
            iniciarLeituraPeriodica();
        } catch (Exception e) {
            conectado = false;
            notificarStatus(false);
            log("[PLC] Erro ao conectar: " + e.getMessage());
        }
    }

    public synchronized void desconectar() {
        conectado = false;

        if (scheduler != null && !scheduler.isShutdown()) {
            scheduler.shutdownNow();
        }

        scheduler = null;

        if (heartbeatScheduler != null && !heartbeatScheduler.isShutdown()) {
            heartbeatScheduler.shutdownNow();
        }

        heartbeatScheduler = null;

        if (client != null) {
            try {
                client.Disconnect();
            } catch (Exception e) {
                log("[PLC] Erro ao desconectar cliente S7: " + e.getMessage());
            }
        }

        client = null;

        notificarStatus(false);
        log("[PLC] Conexão encerrada.");
    }

    private synchronized void desconectarSilencioso() {
        conectado = false;

        if (scheduler != null && !scheduler.isShutdown()) {
            scheduler.shutdownNow();
        }

        scheduler = null;

        if (client != null) {
            try {
                client.Disconnect();
            } catch (Exception ignored) {
            }
        }

        client = null;
    }

    public boolean isConectado() {
        return conectado;
    }

    public void setSnapshotListener(Consumer<OperacaoSnapshot> snapshotListener) {
        this.snapshotListener = snapshotListener;
    }

    public void setStatusListener(Consumer<Boolean> statusListener) {
        this.statusListener = statusListener;
    }

    public void setLogListener(Consumer<String> logListener) {
        this.logListener = logListener;
    }

    private void diagnosticarMemoriaVM() {
        byte[] buffer = new byte[20];
        int resultado = client.ReadArea(S7.S7AreaDB, DB_OPERACAO, 0, 20, buffer);
        if (resultado != 0) {
            log("[DIAG] FALHA ao ler VM. Codigo=" + resultado);
            return;
        }
        StringBuilder sb = new StringBuilder("[DIAG] VM bytes 0-19: ");
        for (int i = 0; i < 20; i++) {
            sb.append(String.format("%02X ", buffer[i] & 0xFF));
        }
        log(sb.toString());
        log(String.format("[DIAG] VW0=%d VW2=%d VW4=%d VW6=%d VW8=%d VW10=%d VW12=%d VW14=%d VW16=%d VW18=%d",
                S7.GetWordAt(buffer, 0), S7.GetWordAt(buffer, 2),
                S7.GetWordAt(buffer, 4), S7.GetWordAt(buffer, 6),
                S7.GetWordAt(buffer, 8), S7.GetWordAt(buffer, 10),
                S7.GetWordAt(buffer, 12), S7.GetWordAt(buffer, 14),
                S7.GetWordAt(buffer, 16), S7.GetWordAt(buffer, 18)));
    }

    private void iniciarLeituraPeriodica() {
        scheduler = Executors.newSingleThreadScheduledExecutor();

        scheduler.scheduleAtFixedRate(() -> {
            if (!conectado || client == null) {
                return;
            }

            try {
                ultimaPressaoLeitura = lerPressaoDoPlc();
            } catch (Exception e) {
                log("[PLC] Erro na leitura da pressao: " + e.getMessage());
            }
        }, 0, INTERVALO_PRESSAO_MS, TimeUnit.MILLISECONDS);

        scheduler.scheduleAtFixedRate(() -> {
            if (!conectado || client == null) {
                return;
            }

            try {
                PressaoLeitura pressaoLeitura = ultimaPressaoLeitura;
                Long strokeCumulativoLido = lerStrokeCumulativoDoPlc();
                long strokeCumulativo = ultimoStrokeCumulativoValido;
                long strokeIntervalo = 0L;
                long strokeAtual = 0L;

                if (strokeCumulativoLido == null) {
                    log("[PLC] Leitura do stroke cumulativo falhou. Mantendo ultimo valor valido.");
                } else {
                    strokeCumulativo = strokeCumulativoLido;

                    if (ultimoStrokeCumulativoValido > 0L && strokeCumulativo < ultimoStrokeCumulativoValido) {
                        strokeCalculatorService.reset();
                        strokePorMinutoService.reset();
                        log("[PLC] Stroke cumulativo reiniciado no PLC. Historicos de stroke resetados.");
                    }

                    if (ultimoStrokeCumulativoValido > 0L && strokeCumulativo >= ultimoStrokeCumulativoValido) {
                        strokeIntervalo = strokeCumulativo - ultimoStrokeCumulativoValido;
                    }

                    ultimoStrokeCumulativoValido = strokeCumulativo;
                    // Calcula o stroke atual (diferença desde última leitura)
                    strokeAtual = strokeCalculatorService.calcularStrokeAtual(strokeCumulativo);
                }

                double pressao = pressaoLeitura.pressaoPsi;

                // Obtém a constante da bomba
                double constante = configuracaoService.getConstante();

                // Calcula a vazão em BBL/min
                // Fórmula: BBL/min = Volume acumulado (10s) / Strokes acumulados (10s)
                double vazaoAtual = strokePorMinutoService.calcularBBLPorMinuto(
                        strokeIntervalo, 
                        constante
                );

                // Calcula stroke por minuto para referência
                double strokePorMinuto = strokePorMinutoService.calcularStrokePorMinuto(strokeIntervalo);

                // Fórmula: Volume acumulado = strokeCumulativo * constante
                double volumeBombeado = strokeCumulativo * constante;

                OperacaoSnapshot snapshot = new OperacaoSnapshot(
                        LocalDateTime.now(),
                        pressao,
                        strokeAtual,
                        strokeCumulativo,
                        vazaoAtual,
                        volumeBombeado
                );

                salvarRegistroAsync(snapshot);
                notificarSnapshot(snapshot);

                log("[PLC] Stroke cumulativo: " + strokeCumulativo
                        + " | Pressao: " + String.format("%.2f", pressao) + " PSI"
                        + " | Pressao raw: " + pressaoLeitura.valorAnalogico
                        + " | Pressao mA: " + String.format("%.2f", pressaoLeitura.correnteMa)
                        + " | Stroke intervalo: " + strokeIntervalo
                        + " | Stroke atual (media 60s): " + strokeAtual
                        + " | Stroke/min: " + String.format("%.2f", strokePorMinuto)
                        + " | Vazão: " + String.format("%.2f", vazaoAtual) + " BBL/min"
                        + " | Volume acum: " + String.format("%.2f", volumeBombeado) + " BBL"
                        + " | Constante: " + String.format("%.6f", constante)
                        + " | Histórico: " + strokePorMinutoService.getTamanhoHistorico() + " registros");

            } catch (Exception e) {
                log("[PLC] Erro na leitura periódica: " + e.getMessage());
            }

        }, 0, 1, TimeUnit.SECONDS);
    }

    private void salvarRegistroAsync(OperacaoSnapshot snapshot) {
        if (persistenciaExecutor.isShutdown()) {
            log("[JSON] Persistência indisponível. Registro não enfileirado.");
            return;
        }

        try {
            persistenciaExecutor.execute(() -> registroOperacaoService.salvar(snapshot));
        } catch (RejectedExecutionException e) {
            log("[JSON] Registro rejeitado durante encerramento da persistência.");
        }
    }

    private void encerrarPersistencia() {
        if (persistenciaExecutor.isShutdown()) {
            return;
        }

        persistenciaExecutor.shutdown();

        try {
            if (!persistenciaExecutor.awaitTermination(2, TimeUnit.SECONDS)) {
                persistenciaExecutor.shutdownNow();
            }
        } catch (InterruptedException e) {
            persistenciaExecutor.shutdownNow();
            Thread.currentThread().interrupt();
        }
    }

    public synchronized void shutdown() {
        desconectar();
        encerrarPersistencia();
    }

    boolean isPersistenciaAtiva() {
        return !persistenciaExecutor.isShutdown();
    }

    private Long lerStrokeCumulativoDoPlc() {
        if (client == null) {
            return null;
        }

        byte[] buffer = new byte[4];

        int resultado = client.ReadArea(
                S7.S7AreaDB,
                DB_OPERACAO,
                STROKE_START,
                4,
                buffer
        );

        if (resultado != 0) {
            log("[PLC] Falha ao ler DB" + DB_OPERACAO + ".DBD" + STROKE_START + ". Codigo: " + resultado);
            return null;
        }

        long valor = S7.GetDWordAt(buffer, 0);
        int word0 = S7.GetWordAt(buffer, 0);
        int word2 = S7.GetWordAt(buffer, 2);

        log(String.format(
                "[PLC-DEBUG] DB1.DBD0/V0 bytes=%02X %02X %02X %02X | DWord=%d | VW0=%d | VW2=%d",
                buffer[0] & 0xFF,
                buffer[1] & 0xFF,
                buffer[2] & 0xFF,
                buffer[3] & 0xFF,
                valor,
                word0,
                word2
        ));

        // Log de DEBUG (descomente se necessário)
        // log(String.format(
        //         "[PLC-DEBUG] Área=DB1 | start=0 | raw=%02X %02X %02X %02X | int32=%d",
        //         buffer[0] & 0xFF,
        //         buffer[1] & 0xFF,
        //         buffer[2] & 0xFF,
        //         buffer[3] & 0xFF,
        //         valor
        // ));

        return valor;
    }

    private PressaoLeitura lerPressaoDoPlc() {
        if (client == null) {
            return new PressaoLeitura(0, 0.0, 0.0);
        }

        // DB1.DBW4 - B002 Analog Amplifier, parametro "Ax, amplified", Word (2 bytes)
        byte[] buffer = new byte[2];

        int resultado = client.ReadArea(
                S7.S7AreaDB,
                DB_OPERACAO,
                PRESSAO_START,
                2,
                buffer
        );

        if (resultado != 0) {
            log("[PRESSAO] FALHA ao ler DB1.DBW4. Codigo=" + resultado);
            return new PressaoLeitura(0, 0.0, 0.0);
        }

        int valorAnalogico = S7.GetWordAt(buffer, 0);
        log(String.format("[PRESSAO] DB1.DBW4 bytes: %02X %02X | raw=%d",
                buffer[0] & 0xFF, buffer[1] & 0xFF, valorAnalogico));
        return converterPressaoParaPsi(valorAnalogico);
    }

    private PressaoLeitura converterPressaoParaPsi(int valorAnalogico) {
        ConfiguracaoBomba config = configuracaoService.getConfiguracao();

        // B002 Analog Amplifier: parametro "Ax, amplified", Word em V4, escala 0-1000.
        double correnteMa = (valorAnalogico / LOGO_ANALOGICO_MAX) * CORRENTE_MAX_MA;
        double pressaoMaxPsi = config.getRangePressaoBar() * BAR_PARA_PSI;

        double pressaoPsi;
        if (correnteMa < CORRENTE_MIN_MA) {
            pressaoPsi = PRESSAO_MIN_PSI;
            log(String.format("[PRESSAO] Corrente abaixo da faixa 4-20 mA: %.2f mA", correnteMa));
        } else if (correnteMa > CORRENTE_MAX_MA) {
            pressaoPsi = pressaoMaxPsi;
            log(String.format("[PRESSAO] Corrente acima da faixa 4-20 mA: %.2f mA", correnteMa));
        } else {
            double pressaoBar = ((correnteMa - CORRENTE_MIN_MA) / (CORRENTE_MAX_MA - CORRENTE_MIN_MA))
                    * config.getRangePressaoBar();
            pressaoPsi = pressaoBar * BAR_PARA_PSI;
        }

        pressaoPsi *= config.getSensibilidadePressao();

        log(String.format("[PRESSAO] Raw analog UInt16 DB1.DBW4=%d | mA=%.2f | maxBar=%.2f | maxPSI=%.2f | PSI=%.2f",
                valorAnalogico, correnteMa, config.getRangePressaoBar(), pressaoMaxPsi, pressaoPsi));

        return new PressaoLeitura(valorAnalogico, correnteMa, pressaoPsi);
    }

    private static class PressaoLeitura {
        final int valorAnalogico;
        final double correnteMa;
        final double pressaoPsi;

        static PressaoLeitura vazia() {
            return new PressaoLeitura(0, 0.0, 0.0);
        }

        PressaoLeitura(int valorAnalogico, double correnteMa, double pressaoPsi) {
            this.valorAnalogico = valorAnalogico;
            this.correnteMa = correnteMa;
            this.pressaoPsi = pressaoPsi;
        }
    }

    private void notificarSnapshot(OperacaoSnapshot snapshot) {
        if (snapshotListener != null) {
            snapshotListener.accept(snapshot);
        }
    }

    private void notificarStatus(boolean status) {
        if (statusListener != null) {
            statusListener.accept(status);
        }
    }

    private void log(String mensagem) {
        if (logListener != null) {
            logListener.accept(mensagem);
        } else {
            System.out.println(mensagem);
        }
    }
}

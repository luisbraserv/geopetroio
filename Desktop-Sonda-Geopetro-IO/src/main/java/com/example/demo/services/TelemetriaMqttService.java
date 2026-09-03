package com.example.demo.services;

import com.example.demo.models.AppSettings;
import com.example.demo.models.CardVisibilityConfig;
import org.eclipse.paho.client.mqttv3.MqttClient;
import org.eclipse.paho.client.mqttv3.MqttConnectOptions;
import org.eclipse.paho.client.mqttv3.MqttMessage;
import org.eclipse.paho.client.mqttv3.persist.MemoryPersistence;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.nio.charset.StandardCharsets;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicLong;

import jakarta.annotation.PreDestroy;

@Service
public class TelemetriaMqttService {

    private static final Logger logger = LoggerFactory.getLogger(TelemetriaMqttService.class);
    private static final DateTimeFormatter FORMATTER = DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss.SSS");
    private static final String DEFAULT_BROKER_URL = "tcp://localhost:1883";

    /**
     * Capacidade da fila. A 1 leitura/s, 3600 cobre uma hora de broker fora antes de comecar a
     * descartar — folga suficiente para uma queda de rede tipica em campo.
     */
    private static final int CAPACIDADE_FILA = 3600;

    /**
     * Fila de leituras aguardando publicacao.
     *
     * <p>Aqui a escolha e oposta a do canal de tempo real: MQTT carrega <b>historico</b>, e cada
     * leitura importa. Por isso fila, e nao "ultimo valor vence".
     */
    private final BlockingQueue<LeituraPendente> fila = new LinkedBlockingQueue<>(CAPACIDADE_FILA);
    private final AtomicBoolean ativo = new AtomicBoolean(false);
    private final AtomicLong descartesAcumulados = new AtomicLong();
    private ExecutorService worker;

    private MqttClient client;
    private String connectedBrokerUrl;
    /** Usuario da conexao vigente: se mudar nas Configuracoes, a conexao e refeita. */
    private String connectedUsuario;

    /**
     * Enfileira uma leitura para publicacao. Chamado pela thread de leitura do CLP.
     *
     * <p><b>Nao publica aqui.</b> Publicar de forma sincrona faria a lentidao da rede atrasar a
     * leitura do CLP — que precisa manter o ritmo de 1 segundo. A publicacao acontece no worker.
     *
     * <p>Se a fila encher (broker fora por muito tempo), a leitura mais antiga e descartada para
     * abrir espaco. Preferimos perder o passado distante a perder o presente; e o H2 local
     * mantem o registro completo de qualquer forma.
     */
    public void enviarLeitura(AppSettings settings,
                              double pesoColuna,
                              double chHidTubos,
                              double chFlutuante,
                              double bombaEscp,
                              double vazao) {
        if (settings == null || settings.getSondaId() == null || settings.getSondaId().isBlank()) {
            logger.debug("Telemetria MQTT nao configurada: sondaId vazio.");
            return;
        }

        LeituraPendente leitura = new LeituraPendente(
                settings.getSondaId().trim(),
                normalizarBrokerUrl(settings.getTelemetriaUrl()),
                settings.getTelemetriaUsuario(),
                settings.getTelemetriaSenha(),
                settings.getCardVisibility(),
                LocalDateTime.now(),
                pesoColuna, chHidTubos, chFlutuante, bombaEscp, vazao);

        if (!fila.offer(leitura)) {
            LeituraPendente descartada = fila.poll();
            fila.offer(leitura);
            if (descartada != null && descartesAcumulados.incrementAndGet() % 100 == 1) {
                logger.warn("Fila MQTT cheia ({} leituras). Descartando as mais antigas. "
                        + "Total descartado: {}.", CAPACIDADE_FILA, descartesAcumulados.get());
            }
        }

        if (ativo.compareAndSet(false, true)) {
            iniciarWorker();
        }
    }

    /** Publicacao efetiva, executada pelo worker. */
    private void publicar(LeituraPendente pendente) {
        String brokerUrl = pendente.brokerUrl();
        String sondaId = pendente.sondaId();
        String usuario = pendente.usuario();
        String senha = pendente.senha();
        LocalDateTime dataHora = pendente.dataHora();
        CardVisibilityConfig vis = pendente.visibilidade();

        // Monta as leituras visíveis num único payload (1 mensagem por ciclo)
        List<String> leituras = new ArrayList<>();
        if (vis == null || vis.isVazao())        leituras.add(leituraJson("VAZAO_01", pendente.vazao()));
        if (vis == null || vis.isPesoColuna())   leituras.add(leituraJson("PESO_COLUNA_01", pendente.pesoColuna()));
        if (vis == null || vis.isChHidTubos())   leituras.add(leituraJson("TORQUE_01", pendente.chHidTubos()));
        if (vis == null || vis.isChFlutuante())  leituras.add(leituraJson("TORQUE_02", pendente.chFlutuante()));
        if (vis == null || vis.isBombaLama() || vis.isEscp()) leituras.add(leituraJson("PRESSAO_01", pendente.bombaEscp()));

        if (leituras.isEmpty()) {
            return;
        }

        try {
            MqttClient mqtt = conectar(brokerUrl, usuario, senha);
            publicarBatch(mqtt, sondaId, dataHora, leituras);
        } catch (Exception e) {
            // Nao relanca: o worker precisa continuar consumindo. A leitura ja saiu da fila —
            // perde-se este ciclo no MQTT, mas ele permanece gravado no H2 local.
            logger.warn("Falha ao publicar telemetria MQTT em {}: {}", brokerUrl, e.getMessage());
        }
    }

    /**
     * Worker de publicacao, em Virtual Thread unica.
     *
     * <p>Fica bloqueado em {@code take()} enquanto nao ha leitura — custo praticamente nulo numa
     * Virtual Thread. Nao se cria thread por leitura.
     */
    private void iniciarWorker() {
        worker = Executors.newSingleThreadExecutor(Thread.ofVirtual().name("mqtt-worker").factory());
        worker.submit(() -> {
            logger.info("Worker MQTT iniciado.");
            while (ativo.get() && !Thread.currentThread().isInterrupted()) {
                try {
                    publicar(fila.take());
                }
                catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                    return;
                }
                catch (Exception e) {
                    // Barreira final: nenhuma falha pode encerrar o worker.
                    logger.error("Erro inesperado no worker MQTT: {}", e.getMessage(), e);
                }
            }
        });
    }

    @PreDestroy
    public void encerrar() {
        ativo.set(false);
        if (worker != null) {
            worker.shutdownNow();
        }
        try {
            if (client != null && client.isConnected()) {
                client.disconnect();
            }
        }
        catch (Exception ignored) {
            // Encerrando de qualquer forma.
        }
        logger.info("Worker MQTT encerrado. Leituras descartadas por fila cheia: {}.",
                descartesAcumulados.get());
    }

    /**
     * Uma leitura aguardando publicacao.
     *
     * <p>Carrega copia dos dados de configuracao relevantes no instante da leitura: se o operador
     * trocar o broker enquanto ha itens na fila, cada item vai para onde estava configurado quando
     * foi lido — e nao para o destino novo.
     */
    private record LeituraPendente(
            String sondaId,
            String brokerUrl,
            String usuario,
            String senha,
            CardVisibilityConfig visibilidade,
            LocalDateTime dataHora,
            double pesoColuna,
            double chHidTubos,
            double chFlutuante,
            double bombaEscp,
            double vazao) {
    }

    private synchronized MqttClient conectar(String brokerUrl, String usuario, String senha) throws Exception {
        boolean mesmasCredenciais = java.util.Objects.equals(usuario, connectedUsuario);
        if (client != null && client.isConnected()
                && brokerUrl.equals(connectedBrokerUrl) && mesmasCredenciais) {
            return client;
        }

        if (client != null) {
            try {
                client.disconnect();
            } catch (Exception ignored) {
                // melhor abrir uma nova conexao do que travar a leitura do PLC por cleanup
            }
        }

        String clientId = "geopetro-sonda-desktop-" + System.getProperty("user.name", "operador");
        client = new MqttClient(brokerUrl, clientId, new MemoryPersistence());

        MqttConnectOptions options = new MqttConnectOptions();
        options.setAutomaticReconnect(true);
        options.setCleanSession(true);
        options.setConnectionTimeout(3);

        // Broker de producao exige autenticacao (allow_anonymous false). Sem credenciais a
        // conexao e recusada e a telemetria desta sonda para — por isso o aviso explicito.
        if (usuario != null && !usuario.isBlank()) {
            options.setUserName(usuario.trim());
            options.setPassword(senha == null ? new char[0] : senha.toCharArray());
        } else {
            logger.warn("Conectando ao broker {} sem credenciais. "
                    + "Se o broker exigir autenticacao, a telemetria nao sera publicada.", brokerUrl);
        }

        client.connect(options);
        connectedBrokerUrl = brokerUrl;
        connectedUsuario = usuario;
        logger.info("Conectado ao broker MQTT {} (usuario: {})",
                brokerUrl, (usuario == null || usuario.isBlank()) ? "anonimo" : usuario.trim());
        return client;
    }

    /** Monta o fragmento JSON de uma leitura: {"dispositivo":"X","valor":N} */
    private String leituraJson(String dispositivo, double valor) {
        return String.format(Locale.US,
                "{\"dispositivo\":\"%s\",\"valor\":%.6f}", dispositivo, valor);
    }

    /**
     * Publica todas as leituras do ciclo numa única mensagem agrupada.
     * Topico: telemetria/{unidade}/batch
     * Reduz ~5x o número de mensagens MQTT (uma por métrica -> uma por ciclo),
     * cortando o custo de mensageria do broker (ex.: AWS IoT Core).
     */
    private void publicarBatch(MqttClient mqtt, String unidade, LocalDateTime dataHora,
                               List<String> leituras) throws Exception {
        String payload = String.format(Locale.US,
                "{\"unidade\":\"%s\",\"dataHora\":\"%s\",\"leituras\":[%s]}",
                unidade,
                dataHora.format(FORMATTER),
                String.join(",", leituras));

        String topico = "telemetria/" + unidade + "/batch";
        MqttMessage message = new MqttMessage(payload.getBytes(StandardCharsets.UTF_8));
        message.setQos(1);
        message.setRetained(false);
        mqtt.publish(topico, message);

        logger.debug("Telemetria MQTT (batch) publicada: topico={} leituras={} payload={}",
                topico, leituras.size(), payload);
    }

    private String normalizarBrokerUrl(String configuredUrl) {
        if (configuredUrl == null || configuredUrl.isBlank()) {
            return DEFAULT_BROKER_URL;
        }

        String url = configuredUrl.trim();
        if (url.startsWith("tcp://") || url.startsWith("ssl://")) {
            return url;
        }

        return DEFAULT_BROKER_URL;
    }
}

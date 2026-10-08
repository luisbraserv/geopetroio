package com.geopetro.desktop.telemetria;

import com.geopetro.desktop.models.AppSettings;
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
    public void enviarLeitura(AppSettings settings, List<LeituraPublicada> leituras) {
        // ⚠️ Desligado de proposito — §6. Antes disto, "desligar" era apagar um campo, e nada
        // distinguia essa escolha de uma configuracao pela metade.
        //
        // A leitura do CLP, a tela, o historico local e o alarme local seguem: o que para aqui e a
        // PUBLICACAO ao broker.
        if (settings != null && !settings.isTelemetriaMqttAtiva()) {
            desconectarDoBroker();
            return;
        }

        if (settings == null || settings.getIdUnidade() == null || settings.getIdUnidade().isBlank()) {
            logger.debug("Telemetria MQTT nao configurada: idUnidade vazio.");
            return;
        }

        if (leituras == null || leituras.isEmpty()) {
            // Sem card visivel com valor nao ha o que publicar. Nao e erro (RN-037, RN-099).
            return;
        }

        LeituraPendente leitura = new LeituraPendente(
                settings.getIdUnidade().trim(),
                normalizarBrokerUrl(settings.getTelemetriaUrl()),
                settings.getTelemetriaUsuario(),
                settings.getTelemetriaSenha(),
                LocalDateTime.now(),
                List.copyOf(leituras));

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
        String idUnidade = pendente.idUnidade();
        String usuario = pendente.usuario();
        String senha = pendente.senha();
        LocalDateTime dataHora = pendente.dataHora();

        List<String> leituras = pendente.leituras().stream().map(this::leituraJson).toList();
        if (leituras.isEmpty()) {
            return;
        }

        try {
            MqttClient mqtt = conectar(brokerUrl, usuario, senha);
            publicarBatch(mqtt, idUnidade, dataHora, leituras);
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

    /**
     * Fecha a conexão com o broker quando a telemetria é desligada.
     *
     * <p>⚠️ Não basta parar de publicar: o cliente sobe com {@code setAutomaticReconnect(true)}, e
     * uma conexão viva reconectando sozinha seria exatamente o gasto de recurso que o interruptor
     * existe para evitar — com a tela dizendo "desligado".
     *
     * <p>A fila é esvaziada junto: o que estava esperando publicação foi lido antes do desligamento
     * e não deve sair depois dele. O H2 local mantém o registro completo de qualquer forma.
     */
    private synchronized void desconectarDoBroker() {
        fila.clear();
        if (client == null) {
            return;
        }
        try {
            if (client.isConnected()) {
                client.disconnect();
            }
        } catch (Exception ignorado) {
            // Desligando de qualquer forma: nao ha o que fazer com a falha do disconnect.
        }
        client = null;
        connectedBrokerUrl = null;
        connectedUsuario = null;
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
    /**
     * ⚠️ A filtragem por visibilidade saiu daqui — passo 3b.
     *
     * <p>Antes esta classe conhecia os cinco dispositivos fixos e decidia quais publicar. Com cards
     * por unidade ela deixa de conhecer o vocabulario: recebe as leituras ja filtradas por
     * {@code LeituraDeCards.paraPublicar}, que aplica RN-037 e RN-099 num lugar so.
     */
    private record LeituraPendente(
            String idUnidade,
            String brokerUrl,
            String usuario,
            String senha,
            LocalDateTime dataHora,
            List<LeituraPublicada> leituras) {
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

    /**
     * Monta o fragmento JSON de uma leitura — {@code mqtt-telemetria.md §3}.
     *
     * <p>A mensagem se descreve (RN-097): tipo e unidade viajam junto do valor, e por isso a
     * Telemetria nao precisa consultar ninguem para grava-la.
     *
     * <p>{@code serie} sai do JSON quando ausente: so o card de stroke tem mais de uma grandeza, e
     * um {@code "serie":""} nas outras seria ruido em toda leitura de toda sonda.
     */
    private String leituraJson(LeituraPublicada leitura) {
        String serie = leitura.serie() == null || leitura.serie().isBlank()
                ? ""
                : String.format("\"serie\":\"%s\",", leitura.serie());
        return String.format(Locale.US,
                "{\"dispositivoId\":\"%s\",%s\"tipo\":\"%s\",\"unidade\":\"%s\","
                        + "\"enderecoDb\":\"%s\",\"valor\":%.6f,\"valorBruto\":%.6f}",
                leitura.dispositivoId(), serie, leitura.tipo(), leitura.unidade(),
                leitura.enderecoDb(), leitura.valor(), leitura.valorBruto());
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
				"{\"idUnidade\":\"%s\",\"dataHora\":\"%s\",\"leituras\":[%s]}",
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

package com.example.demo.services;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.WebSocket;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Locale;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CompletionStage;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import com.example.demo.models.EstadoAtual;
import com.example.demo.models.ConfiguracaoSondaRemota;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.function.Consumer;

/**
 * Cliente STOMP minimo sobre WebSocket, para publicar o estado no Backend-Sonda.
 *
 * <p>Publica o estado e recebe snapshots tipados de configuracao. O parser aceita frames
 * fragmentados, agrupados e heartbeats; rejeita buffers acima de 65536 caracteres.
 *
 * <p>Frame STOMP: {@code COMANDO\nheader:valor\n\ncorpo\0}
 */
class StompRealtimeClient {

	private static final Logger logger = LoggerFactory.getLogger(StompRealtimeClient.class);

	private static final String DESTINO = "/app/realtime/estado";
	/** Terminador de frame STOMP: byte nulo. Escape Java, nao byte cru no fonte. */
	private static final char NULO = '\0';
	private static final Duration TIMEOUT_CONEXAO = Duration.ofSeconds(10);

	private final URI uri;
	private final String token;
	private final AtomicBoolean conectado = new AtomicBoolean(false);
	private static final ObjectMapper JSON = new ObjectMapper();
    private final Long unidade;
    private final Consumer<ConfiguracaoSondaRemota> receberConfiguracao;
    private final CompletableFuture<Void> snapshotRecebido = new CompletableFuture<>();
    private final CompletableFuture<Void> conexaoEstabelecida = new CompletableFuture<>();

	private WebSocket webSocket;

	StompRealtimeClient(String url, String token) { this(url, token, null, snapshot -> {}); }

    StompRealtimeClient(String url, String token, Long unidade, Consumer<ConfiguracaoSondaRemota> receiver) {
        this.unidade = unidade; this.receberConfiguracao = receiver;
        this.uri = URI.create(url);
		this.token = token;
	}

	void conectar() throws Exception {
		HttpClient http = HttpClient.newBuilder()
				.connectTimeout(TIMEOUT_CONEXAO)
				.build();

		webSocket = http.newWebSocketBuilder()
				.connectTimeout(TIMEOUT_CONEXAO)
				.buildAsync(uri, new Listener())
				.get(TIMEOUT_CONEXAO.toSeconds(), TimeUnit.SECONDS);

		// O token vai no frame CONNECT, nao no handshake: o backend valida ali
		// (WebSocketAuthInterceptor) e fixa o usuario na sessao STOMP.
		String connect = "CONNECT\n"
				+ "accept-version:1.2\n"
				+ "heart-beat:10000,10000\n"
				+ "Authorization:Bearer " + token + "\n"
				+ "\n" + NULO;

		enviarTexto(connect);

		// Espera o CONNECTED antes de dar a conexao por boa. Sem isso, um token recusado so
		// apareceria depois — e o worker acharia que esta publicando.
		conexaoEstabelecida.get(TIMEOUT_CONEXAO.toSeconds(), TimeUnit.SECONDS);
        if (unidade != null) {
            enviarTexto("SUBSCRIBE\n" + "id:config-updates\n" + "destination:/topic/config/unidades-sondas/" + unidade + "\nack:auto\n\n" + NULO);
            solicitarConfiguracao();
            snapshotRecebido.get(TIMEOUT_CONEXAO.toSeconds(), TimeUnit.SECONDS);
        }
	}

    void solicitarConfiguracao() throws Exception {
        if (unidade == null) return;
        enviarTexto("UNSUBSCRIBE\nid:config-snapshot\n\n" + NULO);
        enviarTexto("SUBSCRIBE\nid:config-snapshot\ndestination:/app/config/unidades-sondas/" + unidade + "\nack:auto\n\n" + NULO);
    }

	void enviarEstado(EstadoAtual estado) throws Exception {
		if (!conectado.get() || webSocket == null) {
			throw new IllegalStateException("canal nao conectado");
		}

		String corpo = paraJson(estado);
		String frame = "SEND\n"
				+ "destination:" + DESTINO + "\n"
				+ "content-type:application/json\n"
				+ "content-length:" + corpo.getBytes(StandardCharsets.UTF_8).length + "\n"
				+ "\n" + corpo + NULO;

		enviarTexto(frame);
	}

	private void enviarTexto(String texto) throws Exception {
		webSocket.sendText(texto, true).get(TIMEOUT_CONEXAO.toSeconds(), TimeUnit.SECONDS);
	}

	/**
	 * Preserva a precisao decimal usada pelo produtor de estado.
	 * {@link Locale#US} evita separador decimal com virgula no JSON.
	 */
	private String paraJson(EstadoAtual estado) {
		return String.format(Locale.US,
				"{\"unidadeSondaId\":%d,\"timestamp\":\"%s\",\"pesoColuna\":%.4f,"
						+ "\"torqueTubos\":%.4f,\"torqueFlutuante\":%.4f,\"pressaoBomba\":%.4f,"
						+ "\"vazao\":%.6f,\"strokeAtual\":%d}",
				estado.unidadeSondaId(),
				estado.timestamp(),
				estado.pesoColuna(),
				estado.torqueTubos(),
				estado.torqueFlutuante(),
				estado.pressaoBomba(),
				estado.vazao(),
				estado.strokeAtual());
	}

	void fechar() {
		conectado.set(false);
		if (webSocket != null) {
			webSocket.sendClose(WebSocket.NORMAL_CLOSURE, "encerrando");
			webSocket = null;
		}
	}

	boolean isConectado() {
		return conectado.get();
	}

	/** Recebe configuracoes e acompanha o ciclo da conexao. */
	private class Listener implements WebSocket.Listener {

		private final StringBuilder acumulado = new StringBuilder();

		@Override
		public void onOpen(WebSocket ws) {
			ws.request(1);
		}

		@Override
		public CompletionStage<?> onText(WebSocket ws, CharSequence data, boolean last) {
            acumulado.append(data);
            if (acumulado.length() > 65536) {
                conectado.set(false); ws.abort();
                conexaoEstabelecida.completeExceptionally(new IllegalStateException("Frame muito grande."));
                snapshotRecebido.completeExceptionally(new IllegalStateException("Frame muito grande."));
            } else {
                int end;
                while ((end = acumulado.indexOf(String.valueOf(NULO))) >= 0) {
                    String frame = acumulado.substring(0, end);
                    acumulado.delete(0, end + 1);
                    processar(frame.stripLeading());
                }
                if (acumulado.toString().isBlank()) acumulado.setLength(0);
            }
			ws.request(1);
			return null;
		}

		private void processar(String frame) {
			if (frame.startsWith("CONNECTED")) {
				conectado.set(true);
				conexaoEstabelecida.complete(null);
				return;
			}
            if (frame.startsWith("MESSAGE")) {
                processarConfiguracao(frame);
                return;
            }
			if (frame.startsWith("ERROR")) {
				conectado.set(false);
				String mensagem = extrairMensagem(frame);
				logger.warn("Backend recusou o canal de tempo real: {}", mensagem);
				conexaoEstabelecida.completeExceptionally(new IllegalStateException(mensagem));
                snapshotRecebido.completeExceptionally(new IllegalStateException("Configuracao recusada."));
			}
		}

        private void processarConfiguracao(String frame) {
            try {
                String normalized = frame.replace("\r\n", "\n");
                int divider = normalized.indexOf("\n\n");
                if (divider < 0 || unidade == null) return;
                String destination = null, subscription = null;
                for (String header : normalized.substring(0, divider).split("\n")) {
                    if (header.startsWith("destination:")) destination = header.substring(12);
                    if (header.startsWith("subscription:")) subscription = header.substring(13);
                }
                boolean update = ("config-updates".equals(subscription) && ("/topic/config/unidades-sondas/" + unidade).equals(destination));
                boolean snapshot = ("config-snapshot".equals(subscription) && ("/app/config/unidades-sondas/" + unidade).equals(destination));
                if (!update && !snapshot) return;
                var config = JSON.readValue(normalized.substring(divider + 2), ConfiguracaoSondaRemota.class);
                if (config.unidadeSondaId() != unidade) return;
                receberConfiguracao.accept(config);
                snapshotRecebido.complete(null);
            } catch (Exception e) {
                logger.warn("Configuracao remota invalida; mantendo o ultimo snapshot.");
            }
        }

		private String extrairMensagem(String frame) {
			for (String linha : frame.split("\n")) {
				if (linha.startsWith("message:")) {
					return linha.substring("message:".length()).trim();
				}
			}
			return "motivo nao informado";
		}

		@Override
		public CompletionStage<?> onClose(WebSocket ws, int codigo, String motivo) {
			conectado.set(false);
            snapshotRecebido.completeExceptionally(new IllegalStateException("Conexao fechada."));
			conexaoEstabelecida.completeExceptionally(
					new IllegalStateException("conexao fechada: " + motivo));
			return null;
		}

		@Override
		public void onError(WebSocket ws, Throwable erro) {
			conectado.set(false);
            snapshotRecebido.completeExceptionally(new IllegalStateException("Conexao fechada."));
			conexaoEstabelecida.completeExceptionally(erro);
            snapshotRecebido.completeExceptionally(erro);
		}
	}
}

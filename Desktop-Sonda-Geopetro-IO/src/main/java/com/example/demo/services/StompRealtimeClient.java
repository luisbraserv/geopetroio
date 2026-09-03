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

/**
 * Cliente STOMP minimo sobre WebSocket, para publicar o estado no Backend-Sonda.
 *
 * <p><b>Por que uma implementacao propria e nao o WebSocketStompClient do Spring:</b> este cliente
 * so precisa de CONNECT e SEND — nao assina nada, nao recebe nada. O frame STOMP e texto simples, e
 * escreve-lo direto evita arrastar o stack reativo do Spring para dentro de uma aplicacao JavaFX,
 * junto com o gerenciamento de scheduler e ciclo de vida que ele impoe.
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
	private final CompletableFuture<Void> conexaoEstabelecida = new CompletableFuture<>();

	private WebSocket webSocket;

	StompRealtimeClient(String url, String token) {
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
	 * Serializa o estado sem depender de biblioteca JSON.
	 *
	 * <p>São seis números e um id — usar Jackson aqui só acrescentaria dependência. O
	 * {@link Locale#US} é obrigatório: em locale pt-BR o separador decimal viraria vírgula e
	 * produziria JSON inválido.
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

	/** Trata apenas o que interessa: confirmacao de conexao, erro e fechamento. */
	private class Listener implements WebSocket.Listener {

		private final StringBuilder acumulado = new StringBuilder();

		@Override
		public void onOpen(WebSocket ws) {
			ws.request(1);
		}

		@Override
		public CompletionStage<?> onText(WebSocket ws, CharSequence data, boolean last) {
			acumulado.append(data);
			if (last) {
				processar(acumulado.toString());
				acumulado.setLength(0);
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
			if (frame.startsWith("ERROR")) {
				conectado.set(false);
				String mensagem = extrairMensagem(frame);
				logger.warn("Backend recusou o canal de tempo real: {}", mensagem);
				conexaoEstabelecida.completeExceptionally(new IllegalStateException(mensagem));
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
			conexaoEstabelecida.completeExceptionally(
					new IllegalStateException("conexao fechada: " + motivo));
			return null;
		}

		@Override
		public void onError(WebSocket ws, Throwable erro) {
			conectado.set(false);
			conexaoEstabelecida.completeExceptionally(erro);
		}
	}
}

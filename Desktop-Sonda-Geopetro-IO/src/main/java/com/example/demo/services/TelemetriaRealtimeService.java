package com.example.demo.services;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicReference;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import com.example.demo.models.AppSettings;
import com.example.demo.models.EstadoAtual;

import jakarta.annotation.PreDestroy;

/**
 * Canal de TEMPO REAL com o Backend-Sonda.
 *
 * <h2>Por que AtomicReference e nao fila</h2>
 * <p>Este canal transmite o <b>estado atual</b>, nao um historico. Se a rede engasgar por 10
 * segundos, nao interessa entregar 10 estados atrasados quando ela voltar — interessa entregar o
 * mais recente. Uma fila acumularia dados velhos e faria a tela "correr atras do prejuizo".
 *
 * <p>Por isso o produtor (leitura do CLP) apenas <b>sobrescreve</b> a referencia, e o worker envia
 * o que estiver la no momento do envio. Estados intermediarios sao descartados por desenho.
 *
 * <p>O historico completo, esse sim sem perdas, segue pelo caminho MQTT -> InfluxDB.
 *
 * <h2>Concorrencia</h2>
 * <p>Um unico worker em Virtual Thread. Nao se cria thread por leitura: a Virtual Thread fica
 * bloqueada em espera a maior parte do tempo, que e exatamente o caso de uso para o qual foram
 * feitas.
 *
 * <h2>Isolamento</h2>
 * <p>Nenhuma falha aqui pode parar a leitura do CLP nem o MQTT. Toda excecao e capturada dentro do
 * worker; o pior caso e o canal ficar offline e tentar reconectar.
 */
@Service
public class TelemetriaRealtimeService {

	private static final Logger logger = LoggerFactory.getLogger(TelemetriaRealtimeService.class);

	/** Intervalo de envio: acompanha o ciclo de leitura do CLP (1s). */
	private static final Duration INTERVALO_ENVIO = Duration.ofMillis(1000);

	/** Espera antes de tentar reconectar. Cresce ate o teto para nao martelar um backend fora. */
	private static final Duration BACKOFF_INICIAL = Duration.ofSeconds(2);
	private static final Duration BACKOFF_MAXIMO = Duration.ofSeconds(30);

	private static final Pattern TOKEN_PATTERN = Pattern.compile("\"token\"\\s*:\\s*\"([^\"]+)\"");

	/**
	 * Ultimo estado lido do CLP. Sobrescrito a cada ciclo; o worker le e envia.
	 * Um estado nao enviado a tempo e simplesmente substituido — comportamento desejado.
	 */
	private final AtomicReference<EstadoAtual> estadoAtual = new AtomicReference<>();

	/** Configuracao vigente, atualizada pelo produtor a cada ciclo. */
	private final AtomicReference<AppSettings> configuracao = new AtomicReference<>();

	private final AtomicBoolean conectado = new AtomicBoolean(false);
	private final AtomicBoolean ativo = new AtomicBoolean(false);

	private final HttpClient httpClient = HttpClient.newBuilder()
			.connectTimeout(Duration.ofSeconds(5))
			.build();

	private ExecutorService worker;
	private StompRealtimeClient client;

	/**
	 * Publica o estado mais recente. Chamado pela thread de leitura do CLP.
	 *
	 * <p>Nao bloqueia e nao lanca: e apenas uma troca de referencia.
	 */
	public void publicarEstado(AppSettings settings, EstadoAtual estado) {
		if (settings == null || !settings.temConfiguracaoTempoReal()) {
			return;
		}
		configuracao.set(settings);
		estadoAtual.set(estado);

		if (ativo.compareAndSet(false, true)) {
			iniciarWorker();
		}
	}

	public boolean isConectado() {
		return conectado.get();
	}

	private void iniciarWorker() {
		worker = Executors.newSingleThreadExecutor(Thread.ofVirtual().name("realtime-ws").factory());
		worker.submit(this::loop);
		logger.info("Worker de tempo real iniciado.");
	}

	/**
	 * Laco unico do worker: conecta, envia enquanto conectado, reconecta se cair.
	 *
	 * <p>Roda em Virtual Thread — o bloqueio em {@code sleep} e em I/O de rede nao prende
	 * thread de plataforma.
	 */
	private void loop() {
		Duration backoff = BACKOFF_INICIAL;

		while (ativo.get() && !Thread.currentThread().isInterrupted()) {
			try {
				if (!conectado.get()) {
					conectar();
					backoff = BACKOFF_INICIAL;
				}

				enviarEstadoMaisRecente();
				dormir(INTERVALO_ENVIO);
			}
			catch (InterruptedException e) {
				Thread.currentThread().interrupt();
				return;
			}
			catch (Exception e) {
				conectado.set(false);
				fecharClienteSilenciosamente();
				logger.warn("Canal de tempo real indisponivel ({}). Nova tentativa em {}s.",
						e.getMessage(), backoff.toSeconds());
				try {
					dormir(backoff);
				}
				catch (InterruptedException interrupted) {
					Thread.currentThread().interrupt();
					return;
				}
				backoff = proximoBackoff(backoff);
			}
		}
	}

	private void conectar() throws Exception {
		AppSettings settings = configuracao.get();
		if (settings == null || !settings.temConfiguracaoTempoReal()) {
			throw new IllegalStateException("configuracao de tempo real incompleta");
		}

		String token = autenticar(settings);
		client = new StompRealtimeClient(urlWebSocket(settings.getBackendUrl()), token);
		client.conectar();
		conectado.set(true);
		logger.info("Canal de tempo real conectado ao backend {} (unidade {}).",
				settings.getBackendUrl(), settings.getUnidadeSondaId());
	}

	/**
	 * Obtem um JWT no Backend-Sonda, reutilizando o mesmo {@code /auth/login} da aplicacao web.
	 *
	 * <p>Deliberado: o Desktop e um usuario do sistema como outro qualquer, sujeito as mesmas
	 * regras de autorizacao. Um token estatico separado criaria um segundo mecanismo de
	 * autenticacao para manter.
	 */
	private String autenticar(AppSettings settings) throws Exception {
		String corpo = "{\"username\":\"" + escapar(settings.getBackendUsuario())
				+ "\",\"password\":\"" + escapar(settings.getBackendSenha()) + "\"}";

		HttpRequest request = HttpRequest.newBuilder()
				.uri(URI.create(normalizarBase(settings.getBackendUrl()) + "/auth/login"))
				.header("Content-Type", "application/json")
				.timeout(Duration.ofSeconds(10))
				.POST(HttpRequest.BodyPublishers.ofString(corpo, StandardCharsets.UTF_8))
				.build();

		HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
		if (response.statusCode() != 200) {
			throw new IllegalStateException("login recusado pelo backend (HTTP " + response.statusCode() + ")");
		}

		Matcher matcher = TOKEN_PATTERN.matcher(response.body());
		if (!matcher.find()) {
			throw new IllegalStateException("resposta de login sem token");
		}
		return matcher.group(1);
	}

	private void enviarEstadoMaisRecente() throws Exception {
		EstadoAtual estado = estadoAtual.get();
		if (estado == null || client == null) {
			return;
		}
		client.enviarEstado(estado);
	}

	private String urlWebSocket(String backendUrl) {
		String base = normalizarBase(backendUrl);
		String ws = base.startsWith("https://")
				? "wss://" + base.substring("https://".length())
				: "ws://" + base.replaceFirst("^http://", "");
		return ws + "/ws";
	}

	private String normalizarBase(String url) {
		String base = url == null ? "" : url.trim();
		return base.endsWith("/") ? base.substring(0, base.length() - 1) : base;
	}

	private Duration proximoBackoff(Duration atual) {
		Duration dobrado = atual.multipliedBy(2);
		return dobrado.compareTo(BACKOFF_MAXIMO) > 0 ? BACKOFF_MAXIMO : dobrado;
	}

	private void dormir(Duration duracao) throws InterruptedException {
		TimeUnit.MILLISECONDS.sleep(duracao.toMillis());
	}

	private void fecharClienteSilenciosamente() {
		if (client != null) {
			try {
				client.fechar();
			}
			catch (Exception ignored) {
				// Ja estamos em caminho de erro; falha no cleanup nao acrescenta informacao.
			}
			client = null;
		}
	}

	private static String escapar(String valor) {
		return valor == null ? "" : valor.replace("\\", "\\\\").replace("\"", "\\\"");
	}

	@PreDestroy
	public void encerrar() {
		ativo.set(false);
		conectado.set(false);
		fecharClienteSilenciosamente();
		if (worker != null) {
			worker.shutdownNow();
		}
		logger.info("Canal de tempo real encerrado.");
	}
}

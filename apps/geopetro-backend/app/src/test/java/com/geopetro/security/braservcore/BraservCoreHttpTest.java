package com.geopetro.security.braservcore;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.atomic.AtomicInteger;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;

/** Contrato braserv-core §3 e §4, com um core de mentira na porta local. */
class BraservCoreHttpTest {

	private HttpServer core;
	private final AtomicInteger tokensEmitidos = new AtomicInteger();
	private final List<String> autorizacoes = new CopyOnWriteArrayList<>();
	private volatile Instant expiraEm = Instant.now().plusSeconds(900);
	private volatile boolean recusarProximoAcesso;

	@BeforeEach
	void setUp() throws IOException {
		core = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
		core.createContext("/internal/v1/auth/token", troca -> {
			String corpo = new String(troca.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);
			if (!corpo.contains("\"segredo\":\"certo\"")) {
				responder(troca, 401, "{\"mensagem\":\"Credencial de servico invalida.\"}");
				return;
			}
			int n = tokensEmitidos.incrementAndGet();
			responder(troca, 200, "{\"token\":\"tok-" + n + "\",\"expiraEm\":\"" + expiraEm + "\",\"escopos\":[\"acesso:ler\"]}");
		});
		core.createContext("/internal/v1/usuarios/", troca -> {
			autorizacoes.add(troca.getRequestHeaders().getFirst("Authorization"));
			if (recusarProximoAcesso) {
				recusarProximoAcesso = false;
				responder(troca, 401, "");
				return;
			}
			if (troca.getRequestURI().getPath().contains("/ninguem/")) {
				responder(troca, 404, "{\"mensagem\":\"Usuario nao encontrado.\"}");
				return;
			}
			responder(troca, 200, "{\"username\":\"cli\",\"tipo\":\"CLIENTE\",\"ativo\":true,\"roles\":[\"CLIENTE\"],\"unidadeIds\":[7]}");
		});
		core.start();
	}

	@AfterEach
	void tearDown() {
		core.stop(0);
	}

	private static void responder(HttpExchange troca, int status, String corpo) throws IOException {
		byte[] bytes = corpo.getBytes(StandardCharsets.UTF_8);
		troca.getResponseHeaders().add("Content-Type", "application/json");
		troca.sendResponseHeaders(status, bytes.length == 0 ? -1 : bytes.length);
		if (bytes.length > 0) {
			try (OutputStream out = troca.getResponseBody()) {
				out.write(bytes);
			}
		}
	}

	private BraservCoreHttp cliente(String segredo) {
		return new BraservCoreHttp("http://127.0.0.1:" + core.getAddress().getPort(), "geopetro-backend", segredo, 2000);
	}

	@Test
	@DisplayName("pede o token uma vez e o reaproveita enquanto vale")
	void reaproveitaOToken() {
		BraservCoreHttp http = cliente("certo");

		assertThat(http.acesso("cli").orElseThrow().unidadeIds()).containsExactly(7L);
		http.acesso("cli");
		http.acesso("cli");

		assertThat(tokensEmitidos).hasValue(1);
		assertThat(autorizacoes).containsOnly("Bearer tok-1");
	}

	@Test
	@DisplayName("renova o token quando falta menos de 1 min para vencer")
	void renovaAntesDeVencer() {
		expiraEm = Instant.now().plusSeconds(30);
		BraservCoreHttp http = cliente("certo");

		http.acesso("cli");
		http.acesso("cli");

		assertThat(tokensEmitidos).hasValue(2);
	}

	@Test
	@DisplayName("401 numa rota interna descarta o token e tenta uma vez mais")
	void tentaDeNovoAposRecusa() {
		BraservCoreHttp http = cliente("certo");
		http.acesso("cli");
		recusarProximoAcesso = true;

		assertThat(http.acesso("cli")).isPresent();
		assertThat(tokensEmitidos).hasValue(2);
	}

	@Test
	@DisplayName("404 vira vazio: o usuario nao existe no core")
	void naoEncontrado() {
		assertThat(cliente("certo").acesso("ninguem")).isEmpty();
	}

	@Test
	@DisplayName("credencial recusada pelo core vira falha, nunca acesso")
	void credencialRecusada() {
		BraservCoreHttp http = cliente("errado");

		org.assertj.core.api.Assertions.assertThatThrownBy(() -> http.acesso("cli")).isInstanceOf(RuntimeException.class);
		assertThat(autorizacoes).isEmpty();
	}
}

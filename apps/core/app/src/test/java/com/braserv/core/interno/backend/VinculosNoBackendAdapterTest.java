package com.braserv.core.interno.backend;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.security.KeyPairGenerator;
import java.security.interfaces.RSAPrivateCrtKey;
import java.util.List;
import java.util.concurrent.atomic.AtomicReference;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import com.braserv.core.identidade.servico.Escopo;
import com.braserv.core.identidade.token.ChavesDeAssinatura;
import com.braserv.core.identidade.token.TokenDeServico;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;

/** RN-116, spec §8.2: o core pergunta ao backend, e sem resposta a exclusao e recusada. */
class VinculosNoBackendAdapterTest {

	private HttpServer backend;
	private TokenDeServico tokens;
	private final AtomicReference<String> autorizacaoRecebida = new AtomicReference<>();
	private final AtomicReference<String> caminhoRecebido = new AtomicReference<>();
	private volatile Resposta resposta;

	private record Resposta(int status, String corpo, long atrasoMs) {
	}

	@BeforeEach
	void setUp() throws Exception {
		KeyPairGenerator gerador = KeyPairGenerator.getInstance("RSA");
		gerador.initialize(2048);
		tokens = new TokenDeServico(ChavesDeAssinatura.de((RSAPrivateCrtKey) gerador.generateKeyPair().getPrivate(), List.of()), 900);
		backend = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
		backend.createContext("/", this::responder);
		backend.start();
	}

	@AfterEach
	void tearDown() {
		backend.stop(0);
	}

	private void responder(HttpExchange troca) throws IOException {
		autorizacaoRecebida.set(troca.getRequestHeaders().getFirst("Authorization"));
		caminhoRecebido.set(troca.getRequestURI().getPath());
		try {
			Thread.sleep(resposta.atrasoMs());
		} catch (InterruptedException e) {
			Thread.currentThread().interrupt();
		}
		byte[] corpo = resposta.corpo().getBytes(StandardCharsets.UTF_8);
		troca.getResponseHeaders().add("Content-Type", "application/json");
		troca.sendResponseHeaders(resposta.status(), corpo.length);
		try (OutputStream out = troca.getResponseBody()) {
			out.write(corpo);
		}
	}

	private VinculosNoBackendAdapter adapter(long timeoutMs) {
		return new VinculosNoBackendAdapter("http://127.0.0.1:" + backend.getAddress().getPort(), timeoutMs, tokens);
	}

	@Test
	@DisplayName("unidade sem uso no backend: nada impede")
	void semUso() {
		resposta = new Resposta(200, "{\"emUso\":false,\"vinculos\":[]}", 0);

		assertThat(adapter(2000).descreverVinculo(7L)).isEmpty();
		assertThat(caminhoRecebido.get()).isEqualTo("/internal/v1/unidades/7/vinculos");
	}

	@Test
	@DisplayName("unidade em uso: a recusa diz o que o backend encontrou")
	void emUso() {
		resposta = new Resposta(200,
				"{\"emUso\":true,\"vinculos\":[\"limites de alarme configurados\",\"telemetria gravada desde 12/09/2026\"]}", 0);

		assertThat(adapter(2000).descreverVinculo(7L))
				.contains("limites de alarme configurados, telemetria gravada desde 12/09/2026");
	}

	@Test
	@DisplayName("o core se identifica com um token de servico proprio, com o escopo de vinculos")
	void tokenDoCore() {
		resposta = new Resposta(200, "{\"emUso\":false,\"vinculos\":[]}", 0);

		adapter(2000).descreverVinculo(7L);

		String autorizacao = autorizacaoRecebida.get();
		assertThat(autorizacao).startsWith("Bearer ");
		var servico = tokens.validar(autorizacao.substring(7)).orElseThrow();
		assertThat(servico.servico()).isEqualTo("braserv-core");
		assertThat(servico.escopos()).containsExactly(Escopo.UNIDADES_VINCULOS);
	}

	@Test
	@DisplayName("backend com erro (ex.: telemetria fora): recusa")
	void erroRecusa() {
		resposta = new Resposta(503, "{\"mensagem\":\"telemetria indisponivel\"}", 0);

		assertThat(adapter(2000).descreverVinculo(7L)).contains(VinculosNoBackendAdapter.SEM_CONFIRMACAO);
	}

	@Test
	@DisplayName("backend lento alem do limite: recusa")
	void lentoRecusa() {
		resposta = new Resposta(200, "{\"emUso\":false,\"vinculos\":[]}", 1500);

		assertThat(adapter(300).descreverVinculo(7L)).contains(VinculosNoBackendAdapter.SEM_CONFIRMACAO);
	}

	@Test
	@DisplayName("backend fora do ar: recusa")
	void foraDoArRecusa() {
		int porta = backend.getAddress().getPort();
		backend.stop(0);

		assertThat(new VinculosNoBackendAdapter("http://127.0.0.1:" + porta, 500, tokens).descreverVinculo(7L))
				.contains(VinculosNoBackendAdapter.SEM_CONFIRMACAO);
	}

	@Test
	@DisplayName("sem endereco do backend configurado: recusa sem tentar")
	void naoConfiguradoRecusa() {
		resposta = new Resposta(200, "{\"emUso\":false,\"vinculos\":[]}", 0);

		assertThat(new VinculosNoBackendAdapter("", 500, tokens).descreverVinculo(7L))
				.contains(VinculosNoBackendAdapter.SEM_CONFIRMACAO);
		assertThat(caminhoRecebido.get()).isNull();
	}
}

package com.geopetro.security.braservcore;

import java.net.http.HttpClient;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.HttpClientErrorException;
import org.springframework.web.client.RestClient;

/**
 * Chamadas HTTP ao Braserv-Core — contrato em {@code specs/SDD/software/apis/braserv-core.md}.
 *
 * <p>Guarda o token de servico do backend e o renova antes de vencer (contrato §3). Um {@code 401}
 * numa rota interna descarta o token e tenta uma vez mais: o core pode ter trocado de chave ou o
 * cliente ter sido reativado.
 *
 * <p>Sem cache de dados: quem decide o que guardar e por quanto tempo sao os adaptadores das portas.
 */
@Component
public class BraservCoreHttp {

	private static final Logger log = LoggerFactory.getLogger(BraservCoreHttp.class);
	/** Renova o token quando faltar menos que isto para vencer (contrato §3). */
	private static final Duration ANTECEDENCIA = Duration.ofMinutes(1);

	private final RestClient http;
	private final String clienteId;
	private final String segredo;
	private volatile TokenDeServico token;

	public BraservCoreHttp(@Value("${core.url:}") String url,
			@Value("${core.cliente.id:geopetro-backend}") String clienteId,
			@Value("${core.cliente.segredo:}") String segredo,
			@Value("${core.timeout-ms:3000}") long timeoutMs) {
		this.clienteId = clienteId;
		this.segredo = segredo;
		Duration timeout = Duration.ofMillis(timeoutMs);
		JdkClientHttpRequestFactory fabrica = new JdkClientHttpRequestFactory(
				HttpClient.newBuilder().connectTimeout(timeout).build());
		fabrica.setReadTimeout(timeout);
		this.http = RestClient.builder().baseUrl(url == null || url.isBlank() ? "http://braserv-core-nao-configurado" : url)
				.requestFactory(fabrica).build();
		if (url == null || url.isBlank()) {
			log.error("core.url nao configurado: login, acesso e unidades vem do Braserv-Core e nada vai funcionar.");
		}
	}

	/** {@code GET /.well-known/jwks.json} — publico, sem token. */
	@SuppressWarnings("unchecked")
	public List<Map<String, Object>> jwks() {
		Map<String, Object> corpo = http.get().uri("/.well-known/jwks.json").retrieve().body(Map.class);
		Object chaves = corpo == null ? null : corpo.get("keys");
		return chaves instanceof List<?> lista ? (List<Map<String, Object>>) lista : List.of();
	}

	/** {@code GET /internal/v1/usuarios/{username}/acesso}. Vazio para {@code 404}. */
	public Optional<AcessoResposta> acesso(String username) {
		return getInterno("/internal/v1/usuarios/{username}/acesso", AcessoResposta.class, username);
	}

	/** {@code GET /internal/v1/unidades}. */
	public List<UnidadeResposta> unidades() {
		return getInterno("/internal/v1/unidades", UnidadeResposta[].class).map(List::of).orElse(List.of());
	}

	/** {@code GET /internal/v1/unidades/{id}}. Vazio para {@code 404}. */
	public Optional<UnidadeResposta> unidade(long id) {
		return getInterno("/internal/v1/unidades/{id}", UnidadeResposta.class, id);
	}

	private <T> Optional<T> getInterno(String caminho, Class<T> tipo, Object... variaveis) {
		try {
			return Optional.ofNullable(get(caminho, tipo, tokenValido(), variaveis));
		} catch (HttpClientErrorException.Unauthorized recusado) {
			// O token pode ter ficado invalido antes de vencer (troca de chave no core). Uma nova tentativa.
			token = null;
			try {
				return Optional.ofNullable(get(caminho, tipo, tokenValido(), variaveis));
			} catch (HttpClientErrorException.NotFound inexistente) {
				return Optional.empty();
			}
		} catch (HttpClientErrorException.NotFound inexistente) {
			return Optional.empty();
		}
	}

	private <T> T get(String caminho, Class<T> tipo, String bearer, Object... variaveis) {
		return http.get().uri(caminho, variaveis)
				.header(HttpHeaders.AUTHORIZATION, "Bearer " + bearer)
				.retrieve().body(tipo);
	}

	private String tokenValido() {
		TokenDeServico atual = token;
		if (atual != null && Instant.now().isBefore(atual.expiraEm().minus(ANTECEDENCIA))) {
			return atual.token();
		}
		synchronized (this) {
			atual = token;
			if (atual != null && Instant.now().isBefore(atual.expiraEm().minus(ANTECEDENCIA))) {
				return atual.token();
			}
			try {
				TokenDeServico novo = http.post().uri("/internal/v1/auth/token")
						.body(Map.of("clienteId", clienteId, "segredo", segredo == null ? "" : segredo))
						.retrieve().body(TokenDeServico.class);
				if (novo == null || novo.token() == null) {
					throw new IllegalStateException("Braserv-Core respondeu sem token.");
				}
				token = novo;
				return novo.token();
			} catch (HttpClientErrorException e) {
				if (e.getStatusCode() == HttpStatus.UNAUTHORIZED) {
					log.error("O Braserv-Core recusou a credencial de {}. Confira CORE_CLIENTE_SEGREDO e se o "
							+ "sistema esta ativo na tela de sistemas autorizados.", clienteId);
				}
				throw e;
			}
		}
	}

	/** Contrato §3. */
	record TokenDeServico(String token, Instant expiraEm, Set<String> escopos) {
	}

	/** Contrato §4.1. */
	public record AcessoResposta(String username, String tipo, boolean ativo, Set<String> roles, List<Long> unidadeIds) {
	}

	/** Contrato §4.2. */
	public record UnidadeResposta(Long id, String nome, String apelido, String tipo, String status, Long setorId) {
	}
}

package com.braserv.core.interno.backend;

import java.net.http.HttpClient;
import java.time.Duration;
import java.util.List;
import java.util.Optional;
import java.util.Set;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

import com.braserv.core.comum.port.VinculoCadastroPort;
import com.braserv.core.identidade.servico.Escopo;
import com.braserv.core.identidade.token.TokenDeServico;

/**
 * O que o Geopetro-Backend sabe sobre o uso de uma unidade — RN-116, spec §8.2.
 *
 * <p>Limites, cards, alarmes e telemetria vivem no backend, e ele responde pelos quatro. O core
 * pergunta com um token de servico que ele mesmo assina ({@code sub} = {@value #SERVICO}).
 *
 * <p><b>Sem resposta, a exclusao e recusada.</b> Assumir "nao tem uso" porque ninguem respondeu
 * apagaria uma unidade que nao podia ser apagada. So um dos dois erros tem volta: recusar sem
 * necessidade custa tentar de novo; apagar por engano deixa limites, alarmes e telemetria orfaos.
 */
@Component
public class VinculosNoBackendAdapter implements VinculoCadastroPort {

	static final String SERVICO = "braserv-core";
	static final String SEM_CONFIRMACAO = "nao foi possivel confirmar com o Geopetro-Backend que ela nunca foi usada";
	private static final Logger log = LoggerFactory.getLogger(VinculosNoBackendAdapter.class);

	private final RestClient http;
	private final TokenDeServico tokenDeServico;
	private final boolean configurado;

	public VinculosNoBackendAdapter(@Value("${core.backend.url:}") String urlBackend,
			@Value("${core.backend.timeout-ms:5000}") long timeoutMs, TokenDeServico tokenDeServico) {
		this.tokenDeServico = tokenDeServico;
		this.configurado = urlBackend != null && !urlBackend.isBlank();
		Duration timeout = Duration.ofMillis(timeoutMs);
		JdkClientHttpRequestFactory fabrica = new JdkClientHttpRequestFactory(
				HttpClient.newBuilder().connectTimeout(timeout).build());
		fabrica.setReadTimeout(timeout);
		this.http = RestClient.builder().baseUrl(configurado ? urlBackend : "http://nao-configurado")
				.requestFactory(fabrica).build();
	}

	@Override
	public Cadastro cadastro() {
		return Cadastro.UNIDADE;
	}

	@Override
	public Optional<String> descreverVinculo(Long unidadeId) {
		if (!configurado) {
			log.warn("core.backend.url nao configurado: exclusao da unidade {} recusada sem consulta.", unidadeId);
			return Optional.of(SEM_CONFIRMACAO);
		}
		try {
			String token = tokenDeServico.emitir(SERVICO, Set.of(Escopo.UNIDADES_VINCULOS)).token();
			Resposta resposta = http.get()
					.uri("/internal/v1/unidades/{id}/vinculos", unidadeId)
					.header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
					.retrieve()
					.body(Resposta.class);
			if (resposta == null) {
				return Optional.of(SEM_CONFIRMACAO);
			}
			if (!resposta.emUso()) {
				return Optional.empty();
			}
			List<String> vinculos = resposta.vinculos() == null ? List.of() : resposta.vinculos();
			return Optional.of(vinculos.isEmpty() ? "ha uso registrado no Geopetro-Backend" : String.join(", ", vinculos));
		} catch (RuntimeException falha) {
			log.warn("Geopetro-Backend nao confirmou os vinculos da unidade {}: {}", unidadeId, falha.toString());
			return Optional.of(SEM_CONFIRMACAO);
		}
	}

	/** Contrato §5. */
	record Resposta(boolean emUso, List<String> vinculos) {
	}
}

package com.geopetro.security;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.when;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.util.Set;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.SpringBootTest.WebEnvironment;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

import com.geopetro.security.application.ContaAtivaVerificador;
import com.geopetro.security.braservcore.TokensDoCore;

/**
 * Logado sem permissao recebe 403, nao 401 — por HTTP de verdade (DT-017).
 *
 * <p>O MockMvc nao reproduz isto: no servidor real, o 403 vira um despacho interno para
 * {@code /error}, que nao carrega o token. Sem liberar esse despacho, a segunda passagem pela
 * seguranca o tratava como anonimo e respondia 401, e o Front entende 401 como sessao vencida.
 */
@SpringBootTest(webEnvironment = WebEnvironment.RANDOM_PORT, properties = {
		"spring.datasource.url=jdbc:h2:mem:backend-403;DB_CLOSE_DELAY=-1;DB_CLOSE_ON_EXIT=false",
		"spring.datasource.driver-class-name=org.h2.Driver",
		"spring.datasource.username=sa",
		"spring.datasource.password=",
		"spring.jpa.database-platform=org.hibernate.dialect.H2Dialect",
		"spring.jpa.properties.hibernate.dialect=org.hibernate.dialect.H2Dialect",
		"spring.jpa.hibernate.ddl-auto=create-drop",
		"spring.sql.init.mode=never",
		"spring.flyway.enabled=false"
})
class ProibidoNaoViraNaoAutenticadoTest {

	@LocalServerPort
	int porta;

	@MockitoBean
	TokensDoCore tokens;

	@MockitoBean
	ContaAtivaVerificador contaAtiva;

	private int status(String caminho, String token) throws Exception {
		HttpRequest.Builder pedido = HttpRequest.newBuilder(URI.create("http://localhost:" + porta + caminho)).GET();
		if (token != null) {
			pedido.header("Authorization", "Bearer " + token);
		}
		return HttpClient.newHttpClient().send(pedido.build(), HttpResponse.BodyHandlers.discarding()).statusCode();
	}

	@Test
	void logadoSemPermissaoRecebe403EAnonimoRecebe401() throws Exception {
		when(tokens.tokenValido("cliente")).thenReturn(true);
		when(tokens.extrairUsername("cliente")).thenReturn("cli");
		when(tokens.extrairRoles("cliente")).thenReturn(Set.of("CLIENTE"));
		when(contaAtiva.ativa(anyString())).thenReturn(true);

		// CLIENTE sem SIMULADOR + CIMENTACAO nao entra no simulador.
		assertThat(status("/api/simulador/pastas?operacao=primaria", "cliente")).isEqualTo(403);
		assertThat(status("/api/simulador/pastas?operacao=primaria", null)).isEqualTo(401);
	}
}

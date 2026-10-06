package com.braserv.core.identidade;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.when;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.util.Set;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.SpringBootTest.WebEnvironment;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

import com.braserv.core.identidade.adapter.out.JwtTokenAdapter;
import com.braserv.core.identidade.application.ContaAtivaVerificador;
import com.braserv.core.usuario.domain.model.Email;
import com.braserv.core.usuario.domain.model.Role;
import com.braserv.core.usuario.domain.model.Telefone;
import com.braserv.core.usuario.domain.model.UsuarioInterno;

/**
 * Logado sem permissao recebe 403, nao 401 — por HTTP de verdade.
 *
 * <p>O MockMvc nao reproduz isto: no servidor real, o 403 vira um despacho interno para
 * {@code /error}, que nao carrega o token. Sem liberar esse despacho, a segunda passagem pela
 * seguranca o tratava como anonimo e respondia 401, e o Front entende 401 como sessao vencida.
 */
@SpringBootTest(webEnvironment = WebEnvironment.RANDOM_PORT, properties = {
		"spring.datasource.url=jdbc:h2:mem:braserv-core-403;DB_CLOSE_DELAY=-1;DB_CLOSE_ON_EXIT=false",
		"spring.datasource.driver-class-name=org.h2.Driver",
		"spring.datasource.username=sa",
		"spring.datasource.password=",
		"spring.jpa.database-platform=org.hibernate.dialect.H2Dialect",
		"spring.jpa.properties.hibernate.dialect=org.hibernate.dialect.H2Dialect",
		"spring.jpa.hibernate.ddl-auto=create-drop",
		"spring.sql.init.mode=never",
		"spring.flyway.enabled=false",
		"security.jwt.chave-privada=${java.io.tmpdir}/braserv-core-teste/jwt.pem",
		"security.jwt.gerar-se-ausente=true"
})
class ProibidoNaoViraNaoAutenticadoTest {

	@LocalServerPort
	int porta;

	@Autowired
	JwtTokenAdapter tokens;

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
		when(contaAtiva.ativa(anyString())).thenReturn(true);
		String interno = tokens.gerar(new UsuarioInterno(1, "ana", "Senha@123", "Ana",
				Telefone.comTratamento("71999999999"), Email.comTratamento("ana@example.test"), null, Set.of(Role.INTERNO)));

		assertThat(status("/api/servicos-clientes", interno)).isEqualTo(403);
		assertThat(status("/api/servicos-clientes", null)).isEqualTo(401);
	}
}

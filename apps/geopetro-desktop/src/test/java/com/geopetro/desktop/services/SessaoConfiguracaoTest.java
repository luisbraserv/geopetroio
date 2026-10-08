package com.geopetro.desktop.services;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.nio.charset.StandardCharsets;
import java.net.InetSocketAddress;
import java.time.Instant;
import java.util.Base64;
import java.util.concurrent.ConcurrentLinkedQueue;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import com.geopetro.desktop.models.AppSettings;
import com.sun.net.httpserver.HttpServer;

/**
 * RN-086, RN-087 — a sessão que libera as janelas de configuração.
 *
 * <p>Backend de verdade num servidor local, em vez de mock do cliente HTTP: o que se quer provar é
 * o comportamento diante das respostas reais do login, inclusive quando o servidor não responde.
 */
class SessaoConfiguracaoTest {

	private HttpServer servidor;
	private String base;
	private final ConcurrentLinkedQueue<String> chamadas = new ConcurrentLinkedQueue<>();

	/** Resposta do login, trocada por cada teste antes de autenticar. */
	private volatile int status = 200;
	private volatile String corpo = "{\"token\":\"t\",\"roles\":[\"ADMIN\"]}";

	@BeforeEach
	void subir() throws Exception {
		servidor = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
		servidor.createContext("/api/auth/login", troca -> {
			chamadas.add(new String(troca.getRequestBody().readAllBytes(), StandardCharsets.UTF_8));
			byte[] bytes = corpo.getBytes(StandardCharsets.UTF_8);
			troca.getResponseHeaders().set("Content-Type", "application/json");
			troca.sendResponseHeaders(status, bytes.length);
			try (var saida = troca.getResponseBody()) {
				saida.write(bytes);
			}
		});
		servidor.start();
		base = "http://127.0.0.1:" + servidor.getAddress().getPort();
	}

	@AfterEach
	void derrubar() {
		servidor.stop(0);
	}

	private SessaoConfiguracao sessao(String backendUrl) {
		AppSettings settings = new AppSettings();
		settings.setCoreUrl(backendUrl);
		SettingsService service = mock(SettingsService.class);
		when(service.loadSettings()).thenReturn(settings);
		return new SessaoConfiguracao(service, new BackendLogin(java.net.http.HttpClient.newHttpClient()));
	}

	private SessaoConfiguracao sessao() {
		return sessao(base);
	}

	private String tokenComExpiracao(Instant expiracao) {
		String cabecalho = Base64.getUrlEncoder().withoutPadding()
				.encodeToString("{\"alg\":\"RS256\"}".getBytes(StandardCharsets.UTF_8));
		String payload = Base64.getUrlEncoder().withoutPadding()
				.encodeToString(("{\"exp\":" + expiracao.getEpochSecond() + "}")
						.getBytes(StandardCharsets.UTF_8));
		return cabecalho + "." + payload + ".assinatura";
	}

	@Test
	@DisplayName("ADMIN abre a sessao")
	void adminAbre() {
		corpo = "{\"token\":\"t\",\"roles\":[\"ADMIN\"]}";
		var sessao = sessao();

		var resultado = sessao.abrir("ana", "senha");

		assertInstanceOf(SessaoConfiguracao.Resultado.Liberada.class, resultado);
		assertTrue(sessao.liberada());
		assertEquals("ana", sessao.usuario().orElseThrow());
		assertEquals("t", sessao.token().orElseThrow());
	}

	@Test
	@DisplayName("token expirado encerra a sessao local e permite novo login")
	void tokenExpiradoEncerraSessao() {
		String token = tokenComExpiracao(Instant.now().minusSeconds(60));
		corpo = "{\"token\":\"" + token + "\",\"roles\":[\"ADMIN\"]}";
		var sessao = sessao();

		assertInstanceOf(SessaoConfiguracao.Resultado.Liberada.class, sessao.abrir("ana", "senha"));
		assertFalse(sessao.liberada(), "token vencido nao pode manter o portao aberto");
		assertTrue(sessao.token().isEmpty());
	}

	@Test
	@DisplayName("token ainda valido mantem a mesma sessao para as demais chamadas")
	void tokenValidoPermaneceNaSessao() {
		String token = tokenComExpiracao(Instant.now().plusSeconds(3600));
		corpo = "{\"token\":\"" + token + "\",\"roles\":[\"SUPORTE\"]}";
		var sessao = sessao();

		sessao.abrir("sup", "senha");

		assertTrue(sessao.liberada());
		assertEquals(token, sessao.token().orElseThrow());
	}

	@Test
	@DisplayName("SUPORTE abre a sessao")
	void suporteAbre() {
		corpo = "{\"token\":\"t\",\"roles\":[\"SUPORTE\"]}";

		assertInstanceOf(SessaoConfiguracao.Resultado.Liberada.class, sessao().abrir("sup", "senha"));
	}

	@Test
	@DisplayName("perfil sem permissao e recusado com mensagem propria, nao como credencial invalida")
	void perfilSemPermissao() {
		// Quem digitou a senha certa ficaria tentando de novo se a mensagem dissesse
		// "credencial invalida". E nao vaza nada: a pessoa ja conhece o proprio perfil.
		corpo = "{\"token\":\"t\",\"roles\":[\"SONDA\",\"CLIENTE\"]}";
		var sessao = sessao();

		var resultado = sessao.abrir("operador", "senha");

		assertInstanceOf(SessaoConfiguracao.Resultado.PerfilSemPermissao.class, resultado);
		assertFalse(sessao.liberada(), "sem perfil, a sessao nao abre");
	}

	@Test
	@DisplayName("credencial recusada pelo backend nao abre a sessao")
	void credencialInvalida() {
		status = 401;
		corpo = "{}";
		var sessao = sessao();

		assertInstanceOf(SessaoConfiguracao.Resultado.CredencialInvalida.class, sessao.abrir("ana", "errada"));
		assertFalse(sessao.liberada());
	}

	@Test
	@DisplayName("sem rede nao se configura — e o resultado distingue isso de credencial errada")
	void semRede() {
		// Porta que ninguem escuta: o backend esta fora, nao a senha errada.
		var sessao = sessao("http://127.0.0.1:1");

		var resultado = sessao.abrir("ana", "senha");

		assertInstanceOf(SessaoConfiguracao.Resultado.CoreIndisponivel.class, resultado);
		assertFalse(sessao.liberada(), "nao ha validacao local de credencial");
	}

	@Test
	@DisplayName("sem URL de backend, a sessao nem tenta")
	void semBackendConfigurado() {
		var sessao = sessao("   ");

		assertInstanceOf(SessaoConfiguracao.Resultado.CoreNaoConfigurado.class, sessao.abrir("ana", "senha"));
		assertTrue(chamadas.isEmpty(), "nao chega a chamar o backend");
	}

	@Test
	@DisplayName("usuario ou senha em branco sao recusados sem ir ao backend")
	void credencialVazia() {
		var sessao = sessao();

		assertInstanceOf(SessaoConfiguracao.Resultado.CredencialInvalida.class, sessao.abrir("  ", "senha"));
		assertInstanceOf(SessaoConfiguracao.Resultado.CredencialInvalida.class, sessao.abrir("ana", ""));
		assertTrue(chamadas.isEmpty());
	}

	@Test
	@DisplayName("encerrar limpa a sessao — e fechar o app tem o mesmo efeito, nada persiste")
	void encerrar() {
		var sessao = sessao();
		sessao.abrir("ana", "senha");

		sessao.encerrar();

		assertFalse(sessao.liberada());
		assertTrue(sessao.usuario().isEmpty());
		assertTrue(sessao.token().isEmpty());
	}

	@Test
	@DisplayName("roles com o prefixo do Spring Security sao reconhecidas")
	void rolesComPrefixo() {
		corpo = "{\"token\":\"t\",\"roles\":[\"ROLE_SUPORTE\"]}";

		assertInstanceOf(SessaoConfiguracao.Resultado.Liberada.class, sessao().abrir("sup", "senha"));
	}

	@Test
	@DisplayName("a senha vai no corpo do login e nao fica na sessao")
	void senhaNaoFicaNaSessao() {
		var sessao = sessao();
		sessao.abrir("ana", "segredo-que-nao-persiste");

		assertTrue(chamadas.peek().contains("segredo-que-nao-persiste"), "vai para o backend");
		// A sessao guarda o token, nunca a credencial: nada de re-login silencioso depois.
		assertEquals("t", sessao.token().orElseThrow());
	}

	@Test
	@DisplayName("roles de servico nao configuram: a credencial da frota nao serve aqui")
	void credencialDeServicoNaoConfigura() {
		// SEC-011: ha UMA credencial de servico para toda a frota. Se ela liberasse configuracao,
		// qualquer maquina instalada em qualquer unidade configuraria qualquer coisa.
		corpo = "{\"token\":\"t\",\"roles\":[\"SONDA\"]}";

		assertInstanceOf(SessaoConfiguracao.Resultado.PerfilSemPermissao.class,
				sessao().abrir("servico-frota", "senha"));
	}
}

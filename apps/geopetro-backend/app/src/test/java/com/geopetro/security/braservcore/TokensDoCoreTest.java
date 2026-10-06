package com.geopetro.security.braservcore;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.math.BigInteger;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.interfaces.RSAPublicKey;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Base64;
import java.util.Date;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicInteger;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import io.jsonwebtoken.Jwts;

/** RN-117: o backend confere, com a chave publica do core, e nao emite token nenhum. */
class TokensDoCoreTest {

	private KeyPair parDoCore;
	private final List<Map<String, Object>> jwks = new ArrayList<>();
	private final AtomicInteger buscas = new AtomicInteger();
	private final AcessoDoUsuarioAdapterTest.RelogioManual relogio = new AcessoDoUsuarioAdapterTest.RelogioManual();
	private TokensDoCore tokens;

	@BeforeEach
	void setUp() throws Exception {
		parDoCore = novoPar();
		jwks.add(jwk("chave-1", (RSAPublicKey) parDoCore.getPublic()));
		ChavesDoCore chaves = new ChavesDoCore(() -> {
			buscas.incrementAndGet();
			return List.copyOf(jwks);
		}, relogio);
		tokens = new TokensDoCore(chaves);
	}

	private static KeyPair novoPar() throws Exception {
		KeyPairGenerator gerador = KeyPairGenerator.getInstance("RSA");
		gerador.initialize(2048);
		return gerador.generateKeyPair();
	}

	private static Map<String, Object> jwk(String kid, RSAPublicKey chave) {
		return Map.of("kty", "RSA", "kid", kid, "alg", "RS256", "n", b64(chave.getModulus()), "e", b64(chave.getPublicExponent()));
	}

	private static String b64(BigInteger valor) {
		byte[] bytes = valor.toByteArray();
		if (bytes.length > 1 && bytes[0] == 0) {
			bytes = Arrays.copyOfRange(bytes, 1, bytes.length);
		}
		return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
	}

	private String token(String kid, KeyPair par, String emissor, String tipo, String sub, String claim, List<String> valores) {
		return Jwts.builder().header().keyId(kid).and()
				.issuer(emissor).subject(sub).claim("tipo", tipo).claim(claim, valores)
				.issuedAt(new Date()).expiration(Date.from(Instant.now().plusSeconds(600)))
				.signWith(par.getPrivate(), Jwts.SIG.RS256).compact();
	}

	private String pessoa(String... roles) {
		return token("chave-1", parDoCore, "braserv-core", "usuario", "ana", "roles", List.of(roles));
	}

	@Test
	@DisplayName("token de pessoa do core: usuario e roles")
	void tokenDePessoa() {
		String token = pessoa("INTERNO", "MONITORAMENTO");

		assertThat(tokens.tokenValido(token)).isTrue();
		assertThat(tokens.extrairUsername(token)).isEqualTo("ana");
		assertThat(tokens.extrairRoles(token)).containsExactly("INTERNO", "MONITORAMENTO");
	}

	@Test
	@DisplayName("token adulterado e recusado")
	void adulterado() {
		String[] partes = pessoa("INTERNO").split("\\.");
		String payload = new String(Base64.getUrlDecoder().decode(partes[1])).replace("INTERNO", "ADMIN");
		String adulterado = partes[0] + "." + Base64.getUrlEncoder().withoutPadding().encodeToString(payload.getBytes()) + "." + partes[2];

		assertThat(tokens.tokenValido(adulterado)).isFalse();
	}

	@Test
	@DisplayName("token assinado por outra chave com o mesmo kid e recusado")
	void outraChave() throws Exception {
		assertThat(tokens.tokenValido(token("chave-1", novoPar(), "braserv-core", "usuario", "ana", "roles", List.of("ADMIN")))).isFalse();
	}

	@Test
	@DisplayName("token com segredo compartilhado, no formato antigo do backend, e recusado")
	void segredoCompartilhado() {
		String hs256 = Jwts.builder().header().keyId("chave-1").and().issuer("braserv-core").subject("ana")
				.claim("tipo", "usuario").claim("roles", List.of("ADMIN"))
				.expiration(Date.from(Instant.now().plusSeconds(600)))
				.signWith(Jwts.SIG.HS256.key().build()).compact();

		assertThat(tokens.tokenValido(hs256)).isFalse();
	}

	@Test
	@DisplayName("emissor diferente e recusado")
	void emissorErrado() {
		assertThat(tokens.tokenValido(token("chave-1", parDoCore, "outro", "usuario", "ana", "roles", List.of("ADMIN")))).isFalse();
	}

	@Test
	@DisplayName("um tipo nao serve no lugar do outro")
	void tiposNaoSeMisturam() {
		String servico = token("chave-1", parDoCore, "braserv-core", "servico", "braserv-core", "escopos", List.of("unidades:vinculos"));

		assertThat(tokens.tokenValido(servico)).as("servico em rota de pessoa").isFalse();
		assertThat(tokens.servico(servico).orElseThrow().escopos()).containsExactly("unidades:vinculos");
		assertThat(tokens.servico(pessoa("ADMIN"))).as("pessoa em rota interna").isEmpty();
		assertThatThrownBy(() -> tokens.extrairUsername(servico)).isInstanceOf(RuntimeException.class);
	}

	@Test
	@DisplayName("kid novo depois de uma rotacao: busca o JWKS de novo, no maximo a cada 30 s")
	void rotacaoDeChave() throws Exception {
		assertThat(tokens.tokenValido(pessoa("INTERNO"))).isTrue();
		assertThat(buscas).hasValue(1);

		KeyPair novo = novoPar();
		String comChaveNova = token("chave-2", novo, "braserv-core", "usuario", "ana", "roles", List.of("INTERNO"));
		jwks.add(jwk("chave-2", (RSAPublicKey) novo.getPublic()));

		assertThat(tokens.tokenValido(comChaveNova)).as("ainda dentro dos 30 s desde a ultima busca").isFalse();
		relogio.avancar(Duration.ofSeconds(31));
		assertThat(tokens.tokenValido(comChaveNova)).isTrue();
		assertThat(tokens.tokenValido(pessoa("INTERNO"))).as("a chave anterior continua valendo").isTrue();

		// kid inventado nao faz o backend martelar o core
		for (int i = 0; i < 5; i++) {
			tokens.tokenValido(token("inventado", novo, "braserv-core", "usuario", "x", "roles", List.of()));
		}
		assertThat(buscas).hasValue(2);
	}
}

package com.braserv.core.identidade;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.nio.file.Files;
import java.nio.file.Path;
import java.security.KeyPairGenerator;
import java.security.interfaces.RSAPrivateCrtKey;
import java.time.Instant;
import java.util.Base64;
import java.util.Date;
import java.util.List;
import java.util.Map;
import java.util.Set;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.context.annotation.AnnotationConfigApplicationContext;
import org.springframework.context.support.PropertySourcesPlaceholderConfigurer;
import org.springframework.mock.env.MockPropertySource;

import com.braserv.core.identidade.adapter.out.JwtTokenAdapter;
import com.braserv.core.identidade.token.ChavesDeAssinatura;
import com.braserv.core.identidade.token.ChavesDeAssinaturaConfig;
import com.braserv.core.usuario.domain.model.Email;
import com.braserv.core.usuario.domain.model.Role;
import com.braserv.core.usuario.domain.model.Telefone;
import com.braserv.core.usuario.domain.model.Usuario;
import com.braserv.core.usuario.domain.model.UsuarioInterno;

import io.jsonwebtoken.Jwts;

/**
 * RN-117: o core assina com a chave privada, e o token se confere so com a chave publica do JWKS.
 */
class JwtTokenAdapterTest {

	private static RSAPrivateCrtKey novaChave() throws Exception {
		KeyPairGenerator gerador = KeyPairGenerator.getInstance("RSA");
		gerador.initialize(2048);
		return (RSAPrivateCrtKey) gerador.generateKeyPair().getPrivate();
	}

	private static Usuario ana() {
		return new UsuarioInterno(123, "ana", "Senha@123", "Ana", Telefone.comTratamento("71999999999"),
				Email.comTratamento("ana@example.test"), null, Set.of(Role.INTERNO, Role.MONITORAMENTO));
	}

	@Test
	@DisplayName("token emitido leva kid, emissor e tipo, e se confere com a chave publica")
	void tokenEmitidoSeConfere() throws Exception {
		ChavesDeAssinatura chaves = ChavesDeAssinatura.de(novaChave(), List.of());
		JwtTokenAdapter adapter = new JwtTokenAdapter(chaves, 3600);

		String token = adapter.gerar(ana());

		assertThat(adapter.extrairUsername(token)).isEqualTo("ana");
		assertThat(adapter.tokenValido(token)).isTrue();
		assertThat(adapter.extrairRoles(token)).containsExactlyInAnyOrder("INTERNO", "MONITORAMENTO");

		var conferido = Jwts.parser().verifyWith(chaves.publica(chaves.kidAtual()).orElseThrow()).build()
				.parseSignedClaims(token);
		assertThat(conferido.getHeader().getKeyId()).isEqualTo(chaves.kidAtual());
		assertThat(conferido.getHeader().getAlgorithm()).isEqualTo("RS256");
		assertThat(conferido.getPayload().getIssuer()).isEqualTo("braserv-core");
		assertThat(conferido.getPayload().get("tipo")).isEqualTo("usuario");
	}

	@Test
	@DisplayName("token com conteudo alterado e recusado")
	void tokenAlteradoRecusado() throws Exception {
		JwtTokenAdapter adapter = new JwtTokenAdapter(ChavesDeAssinatura.de(novaChave(), List.of()), 3600);
		String[] partes = adapter.gerar(ana()).split("\\.");
		String payload = new String(Base64.getUrlDecoder().decode(partes[1]));
		String adulterado = Base64.getUrlEncoder().withoutPadding()
				.encodeToString(payload.replace("MONITORAMENTO", "ADMIN").getBytes());

		assertThatThrownBy(() -> adapter.extrairUsername(partes[0] + "." + adulterado + "." + partes[2]))
				.isInstanceOf(RuntimeException.class);
	}

	@Test
	@DisplayName("token assinado por outra chave e recusado")
	void outraChaveRecusada() throws Exception {
		JwtTokenAdapter nosso = new JwtTokenAdapter(ChavesDeAssinatura.de(novaChave(), List.of()), 3600);
		JwtTokenAdapter outro = new JwtTokenAdapter(ChavesDeAssinatura.de(novaChave(), List.of()), 3600);

		assertThatThrownBy(() -> nosso.extrairUsername(outro.gerar(ana()))).isInstanceOf(RuntimeException.class);
	}

	@Test
	@DisplayName("token HS256 com segredo, como o do backend antigo, e recusado")
	void tokenComSegredoCompartilhadoRecusado() throws Exception {
		ChavesDeAssinatura chaves = ChavesDeAssinatura.de(novaChave(), List.of());
		JwtTokenAdapter adapter = new JwtTokenAdapter(chaves, 3600);
		String hs256 = Jwts.builder().header().keyId(chaves.kidAtual()).and()
				.issuer("braserv-core").subject("ana").claim("tipo", "usuario").claim("roles", List.of("ADMIN"))
				.expiration(Date.from(Instant.now().plusSeconds(60)))
				.signWith(Jwts.SIG.HS256.key().build())
				.compact();

		assertThatThrownBy(() -> adapter.extrairUsername(hs256)).isInstanceOf(RuntimeException.class);
	}

	@Test
	@DisplayName("token de servico nao vale como token de pessoa")
	void tokenDeServicoRecusado() throws Exception {
		ChavesDeAssinatura chaves = ChavesDeAssinatura.de(novaChave(), List.of());
		JwtTokenAdapter adapter = new JwtTokenAdapter(chaves, 3600);
		String servico = Jwts.builder().header().keyId(chaves.kidAtual()).and()
				.issuer("braserv-core").subject("geopetro-backend").claim("tipo", "servico")
				.expiration(Date.from(Instant.now().plusSeconds(60)))
				.signWith(chaves.privadaAtual(), Jwts.SIG.RS256)
				.compact();

		assertThatThrownBy(() -> adapter.extrairUsername(servico)).isInstanceOf(RuntimeException.class);
	}

	@Test
	@DisplayName("durante a rotacao, token assinado pela chave anterior continua valendo")
	void chaveAnteriorContinuaValendo() throws Exception {
		RSAPrivateCrtKey antiga = novaChave();
		ChavesDeAssinatura antes = ChavesDeAssinatura.de(antiga, List.of());
		String tokenAntigo = new JwtTokenAdapter(antes, 3600).gerar(ana());

		var publicaAntiga = antes.publica(antes.kidAtual()).orElseThrow();
		ChavesDeAssinatura depois = ChavesDeAssinatura.de(novaChave(), List.of(publicaAntiga));

		assertThat(new JwtTokenAdapter(depois, 3600).extrairUsername(tokenAntigo)).isEqualTo("ana");
		@SuppressWarnings("unchecked")
		var keys = (List<Map<String, String>>) depois.jwks().get("keys");
		assertThat(keys).extracting(chave -> chave.get("kid")).containsExactly(depois.kidAtual(), antes.kidAtual());
	}

	@Test
	@DisplayName("em desenvolvimento a chave e gerada uma vez e reaproveitada")
	void chaveGeradaUmaVez(@TempDir Path pasta) {
		Path arquivo = pasta.resolve("sub/jwt.pem");

		String primeiro = carregar(arquivo, true).kidAtual();
		String segundo = carregar(arquivo, true).kidAtual();

		assertThat(Files.exists(arquivo)).isTrue();
		assertThat(segundo).isEqualTo(primeiro);
	}

	@Test
	@DisplayName("sem o arquivo da chave e sem permissao de gerar, o core nao sobe")
	void semChaveNaoSobe(@TempDir Path pasta) {
		assertThatThrownBy(() -> carregar(pasta.resolve("ausente.pem"), false))
				.hasRootCauseMessage("Chave de assinatura nao encontrada em " + pasta.resolve("ausente.pem").toAbsolutePath()
						+ ". Gere com: openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out <arquivo>");
	}

	@Test
	@DisplayName("sem a propriedade da chave, o core nao sobe")
	void semPropriedadeNaoSobe() {
		assertThatThrownBy(() -> carregar(null, false))
				.hasRootCauseMessage("security.jwt.chave-privada nao configurado. Defina JWT_CHAVE_PRIVADA com o caminho do PEM.");
	}

	private static ChavesDeAssinatura carregar(Path arquivo, boolean gerar) {
		try (var contexto = new AnnotationConfigApplicationContext()) {
			var propriedades = new MockPropertySource().withProperty("security.jwt.gerar-se-ausente", gerar);
			if (arquivo != null) {
				propriedades.withProperty("security.jwt.chave-privada", arquivo.toString());
			}
			// Sem as fontes da maquina: o teste nao pode depender de variavel de ambiente real.
			contexto.getEnvironment().getPropertySources().remove("systemProperties");
			contexto.getEnvironment().getPropertySources().remove("systemEnvironment");
			contexto.getEnvironment().getPropertySources().addFirst(propriedades);
			contexto.registerBean(PropertySourcesPlaceholderConfigurer.class);
			contexto.register(ChavesDeAssinaturaConfig.class);
			contexto.refresh();
			return contexto.getBean(ChavesDeAssinatura.class);
		}
	}
}

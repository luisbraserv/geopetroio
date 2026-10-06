package com.braserv.core.identidade.adapter.out;

import java.security.Key;
import java.time.Instant;
import java.util.Date;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import com.braserv.core.identidade.application.port.out.TokenPort;
import com.braserv.core.identidade.token.ChavesDeAssinatura;
import com.braserv.core.usuario.domain.model.Role;
import com.braserv.core.usuario.domain.model.Usuario;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.LocatorAdapter;
import io.jsonwebtoken.ProtectedHeader;
import io.jsonwebtoken.security.SignatureException;

/**
 * Emite e confere o token de pessoa — RN-117.
 *
 * <p>Assina com RS256 e a chave privada do core; o cabecalho leva o {@code kid}, que diz com qual
 * chave publica do JWKS o token se confere. O mesmo formato e validado pelos outros sistemas, que
 * so tem a chave publica.
 *
 * <p>So aceita como valido o que o proprio core emitiu para uma <b>pessoa</b>: emissor
 * {@value #EMISSOR} e {@code tipo} = {@value #TIPO_USUARIO}. Um token de servico, mesmo assinado
 * pelo core, nao abre rota publica.
 */
@Component
public class JwtTokenAdapter implements TokenPort {

	public static final String EMISSOR = "braserv-core";
	public static final String TIPO_USUARIO = "usuario";

	private final ChavesDeAssinatura chaves;
	private final long expirationSeconds;

	public JwtTokenAdapter(ChavesDeAssinatura chaves,
			@Value("${security.jwt.expiration-seconds:3600}") long expirationSeconds) {
		this.chaves = chaves;
		this.expirationSeconds = expirationSeconds;
	}

	@Override
	public String gerar(Usuario usuario) {
		Instant agora = Instant.now();
		Set<String> roles = usuario.getRoles().stream().map(Role::name).collect(Collectors.toSet());

		return Jwts.builder()
				.header().keyId(chaves.kidAtual()).and()
				.issuer(EMISSOR)
				.subject(usuario.getUsername())
				.claim("tipo", TIPO_USUARIO)
				.claim("roles", roles)
				.issuedAt(Date.from(agora))
				.expiration(Date.from(agora.plusSeconds(expirationSeconds)))
				.signWith(chaves.privadaAtual(), Jwts.SIG.RS256)
				.compact();
	}

	@Override
	public String extrairUsername(String token) {
		return claims(token).getSubject();
	}

	@Override
	public boolean tokenValido(String token) {
		return claims(token).getExpiration().after(new Date());
	}

	@Override
	public Set<String> extrairRoles(String token) {
		Object roles = claims(token).get("roles");
		if (roles instanceof List<?> lista) {
			Set<String> resultado = new LinkedHashSet<>();
			lista.stream().filter(String.class::isInstance).map(String.class::cast).forEach(resultado::add);
			return resultado;
		}
		return Set.of();
	}

	/**
	 * Confere assinatura, emissor, expiracao e tipo. Lanca excecao em qualquer falha; quem chama
	 * (o filtro) trata como "nao autenticado".
	 */
	private Claims claims(String token) {
		Claims claims = Jwts.parser()
				.keyLocator(new LocatorAdapter<Key>() {
					@Override
					protected Key locate(ProtectedHeader header) {
						return chaves.publica(header.getKeyId())
								.orElseThrow(() -> new SignatureException("kid desconhecido: " + header.getKeyId()));
					}
				})
				.requireIssuer(EMISSOR)
				.build()
				.parseSignedClaims(token)
				.getPayload();
		if (!TIPO_USUARIO.equals(claims.get("tipo", String.class))) {
			throw new SignatureException("Token nao e de pessoa.");
		}
		return claims;
	}
}

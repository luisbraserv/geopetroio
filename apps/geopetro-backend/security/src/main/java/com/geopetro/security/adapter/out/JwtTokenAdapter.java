package com.geopetro.security.adapter.out;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Date;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

import javax.crypto.SecretKey;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import com.geopetro.security.application.port.out.TokenPort;
import com.geopetro.usuario.domain.model.Role;
import com.geopetro.usuario.domain.model.Usuario;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;

@Component
public class JwtTokenAdapter implements TokenPort {

	private final SecretKey secretKey;
	private final long expirationSeconds;

	public JwtTokenAdapter(
			@Value("${security.jwt.secret}") String secret,
			@Value("${security.jwt.expiration-seconds:3600}") long expirationSeconds) {
		// Sem valor padrao: a aplicacao deve falhar no startup se o segredo nao for
		// fornecido, em vez de subir assinando tokens com uma chave publica conhecida.
		if (secret == null || secret.isBlank()) {
			throw new IllegalStateException(
					"security.jwt.secret nao configurado. Defina a variavel de ambiente JWT_SECRET.");
		}
		this.secretKey = Keys.hmacShaKeyFor(secret.getBytes(StandardCharsets.UTF_8));
		this.expirationSeconds = expirationSeconds;
	}

	@Override
	public String gerar(Usuario usuario) {
		Instant agora = Instant.now();
		Set<String> roles = usuario.getRoles().stream().map(Role::name).collect(Collectors.toSet());

		return Jwts.builder()
				.subject(usuario.getUsername())
				.claims(Map.of("roles", roles))
				.issuedAt(Date.from(agora))
				.expiration(Date.from(agora.plusSeconds(expirationSeconds)))
				.signWith(secretKey)
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

	private Claims claims(String token) {
		return Jwts.parser()
				.verifyWith(secretKey)
				.build()
				.parseSignedClaims(token)
				.getPayload();
	}
}

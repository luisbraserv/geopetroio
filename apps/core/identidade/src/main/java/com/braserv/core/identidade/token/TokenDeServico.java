package com.braserv.core.identidade.token;

import java.security.Key;
import java.time.Duration;
import java.time.Instant;
import java.util.Collection;
import java.util.Date;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Optional;
import java.util.Set;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.LocatorAdapter;
import io.jsonwebtoken.ProtectedHeader;
import io.jsonwebtoken.security.SignatureException;

/**
 * Token de <b>sistema</b> — RN-117.
 *
 * <p>Mesmo formato e mesma chave do token de pessoa, com {@code tipo} = {@value #TIPO} e os
 * {@code escopos} concedidos no lugar das roles. Abre as rotas {@code /internal/**} e nada mais: a
 * validacao do token de pessoa recusa este tipo, e esta recusa o de pessoa.
 *
 * <p>Vale {@value #VALIDADE_PADRAO_SEGUNDOS} s por padrao. Curto de proposito: desativar um cliente
 * de servico impede tokens novos na hora, mas os ja emitidos valem ate expirar.
 */
@Component
public class TokenDeServico {

	public static final String TIPO = "servico";
	public static final String EMISSOR = "braserv-core";
	public static final long VALIDADE_PADRAO_SEGUNDOS = 900;

	private final ChavesDeAssinatura chaves;
	private final Duration validade;

	public TokenDeServico(ChavesDeAssinatura chaves,
			@Value("${security.token-servico.validade-segundos:" + VALIDADE_PADRAO_SEGUNDOS + "}") long validadeSegundos) {
		this.chaves = chaves;
		this.validade = Duration.ofSeconds(validadeSegundos);
	}

	public TokenEmitido emitir(String servico, Collection<String> escopos) {
		Instant agora = Instant.now();
		Instant expiraEm = agora.plus(validade);
		Set<String> concedidos = new LinkedHashSet<>(escopos);
		String token = Jwts.builder()
				.header().keyId(chaves.kidAtual()).and()
				.issuer(EMISSOR)
				.subject(servico)
				.claim("tipo", TIPO)
				.claim("escopos", concedidos)
				.issuedAt(Date.from(agora))
				.expiration(Date.from(expiraEm))
				.signWith(chaves.privadaAtual(), Jwts.SIG.RS256)
				.compact();
		return new TokenEmitido(token, expiraEm, concedidos);
	}

	/** Vazio para qualquer token que nao seja um token de servico valido deste core. */
	public Optional<ServicoAutenticado> validar(String token) {
		try {
			Claims claims = Jwts.parser()
					.keyLocator(new LocatorAdapter<Key>() {
						@Override
						protected Key locate(ProtectedHeader header) {
							return chaves.publica(header.getKeyId())
									.orElseThrow(() -> new SignatureException("kid desconhecido"));
						}
					})
					.requireIssuer(EMISSOR)
					.build()
					.parseSignedClaims(token)
					.getPayload();
			if (!TIPO.equals(claims.get("tipo", String.class)) || claims.getSubject() == null) {
				return Optional.empty();
			}
			Set<String> escopos = new LinkedHashSet<>();
			if (claims.get("escopos") instanceof List<?> lista) {
				lista.stream().filter(String.class::isInstance).map(String.class::cast).forEach(escopos::add);
			}
			return Optional.of(new ServicoAutenticado(claims.getSubject(), escopos));
		} catch (RuntimeException invalido) {
			return Optional.empty();
		}
	}

	public record TokenEmitido(String token, Instant expiraEm, Set<String> escopos) {
	}

	public record ServicoAutenticado(String servico, Set<String> escopos) {
	}
}

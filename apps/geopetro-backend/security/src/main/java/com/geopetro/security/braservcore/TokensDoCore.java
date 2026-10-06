package com.geopetro.security.braservcore;

import java.security.Key;
import java.util.Date;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Optional;
import java.util.Set;

import org.springframework.stereotype.Component;

import com.geopetro.security.application.port.out.TokenPort;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.LocatorAdapter;
import io.jsonwebtoken.ProtectedHeader;
import io.jsonwebtoken.security.SignatureException;

/**
 * Confere os tokens emitidos pelo Braserv-Core — RN-117, contrato §2.
 *
 * <p>Este backend nao emite token nenhum: so confere, com a chave publica do core. Nao guarda
 * segredo de assinatura, e por isso nao consegue forjar um token.
 *
 * <p>Dois tipos, e um nao serve no lugar do outro: o de <b>pessoa</b> ({@code tipo=usuario}) abre
 * as rotas publicas; o de <b>servico</b> ({@code tipo=servico}) abre so {@code /internal/**}.
 */
@Component
public class TokensDoCore implements TokenPort {

	public static final String EMISSOR = "braserv-core";

	private final ChavesDoCore chaves;

	public TokensDoCore(ChavesDoCore chaves) {
		this.chaves = chaves;
	}

	@Override
	public String extrairUsername(String token) {
		return pessoa(token).getSubject();
	}

	@Override
	public boolean tokenValido(String token) {
		try {
			return pessoa(token).getExpiration().after(new Date());
		} catch (RuntimeException invalido) {
			return false;
		}
	}

	@Override
	public Set<String> extrairRoles(String token) {
		return lista(pessoa(token).get("roles"));
	}

	/** Vazio para qualquer coisa que nao seja um token de servico valido do core. */
	public Optional<ServicoAutenticado> servico(String token) {
		try {
			Claims claims = conferir(token);
			if (!"servico".equals(claims.get("tipo", String.class)) || claims.getSubject() == null) {
				return Optional.empty();
			}
			return Optional.of(new ServicoAutenticado(claims.getSubject(), lista(claims.get("escopos"))));
		} catch (RuntimeException invalido) {
			return Optional.empty();
		}
	}

	private Claims pessoa(String token) {
		Claims claims = conferir(token);
		if (!"usuario".equals(claims.get("tipo", String.class))) {
			throw new SignatureException("Token nao e de pessoa.");
		}
		return claims;
	}

	/** Assinatura RS256 com a chave do {@code kid}, emissor {@value #EMISSOR} e validade. */
	private Claims conferir(String token) {
		return Jwts.parser()
				.keyLocator(new LocatorAdapter<Key>() {
					@Override
					protected Key locate(ProtectedHeader header) {
						return chaves.chave(header.getKeyId())
								.orElseThrow(() -> new SignatureException("kid desconhecido: " + header.getKeyId()));
					}
				})
				.requireIssuer(EMISSOR)
				.build()
				.parseSignedClaims(token)
				.getPayload();
	}

	private static Set<String> lista(Object valor) {
		Set<String> resultado = new LinkedHashSet<>();
		if (valor instanceof List<?> itens) {
			itens.stream().filter(String.class::isInstance).map(String.class::cast).forEach(resultado::add);
		}
		return resultado;
	}

	public record ServicoAutenticado(String servico, Set<String> escopos) {
	}
}

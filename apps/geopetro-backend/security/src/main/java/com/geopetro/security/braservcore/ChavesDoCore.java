package com.geopetro.security.braservcore;

import java.math.BigInteger;
import java.security.KeyFactory;
import java.security.interfaces.RSAPublicKey;
import java.security.spec.RSAPublicKeySpec;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.function.Supplier;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

/**
 * As chaves publicas que conferem os tokens do Braserv-Core — RN-117, contrato §2.
 *
 * <p>Ficam em memoria. Um {@code kid} desconhecido faz buscar o JWKS de novo, no maximo uma vez a
 * cada {@value #INTERVALO_MINIMO_SEGUNDOS} s: o core pode ter rotacionado a chave, mas um token
 * forjado com {@code kid} inventado nao pode fazer o backend martelar o core a cada requisicao.
 *
 * <p>Nada e buscado no startup: o backend sobe mesmo com o core fora, e a primeira requisicao
 * autenticada busca as chaves.
 */
@Component
public class ChavesDoCore {

	static final long INTERVALO_MINIMO_SEGUNDOS = 30;
	private static final Logger log = LoggerFactory.getLogger(ChavesDoCore.class);

	private final Supplier<List<Map<String, Object>>> jwks;
	private final Clock relogio;
	private volatile Map<String, RSAPublicKey> chaves = Map.of();
	private volatile Instant ultimaBusca = Instant.EPOCH;

	@Autowired
	public ChavesDoCore(BraservCoreHttp core) {
		this(core::jwks, Clock.systemUTC());
	}

	ChavesDoCore(Supplier<List<Map<String, Object>>> jwks, Clock relogio) {
		this.jwks = jwks;
		this.relogio = relogio;
	}

	public Optional<RSAPublicKey> chave(String kid) {
		if (kid == null) {
			return Optional.empty();
		}
		RSAPublicKey conhecida = chaves.get(kid);
		if (conhecida != null) {
			return Optional.of(conhecida);
		}
		recarregarSePuder();
		return Optional.ofNullable(chaves.get(kid));
	}

	private synchronized void recarregarSePuder() {
		Instant agora = relogio.instant();
		if (agora.isBefore(ultimaBusca.plus(Duration.ofSeconds(INTERVALO_MINIMO_SEGUNDOS)))) {
			return;
		}
		ultimaBusca = agora;
		try {
			Map<String, RSAPublicKey> lidas = new HashMap<>();
			for (Map<String, Object> jwk : jwks.get()) {
				if ("RSA".equals(jwk.get("kty")) && jwk.get("kid") instanceof String kid) {
					lidas.put(kid, publica((String) jwk.get("n"), (String) jwk.get("e")));
				}
			}
			chaves = Map.copyOf(lidas);
			log.info("Chaves do Braserv-Core carregadas: {}", lidas.keySet());
		} catch (RuntimeException falha) {
			// Mantem as chaves que ja tinha: um token assinado com elas continua valendo.
			log.warn("Nao foi possivel buscar o JWKS do Braserv-Core: {}", falha.toString());
		}
	}

	private static RSAPublicKey publica(String n, String e) {
		try {
			Base64.Decoder base64 = Base64.getUrlDecoder();
			RSAPublicKeySpec spec = new RSAPublicKeySpec(new BigInteger(1, base64.decode(n)), new BigInteger(1, base64.decode(e)));
			return (RSAPublicKey) KeyFactory.getInstance("RSA").generatePublic(spec);
		} catch (Exception invalida) {
			throw new IllegalStateException("Chave invalida no JWKS do Braserv-Core.", invalida);
		}
	}
}

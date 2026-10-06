package com.braserv.core.identidade.token;

import java.time.Duration;
import java.util.Map;

import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Publica as chaves publicas que conferem os tokens — RN-117.
 *
 * <p>Sem autenticacao: a chave publica nao serve para emitir token. Mesmo assim a rota <b>nao e
 * publicada pelo proxy</b>; so os servicos da rede interna a consultam.
 */
@RestController
public class JwksController {

	private final ChavesDeAssinatura chaves;

	public JwksController(ChavesDeAssinatura chaves) {
		this.chaves = chaves;
	}

	@GetMapping("/.well-known/jwks.json")
	public ResponseEntity<Map<String, Object>> jwks() {
		return ResponseEntity.ok()
				.cacheControl(CacheControl.maxAge(Duration.ofMinutes(5)))
				.body(chaves.jwks());
	}
}

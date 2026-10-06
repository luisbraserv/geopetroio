package com.geopetro.security.braservcore;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.LinkedHashSet;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import com.geopetro.comum.port.AcessoDoUsuarioPort;

/**
 * O acesso atual do usuario, lido no Braserv-Core — spec braserv-core §6.6.
 *
 * <ul>
 *   <li><b>Cache de {@code core.cache.acesso-segundos} (10 s).</b> E a janela do corte de acesso
 *       (RN-062, RN-107): um usuario desativado no core perde o acesso aqui em ate 10 s.</li>
 *   <li><b>Core sem resposta (D-4):</b> o ultimo valor conhecido continua valendo por ate
 *       {@code core.cache.acesso-tolerancia-segundos} (5 min), com aviso no log a cada uso. Passado
 *       isso, nega. Um reinicio do core nao derruba o tempo real das operacoes em andamento; o custo
 *       e que um usuario desativado durante a queda entra por ate 5 min.</li>
 * </ul>
 */
@Component
public class AcessoDoUsuarioAdapter implements AcessoDoUsuarioPort {

	private static final Logger log = LoggerFactory.getLogger(AcessoDoUsuarioAdapter.class);
	private static final int LIMITE_ENTRADAS = 10_000;

	private final BraservCoreHttp core;
	private final Duration validade;
	private final Duration tolerancia;
	private final Clock relogio;
	private final Map<String, Registro> cache = new ConcurrentHashMap<>();

	@Autowired
	public AcessoDoUsuarioAdapter(BraservCoreHttp core,
			@Value("${core.cache.acesso-segundos:10}") long validadeSegundos,
			@Value("${core.cache.acesso-tolerancia-segundos:300}") long toleranciaSegundos) {
		this(core, Duration.ofSeconds(validadeSegundos), Duration.ofSeconds(toleranciaSegundos), Clock.systemUTC());
	}

	AcessoDoUsuarioAdapter(BraservCoreHttp core, Duration validade, Duration tolerancia, Clock relogio) {
		this.core = core;
		this.validade = validade;
		this.tolerancia = tolerancia;
		this.relogio = relogio;
	}

	@Override
	public Optional<AcessoDoUsuario> buscar(String username) {
		if (username == null || username.isBlank()) {
			return Optional.empty();
		}
		Instant agora = relogio.instant();
		Registro registro = cache.get(username);
		if (registro != null && agora.isBefore(registro.obtidoEm().plus(validade))) {
			return registro.acesso();
		}
		try {
			Optional<AcessoDoUsuario> lido = core.acesso(username).map(AcessoDoUsuarioAdapter::paraPorta);
			if (cache.size() >= LIMITE_ENTRADAS) {
				cache.values().removeIf(r -> !agora.isBefore(r.obtidoEm().plus(tolerancia)));
			}
			cache.put(username, new Registro(lido, agora));
			return lido;
		} catch (RuntimeException falha) {
			if (registro != null && agora.isBefore(registro.obtidoEm().plus(tolerancia))) {
				log.warn("Braserv-Core sem resposta; usando o acesso de {} obtido em {} ({}).", username,
						registro.obtidoEm(), falha.toString());
				return registro.acesso();
			}
			throw new BraservCoreIndisponivelException(
					"Braserv-Core sem resposta e sem acesso recente de " + username + ".", falha);
		}
	}

	/** Descarta o cache. Existe para os testes. */
	public void limpar() {
		cache.clear();
	}

	private static AcessoDoUsuario paraPorta(BraservCoreHttp.AcessoResposta r) {
		return new AcessoDoUsuario(r.username(), r.tipo(), r.ativo(), r.roles(),
				r.unidadeIds() == null ? null : new LinkedHashSet<>(r.unidadeIds()));
	}

	private record Registro(Optional<AcessoDoUsuario> acesso, Instant obtidoEm) {
	}
}

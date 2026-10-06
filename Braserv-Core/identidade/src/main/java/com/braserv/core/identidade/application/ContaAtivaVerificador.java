package com.braserv.core.identidade.application;

import java.time.Duration;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import com.braserv.core.usuario.application.port.out.UsuarioRepositoryPort;
import com.braserv.core.usuario.domain.model.StatusUsuario;

/**
 * Responde se a conta continua ativa — RN-062.
 *
 * <p>O token JWT carrega username e roles, e vale uma hora sem renovacao. Sem esta verificacao,
 * desativar um usuario so teria efeito quando o token dele expirasse. A consulta acontece a cada
 * requisicao autenticada, por isso e uma projecao de um campo, protegida por um cache curto.
 *
 * <p><b>O cache define a janela do corte.</b> Um usuario desativado continua passando por ate
 * {@code security.cache-status-segundos} — poucos segundos, contra a hora inteira de antes.
 * Aumentar esse valor alarga a janela; e o unico botao que troca corte rapido por menos consultas.
 *
 * <p>Nao ha revogacao de token individual: um token vazado de usuario <i>ativo</i> segue valido
 * ate expirar.
 */
@Component
public class ContaAtivaVerificador {

	/** Teto de entradas antes de uma limpeza das expiradas. A frota de usuarios e pequena. */
	private static final int LIMITE_ENTRADAS = 10_000;

	private final UsuarioRepositoryPort usuarioRepositoryPort;
	private final Duration validadeCache;
	private final Map<String, Registro> cache = new ConcurrentHashMap<>();

	public ContaAtivaVerificador(UsuarioRepositoryPort usuarioRepositoryPort,
			@Value("${security.cache-status-segundos:10}") long cacheSegundos) {
		this.usuarioRepositoryPort = usuarioRepositoryPort;
		this.validadeCache = Duration.ofSeconds(Math.max(0, cacheSegundos));
	}

	/**
	 * Uma conta inexistente responde {@code false}: username valido no token e ausente no banco
	 * significa usuario removido, e negar e a leitura segura.
	 */
	public boolean ativa(String username) {
		if (username == null || username.isBlank()) {
			return false;
		}

		long agora = System.nanoTime();
		Registro registro = cache.get(username);

		if (registro != null && registro.valido(agora)) {
			return registro.ativa();
		}

		if (cache.size() >= LIMITE_ENTRADAS) {
			cache.values().removeIf(entrada -> !entrada.valido(agora));
		}

		Optional<StatusUsuario> status = usuarioRepositoryPort.buscarStatusPorUsername(username);
		boolean ativa = status.filter(StatusUsuario.ATIVO::equals).isPresent();
		cache.put(username, new Registro(ativa, agora + validadeCache.toNanos()));
		return ativa;
	}

	/** Descarta o cache inteiro. Existe para os testes; nao ha caminho de producao que chame. */
	public void limpar() {
		cache.clear();
	}

	private record Registro(boolean ativa, long expiraEm) {

		boolean valido(long agora) {
			return agora - expiraEm < 0;
		}
	}
}

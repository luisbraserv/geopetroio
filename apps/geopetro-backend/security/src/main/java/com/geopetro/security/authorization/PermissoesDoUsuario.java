package com.geopetro.security.authorization;

import java.util.Set;

import org.springframework.stereotype.Component;

import com.geopetro.usuario.application.port.out.UsuarioRepositoryPort;
import com.geopetro.usuario.domain.model.Role;

/**
 * Responde se um usuario satisfaz uma {@link RegraDeAcesso} <b>a partir do username</b>.
 *
 * <p>Existe por causa do WebSocket. No HTTP a regra le as authorities do token, que a cadeia de
 * filtros ja resolveu; no canal STOMP nao ha {@code Authentication} — o CONNECT guarda apenas o
 * nome do usuario como {@code Principal}. Sem isto, a unica forma de aplicar a mesma regra la seria
 * duplicar a decisao.
 *
 * <p><b>Consulta o banco, nao o token</b>, e isso e deliberado: uma assinatura de tempo real vive
 * horas, e o token que a abriu pode ter sido emitido antes de a permissao ser revogada. Le-la do
 * banco faz a revogacao valer na proxima assinatura, e nao na expiracao do token — a mesma escolha
 * que {@code ContaAtivaVerificador} faz para conta desativada (RN-062).
 *
 * <p>Usuario inexistente responde {@code false}: negar e a leitura segura.
 */
@Component
public class PermissoesDoUsuario {

	private final UsuarioRepositoryPort usuarios;

	public PermissoesDoUsuario(UsuarioRepositoryPort usuarios) {
		this.usuarios = usuarios;
	}

	public boolean satisfaz(String username, RegraDeAcesso regra) {
		if (username == null || username.isBlank() || regra == null) {
			return false;
		}

		Set<Role> roles = usuarios.buscarPorUsername(username)
				.map(usuario -> usuario.getRoles())
				.orElse(Set.of());

		return regra.satisfeitaPor(roles);
	}
}

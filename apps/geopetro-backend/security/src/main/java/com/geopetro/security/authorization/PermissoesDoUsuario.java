package com.geopetro.security.authorization;

import java.util.EnumSet;
import java.util.Set;

import org.springframework.stereotype.Component;

import com.geopetro.comum.port.AcessoDoUsuarioPort;
import com.geopetro.comum.port.AcessoDoUsuarioPort.BraservCoreIndisponivelException;

/**
 * Responde se um usuario satisfaz uma {@link RegraDeAcesso} <b>a partir do username</b>.
 *
 * <p>Existe por causa do WebSocket. No HTTP a regra le as authorities do token, que a cadeia de
 * filtros ja resolveu; no canal STOMP nao ha {@code Authentication} — o CONNECT guarda apenas o
 * nome do usuario como {@code Principal}.
 *
 * <p><b>Usa as roles atuais, nao as do token</b>, e isso e deliberado: uma assinatura de tempo real
 * vive horas, e o token que a abriu pode ter sido emitido antes de a permissao ser revogada. As roles
 * vem do Braserv-Core ({@link AcessoDoUsuarioPort}), com o mesmo cache curto do corte de acesso.
 *
 * <p>Usuario inexistente, role desconhecida e core indisponivel sem resposta recente: negar.
 */
@Component
public class PermissoesDoUsuario {

	private final AcessoDoUsuarioPort acessos;

	public PermissoesDoUsuario(AcessoDoUsuarioPort acessos) {
		this.acessos = acessos;
	}

	public boolean satisfaz(String username, RegraDeAcesso regra) {
		if (username == null || username.isBlank() || regra == null) {
			return false;
		}
		try {
			return regra.satisfeitaPor(acessos.buscar(username).map(a -> roles(a.roles())).orElse(Set.of()));
		} catch (BraservCoreIndisponivelException indisponivel) {
			return false;
		}
	}

	/** Uma role que o core conhece e este backend nao (ex.: UNIDADE) e ignorada. */
	public static Set<Role> roles(Set<String> nomes) {
		Set<Role> roles = EnumSet.noneOf(Role.class);
		for (String nome : nomes) {
			for (Role role : Role.values()) {
				if (role.name().equals(nome)) {
					roles.add(role);
				}
			}
		}
		return roles;
	}
}

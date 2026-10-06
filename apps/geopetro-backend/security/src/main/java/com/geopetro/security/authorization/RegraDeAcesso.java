package com.geopetro.security.authorization;

import java.util.ArrayList;
import java.util.Collection;
import java.util.EnumSet;
import java.util.List;
import java.util.Set;
import java.util.function.Supplier;

import org.springframework.security.authorization.AuthorizationDecision;
import org.springframework.security.authorization.AuthorizationManager;
import org.springframework.security.authorization.AuthorizationResult;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.web.access.intercept.RequestAuthorizationContext;

import com.geopetro.security.authorization.Role;

/**
 * Uma regra de acesso: <b>uma lista de combinacoes</b>, qualquer uma delas suficiente, cada uma
 * exigindo <b>todas</b> as suas roles.
 *
 * <pre>
 * RegraDeAcesso.exigindo(Role.ADMIN)
 *         .ou(Role.CLIENTE, Role.MONITORAMENTO)
 *         .ou(Role.INTERNO, Role.MONITORAMENTO)
 * </pre>
 *
 * <p><b>Por que esta classe existe.</b> {@code hasAnyRole(...)} so sabe dizer "qualquer uma destas",
 * e o modelo de papeis passou a ser "tipo de conta <i>somado</i> a permissao de modulo" — ver
 * {@link Role}. Com {@code hasAnyRole}, {@code MONITORAMENTO} sozinha abriria a tela para quem nunca
 * deveria entrar, porque a role de modulo deixaria de depender do tipo de conta. A alternativa era
 * SpEL em string ({@code WebExpressionAuthorizationManager}); aqui o compilador confere o nome da
 * role, e a regra e testavel sem subir a cadeia de filtros.
 *
 * <p>Serve os dois canais com <b>a mesma</b> declaracao:
 * <ul>
 *   <li>HTTP — e um {@link AuthorizationManager}, usado em {@code .access(...)} no
 *       {@code SecurityConfig}, lendo as authorities {@code ROLE_*} do token.</li>
 *   <li>WebSocket — {@link #satisfeitaPor(Collection)}, a partir das roles carregadas do banco, onde
 *       nao existe {@code Authentication} da cadeia HTTP.</li>
 * </ul>
 *
 * <p>Imutavel: {@link #ou} devolve uma regra nova, o que permite derivar uma regra de outra
 * ({@code MONITORAMENTO.ou(Role.SUPORTE)}) sem risco de alterar a original.
 */
public final class RegraDeAcesso implements AuthorizationManager<RequestAuthorizationContext> {

	/** Prefixo que o Spring Security usa nas authorities, aplicado no JwtAuthenticationFilter. */
	private static final String PREFIXO_AUTHORITY = "ROLE_";

	private final List<Set<Role>> combinacoes;

	private RegraDeAcesso(List<Set<Role>> combinacoes) {
		this.combinacoes = List.copyOf(combinacoes);
	}

	/** Primeira combinacao da regra. Todas as roles informadas passam a ser exigidas juntas. */
	public static RegraDeAcesso exigindo(Role... roles) {
		return new RegraDeAcesso(List.of(combinacao(roles)));
	}

	/** Alternativa: satisfazer <b>esta</b> combinacao tambem libera o acesso. */
	public RegraDeAcesso ou(Role... roles) {
		List<Set<Role>> ampliada = new ArrayList<>(combinacoes);
		ampliada.add(combinacao(roles));
		return new RegraDeAcesso(ampliada);
	}

	/**
	 * Decisao para o canal HTTP.
	 *
	 * <p>Nega — em vez de abster-se — quando ninguem esta autenticado. Abster-se deixaria a
	 * requisicao passar caso nenhuma outra regra opinasse, e uma rota protegida ficaria aberta.
	 * Negar aqui preserva o 401 do anonimo: quem traduz negacao de anonimo em "autentique-se" e o
	 * {@code ExceptionTranslationFilter}, igual ao que acontece com {@code hasAnyRole}.
	 */
	@Override
	public AuthorizationResult authorize(Supplier<? extends Authentication> authentication,
			RequestAuthorizationContext contexto) {
		Authentication autenticacao = authentication == null ? null : authentication.get();

		if (autenticacao == null || !autenticacao.isAuthenticated()) {
			return new AuthorizationDecision(false);
		}

		return new AuthorizationDecision(satisfeitaPor(rolesDe(autenticacao)));
	}

	/** True se as roles informadas contemplarem <b>alguma</b> das combinacoes da regra. */
	public boolean satisfeitaPor(Collection<Role> rolesDoUsuario) {
		if (rolesDoUsuario == null || rolesDoUsuario.isEmpty()) {
			return false;
		}

		Set<Role> roles = EnumSet.copyOf(rolesDoUsuario);
		return combinacoes.stream().anyMatch(roles::containsAll);
	}

	/** Forma legivel para log e mensagem de erro: {@code [ADMIN] ou [CLIENTE+MONITORAMENTO]}. */
	@Override
	public String toString() {
		return combinacoes.stream()
				.map(combinacao -> combinacao.stream().map(Enum::name).reduce((a, b) -> a + "+" + b).orElse(""))
				.map(nomes -> "[" + nomes + "]")
				.reduce((a, b) -> a + " ou " + b)
				.orElse("[]");
	}

	private static Set<Role> combinacao(Role... roles) {
		if (roles == null || roles.length == 0) {
			// Combinacao vazia seria satisfeita por qualquer autenticado — provavelmente um
			// esquecimento, e o efeito (rota aberta) aparece longe da causa.
			throw new IllegalArgumentException("Combinacao de acesso sem role nenhuma.");
		}
		return Set.of(roles);
	}

	/**
	 * Authority desconhecida e <b>ignorada</b>, nao rejeitada: um token emitido antes de uma role
	 * sair do enum continua valendo pelo que ainda existe nele, em vez de derrubar a requisicao com
	 * {@code IllegalArgumentException} vinda de {@code valueOf}.
	 */
	private static Set<Role> rolesDe(Authentication autenticacao) {
		Set<Role> roles = EnumSet.noneOf(Role.class);

		for (GrantedAuthority authority : autenticacao.getAuthorities()) {
			String nome = authority.getAuthority();
			if (nome == null) {
				continue;
			}
			if (nome.startsWith(PREFIXO_AUTHORITY)) {
				nome = nome.substring(PREFIXO_AUTHORITY.length());
			}
			for (Role role : Role.values()) {
				if (role.name().equals(nome)) {
					roles.add(role);
					break;
				}
			}
		}

		return roles;
	}
}

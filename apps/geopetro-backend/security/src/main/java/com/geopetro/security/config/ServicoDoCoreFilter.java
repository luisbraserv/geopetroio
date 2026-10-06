package com.geopetro.security.config;

import java.io.IOException;

import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.filter.OncePerRequestFilter;

import com.geopetro.security.braservcore.TokensDoCore;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

/**
 * Autentica o <b>sistema</b> que chama {@code /internal/**} — RN-117.
 *
 * <p>So aceita token de servico do Braserv-Core. Cada escopo vira a authority
 * {@code ESCOPO_<escopo>}. Nao e {@code @Component}: o Spring Boot o registraria para todas as
 * requisicoes, e ele so faz sentido na cadeia interna.
 */
class ServicoDoCoreFilter extends OncePerRequestFilter {

	static final String PREFIXO_AUTHORITY = "ESCOPO_";

	private final TokensDoCore tokens;

	ServicoDoCoreFilter(TokensDoCore tokens) {
		this.tokens = tokens;
	}

	@Override
	protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
			throws ServletException, IOException {
		String authorization = request.getHeader("Authorization");
		if (authorization != null && authorization.startsWith("Bearer ")) {
			tokens.servico(authorization.substring(7)).ifPresent(servico -> SecurityContextHolder.getContext()
					.setAuthentication(new UsernamePasswordAuthenticationToken(servico.servico(), null,
							servico.escopos().stream().map(e -> new SimpleGrantedAuthority(PREFIXO_AUTHORITY + e)).toList())));
		}
		chain.doFilter(request, response);
	}
}

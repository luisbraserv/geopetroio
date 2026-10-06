package com.braserv.core.interno;

import java.io.IOException;

import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.filter.OncePerRequestFilter;

import com.braserv.core.identidade.servico.Escopo;
import com.braserv.core.identidade.token.TokenDeServico;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

/**
 * Autentica o <b>sistema</b> que chama uma rota interna — RN-117.
 *
 * <p>So aceita token de servico. Um token de pessoa, mesmo valido, nao autentica nada aqui, e a
 * rota responde 401. Cada escopo do token vira a authority {@code ESCOPO_<escopo>}.
 *
 * <p>Nao e {@code @Component} de proposito: o Spring Boot registraria o filtro para <b>todas</b> as
 * requisicoes, e ele so faz sentido na cadeia de {@code /internal/**}.
 */
class ServicoAuthenticationFilter extends OncePerRequestFilter {

	private final TokenDeServico tokenDeServico;

	ServicoAuthenticationFilter(TokenDeServico tokenDeServico) {
		this.tokenDeServico = tokenDeServico;
	}

	@Override
	protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
			throws ServletException, IOException {
		String authorization = request.getHeader("Authorization");
		if (authorization != null && authorization.startsWith("Bearer ")) {
			tokenDeServico.validar(authorization.substring(7)).ifPresent(servico -> {
				var authorities = servico.escopos().stream()
						.map(escopo -> new SimpleGrantedAuthority(Escopo.PREFIXO_AUTHORITY + escopo))
						.toList();
				SecurityContextHolder.getContext()
						.setAuthentication(new UsernamePasswordAuthenticationToken(servico.servico(), null, authorities));
			});
		}
		chain.doFilter(request, response);
	}
}

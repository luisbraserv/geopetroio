package com.braserv.core.identidade.config;

import java.io.IOException;

import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import com.braserv.core.identidade.application.ContaAtivaVerificador;
import com.braserv.core.identidade.application.port.out.TokenPort;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

@Component
public class JwtAuthenticationFilter extends OncePerRequestFilter {

	private final TokenPort tokenPort;
	private final ContaAtivaVerificador contaAtivaVerificador;

	public JwtAuthenticationFilter(TokenPort tokenPort, ContaAtivaVerificador contaAtivaVerificador) {
		this.tokenPort = tokenPort;
		this.contaAtivaVerificador = contaAtivaVerificador;
	}

	@Override
	protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain filterChain)
			throws ServletException, IOException {
		String authorization = request.getHeader("Authorization");

		if (authorization == null || !authorization.startsWith("Bearer ")) {
			filterChain.doFilter(request, response);
			return;
		}

		try {
			String token = authorization.substring(7);
			String username = tokenPort.extrairUsername(token);

			if (username != null && tokenPort.tokenValido(token)
					&& SecurityContextHolder.getContext().getAuthentication() == null
					&& contaAtivaVerificador.ativa(username)) {
				var authorities = tokenPort.extrairRoles(token).stream()
						.map(role -> new SimpleGrantedAuthority("ROLE_" + role))
						.toList();
				var authentication = new UsernamePasswordAuthenticationToken(username, null, authorities);
				SecurityContextHolder.getContext().setAuthentication(authentication);
			}
		} catch (RuntimeException ignored) {
			SecurityContextHolder.clearContext();
		}

		filterChain.doFilter(request, response);
	}
}

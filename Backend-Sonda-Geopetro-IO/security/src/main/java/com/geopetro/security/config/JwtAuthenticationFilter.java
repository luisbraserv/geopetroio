package com.geopetro.security.config;

import java.io.IOException;

import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import com.geopetro.security.application.port.out.TokenPort;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

@Component
public class JwtAuthenticationFilter extends OncePerRequestFilter {

	private final TokenPort tokenPort;

	public JwtAuthenticationFilter(TokenPort tokenPort) {
		this.tokenPort = tokenPort;
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
					&& SecurityContextHolder.getContext().getAuthentication() == null) {
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

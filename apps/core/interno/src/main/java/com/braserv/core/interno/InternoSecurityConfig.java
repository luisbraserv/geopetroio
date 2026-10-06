package com.braserv.core.interno;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.annotation.Order;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;

import com.braserv.core.identidade.servico.Escopo;
import com.braserv.core.identidade.token.TokenDeServico;

import jakarta.servlet.http.HttpServletResponse;

/**
 * Cadeia de seguranca das rotas {@code /internal/**} — RN-117.
 *
 * <p>Ordem 1: casa antes da cadeia das rotas publicas. Aqui so vale token de servico, e cada rota
 * exige o escopo dela. Uma rota interna nova nasce negada ate ganhar regra.
 *
 * <p>O proxy nao publica {@code /internal/**}; esta cadeia e a segunda barreira, nao a unica.
 */
@Configuration
public class InternoSecurityConfig {

	@Bean
	@Order(1)
	SecurityFilterChain internoFilterChain(HttpSecurity http, TokenDeServico tokenDeServico) throws Exception {
		return http
				.securityMatcher("/internal/**")
				.csrf(AbstractHttpConfigurer::disable)
				.sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
				.authorizeHttpRequests(auth -> auth
						// Troca de id + segredo por token: e aqui que o sistema se autentica.
						.requestMatchers(HttpMethod.POST, "/internal/v1/auth/token").permitAll()
						.requestMatchers(HttpMethod.GET, "/internal/v1/usuarios/*/acesso")
						.hasAuthority(Escopo.PREFIXO_AUTHORITY + Escopo.ACESSO_LER)
						.requestMatchers(HttpMethod.GET, "/internal/v1/unidades", "/internal/v1/unidades/*")
						.hasAuthority(Escopo.PREFIXO_AUTHORITY + Escopo.UNIDADES_LER)
						.anyRequest().denyAll())
				.exceptionHandling(ex -> ex
						.authenticationEntryPoint((request, response, e) ->
								response.sendError(HttpServletResponse.SC_UNAUTHORIZED, "Unauthorized"))
						.accessDeniedHandler((request, response, e) ->
								response.sendError(HttpServletResponse.SC_FORBIDDEN, "Forbidden")))
				.addFilterBefore(new ServicoAuthenticationFilter(tokenDeServico), UsernamePasswordAuthenticationFilter.class)
				.build();
	}
}

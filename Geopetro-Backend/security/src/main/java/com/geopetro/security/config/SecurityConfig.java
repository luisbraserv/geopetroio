package com.geopetro.security.config;

import java.util.List;

import jakarta.servlet.http.HttpServletResponse;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

@Configuration
public class SecurityConfig {

	private final JwtAuthenticationFilter jwtAuthenticationFilter;
	private final List<String> allowedOrigins;
	private final List<String> allowedOriginPatterns;

	public SecurityConfig(JwtAuthenticationFilter jwtAuthenticationFilter,
			@Value("${security.cors.allowed-origins:http://localhost:4200}") List<String> allowedOrigins,
			@Value("${security.cors.allowed-origin-patterns:http://localhost:4200}") List<String> allowedOriginPatterns) {
		this.jwtAuthenticationFilter = jwtAuthenticationFilter;
		this.allowedOrigins = allowedOrigins;
		this.allowedOriginPatterns = allowedOriginPatterns;
	}

	@Bean
	SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
		return http
				.cors(cors -> cors.configurationSource(corsConfigurationSource()))
				.csrf(AbstractHttpConfigurer::disable)
				.sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
				.authorizeHttpRequests(auth -> auth
						.requestMatchers(HttpMethod.POST, "/api/auth/login", "/api/auth/recuperacao-senha", "/api/auth/recuperacao-senha/confirmar")
						.permitAll()
						.requestMatchers("/swagger-ui.html", "/swagger-ui/**", "/v3/api-docs/**")
						.permitAll()
						// Probes de liveness/readiness do orquestrador, que nao se autentica.
						// Apenas /health e exposto (management.endpoints.web.exposure.include),
						// e sem detalhes (show-details=never), entao nao vaza configuracao.
						.requestMatchers("/actuator/health", "/actuator/health/**")
						.permitAll()
						// Handshake do WebSocket. Nao ha como exigir Authorization aqui: o
						// navegador nao envia headers customizados no handshake. A autenticacao
						// acontece no frame CONNECT do STOMP e a autorizacao por unidade no
						// SUBSCRIBE — ver WebSocketAuthInterceptor.
						.requestMatchers("/ws", "/ws/**")
						.permitAll()
						// Monitoramento: CLIENTE tambem acessa, mas o SondaMonitoramentoService
						// restringe o escopo dele as unidades concedidas no cadastro. Os demais
						// perfis aqui listados enxergam a frota inteira.
						.requestMatchers("/api/sondas/**")
						.hasAnyRole("SONDA", "CIMENTACAO", "GERENCIA", "DIRETORIA", "CLIENTE", "ADMIN")
						.requestMatchers("/api/simulador/**")
						.hasAnyRole("CIMENTACAO", "GERENCIA", "DIRETORIA", "ADMIN")
						.requestMatchers("/api/setores/**", "/api/unidades-sondas/**")
						.hasAnyRole("INTERNO", "CIMENTACAO", "ADMIN")
						// Regionais: leitura liberada aos perfis internos (as telas de setor e
						// unidade/sonda precisam listar regionais); escrita so ADMIN.
						.requestMatchers(HttpMethod.GET, "/api/regionais/**")
						.hasAnyRole("INTERNO", "CIMENTACAO", "ADMIN")
						.requestMatchers("/api/regionais/**")
						.hasRole("ADMIN")
						// Autoatendimento: precisa vir ANTES de /api/usuarios/** para nao herdar ADMIN.
						.requestMatchers(HttpMethod.PATCH, "/api/usuarios/me", "/api/usuarios/me/senha")
						.authenticated()
						// Configuracoes do sistema: ADMIN e SUPORTE (RN-086). Vem ANTES do
						// bloco de cadastros para nao herdar a restricao a ADMIN.
						.requestMatchers("/api/configuracoes/**")
						.hasAnyRole("ADMIN", "SUPORTE")
						// Cadastros seguem exclusivos de ADMIN: SUPORTE configura o sistema,
						// nao administra usuario nem empresa.
						.requestMatchers("/api/empresas/**", "/api/usuarios/**")
						.hasRole("ADMIN")
						.anyRequest()
						.authenticated())
				.exceptionHandling(ex -> ex
						.authenticationEntryPoint((request, response, authException) ->
								response.sendError(HttpServletResponse.SC_UNAUTHORIZED, "Unauthorized"))
						.accessDeniedHandler((request, response, accessDeniedException) ->
								response.sendError(HttpServletResponse.SC_FORBIDDEN, "Forbidden")))
				.addFilterBefore(jwtAuthenticationFilter, UsernamePasswordAuthenticationFilter.class)
				.build();
	}

	@Bean
	CorsConfigurationSource corsConfigurationSource() {
		CorsConfiguration configuration = new CorsConfiguration();
		configuration.setAllowedOrigins(allowedOrigins);
		configuration.setAllowedOriginPatterns(allowedOriginPatterns);
		configuration.setAllowedMethods(List.of("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"));
		configuration.setAllowedHeaders(List.of("Authorization", "Content-Type", "Accept", "Origin", "X-Requested-With"));
		configuration.setAllowCredentials(true);

		UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
		source.registerCorsConfiguration("/**", configuration);
		return source;
	}
}

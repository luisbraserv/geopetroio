package com.braserv.core.identidade.config;

import java.util.List;

import jakarta.servlet.DispatcherType;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.annotation.Order;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

import com.braserv.core.identidade.authorization.RegrasDeAcesso;

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

	/**
	 * Rotas publicas, com token de pessoa. Vem depois da cadeia das rotas internas
	 * ({@code /internal/**}, token de servico), que tem ordem 1 e casa primeiro.
	 */
	@Bean
	@Order(2)
	SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
		return http
				.cors(cors -> cors.configurationSource(corsConfigurationSource()))
				.csrf(AbstractHttpConfigurer::disable)
				.sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
				.authorizeHttpRequests(auth -> auth
						// O 403 de uma regra abaixo vira um despacho interno para /error, que nao carrega
						// o token. Sem liberar esse despacho, ele seria barrado como anonimo e quem esta
						// logado sem permissao receberia 401 ("faca login") em vez de 403. O Front trata
						// 401 como sessao vencida.
						.dispatcherTypeMatchers(DispatcherType.ERROR).permitAll()
						.requestMatchers(HttpMethod.POST, "/api/auth/login", "/api/auth/recuperacao-senha", "/api/auth/recuperacao-senha/confirmar")
						.permitAll()
						// Chaves publicas que conferem os tokens (RN-117). Nao servem para emitir
						// token, e por isso dispensam autenticacao; o proxy nao publica esta rota.
						.requestMatchers(HttpMethod.GET, "/.well-known/jwks.json")
						.permitAll()
						.requestMatchers("/swagger-ui.html", "/swagger-ui/**", "/v3/api-docs/**")
						.permitAll()
						// Probes de liveness/readiness do orquestrador, que nao se autentica.
						// Apenas /health e exposto (management.endpoints.web.exposure.include),
						// e sem detalhes (show-details=never), entao nao vaza configuracao.
						.requestMatchers("/actuator/health", "/actuator/health/**")
						.permitAll()
						// Cadastro de apoio das telas internas. CIMENTACAO saiu desta lista em
						// 2026-09-17: ela virou permissao de dominio e passou a ser combinavel com
						// CLIENTE (Simulador de Cimentacao), o que daria a um cliente a lista de
						// setores e da frota inteira — dado interno, e nao o que a role concede.
						.requestMatchers("/api/setores/**")
						.hasAnyRole("INTERNO", "ADMIN")
						// Unidades: qualquer interno consulta; criar, editar, inativar e excluir exigem
						// ADMIN ou INTERNO + UNIDADE (RN-118).
						.requestMatchers(HttpMethod.GET, "/api/unidades/**")
						.hasAnyRole("INTERNO", "ADMIN")
						.requestMatchers("/api/unidades/**")
						.access(RegrasDeAcesso.GESTAO_UNIDADES)
						// Regionais: leitura liberada aos perfis internos (as telas de setor e
						// unidade precisam listar regionais); escrita so ADMIN.
						.requestMatchers(HttpMethod.GET, "/api/regionais/**")
						.hasAnyRole("INTERNO", "ADMIN")
						.requestMatchers("/api/regionais/**")
						.hasRole("ADMIN")
						// Autoatendimento: precisa vir ANTES de /api/usuarios/** para nao herdar ADMIN.
						.requestMatchers(HttpMethod.PATCH, "/api/usuarios/me", "/api/usuarios/me/senha")
						.authenticated()
						// Configuracoes do sistema: ADMIN e SUPORTE (RN-086). Vem ANTES do
						// bloco de cadastros para nao herdar a restricao a ADMIN.
						.requestMatchers("/api/configuracoes/**")
						.access(RegrasDeAcesso.CONFIGURACAO)
						// Cadastros seguem exclusivos de ADMIN: SUPORTE configura o sistema,
						// nao administra usuario nem empresa.
						.requestMatchers("/api/empresas/**", "/api/usuarios/**", "/api/servicos-clientes/**")
						.access(RegrasDeAcesso.ADMINISTRACAO)
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

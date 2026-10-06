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

import com.geopetro.security.authorization.RegrasDeAcesso;

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
						// Acesso por COMBINACAO de roles, nao por lista — ver RegrasDeAcesso.
						// `hasAnyRole` nao serve aqui: MONITORAMENTO sozinha nao concede nada, ela
						// vale somada ao tipo de conta (CLIENTE ou INTERNO).
						//
						// A ordem abaixo vai do mais especifico ao mais geral dentro de
						// /api/sondas: a primeira regra que casa decide, e /api/sondas/** no fim
						// engoliria as anteriores se viesse antes.
						//
						// Cards: SUPORTE entra aqui e so aqui dentro de /api/sondas. Ele configura
						// o sistema, nao acompanha operacao — dar-lhe a rota inteira seria mais do
						// que "configurar". Quem pode LER e GRAVAR e decidido em
						// ConfiguracaoCardsAccess; aqui so se garante que o perfil chega ao recurso.
						.requestMatchers("/api/sondas/*/cards")
						.access(RegrasDeAcesso.CARDS_DA_UNIDADE)
						// Limites de alarme e historico de alarmes seguem o tempo real (RN-069):
						// acompanhar o ao vivo, ajustar o limite e ler o historico sao a mesma
						// autoridade. Conceder monitoramento sem MONITORAMENTO_REAL nao abre estes.
						.requestMatchers("/api/sondas/*/configuracao", "/api/sondas/*/alarmes", "/api/sondas/*/alarmes/**")
						.access(RegrasDeAcesso.MONITORAMENTO_REAL)
						// A lista de sondas serve as QUATRO telas da area, e por isso aceita
						// qualquer uma das duas permissoes. Exigir MONITORAMENTO aqui deixaria quem
						// recebeu apenas o tempo real com a tela aberta e a lista em 403.
						.requestMatchers("/api/sondas/minhas")
						.access(RegrasDeAcesso.AREA_SONDA)
						// Series historicas: a tela de Monitoramento. CLIENTE tambem acessa, mas o
						// SondaMonitoramentoService restringe o escopo dele as unidades concedidas
						// no cadastro; conta interna enxerga a frota inteira (RN-047).
						// O /api/sondas/** que fecha o bloco e a rede de seguranca: um endpoint
						// novo nasce exigindo monitoramento em vez de herdar `authenticated`.
						.requestMatchers("/api/sondas/*/monitoramentos/**", "/api/sondas/**")
						.access(RegrasDeAcesso.MONITORAMENTO)
						.requestMatchers("/api/simulador/**")
						.access(RegrasDeAcesso.SIMULADOR_CIMENTACAO)
						// Cadastro de apoio das telas internas. CIMENTACAO saiu desta lista em
						// 2026-09-17: ela virou permissao de dominio e passou a ser combinavel com
						// CLIENTE (Simulador de Cimentacao), o que daria a um cliente a lista de
						// setores e da frota inteira — dado interno, e nao o que a role concede.
						.requestMatchers("/api/setores/**", "/api/unidades-sondas/**")
						.hasAnyRole("INTERNO", "ADMIN")
						// Regionais: leitura liberada aos perfis internos (as telas de setor e
						// unidade/sonda precisam listar regionais); escrita so ADMIN.
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
						.requestMatchers("/api/empresas/**", "/api/usuarios/**")
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

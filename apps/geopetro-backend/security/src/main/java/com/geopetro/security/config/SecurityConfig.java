package com.geopetro.security.config;

import java.util.List;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.annotation.Order;
import org.springframework.http.HttpMethod;
import org.springframework.security.authorization.AuthorizationDecision;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

import com.geopetro.security.authorization.RegrasDeAcesso;
import com.geopetro.security.braservcore.TokensDoCore;

import jakarta.servlet.DispatcherType;
import jakarta.servlet.http.HttpServletResponse;

/**
 * Seguranca do Geopetro-Backend depois do Braserv-Core (spec braserv-core §6).
 *
 * <p>Este backend nao tem mais login, cadastro nem configuracao de e-mail: tudo isso e servido
 * pelo core. Aqui sobram o monitoramento, o tempo real e o simulador, protegidos por token de pessoa
 * emitido pelo core, e uma rota interna que so o core chama.
 */
@Configuration
public class SecurityConfig {

	/** Unico sistema que pode perguntar pelos vinculos de uma unidade (contrato §5). */
	static final String SERVICO_DO_CORE = "braserv-core";
	static final String ESCOPO_VINCULOS = "unidades:vinculos";

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
	 * {@code /internal/**}: so o Braserv-Core, com token de servico e o escopo de vinculos. O proxy
	 * nao publica esta rota; esta cadeia e a segunda barreira.
	 */
	@Bean
	@Order(1)
	SecurityFilterChain internoFilterChain(HttpSecurity http, TokensDoCore tokens) throws Exception {
		return http
				.securityMatcher("/internal/**")
				.csrf(AbstractHttpConfigurer::disable)
				.sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
				.authorizeHttpRequests(auth -> auth
						.requestMatchers(HttpMethod.GET, "/internal/v1/unidades/*/vinculos")
						.access((autenticacao, contexto) -> {
							var a = autenticacao.get();
							boolean doCore = a != null && a.isAuthenticated() && SERVICO_DO_CORE.equals(a.getName());
							boolean comEscopo = doCore && a.getAuthorities().stream()
									.anyMatch(g -> (ServicoDoCoreFilter.PREFIXO_AUTHORITY + ESCOPO_VINCULOS).equals(g.getAuthority()));
							return new AuthorizationDecision(comEscopo);
						})
						.anyRequest().denyAll())
				.exceptionHandling(ex -> ex
						.authenticationEntryPoint((request, response, e) ->
								response.sendError(HttpServletResponse.SC_UNAUTHORIZED, "Unauthorized"))
						.accessDeniedHandler((request, response, e) ->
								response.sendError(HttpServletResponse.SC_FORBIDDEN, "Forbidden")))
				.addFilterBefore(new ServicoDoCoreFilter(tokens), UsernamePasswordAuthenticationFilter.class)
				.build();
	}

	@Bean
	@Order(2)
	SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
		return http
				.cors(cors -> cors.configurationSource(corsConfigurationSource()))
				.csrf(AbstractHttpConfigurer::disable)
				.sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
				.authorizeHttpRequests(auth -> auth
						// O 403 de uma regra abaixo vira um despacho interno para /error, que nao carrega
						// o token. Sem liberar esse despacho, quem esta logado sem permissao receberia 401
						// ("faca login") em vez de 403, e o Front trata 401 como sessao vencida (DT-017).
						.dispatcherTypeMatchers(DispatcherType.ERROR).permitAll()
						.requestMatchers("/swagger-ui.html", "/swagger-ui/**", "/v3/api-docs/**")
						.permitAll()
						// Probes de liveness/readiness do orquestrador, que nao se autentica.
						.requestMatchers("/actuator/health", "/actuator/health/**")
						.permitAll()
						// Handshake do WebSocket. O navegador nao envia headers customizados no
						// handshake: a autenticacao acontece no CONNECT do STOMP e a autorizacao por
						// unidade no SUBSCRIBE — ver WebSocketAuthInterceptor.
						.requestMatchers("/ws", "/ws/**")
						.permitAll()
						// Acesso por COMBINACAO de roles, nao por lista — ver RegrasDeAcesso.
						// Do mais especifico ao mais geral: a primeira regra que casa decide, e
						// /api/monitoramento/** no fim engoliria as anteriores se viesse antes.
						//
						// Cards: SUPORTE entra aqui e so aqui. Quem pode LER e GRAVAR e decidido em
						// ConfiguracaoCardsAccess; aqui so se garante que o perfil chega ao recurso.
						.requestMatchers("/api/monitoramento/unidades/*/cards")
						.access(RegrasDeAcesso.CARDS_DA_UNIDADE)
						// Limites e historico de alarmes seguem o tempo real (RN-069).
						.requestMatchers("/api/monitoramento/unidades/*/configuracao",
								"/api/monitoramento/unidades/*/alarmes", "/api/monitoramento/unidades/*/alarmes/**")
						.access(RegrasDeAcesso.MONITORAMENTO_REAL)
						// A lista de unidades serve as QUATRO telas da area, e por isso aceita qualquer
						// uma das duas permissoes.
						.requestMatchers("/api/monitoramento/unidades/minhas")
						.access(RegrasDeAcesso.AREA_MONITORAMENTO)
						// Series historicas e a rede de seguranca: um endpoint novo da area nasce
						// exigindo monitoramento em vez de herdar `authenticated`.
						.requestMatchers("/api/monitoramento/**")
						.access(RegrasDeAcesso.MONITORAMENTO)
						.requestMatchers("/api/simulador/**")
						.access(RegrasDeAcesso.SIMULADOR_CIMENTACAO)
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

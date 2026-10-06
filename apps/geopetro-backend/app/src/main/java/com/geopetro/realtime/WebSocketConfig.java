package com.geopetro.realtime;

import java.util.List;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.messaging.simp.config.ChannelRegistration;
import org.springframework.messaging.simp.config.MessageBrokerRegistry;
import org.springframework.web.socket.config.annotation.EnableWebSocketMessageBroker;
import org.springframework.web.socket.config.annotation.StompEndpointRegistry;
import org.springframework.web.socket.config.annotation.WebSocketMessageBrokerConfigurer;

/**
 * Canal de tempo real: Geopetro-Desktop -> Backend -> Angular.
 *
 * <h2>Desenho</h2>
 * <pre>
 *   Geopetro-Desktop --SEND--> /app/realtime/estado --> RealtimeController
 *                                                          |
 *                                                          v
 *   Angular   &lt;--SUBSCRIBE-- /topic/realtime/unidades/{id}
 * </pre>
 *
 * <p><b>Broker em memoria, de proposito.</b> Estes dados sao efemeros — o "agora" de uma sonda, com
 * validade de um segundo. Nao ha necessidade de broker externo, persistencia ou garantia de entrega:
 * quem perde uma mensagem recebe a proxima em 1s. O historico tem outro caminho (MQTT -> InfluxDB).
 *
 * <p>⚠️ <b>Limite conhecido:</b> broker em memoria nao propaga entre instancias. Com mais de uma
 * replica do backend, um assinante conectado na instancia A nao recebe o que o Desktop publicou na
 * instancia B. Ver specs/SDD/software/apis/websocket-realtime.md.
 */
@Configuration
@EnableWebSocketMessageBroker
public class WebSocketConfig implements WebSocketMessageBrokerConfigurer {

	private final WebSocketInboundGuard authInterceptor;
	private final List<String> allowedOrigins;
    /** Documento de cards: confere o acesso a cada entrega, e nao so no SUBSCRIBE — ver a classe. */
    @org.springframework.beans.factory.annotation.Autowired
    private com.geopetro.cards.ConfiguracaoCardsOutbound cardsOutbound;
    /** Tempo real: revalida conta ativa e escopo a cada entrega, e nao so no SUBSCRIBE (RN-062). */
    @org.springframework.beans.factory.annotation.Autowired
    private RealtimeOutbound realtimeOutbound;

	public WebSocketConfig(WebSocketInboundGuard authInterceptor,
			@Value("${security.cors.allowed-origin-patterns:http://localhost:*}") List<String> allowedOrigins) {
		this.authInterceptor = authInterceptor;
		this.allowedOrigins = allowedOrigins;
	}

	@Override
	public void registerStompEndpoints(StompEndpointRegistry registry) {
		registry.setPreserveReceiveOrder(true);
        registry.addEndpoint("/ws")
				.setAllowedOriginPatterns(allowedOrigins.toArray(String[]::new));
	}

	@Override
	public void configureMessageBroker(MessageBrokerRegistry registry) {
		registry.setPreservePublishOrder(true);
        registry.enableSimpleBroker("/topic");
		registry.setApplicationDestinationPrefixes("/app");
	}

    /**
     * Guardas de saída: cada tópico revalida o acesso a <b>cada entrega</b>, e não só no SUBSCRIBE.
     *
     * <p>Uma tela aberta assina no login e fica horas conectada; sem isto, desativar a conta ou
     * revogar o acesso à Unidade cortaria o HTTP e deixaria a entrega de pé (RN-062).
     *
     * <p>⚠️ Eram três. A do documento de <b>limites</b> saiu em 2026-09-09 junto com o tópico que ela
     * protegia — ele ficou sem assinante quando o alarme da estação passou a ser configurado na
     * estação ({@code specs/SDD/negocio/requisitos/configuracao-da-estacao.md §3.3}).
     */
    @Override
    public void configureClientOutboundChannel(ChannelRegistration registration) {
        registration.interceptors(cardsOutbound, realtimeOutbound);
    }

	@Override
	public void configureClientInboundChannel(ChannelRegistration registration) {
		// Autentica no CONNECT e autoriza cada SUBSCRIBE/SEND. Sem isto, o WebSocket seria um
		// caminho paralelo ao SecurityConfig — que so protege HTTP.
		registration.interceptors(authInterceptor);
	}
}

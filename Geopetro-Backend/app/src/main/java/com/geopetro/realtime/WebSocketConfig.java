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
 *   Angular   &lt;--SUBSCRIBE-- /topic/realtime/unidades-sondas/{id}
 * </pre>
 *
 * <p><b>Broker em memoria, de proposito.</b> Estes dados sao efemeros — o "agora" de uma sonda, com
 * validade de um segundo. Nao ha necessidade de broker externo, persistencia ou garantia de entrega:
 * quem perde uma mensagem recebe a proxima em 1s. O historico tem outro caminho (MQTT -> InfluxDB).
 *
 * <p>⚠️ <b>Limite conhecido:</b> broker em memoria nao propaga entre instancias. Com mais de uma
 * replica do backend, um assinante conectado na instancia A nao recebe o que o Desktop publicou na
 * instancia B. Ver specs/contracts/websocket-realtime.md.
 */
@Configuration
@EnableWebSocketMessageBroker
public class WebSocketConfig implements WebSocketMessageBrokerConfigurer {

	private final WebSocketInboundGuard authInterceptor;
	private final List<String> allowedOrigins;
    @org.springframework.beans.factory.annotation.Autowired
    private com.geopetro.configuracaosonda.ConfiguracaoSondaOutbound configOutbound;
    /** Topico de cards tem sufixo proprio e nao casa com a guarda acima — ver a classe. */
    @org.springframework.beans.factory.annotation.Autowired
    private com.geopetro.cards.ConfiguracaoCardsOutbound cardsOutbound;

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

    @Override
    public void configureClientOutboundChannel(ChannelRegistration registration) {
        registration.interceptors(configOutbound, cardsOutbound);
    }

	@Override
	public void configureClientInboundChannel(ChannelRegistration registration) {
		// Autentica no CONNECT e autoriza cada SUBSCRIBE/SEND. Sem isto, o WebSocket seria um
		// caminho paralelo ao SecurityConfig — que so protege HTTP.
		registration.interceptors(authInterceptor);
	}
}

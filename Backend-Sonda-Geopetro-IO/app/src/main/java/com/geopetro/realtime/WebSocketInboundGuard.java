package com.geopetro.realtime;

import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.messaging.*;
import org.springframework.messaging.simp.SimpMessageHeaderAccessor;
import org.springframework.messaging.simp.stomp.*;
import org.springframework.messaging.support.*;
import org.springframework.stereotype.Component;

/** Preserves explicit STOMP rejection when inbound ordering queues the authorization call. */
@Component
public class WebSocketInboundGuard implements ChannelInterceptor {
    private final WebSocketAuthInterceptor authorization;
    private final ObjectProvider<MessageChannel> outbound;

    public WebSocketInboundGuard(WebSocketAuthInterceptor authorization,
            @Qualifier("clientOutboundChannel") ObjectProvider<MessageChannel> outbound) {
        this.authorization = authorization;
        this.outbound = outbound;
    }

    @Override public Message<?> preSend(Message<?> message, MessageChannel channel) {
        try {
            return authorization.preSend(message, channel);
        } catch (WebSocketNaoAutorizadoException denied) {
            // OrderedMessageChannelDecorator catches exceptions before the protocol handler sees
            // them. Send ERROR explicitly: the protocol handler then closes this session.
            var error = StompHeaderAccessor.create(StompCommand.ERROR);
            error.setSessionId(SimpMessageHeaderAccessor.getSessionId(message.getHeaders()));
            error.setMessage("Operacao STOMP nao autorizada.");
            outbound.getObject().send(MessageBuilder.createMessage(new byte[0], error.getMessageHeaders()));
            return null;
        }
    }
}

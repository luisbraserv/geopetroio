package com.geopetro.configuracaosonda;
import java.util.regex.Pattern;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.messaging.*;
import org.springframework.messaging.simp.SimpMessageHeaderAccessor;
import org.springframework.messaging.simp.user.SimpUserRegistry;
import org.springframework.messaging.support.ChannelInterceptor;
import org.springframework.stereotype.Component;

@Component
public class ConfiguracaoSondaOutbound implements ChannelInterceptor {
    private static final Pattern DESTINATION = Pattern.compile("^/(?:topic|app)/config/unidades-sondas/([1-9][0-9]{0,18})$");
    private final ObjectProvider<SimpUserRegistry> registry;
    private final ConfiguracaoSondaAccess access;
    public ConfiguracaoSondaOutbound(ObjectProvider<SimpUserRegistry> registry, ConfiguracaoSondaAccess access) {
        this.registry = registry; this.access = access;
    }
    @Override public Message<?> preSend(Message<?> message, MessageChannel channel) {
        String destination = SimpMessageHeaderAccessor.getDestination(message.getHeaders());
        if (destination == null) return message;
        var match = DESTINATION.matcher(destination);
        if (!match.matches()) return message;
        try {
            String session = SimpMessageHeaderAccessor.getSessionId(message.getHeaders());
            var users = registry.getObject();
            var owner = users.getUsers().stream().filter(u -> u.getSession(session) != null).findFirst();
            return owner.isPresent() && access.permite(owner.get().getName(), Long.parseLong(match.group(1))) ? message : null;
        } catch (RuntimeException e) { return null; }
    }
}

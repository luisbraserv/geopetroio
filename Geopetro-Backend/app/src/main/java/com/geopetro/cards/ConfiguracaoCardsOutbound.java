package com.geopetro.cards;

import java.util.regex.Pattern;

import org.springframework.beans.factory.ObjectProvider;
import org.springframework.messaging.*;
import org.springframework.messaging.simp.SimpMessageHeaderAccessor;
import org.springframework.messaging.simp.user.SimpUserRegistry;
import org.springframework.messaging.support.ChannelInterceptor;
import org.springframework.stereotype.Component;

/**
 * Guarda o topico de cards na saida.
 *
 * <p><b>Por que existe uma segunda guarda.</b> A de configuracao casa
 * {@code /config/unidades-sondas/{id}} terminando no id — o topico de cards tem sufixo e passaria
 * sem verificacao nenhuma. Cada topico e guardado ao lado da regra de acesso que lhe corresponde.
 *
 * <p>Confere a cada entrega, e nao so no SUBSCRIBE: uma sessao que ja assinava continua sendo
 * verificada depois de a conta ser desativada ou o acesso revogado.
 */
@Component
public class ConfiguracaoCardsOutbound implements ChannelInterceptor {

    private static final Pattern DESTINO =
        Pattern.compile("^/(?:topic|app)/config/unidades-sondas/([1-9][0-9]{0,18})/cards$");

    private final ObjectProvider<SimpUserRegistry> registry;
    private final ConfiguracaoCardsAccess access;

    public ConfiguracaoCardsOutbound(ObjectProvider<SimpUserRegistry> registry, ConfiguracaoCardsAccess access) {
        this.registry = registry; this.access = access;
    }

    @Override public Message<?> preSend(Message<?> message, MessageChannel channel) {
        String destino = SimpMessageHeaderAccessor.getDestination(message.getHeaders());
        if (destino == null) return message;
        var match = DESTINO.matcher(destino);
        if (!match.matches()) return message;
        try {
            String sessao = SimpMessageHeaderAccessor.getSessionId(message.getHeaders());
            var dono = registry.getObject().getUsers().stream()
                .filter(u -> u.getSession(sessao) != null).findFirst();
            return dono.isPresent() && access.podeLer(dono.get().getName(), Long.parseLong(match.group(1)))
                ? message : null;
        } catch (RuntimeException e) {
            // Na duvida, nao entrega: e configuracao de uma unidade especifica.
            return null;
        }
    }
}

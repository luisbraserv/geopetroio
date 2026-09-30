package com.geopetro.alarmes;

import java.lang.reflect.Proxy;
import java.util.*;
import java.util.function.BiFunction;
import org.springframework.messaging.Message;
import org.springframework.messaging.simp.stomp.*;
import org.springframework.messaging.support.MessageBuilder;
import com.geopetro.monitoramento.SondaMonitoramentoService;
import com.geopetro.realtime.WebSocketAuthInterceptor;
import com.geopetro.security.application.port.out.TokenPort;
import com.geopetro.usuario.adapter.out.persistence.entity.UsuarioInternoEntity;
import com.geopetro.usuario.adapter.out.persistence.repository.UsuarioJpaRepository;
import com.geopetro.usuario.domain.model.*;
import com.geopetro.unidadesonda.repository.UnidadeSondaJpaRepository;

/** Uses fictional users and repositories. Never contacts the running application. */
public class WebSocketAuditProbe {
    static <T> T stub(Class<T> type, BiFunction<String, Object[], Object> call) {
        return type.cast(Proxy.newProxyInstance(type.getClassLoader(), new Class<?>[]{type},
            (p, m, args) -> call.apply(m.getName(), args)));
    }
    static Message<byte[]> frame(StompHeaderAccessor accessor) {
        accessor.setLeaveMutable(true);
        return MessageBuilder.createMessage(new byte[0], accessor.getMessageHeaders());
    }
    public static void main(String[] args) {
        var user = new UsuarioInternoEntity();
        user.setUsername("fictional-audit-user");
        user.setRole(Role.SONDA);
        user.setStatus(StatusUsuario.INATIVO);
        var users = stub(UsuarioJpaRepository.class, (method, values) -> Optional.of(user));
        var units = stub(UnidadeSondaJpaRepository.class, (method, values) -> true);
        var monitor = new SondaMonitoramentoService(units, users, null);
        var tokens = stub(TokenPort.class, (method, values) -> switch (method) {
            case "tokenValido" -> true;
            case "extrairUsername" -> user.getUsername();
            default -> Set.of("SONDA");
        });
        var auth = new WebSocketAuthInterceptor(tokens, monitor);
        var connect = StompHeaderAccessor.create(StompCommand.CONNECT);
        connect.setNativeHeader("Authorization", "Bearer fictional-still-valid-token");
        boolean connected = auth.preSend(frame(connect), null) != null;
        var subscribe = StompHeaderAccessor.create(StompCommand.SUBSCRIBE);
        subscribe.setUser(connect.getUser());
        subscribe.setDestination("/topic/realtime/unidades-sondas/1");
        boolean subscribed = auth.preSend(frame(subscribe), null) != null;
        boolean publishAccess = monitor.usuarioPossuiAcessoAUnidade(user.getUsername(), 1L);
        if (!connected || !subscribed || !publishAccess) throw new AssertionError("Not reproduced");
        System.out.println("REPRODUCED | inactive account with valid JWT | CONNECT=" + connected
            + "; SUBSCRIBE=" + subscribed + "; controller unit authorization=" + publishAccess);
    }
}

package com.geopetro.configuracaosonda;

import com.geopetro.cards.ConfiguracaoCards;
import com.geopetro.cards.ConfiguracaoCardsAccess;
import com.geopetro.cards.ConfiguracaoCardsService;
import com.geopetro.monitoramento.SondaMonitoramentoService;
import com.geopetro.security.application.port.out.TokenPort;
import java.net.URI;
import java.net.http.*;
import java.util.List;
import java.util.concurrent.*;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

/** Real TCP/WebSocket transport, controller, broker, registry and outbound authorization. */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
    "spring.datasource.url=jdbc:h2:mem:configuration-websocket;DB_CLOSE_DELAY=-1",
    "spring.datasource.driver-class-name=org.h2.Driver", "spring.datasource.username=sa", "spring.datasource.password=",
    "spring.jpa.database-platform=org.hibernate.dialect.H2Dialect",
    "spring.jpa.properties.hibernate.dialect=org.hibernate.dialect.H2Dialect",
    "spring.jpa.hibernate.ddl-auto=create-drop", "spring.sql.init.mode=never", "spring.flyway.enabled=false"
})
class ConfiguracaoSondaWebSocketTest {
    @Value("${local.server.port}") int port;
    @MockitoBean TokenPort tokens;
    @MockitoBean SondaMonitoramentoService monitoramento;
    @MockitoBean ConfiguracaoSondaAccess access;
    @MockitoBean ConfiguracaoCardsAccess cardsAccess;
    @Autowired ConfiguracaoSondaService service;
    @Autowired ConfiguracaoSondaRepository repository;
    @Autowired ConfiguracaoCardsService cardsService;
    @Autowired SimpMessagingTemplate messages;
    @BeforeEach void setup() {
        repository.deleteAll();
        when(tokens.tokenValido("test-token")).thenReturn(true);
        when(tokens.extrairUsername("test-token")).thenReturn("ana");
        when(monitoramento.usuarioPossuiAcessoAUnidade("ana", 7L)).thenReturn(true);
        when(access.permite("ana", 7)).thenReturn(true);
        declararCardDePressao();
    }
    /**
     * O limite so existe para uma grandeza que a unidade declara — RN-089. Sem o card, o
     * {@code service.salvar} abaixo seria recusado antes de chegar ao transporte, que e o que este
     * teste examina.
     */
    private void declararCardDePressao() {
        if (!cardsService.ler("ana", 7).cards().isEmpty()) return;
        var conexao = new ConfiguracaoCards.Conexao("10.0.0.5", 0, 1, 1, 1000);
        var parametros = new ConfiguracaoCards.Parametros(250.0, null, null, null, null,
            null, null, null, null, null, null, null);
        var card = new ConfiguracaoCards.Card(null, "Pressao da bomba", ConfiguracaoCards.Tipo.PRESSAO,
            10, true, true, 0, parametros);
        cardsService.salvar("ana", 7, new ConfiguracaoCards.Alteracao(0, conexao, List.of(card)));
    }
    @Test void initialSnapshotLiveUpdateAndReconnectUseThePersistedRevision() throws Exception {
        try (var first = open()) {
            first.subscribe("updates", "/topic/config/unidades-sondas/7");
            first.snapshot();
            String initial = first.next();
            assertTrue(initial.contains("destination:/app/config/unidades-sondas/7"), initial);
            assertTrue(initial.contains("\"revisao\":0"), initial);
            var limit = new ConfiguracaoSonda.Limite("PRESSAO_01", null, null, 100.0, null, 120.0, 3, 5, true);
            service.salvar("ana", 7, new ConfiguracaoSonda.Alteracao(0, List.of(limit)));
            String update = first.next();
            assertTrue(update.contains("subscription:updates"), update);
            assertTrue(update.contains("\"revisao\":1"), update);
            assertTrue(update.contains("\"dispositivoId\":\"PRESSAO_01\""), update);
            assertTrue(update.contains("\"maximoCritico\":120.0"), update);
            first.snapshot();
            assertTrue(first.next().contains("\"revisao\":1"));
        }
        try (var reconnected = open()) {
            reconnected.subscribe("snapshot", "/app/config/unidades-sondas/7");
            assertTrue(reconnected.next().contains("\"revisao\":1"));
        }
    }
    @Test void revocationStopsDeliveryToAnAlreadySubscribedSession() throws Exception {
        try (var socket = open()) {
            socket.subscribe("updates", "/topic/config/unidades-sondas/7");
            socket.subscribe("snapshot", "/app/config/unidades-sondas/7");
            socket.next(); // ordered snapshot proves the topic subscription was processed
            when(access.permite("ana", 7)).thenReturn(false);
            messages.convertAndSend("/topic/config/unidades-sondas/7", service.ler("ana", 7));
            verify(access, timeout(3000).atLeast(2)).permite("ana", 7);
            assertNull(socket.frames.poll(300, TimeUnit.MILLISECONDS));
            when(access.permite("ana", 7)).thenReturn(true);
            messages.convertAndSend("/topic/config/unidades-sondas/7", service.ler("ana", 7));
            assertTrue(socket.next().contains("subscription:updates"));
        }
    }
    @Test void anotherUnitCannotBeSubscribedAndClientsCannotPublishConfiguration() throws Exception {
        try (var socket = open()) {
            socket.subscribe("forbidden", "/topic/config/unidades-sondas/8");
            verify(monitoramento, timeout(3000)).usuarioPossuiAcessoAUnidade("ana", 8L);
            assertTrue(socket.next().startsWith("ERROR"));
        }
        try (var socket = open()) {
            socket.subscribe("updates", "/topic/config/unidades-sondas/7");
            socket.send("SEND\ndestination:/topic/config/unidades-sondas/7\n\n{}");
            assertTrue(socket.next().startsWith("ERROR"));
            assertEquals(0, repository.count());
        }
    }
    private Socket open() throws Exception {
        var socket = connect("test-token");
        assertTrue(socket.next().startsWith("CONNECTED")); return socket;
    }
    @Test void invalidTokenReceivesAnExplicitError() throws Exception {
        try (var socket = connect("invalid-token")) {
            assertTrue(socket.next().startsWith("ERROR"));
        }
    }
    private Socket connect(String token) throws Exception {
        var socket = new Socket();
        socket.ws = HttpClient.newHttpClient().newWebSocketBuilder()
            .buildAsync(URI.create("ws://localhost:" + port + "/ws"), socket).get(5, TimeUnit.SECONDS);
        socket.send("CONNECT\naccept-version:1.2\nAuthorization:Bearer " + token + "\n\n");
        return socket;
    }
    private static class Socket implements WebSocket.Listener, AutoCloseable {
        WebSocket ws;
        final BlockingQueue<String> frames = new LinkedBlockingQueue<>();
        final StringBuilder buffer = new StringBuilder();
        public void onOpen(WebSocket socket) { socket.request(1); }
        public CompletionStage<?> onText(WebSocket socket, CharSequence text, boolean last) {
            buffer.append(text); int end;
            while ((end = buffer.indexOf("\0")) >= 0) {
                frames.add(buffer.substring(0, end).stripLeading()); buffer.delete(0, end + 1);
            }
            socket.request(1); return null;
        }
        void send(String frame) throws Exception { ws.sendText(frame + '\0', true).get(5, TimeUnit.SECONDS); }
        void subscribe(String id, String destination) throws Exception { send("SUBSCRIBE\nid:" + id + "\ndestination:" + destination + "\nack:auto\n\n"); }
        void snapshot() throws Exception {
            send("UNSUBSCRIBE\nid:snapshot\n\n");
            subscribe("snapshot", "/app/config/unidades-sondas/7");
        }
        String next() throws Exception { var frame = frames.poll(5, TimeUnit.SECONDS); assertNotNull(frame, "Expected STOMP frame"); return frame; }
        public void close() { ws.abort(); }
    }
}

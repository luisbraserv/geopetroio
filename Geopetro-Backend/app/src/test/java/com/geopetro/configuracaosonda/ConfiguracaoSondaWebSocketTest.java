package com.geopetro.configuracaosonda;

import com.geopetro.cards.ConfiguracaoCards;
import com.geopetro.cards.ConfiguracaoCardsAccess;
import com.geopetro.cards.ConfiguracaoCardsService;
import com.geopetro.monitoramento.SondaMonitoramentoService;
import com.geopetro.security.application.ContaAtivaVerificador;
import com.geopetro.security.application.port.out.TokenPort;
import com.geopetro.security.authorization.PermissoesDoUsuario;
import com.geopetro.security.authorization.RegrasDeAcesso;
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

/**
 * Transporte WebSocket real, controller, broker, registro de sessoes e autorizacao de saida.
 *
 * <p>⚠️ <b>Este teste mudou de documento em 2026-09-09.</b> Ele cobria o canal dos <b>limites</b> de
 * alarme, que saiu junto com a assinatura do Desktop
 * ({@code specs/SDD/negocio/requisitos/configuracao-da-estacao.md §3.3}). O que era especifico daquele documento
 * morreu com ele; o que vale para o <b>transporte</b> e para a <b>guarda de saida</b> foi apontado
 * para o documento de cards, que e o unico que o canal ainda carrega.
 *
 * <p>Sem esse cuidado, apagar o arquivo levaria junto a unica cobertura fim-a-fim de
 * {@code ConfiguracaoCardsOutbound} — e o corte de acesso da RN-062 ficaria sem teste.
 */
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
    /** O CONNECT confere a conta (RN-062); sem este duble, "ana" nao existe no banco de teste. */
    @MockitoBean ContaAtivaVerificador contas;
    /** O SUBSCRIBE confere a permissao de modulo; "ana" tambem nao tem roles no banco de teste. */
    @MockitoBean PermissoesDoUsuario permissoes;
    @Autowired ConfiguracaoSondaRepository repository;
    @Autowired ConfiguracaoCardsService cardsService;
    @Autowired SimpMessagingTemplate messages;

    @BeforeEach void setup() {
        repository.deleteAll();
        when(tokens.tokenValido("test-token")).thenReturn(true);
        when(tokens.extrairUsername("test-token")).thenReturn("ana");
        when(monitoramento.usuarioPossuiAcessoAUnidade("ana", 7L)).thenReturn(true);
        when(access.permite("ana", 7)).thenReturn(true);
        when(contas.ativa("ana")).thenReturn(true);
        when(cardsAccess.podeLer("ana", 7)).thenReturn(true);
        when(permissoes.satisfaz("ana", RegrasDeAcesso.AREA_SONDA)).thenReturn(true);
        when(cardsAccess.podeGravar("ana", 7)).thenReturn(true);
        declararCardDePressao();
    }

    private void declararCardDePressao() {
        if (!cardsService.ler("ana", 7).cards().isEmpty()) return;
        var conexao = new ConfiguracaoCards.Conexao("10.0.0.5", 0, 1, 1, 1000);
        var parametros = new ConfiguracaoCards.Parametros(250.0, null, null, null, null,
            null, null, null, null, null, null, null);
        var card = new ConfiguracaoCards.Card(null, "Pressao da bomba", ConfiguracaoCards.Tipo.PRESSAO,
            10, true, true, 0, parametros);
        cardsService.salvar("ana", 7, new ConfiguracaoCards.Alteracao(0, conexao, List.of(card)));
    }

    @Test void initialSnapshotAndLiveUpdateUseThePersistedRevision() throws Exception {
        try (var socket = open()) {
            socket.subscribe("updates", "/topic/config/unidades-sondas/7/cards");
            socket.snapshot();
            String inicial = socket.next();
            assertTrue(inicial.contains("destination:/app/config/unidades-sondas/7/cards"), inicial);
            assertTrue(inicial.contains("\"dispositivoId\":\"PRESSAO_01\""), inicial);

            var conexao = new ConfiguracaoCards.Conexao("10.0.0.9", 0, 1, 1, 1000);
            var atual = cardsService.ler("ana", 7);
            cardsService.salvar("ana", 7, new ConfiguracaoCards.Alteracao(atual.revisao(), conexao,
                List.of(new ConfiguracaoCards.Card(atual.cards().get(0).dispositivoId(), "Pressao da linha",
                    ConfiguracaoCards.Tipo.PRESSAO, 10, true, true, 0, atual.cards().get(0).parametros()))));

            String update = socket.next();
            assertTrue(update.contains("subscription:updates"), update);
            assertTrue(update.contains("\"nome\":\"Pressao da linha\""), update);
        }
    }

    /**
     * ⚠️ O corte de acesso vale a cada ENTREGA, e nao so no SUBSCRIBE — RN-062.
     *
     * <p>Uma tela aberta assina no login e fica horas conectada; verificar uma vez faria o corte
     * valer para quem chegasse depois, e nao para quem ja estava — que e o caso que a desativacao
     * existe para tratar.
     */
    @Test void revocationStopsDeliveryToAnAlreadySubscribedSession() throws Exception {
        try (var socket = open()) {
            socket.subscribe("updates", "/topic/config/unidades-sondas/7/cards");
            socket.snapshot();
            socket.next(); // o snapshot ordenado prova que a assinatura do topico foi processada

            when(cardsAccess.podeLer("ana", 7)).thenReturn(false);
            messages.convertAndSend("/topic/config/unidades-sondas/7/cards", cardsService.ler("ana", 7));
            verify(cardsAccess, timeout(3000).atLeast(2)).podeLer("ana", 7);
            assertNull(socket.frames.poll(300, TimeUnit.MILLISECONDS), "revogado nao recebe mais");

            when(cardsAccess.podeLer("ana", 7)).thenReturn(true);
            messages.convertAndSend("/topic/config/unidades-sondas/7/cards", cardsService.ler("ana", 7));
            assertTrue(socket.next().contains("subscription:updates"), "restaurado volta a receber");
        }
    }

    @Test void anotherUnitCannotBeSubscribedAndClientsCannotPublishConfiguration() throws Exception {
        try (var socket = open()) {
            socket.subscribe("forbidden", "/topic/config/unidades-sondas/8/cards");
            verify(access, timeout(3000)).permite("ana", 8);
            assertTrue(socket.next().startsWith("ERROR"));
        }
        try (var socket = open()) {
            socket.subscribe("updates", "/topic/config/unidades-sondas/7/cards");
            socket.send("SEND\ndestination:/topic/config/unidades-sondas/7/cards\n\n{}");
            assertTrue(socket.next().startsWith("ERROR"));
        }
    }

    /**
     * ⚠️ O destino sem {@code /cards} deixou de existir, e precisa ser <b>recusado</b>.
     *
     * <p>Era o tópico dos limites de alarme. Aceitá-lo ainda deixaria um destino autorizado que
     * ninguem publica nem consome — e um destino aceito sem dono e exatamente como nasce um canal
     * paralelo sem controle.
     */
    @Test void oDestinoAntigoDeLimitesERecusado() throws Exception {
        try (var socket = open()) {
            socket.subscribe("limites", "/topic/config/unidades-sondas/7");
            assertTrue(socket.next().startsWith("ERROR"), "o destino sem /cards nao existe mais");
        }
    }

    @Test void deactivatedAccountCannotConnectEvenWithAValidToken() throws Exception {
        when(contas.ativa("ana")).thenReturn(false);
        try (var socket = connect("test-token")) {
            assertTrue(socket.next().startsWith("ERROR"));
        }
    }

    @Test void invalidTokenReceivesAnExplicitError() throws Exception {
        try (var socket = connect("invalid-token")) {
            assertTrue(socket.next().startsWith("ERROR"));
        }
    }

    private Socket open() throws Exception {
        var socket = connect("test-token");
        assertTrue(socket.next().startsWith("CONNECTED")); return socket;
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
        /** ⚠️ O {@code \n\n} separa cabecalhos do corpo. Sem ele o broker recusa o frame inteiro. */
        void subscribe(String id, String destino) throws Exception {
            send("SUBSCRIBE\nid:" + id + "\ndestination:" + destino + "\nack:auto\n\n");
        }
        void snapshot() throws Exception {
            send("UNSUBSCRIBE\nid:snapshot\n\n");
            subscribe("snapshot", "/app/config/unidades-sondas/7/cards");
        }
        String next() throws Exception {
            String frame = frames.poll(5, TimeUnit.SECONDS);
            assertNotNull(frame, "nenhum frame recebido");
            return frame;
        }
        public void close() { if (ws != null) ws.abort(); }
    }
}

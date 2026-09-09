package com.example.demo.services;

import com.example.demo.models.CardsDaUnidade;
import com.example.demo.models.ConfiguracaoSondaRemota;
import com.example.demo.models.AppSettings;
import java.net.http.WebSocket;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.springframework.context.annotation.AnnotationConfigApplicationContext;
import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class ConfiguracaoRemotaTest {
    private ConfiguracaoSondaRemota snapshot(long unit, long revision) {
        return new ConfiguracaoSondaRemota(1, unit, revision, List.of(), "ana", "2026-09-07T12:00:00Z");
    }
    /** Store em pasta temporaria: sem isso o teste escreveria no diretorio do projeto. */
    private ConfiguracaoRemotaState estadoIsolado() throws Exception {
        return new ConfiguracaoRemotaState(
            new ConfiguracaoRemotaStore(java.nio.file.Files.createTempDirectory("cfg").resolve("c.json")));
    }

    @Test void rejectsOldRevisionsWrongUnitsAndCallbacksFromAnOldConnection() throws Exception {
        var state = estadoIsolado();
        long first = state.conectar("backend\nana", 7L);
        assertTrue(state.aceitar(first, snapshot(7, 2)));
        assertFalse(state.aceitar(first, snapshot(7, 1)));
        assertFalse(state.aceitar(first, snapshot(8, 3)));
        long second = state.conectar("backend\nana", 7L);
        assertEquals(2, state.atual().orElseThrow().revisao());
        assertFalse(state.aceitar(first, snapshot(7, 3)));
        assertTrue(state.aceitar(second, snapshot(7, 3)));
        assertTrue(state.atual("backend\noutra-conta", 7L).isEmpty());
        state.conectar("backend\noutra-conta", 7L);
        assertTrue(state.atual().isEmpty());
        state.conectar("backend\nana", 8L);
        assertTrue(state.atual().isEmpty());
    }
    @Test void parserHandlesFragmentedAndGroupedFramesButRejectsInvalidSnapshots() throws Exception {
        var received = new ArrayList<ConfiguracaoSondaRemota>();
        var client = new StompRealtimeClient("ws://localhost/ws", "unused", 7L, received::add, cards -> {});
        var listener = listener(client);
        var ws = mock(WebSocket.class);
        listener.onText(ws, "\nCONNE", false);
        listener.onText(ws, "CTED\nversion:1.2\n\n\0" + frame(7, 1), true);
        assertTrue(client.isConectado()); assertEquals(1, received.size());
        String valid = frame(7, 2);
        listener.onText(ws, valid.substring(0, 20), true);
        listener.onText(ws, valid.substring(20), true);
        assertEquals(2, received.size());
        listener.onText(ws, frame(8, 3), true);
        listener.onText(ws, frame(7, 3).replace("\"schemaVersion\":1", "\"schemaVersion\":99"), true);
        listener.onText(ws, frame(7, 3).replace("config-snapshot", "unknown"), true);
        assertEquals(2, received.size());
        listener.onClose(ws, 1000, "closed"); assertFalse(client.isConectado());
    }
    private static final String LIMITE_TEMPERATURA =
        "{\"dispositivoId\":\"TEMPERATURA_01\",\"serie\":null,\"minimoAtencao\":null,\"maximoAtencao\":80.0,"
        + "\"minimoCritico\":null,\"maximoCritico\":95.0,\"segundosParaAbrir\":0,\"segundosParaFechar\":0,\"ativo\":true}";
    private static final String LIMITE_VAZAO =
        "{\"dispositivoId\":\"CONTADOR_STROKE_01\",\"serie\":\"vazao\",\"minimoAtencao\":null,\"maximoAtencao\":8.0,"
        + "\"minimoCritico\":null,\"maximoCritico\":10.0,\"segundosParaAbrir\":2,\"segundosParaFechar\":4,\"ativo\":true}";
    private static final String LIMITE_VOLUME =
        "{\"dispositivoId\":\"CONTADOR_STROKE_01\",\"serie\":\"volumeAcumulado\",\"minimoAtencao\":null,"
        + "\"maximoAtencao\":500.0,\"minimoCritico\":null,\"maximoCritico\":null,\"segundosParaAbrir\":0,"
        + "\"segundosParaFechar\":0,\"ativo\":true}";

    private String frameComLimites(long revision, String... limites) {
        String json = "{\"schemaVersion\":1,\"unidadeSondaId\":7,\"revisao\":" + revision
            + ",\"limites\":[" + String.join(",", limites)
            + "],\"atualizadoPor\":\"ana\",\"atualizadoEm\":\"2026-09-07T12:00:00Z\"}";
        return "MESSAGE\nsubscription:config-snapshot\ndestination:/app/config/unidades-sondas/7\n\n" + json + '\0';
    }

    /**
     * ⚠️ O parser nao conhece mais o vocabulario de dispositivos.
     *
     * <p>Ate 2026-09-08 a lista fixa dos cinco ids vivia tambem aqui, e um limite de
     * {@code TEMPERATURA_01} fazia o construtor recusar o snapshot <b>inteiro</b>: a estacao seguia
     * com a configuracao anterior, em silencio. Os dois documentos chegam por canais independentes,
     * com revisoes proprias, e o de limites pode chegar antes do de cards — um id desconhecido
     * significa "card que ainda nao chegou", nao "documento corrompido".
     *
     * <p>As duas series do mesmo contador provam a outra metade: sem {@code serie} na chave elas
     * colidiriam e uma sumiria.
     */
    @Test void limiteForaDaListaFixaAntigaChegaAEstacaoESeriesNaoColidem() throws Exception {
        var recebidos = new ArrayList<ConfiguracaoSondaRemota>();
        var client = new StompRealtimeClient("ws://localhost/ws", "unused", 7L, recebidos::add, cards -> {});
        var listener = listener(client);
        var ws = mock(WebSocket.class);
        listener.onText(ws, CONECTADO, true);

        listener.onText(ws, frameComLimites(1, LIMITE_TEMPERATURA, LIMITE_VAZAO, LIMITE_VOLUME), true);
        assertEquals(1, recebidos.size(), "a lista fixa antiga descartaria o snapshot inteiro");
        assertEquals(3, recebidos.get(0).limites().size(), "as duas series do contador sao limites distintos");

        // A forma continua conferida: a mesma serie do mesmo contador duas vezes e documento invalido.
        listener.onText(ws, frameComLimites(2, LIMITE_VAZAO, LIMITE_VAZAO), true);
        assertEquals(1, recebidos.size(), "grandeza repetida continua invalidando o snapshot");
    }

    @Test void oversizedFrameClosesTheSocket() throws Exception {
        var client = new StompRealtimeClient("ws://localhost/ws", "unused");
        var ws = mock(WebSocket.class);
        listener(client).onText(ws, "x".repeat(65537), false);
        verify(ws).abort(); assertFalse(client.isConectado());
    }
    @Test void settingsEventStartsSynchronizationWithoutAnyPlcSample() {
        var settings = mock(SettingsService.class);
        var realtime = mock(TelemetriaRealtimeService.class);
        var values = new AppSettings(); when(settings.loadSettings()).thenReturn(values);
        try (var context = new AnnotationConfigApplicationContext()) {
            context.registerBean(SettingsService.class, () -> settings);
            context.registerBean(TelemetriaRealtimeService.class, () -> realtime);
            context.register(CanalConfiguracaoLifecycle.class); context.refresh();
            context.publishEvent(new SettingsService.Alteradas());
            verify(realtime).atualizarConfiguracao(values);
        }
    }
    private WebSocket.Listener listener(StompRealtimeClient client) throws Exception {
        var type = Class.forName(StompRealtimeClient.class.getName() + "$Listener");
        var constructor = type.getDeclaredConstructor(StompRealtimeClient.class); constructor.setAccessible(true);
        return (WebSocket.Listener) constructor.newInstance(client);
    }
    private String frame(long unit, long revision) throws Exception {
        String json = new com.fasterxml.jackson.databind.ObjectMapper().writeValueAsString(snapshot(unit, revision));
        return "MESSAGE\nsubscription:config-snapshot\ndestination:/app/config/unidades-sondas/7\n\n" + json + '\0';
    }

    // ==================================================================== cards

    private static final String CONECTADO = "CONNECTED\nversion:1.2\n\n\0";

    private String frameCards(long unit, long revision) throws Exception {
        var documento = new CardsDaUnidade(1, unit, revision, null, List.of(), "ana", null);
        String json = new com.fasterxml.jackson.databind.ObjectMapper().writeValueAsString(documento);
        return "MESSAGE\nsubscription:cards-snapshot\ndestination:/app/config/unidades-sondas/7/cards\n\n"
            + json + '\0';
    }

    /**
     * Os dois documentos chegam pelo mesmo canal e sao separados pelo destino.
     *
     * <p>O destino dos limites e PREFIXO do de cards. Um despacho que conferisse so o inicio
     * mandaria o documento de cards para o parser de limites, que o recusaria — e a unidade ficaria
     * sem saber o que ler, sem nada explicando por que.
     */
    @Test void cardsELimitesChegamPeloMesmoCanalSemSeMisturar() throws Exception {
        var limites = new ArrayList<ConfiguracaoSondaRemota>();
        var cards = new ArrayList<CardsDaUnidade>();
        var client = new StompRealtimeClient("ws://localhost/ws", "unused", 7L, limites::add, cards::add);
        var listener = listener(client);
        var ws = mock(WebSocket.class);
        listener.onText(ws, CONECTADO, true);

        listener.onText(ws, frame(7, 1), true);
        listener.onText(ws, frameCards(7, 3), true);

        assertEquals(1, limites.size(), "o snapshot de limites nao virou card");
        assertEquals(1, cards.size(), "o documento de cards nao virou limite");
        assertEquals(3, cards.get(0).revisao());
    }

    @Test void cardsDeOutraUnidadeSaoIgnorados() throws Exception {
        var cards = new ArrayList<CardsDaUnidade>();
        var client = new StompRealtimeClient("ws://localhost/ws", "unused", 7L, s -> {}, cards::add);
        var listener = listener(client);
        var ws = mock(WebSocket.class);
        listener.onText(ws, CONECTADO, true);

        listener.onText(ws, frameCards(8, 3), true);

        assertTrue(cards.isEmpty(), "configuracao de outra unidade nao entra como se fosse desta");
    }

    /**
     * ⚠️ Este teste existe por causa de um defeito real: o despacho dos cards foi escrito e
     * testado, mas os frames de SUBSCRIBE nao chegaram a ser enviados. A suite passava — os outros
     * testes alimentam o listener direto, pulando o {@code conectar()} — e o sintoma so apareceu ao
     * rodar o app: "a unidade nao le nada", longe da causa.
     *
     * <p>Confere os QUATRO destinos: os dois documentos, cada um com atualizacao continua
     * ({@code /topic}) e snapshot inicial ({@code /app}).
     */
    @Test void assinaOsQuatroDestinosDaConfiguracao() throws Exception {
        var enviados = new ArrayList<String>();
        var client = new StompRealtimeClient("ws://localhost/ws", "unused", 144L, s -> {}, c -> {});
        var ws = mock(WebSocket.class);
        when(ws.sendText(any(), anyBoolean())).thenAnswer(chamada -> {
            enviados.add(chamada.getArgument(0).toString());
            return java.util.concurrent.CompletableFuture.completedFuture(ws);
        });
        var campo = StompRealtimeClient.class.getDeclaredField("webSocket");
        campo.setAccessible(true);
        campo.set(client, ws);

        client.solicitarConfiguracao();

        assertThat(enviados).anyMatch(f -> f.contains("id:config-snapshot")
                && f.contains("destination:/app/config/unidades-sondas/144\n"));
        assertThat(enviados).anyMatch(f -> f.contains("id:cards-snapshot")
                && f.contains("destination:/app/config/unidades-sondas/144/cards\n"));
    }

    /**
     * Unidade nunca configurada devolve revisao 0 e lista vazia (RN-092). A conexao nao pode travar
     * esperando um documento de cards que talvez nunca venha.
     */
    @Test void unidadeSemCardsNaoTravaAConexao() throws Exception {
        var client = new StompRealtimeClient("ws://localhost/ws", "unused", 7L, s -> {}, c -> {});
        var listener = listener(client);
        var ws = mock(WebSocket.class);

        listener.onText(ws, CONECTADO + frame(7, 1), true);

        assertTrue(client.isConectado(), "so o snapshot de limites e esperado para dar a conexao por boa");
    }
}

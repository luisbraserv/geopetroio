package com.example.demo.services;

import com.example.demo.models.ConfiguracaoSondaRemota;
import com.example.demo.models.AppSettings;
import java.net.http.WebSocket;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.springframework.context.annotation.AnnotationConfigApplicationContext;
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
        var client = new StompRealtimeClient("ws://localhost/ws", "unused", 7L, received::add);
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
}

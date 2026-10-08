package com.geopetro.desktop.telemetria;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.net.http.WebSocket;
import java.util.ArrayList;
import java.util.List;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.context.annotation.AnnotationConfigApplicationContext;

import com.geopetro.desktop.configuracoes.AppSettings;
import com.geopetro.desktop.models.CardsDaUnidade;
import com.geopetro.desktop.services.CardsState;
import com.geopetro.desktop.services.CardsStore;
import com.geopetro.desktop.configuracoes.SettingsService;

/**
 * O canal de configuracao do Desktop, agora com <b>um</b> documento: os cards.
 *
 * <p>⚠️ <b>Herdeiro de {@code ConfiguracaoRemotaTest}</b>, que cobria os dois documentos e saiu com o
 * de limites em 2026-09-09 ({@code specs/SDD/negocio/requisitos/configuracao-da-estacao.md §3.3}). O que era
 * especifico dos limites morreu com a feature; o que vale para o transporte, para as guardas de
 * cache e para os cards foi trazido para ca — apagar tudo junto teria levado cobertura viva.
 */
class CanalDeCardsTest {

    private static final String CONECTADO = "CONNECTED\nversion:1.2\n\n\0";

    private CardsDaUnidade documento(long unidade, long revisao) {
        return new CardsDaUnidade(1, unidade, revisao, null, List.of(), "ana", null);
    }

    /** Store em pasta temporaria: sem isso o teste escreveria no diretorio do projeto. */
    private CardsState estadoIsolado() throws Exception {
        return new CardsState(
                new CardsStore(java.nio.file.Files.createTempDirectory("cards").resolve("c.json")));
    }

    private String frameCards(long unidade, long revisao) throws Exception {
        String json = new com.fasterxml.jackson.databind.ObjectMapper()
                .writeValueAsString(documento(unidade, revisao));
        return "MESSAGE\nsubscription:cards-snapshot\ndestination:/app/config/unidades/7/cards\n\n"
                + json + '\0';
    }

    /** Frame no destino dos LIMITES — que ninguem mais assina, e que nao pode virar card. */
    private String frameNoDestinoAntigoDeLimites() {
        return "MESSAGE\nsubscription:config-snapshot\ndestination:/app/config/unidades/7\n\n"
                + "{\"schemaVersion\":1,\"unidadeId\":7,\"revisao\":9,\"limites\":[]}" + '\0';
    }

    private WebSocket.Listener listener(StompRealtimeClient client) throws Exception {
        var type = Class.forName(StompRealtimeClient.class.getName() + "$Listener");
        var constructor = type.getDeclaredConstructor(StompRealtimeClient.class);
        constructor.setAccessible(true);
        return (WebSocket.Listener) constructor.newInstance(client);
    }

    // --- guardas do cache -------------------------------------------------------

    /**
     * Revisao velha, unidade errada e retorno de uma conexao antiga nao substituem o que vale.
     *
     * <p>A mecanica e de {@code EstadoDeDocumento}, compartilhada — mas quem a exercita agora e o
     * unico documento que sobrou.
     */
    @Test
    void recusaRevisaoVelhaUnidadeErradaERetornoDeConexaoAntiga() throws Exception {
        var estado = estadoIsolado();
        long primeira = estado.conectar("backend\nana", 7L);
        assertTrue(estado.aceitar(primeira, documento(7, 2)));
        assertFalse(estado.aceitar(primeira, documento(7, 1)), "revisao menor nao substitui");
        assertFalse(estado.aceitar(primeira, documento(8, 3)), "documento de outra unidade nao entra");

        long segunda = estado.conectar("backend\nana", 7L);
        assertEquals(2, estado.atual().orElseThrow().revisao());
        assertFalse(estado.aceitar(primeira, documento(7, 3)), "callback de conexao antiga e ignorado");
        assertTrue(estado.aceitar(segunda, documento(7, 3)));

        assertTrue(estado.atual("backend\noutra-conta", 7L).isEmpty(), "cache e isolado por conta");
        estado.conectar("backend\nana", 8L);
        assertTrue(estado.atual().isEmpty(), "trocar de unidade nao herda o documento da anterior");
    }

    // --- transporte -------------------------------------------------------------

    @Test
    @DisplayName("o parser aceita frames fragmentados e agrupados")
    void parserAceitaFramesFragmentadosEAgrupados() throws Exception {
        var recebidos = new ArrayList<CardsDaUnidade>();
        var client = new StompRealtimeClient("ws://localhost/ws", "unused", 7L, recebidos::add);
        var listener = listener(client);
        var ws = mock(WebSocket.class);

        // Fragmentado: o CONNECTED chega partido ao meio, com o primeiro documento colado.
        listener.onText(ws, "\nCONNE", false);
        listener.onText(ws, "CTED\nversion:1.2\n\n\0" + frameCards(7, 1), true);
        assertTrue(client.isConectado());
        assertEquals(1, recebidos.size());

        // Um frame partido em dois pedacos continua sendo um frame.
        String inteiro = frameCards(7, 2);
        listener.onText(ws, inteiro.substring(0, 20), true);
        listener.onText(ws, inteiro.substring(20), true);
        assertEquals(2, recebidos.size());
        assertEquals(2, recebidos.get(1).revisao());
    }

    @Test
    void frameGiganteFechaOSocket() throws Exception {
        var client = new StompRealtimeClient("ws://localhost/ws", "unused");
        var ws = mock(WebSocket.class);

        listener(client).onText(ws, "x".repeat(65537), false);

        verify(ws).abort();
        assertFalse(client.isConectado());
    }

    @Test
    void cardsDeOutraUnidadeSaoIgnorados() throws Exception {
        var cards = new ArrayList<CardsDaUnidade>();
        var client = new StompRealtimeClient("ws://localhost/ws", "unused", 7L, cards::add);
        var listener = listener(client);
        var ws = mock(WebSocket.class);
        listener.onText(ws, CONECTADO, true);

        listener.onText(ws, frameCards(8, 3), true);

        assertTrue(cards.isEmpty(), "configuracao de outra unidade nao entra como se fosse desta");
    }

    /**
     * ⚠️ O destino dos limites e <b>prefixo</b> do de cards.
     *
     * <p>O canal de limites nao e mais assinado, mas o despacho continua conferindo o destino por
     * igualdade exata: uma comparacao frouxa ("comeca com") voltaria a morder se algum dia houver um
     * segundo documento sob o mesmo prefixo — e o sintoma seria a unidade nao ler nada, longe da
     * causa.
     */
    @Test
    @DisplayName("frame no destino antigo de limites nao vira documento de cards")
    void frameNoDestinoDeLimitesNaoViraCards() throws Exception {
        var cards = new ArrayList<CardsDaUnidade>();
        var client = new StompRealtimeClient("ws://localhost/ws", "unused", 7L, cards::add);
        var listener = listener(client);
        var ws = mock(WebSocket.class);
        listener.onText(ws, CONECTADO, true);

        listener.onText(ws, frameNoDestinoAntigoDeLimites(), true);

        assertTrue(cards.isEmpty(), "o destino sem /cards nao e documento de cards");
    }

    /**
     * ⚠️ Este teste existe por causa de um defeito real: o despacho dos cards foi escrito e testado,
     * mas os frames de SUBSCRIBE nao chegaram a ser enviados. A suite passava — os outros testes
     * alimentam o listener direto, pulando o {@code conectar()} — e o sintoma so apareceu ao rodar o
     * app: "a unidade nao le nada", longe da causa.
     */
    @Test
    void assinaODestinoDoSnapshotDeCards() throws Exception {
        var enviados = new ArrayList<String>();
        var client = new StompRealtimeClient("ws://localhost/ws", "unused", 144L, c -> {});
        var ws = mock(WebSocket.class);
        when(ws.sendText(any(), anyBoolean())).thenAnswer(chamada -> {
            enviados.add(chamada.getArgument(0).toString());
            return java.util.concurrent.CompletableFuture.completedFuture(ws);
        });
        var campo = StompRealtimeClient.class.getDeclaredField("webSocket");
        campo.setAccessible(true);
        campo.set(client, ws);

        client.solicitarConfiguracao();

        assertThat(enviados).anyMatch(f -> f.contains("id:cards-snapshot")
                && f.contains("destination:/app/config/unidades/144/cards\n"));
        assertThat(enviados).noneMatch(f -> f.contains("id:config-snapshot"))
                .as("o canal de limites nao e mais assinado");
    }

    /**
     * ⚠️ A conexao passou a esperar o snapshot de <b>cards</b>, e nao mais o de limites.
     *
     * <p>Este e o teste que protege essa troca. Unidade nunca configurada devolve revisao 0 com a
     * lista vazia (RN-092) — o snapshot <b>chega</b>, so vem sem card nenhum, e a conexao segue. Se
     * o backend um dia deixar de responder a esse caso, a conexao inteira trava ate o timeout e a
     * estacao para de publicar.
     */
    @Test
    @DisplayName("unidade sem card nenhum nao trava a conexao")
    void unidadeSemCardsNaoTravaAConexao() throws Exception {
        var recebidos = new ArrayList<CardsDaUnidade>();
        var client = new StompRealtimeClient("ws://localhost/ws", "unused", 7L, recebidos::add);
        var listener = listener(client);
        var ws = mock(WebSocket.class);

        listener.onText(ws, CONECTADO + frameCards(7, 0), true);

        assertTrue(client.isConectado());
        assertEquals(1, recebidos.size(), "revisao 0 com lista vazia e um snapshot valido");
        assertEquals(0, recebidos.get(0).revisao());
    }

    // --- ciclo de vida ----------------------------------------------------------

    @Test
    void oEventoDeConfiguracaoIniciaASincronizacaoSemNenhumaLeituraDoClp() {
        var settings = mock(SettingsService.class);
        var realtime = mock(TelemetriaRealtimeService.class);
        var valores = new AppSettings();
        when(settings.loadSettings()).thenReturn(valores);

        try (var context = new AnnotationConfigApplicationContext()) {
            context.registerBean(SettingsService.class, () -> settings);
            context.registerBean(TelemetriaRealtimeService.class, () -> realtime);
            context.register(CanalConfiguracaoLifecycle.class);
            context.refresh();

            context.publishEvent(new SettingsService.Alteradas());

            verify(realtime).atualizarConfiguracao(valores);
        }
    }
}

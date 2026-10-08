package com.geopetro.desktop.services;

import static org.junit.jupiter.api.Assertions.*;
import java.nio.file.Path;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import com.geopetro.desktop.models.AppSettings;
import com.geopetro.desktop.models.CardsDaUnidade;
import com.geopetro.desktop.telemetria.TelemetriaRealtimeService;

class CardsOfflineTest {
    @TempDir Path pasta;

    @Test void carregaCacheAntesDeQualquerLoginEIsolaTrocaDeUnidade() {
        var store = new CardsStore(pasta.resolve("cards.json"));
        var doc = new CardsDaUnidade(1, 7, 4, CardsDaUnidade.Conexao.padrao(), List.of(), null, null);
        store.gravar("http://127.0.0.1:1\noperador", 7L, doc);
        var realtime = new TelemetriaRealtimeService(new CardsState(store));
        var settings = new AppSettings();
        settings.setBackendUrl("http://127.0.0.1:1");
        settings.setBackendUsuario("operador"); settings.setBackendSenha("test-only");
        settings.setUnidadeId(7L);
        try {
            realtime.atualizarConfiguracao(settings);
            assertEquals(doc, realtime.cardsAtuais(settings).orElseThrow(), "cache independe de login bem-sucedido");
            settings.setUnidadeId(8L);
            realtime.atualizarConfiguracao(settings);
            assertTrue(realtime.cardsAtuais(settings).isEmpty());
        } finally { realtime.encerrar(); }
    }

    /**
     * ⚠️ <b>Desligar o tempo real não pode apagar os cards.</b>
     *
     * <p>{@code configuracao-da-estacao.md §6} promete que, com o WebSocket desmarcado, continuam
     * de pé "a leitura do CLP, a tela, o histórico local e o alarme local". A tela e o alarme local
     * dependem dos cards — o alarme da estação só alcança grandeza de card invisível porque ela
     * aparece no dashboard (RN-111).
     *
     * <p><b>A armadilha:</b> o caminho óbvio seria dobrar o interruptor dentro de
     * {@code temConfiguracaoTempoReal()}. Aí {@code alvo()} passaria a devolver {@code null},
     * {@code atualizarConfiguracao} chamaria {@code cards.conectar(null, null)}, e
     * {@link EstadoDeDocumento#conectar} <b>zera o snapshot em memória</b> quando backend ou unidade
     * mudam. O dashboard ficaria vazio e o alarme local mudo, junto com a telemetria — e nenhum
     * teste de telemetria acusaria.
     */
    @Test void desligarTempoRealNaoApagaOsCards() {
        var store = new CardsStore(pasta.resolve("cards.json"));
        var doc = new CardsDaUnidade(1, 7, 4, CardsDaUnidade.Conexao.padrao(), List.of(), null, null);
        store.gravar("http://127.0.0.1:1\noperador", 7L, doc);
        var realtime = new TelemetriaRealtimeService(new CardsState(store));
        var settings = new AppSettings();
        settings.setBackendUrl("http://127.0.0.1:1");
        settings.setBackendUsuario("operador"); settings.setBackendSenha("test-only");
        settings.setUnidadeId(7L);
        settings.setTempoRealAtivo(false);
        try {
            realtime.atualizarConfiguracao(settings);
            assertEquals(doc, realtime.cardsAtuais(settings).orElseThrow(),
                    "os cards sumiram junto com a telemetria: a tela e o alarme local ficariam sem nada");
        } finally { realtime.encerrar(); }
    }
}

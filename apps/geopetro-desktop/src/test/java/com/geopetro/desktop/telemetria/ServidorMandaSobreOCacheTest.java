package com.geopetro.desktop.telemetria;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Method;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import com.geopetro.desktop.configuracoes.AppSettings;
import com.geopetro.desktop.cards.CardsDaUnidade;
import com.geopetro.desktop.sessao.UnidadeSondaOpcao;
import com.geopetro.desktop.cards.CardsState;
import com.geopetro.desktop.cards.CardsStore;
import com.geopetro.desktop.sessao.UnidadeSondaCatalogoService;

/**
 * O cache em disco segura a estação sem rede (RN-088), mas não pode vencer o servidor.
 *
 * <p>O caso que motivou: o banco foi recriado e a unidade 1 ficou sem cards (revisão 0), enquanto o
 * Desktop guardava a revisão 8 de 22/09. Com a regra antiga de "só revisão maior" desde o disco, a
 * resposta do servidor era recusada para sempre e a estação mostrava e lia os cards de outra
 * configuração.
 */
class ServidorMandaSobreOCacheTest {

    private static final String CHAVE = "http://127.0.0.1:1\noperador";

    @TempDir Path pasta;

    private static CardsDaUnidade documento(long unidade, long revisao, String... nomes) {
        List<CardsDaUnidade.Card> cards = java.util.Arrays.stream(nomes)
                .map(nome -> new CardsDaUnidade.Card("d-" + nome, nome, CardsDaUnidade.Tipo.PRESSAO, 0,
                        true, true, 0, CardsDaUnidade.Parametros.vazio()))
                .toList();
        return new CardsDaUnidade(1, unidade, revisao, null, cards, "ana", null);
    }

    private CardsStore store() {
        return new CardsStore(pasta.resolve("cards.json"));
    }

    @Test
    @DisplayName("a primeira resposta do servidor substitui o cache, mesmo com revisao menor")
    void primeiraRespostaSubstituiCacheDeRevisaoMaior() {
        var store = store();
        store.gravar(CHAVE, 1L, documento(1, 8, "Novo card", "Contador de Stroke"));
        var estado = new CardsState(store);

        long conexao = estado.conectar(CHAVE, 1L);
        assertEquals(8, estado.atual().orElseThrow().revisao(), "sem rede, vale o disco");

        assertTrue(estado.aceitar(conexao, CardsDaUnidade.vazio(1)), "o servidor respondeu: unidade sem cards");
        assertTrue(estado.atual().orElseThrow().cards().isEmpty());
        assertEquals(0, store.carregar(CHAVE, 1L).orElseThrow().revisao(), "o disco passa a guardar o do servidor");
    }

    @Test
    @DisplayName("revisao igual com outro conteudo tambem substitui: o id pode apontar para outra configuracao")
    void revisaoIgualDoServidorSubstitui() {
        var store = store();
        store.gravar(CHAVE, 1L, documento(1, 3, "Antigo"));
        var estado = new CardsState(store);
        long conexao = estado.conectar(CHAVE, 1L);

        assertTrue(estado.aceitar(conexao, documento(1, 3, "Novo")));
        assertEquals("Novo", estado.atual().orElseThrow().cards().get(0).nome());
    }

    @Test
    @DisplayName("depois da primeira resposta, a guarda de revisao volta a valer na mesma conexao")
    void guardaDeRevisaoValeDepoisDaPrimeiraResposta() {
        var estado = new CardsState(store());
        long conexao = estado.conectar(CHAVE, 1L);
        assertTrue(estado.aceitar(conexao, documento(1, 5)));
        assertFalse(estado.aceitar(conexao, documento(1, 4)), "snapshot fora de ordem nao regride");
        assertFalse(estado.aceitar(conexao, documento(1, 5)), "repeticao da mesma revisao nao regrava");
        assertTrue(estado.aceitar(conexao, documento(1, 6)));
    }

    @Test
    @DisplayName("trocar para uma unidade vazia atualiza, mesmo que ela tenha cache antigo")
    void trocarParaUnidadeVaziaAtualiza() {
        var store = store();
        store.gravar(CHAVE, 2L, documento(2, 5, "De outra epoca"));
        var estado = new CardsState(store);

        long naUm = estado.conectar(CHAVE, 1L);
        assertTrue(estado.aceitar(naUm, documento(1, 4, "Peso")));

        long naDois = estado.conectar(CHAVE, 2L);
        assertTrue(estado.atual().isEmpty() || estado.atual().orElseThrow().unidadeId() == 2,
                "nada da unidade 1 atravessa a troca");
        assertTrue(estado.aceitar(naDois, CardsDaUnidade.vazio(2)));
        assertTrue(estado.atual(CHAVE, 2L).orElseThrow().cards().isEmpty(), "a unidade 2 esta vazia, e a tela tambem");
    }

    @Test
    @DisplayName("descartar apaga memoria e disco, mas so da unidade pedida")
    void descartarSoDaUnidadeAtual() {
        var store = store();
        store.gravar(CHAVE, 1L, documento(1, 8, "Velho"));
        var estado = new CardsState(store);
        estado.conectar(CHAVE, 1L);

        estado.descartar(CHAVE, 2L);
        assertTrue(estado.atual().isPresent(), "outra unidade nao apaga esta");

        estado.descartar(CHAVE, 1L);
        assertTrue(estado.atual().isEmpty());
        assertFalse(Files.exists(pasta.resolve("cards.json")));
        estado.conectar(CHAVE, 1L);
        assertTrue(estado.atual().isEmpty(), "reconectar nao ressuscita o cache apagado");
    }

    // --- verificacao das unidades disponiveis ----------------------------------

    /** Catalogo controlado pelo teste: a lista que o servidor responderia, ou falha de rede. */
    private static UnidadeSondaCatalogoService catalogo(List<UnidadeSondaOpcao> resposta, boolean semRede) {
        return new UnidadeSondaCatalogoService() {
            @Override
            public List<UnidadeSondaOpcao> listarComToken(String backendUrl, String token) {
                if (semRede) {
                    throw new CatalogoIndisponivelException("Não foi possível falar com o Backend");
                }
                return resposta;
            }
        };
    }

    private static AppSettings settings(long unidade) {
        var settings = new AppSettings();
        settings.setBackendUrl("http://127.0.0.1:1");
        settings.setBackendUsuario("operador");
        settings.setBackendSenha("test-only");
        settings.setUnidadeId(unidade);
        settings.setTempoRealAtivo(false); // sem worker tentando rede de verdade
        return settings;
    }

    /** Chama a verificacao como o conectar() chama, sem precisar de backend nem de WebSocket. */
    private static void verificar(TelemetriaRealtimeService realtime, AppSettings settings) throws Throwable {
        Method alvo = TelemetriaRealtimeService.class.getDeclaredMethod("alvo", AppSettings.class);
        alvo.setAccessible(true);
        Object destino = alvo.invoke(realtime, settings);
        Method verificar = TelemetriaRealtimeService.class.getDeclaredMethod("verificarDisponibilidade",
                destino.getClass(), String.class);
        verificar.setAccessible(true);
        try {
            verificar.invoke(realtime, destino, "token");
        } catch (InvocationTargetException e) {
            throw e.getCause();
        }
    }

    @Test
    @DisplayName("unidade disponivel: segue, e o cache fica ate o servidor mandar o documento")
    void unidadeDisponivelSegue() throws Throwable {
        var store = store();
        store.gravar(CHAVE, 1L, documento(1, 8, "Velho"));
        var realtime = new TelemetriaRealtimeService(new CardsState(store),
				catalogo(List.of(new UnidadeSondaOpcao(1L, "UC-01", null, "SONDA")), false));
        var settings = settings(1);
        try {
            realtime.atualizarConfiguracao(settings);
            verificar(realtime, settings);
            assertFalse(realtime.unidadeIndisponivel(settings));
            assertTrue(realtime.cardsAtuais(settings).isPresent());
        } finally {
            realtime.encerrar();
        }
    }

    @Test
    @DisplayName("unidade fora da lista do servidor: os cards dela saem da tela e do disco")
    void unidadeIndisponivelDescartaOsCards() throws Throwable {
        var store = store();
        store.gravar(CHAVE, 1L, documento(1, 8, "De outra unidade"));
        var realtime = new TelemetriaRealtimeService(new CardsState(store),
				catalogo(List.of(new UnidadeSondaOpcao(2L, "UC-02", null, "SONDA")), false));
        var settings = settings(1);
        try {
            realtime.atualizarConfiguracao(settings);
            assertTrue(realtime.cardsAtuais(settings).isPresent(), "antes de verificar, vale o disco");

            assertThrows(IllegalStateException.class, () -> verificar(realtime, settings));
            assertTrue(realtime.unidadeIndisponivel(settings));
            assertTrue(realtime.cardsAtuais(settings).isEmpty());
            assertTrue(store.carregar(CHAVE, 1L).isEmpty());

            // Escolher outra unidade limpa o aviso na hora, antes de qualquer resposta.
            var outra = settings(2);
            realtime.atualizarConfiguracao(outra);
            assertFalse(realtime.unidadeIndisponivel(outra));
        } finally {
            realtime.encerrar();
        }
    }

    @Test
    @DisplayName("sem rede, nada e descartado: o cache segura a estacao (RN-088)")
    void semRedeMantemOCache() throws Throwable {
        var store = store();
        var doc = documento(1, 8, "Peso");
        store.gravar(CHAVE, 1L, doc);
        var realtime = new TelemetriaRealtimeService(new CardsState(store), catalogo(List.of(), true));
        var settings = settings(1);
        try {
            realtime.atualizarConfiguracao(settings);
            assertThrows(UnidadeSondaCatalogoService.CatalogoIndisponivelException.class,
                    () -> verificar(realtime, settings));
            assertFalse(realtime.unidadeIndisponivel(settings));
            assertEquals(doc, realtime.cardsAtuais(settings).orElseThrow());
            assertTrue(store.carregar(CHAVE, 1L).isPresent());
        } finally {
            realtime.encerrar();
        }
    }
}

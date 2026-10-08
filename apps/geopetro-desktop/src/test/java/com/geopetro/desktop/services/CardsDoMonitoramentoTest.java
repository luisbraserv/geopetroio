package com.geopetro.desktop.services;

import static org.junit.jupiter.api.Assertions.*;
import java.util.List;
import org.junit.jupiter.api.Test;
import com.geopetro.desktop.aquisicao.LeituraDeCards.Grandeza;
import com.geopetro.desktop.aquisicao.LeituraDeCards;
import com.geopetro.desktop.aquisicao.SondaService;
import com.geopetro.desktop.cards.CardsDaUnidade.*;
import com.geopetro.desktop.cards.CardsDaUnidade;

class CardsDoMonitoramentoTest {
    private Card card(String id, Tipo tipo, boolean ativo, boolean visivel, int ordem) {
        return new Card(id, id, tipo, 10, ativo, visivel, ordem, Parametros.vazio());
    }
    private CardsDaUnidade documento(long unidade, long revisao, Card... cards) {
        return new CardsDaUnidade(1, unidade, revisao, Conexao.padrao(), List.of(cards), null, null);
    }
    private Grandeza medida() {
        return new Grandeza("PRESSAO_01", "Nome anterior", Tipo.PRESSAO, null, "DBW10", true,
                123.0, "psi", 400, null);
    }

    @Test void configuracaoMostraQuatroIndicadoresAntesDeConectarAoClp() {
        var doc = documento(1, 3, card("PRESSAO_01", Tipo.PRESSAO, true, true, 0),
                card("CONTADOR_STROKE_01", Tipo.CONTADOR_STROKE, true, true, 1));
        var painel = CardsDoMonitoramento.montar(doc, List.of(), false);
        assertEquals(4, painel.size());
        assertEquals(List.of("", "stroke", "vazao", "volumeAcumulado"), painel.stream().map(Grandeza::serie).toList());
        assertTrue(painel.stream().noneMatch(Grandeza::temValor));
        assertTrue(painel.stream().allMatch(g -> Double.isNaN(g.bruto())));
        assertTrue(painel.stream().allMatch(g -> g.semValorPorque().equals("CLP desconectado")));
        assertTrue(LeituraDeCards.paraPublicar(painel).isEmpty(), "placeholder não é telemetria");
    }

    @Test void ativoInvisivelContinuaNaEstacaoEInativoSaiMesmoComLeituraAntiga() {
        var doc = documento(1, 1, card("PRESSAO_01", Tipo.PRESSAO, false, true, 0),
                card("TEMPERATURA_01", Tipo.TEMPERATURA, true, false, 2),
                card("PESO_01", Tipo.PESO, true, true, 1));
        var painel = CardsDoMonitoramento.montar(doc, List.of(medida()), true);
        assertEquals(List.of("PESO_01", "TEMPERATURA_01"), painel.stream().map(Grandeza::dispositivoId).toList());
    }

    @Test void primeiraLeituraPreencheOValorMasRotuloVemDoDocumento() {
        var doc = documento(1, 1, card("PRESSAO_01", Tipo.PRESSAO, true, true, 0));
        assertEquals("Aguardando a primeira leitura", CardsDoMonitoramento.montar(doc, List.of(), true).getFirst().semValorPorque());
        var preenchido = CardsDoMonitoramento.montar(doc, List.of(medida()), true).getFirst();
        assertEquals(123.0, preenchido.valor());
        assertEquals("PRESSAO_01", preenchido.nome());
        assertFalse(CardsDoMonitoramento.montar(doc, List.of(medida()), false).getFirst().temValor());
    }

    @Test void leituraDeOutraUnidadeOuRevisaoNaoVazaParaONovoDocumento() {
        var c = card("PRESSAO_01", Tipo.PRESSAO, true, true, 0);
        var sonda = new SondaService();
        var doc = documento(1, 1, c);
        sonda.atualizarGrandezas(doc, List.of(medida()));
        assertEquals(1, sonda.grandezas(doc).size());
        assertTrue(sonda.grandezas(documento(2, 1, c)).isEmpty());
        assertTrue(sonda.grandezas(documento(1, 2, c)).isEmpty());
        sonda.limparGrandezas();
        assertTrue(sonda.grandezas(doc).isEmpty());
    }

    @Test void semDocumentoOuSemCardsNaoInventaSensores() {
        assertTrue(CardsDoMonitoramento.montar(null, List.of(medida()), true).isEmpty());
        assertTrue(CardsDoMonitoramento.montar(CardsDaUnidade.vazio(1), List.of(medida()), true).isEmpty());
    }
}

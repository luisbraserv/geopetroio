package com.geopetro.desktop.services;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.nio.file.Path;
import java.util.List;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import com.geopetro.desktop.models.CardsDaUnidade;
import com.geopetro.desktop.models.CardsDaUnidade.Card;
import com.geopetro.desktop.models.CardsDaUnidade.Parametros;
import com.geopetro.desktop.models.CardsDaUnidade.Tipo;
import com.geopetro.desktop.services.CalibracaoDeCards.Calibracao;

class CalibracaoCardServiceTest {

	@TempDir Path pasta;

	@Test
	void rangeECalibracaoPertencemAoDispositivoClicado() {
		Card peso = card("PESO_01", Tipo.PESO, 100);
		Card torque = card("TORQUE_01", Tipo.TORQUE, 200);
		CardsDaUnidade base = new CardsDaUnidade(1, 7, 3, null, List.of(peso, torque), null, null);
		ConfiguracaoCardsClient cliente = mock(ConfiguracaoCardsClient.class);
		when(cliente.salvarCards(eq(7L), eq(base), anyList())).thenAnswer(chamada ->
				new CardsDaUnidade(1, 7, 4, null, chamada.getArgument(2), null, null));
		CalibracaoDeCards calibracoes = new CalibracaoDeCards(pasta.resolve("calibracao.json"));
		CalibracaoCardService servico = new CalibracaoCardService(cliente, calibracoes);

		CardsDaUnidade salvo = servico.salvar(base, peso, 150.5,
				Calibracao.padrao().comSensibilidade(1.12));

		assertEquals(150.5, salvo.cards().get(0).parametros().rangeSensorBar());
		assertEquals(200.0, salvo.cards().get(1).parametros().rangeSensorBar());
		assertEquals(1.12, calibracoes.para("PESO_01").sensibilidade());
		assertEquals(1.0, calibracoes.para("TORQUE_01").sensibilidade());
		verify(cliente).salvarCards(eq(7L), eq(base), anyList());
	}

	private static Card card(String id, Tipo tipo, double range) {
		return new Card(id, id, tipo, 4, true, true, 0,
				new Parametros(range, null, null, null, null, null, null, null, null, null, null, null));
	}
}

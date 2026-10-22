package com.geopetro.desktop.cards;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.geopetro.desktop.cards.CardsDaUnidade.Parametros;

/**
 * RN-120 — os parâmetros da vazão por cardã atravessam o JSON do servidor e o cache em disco.
 *
 * <p>{@code Parametros} ganhou um segundo construtor, com a assinatura de antes do cardã. O risco
 * é o Jackson escolher esse construtor e descartar calado os dois campos novos: a tela salvaria a
 * constante e o servidor receberia nada.
 */
class ParametrosJsonTest {

	private static final ObjectMapper JSON = new ObjectMapper();

	@Test
	@DisplayName("os campos do cardã vão e voltam pelo JSON")
	void idaEVolta() throws Exception {
		var original = new Parametros(null, null, null, null, null, null, null, null, null, null, null, null,
				0.00012345, 4);

		assertEquals(original, JSON.readValue(JSON.writeValueAsString(original), Parametros.class));
	}

	@Test
	@DisplayName("documento antigo, sem os campos do cardã, continua legível e não os inventa")
	void documentoAntigo() throws Exception {
		var antigo = JSON.readValue("{\"constanteBomba\":0.125}", Parametros.class);

		assertEquals(0.125, antigo.constanteBomba());
		assertNull(antigo.constanteCarda());
		assertNull(antigo.pulsosPorVolta());
		// NON_NULL: card de stroke continua sem os campos do cardã no JSON que vai ao servidor.
		assertFalse(JSON.writeValueAsString(antigo).contains("constanteCarda"));
	}
}

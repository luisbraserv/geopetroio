package com.geopetro.cards;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;

import org.junit.jupiter.api.Test;

import com.geopetro.cards.ConfiguracaoCards.Card;
import com.geopetro.cards.ConfiguracaoCards.Tipo;
import com.geopetro.cards.GrandezasDeCard.Grandeza;

/** RN-090, RN-098: quantas grandezas cada card produz, e como se identificam. */
class GrandezasDeCardTest {

	static Card card(String id, Tipo tipo, boolean ativo) {
		return new Card(id, id, tipo, 10, ativo, true, 0, null);
	}

	@Test
	void umContadorDeStrokeRendeTresGrandezasSobOMesmoDispositivoId() {
		assertThat(GrandezasDeCard.de(card("CONTADOR_STROKE_01", Tipo.CONTADOR_STROKE, true)))
				.containsExactly(
						new Grandeza("CONTADOR_STROKE_01", "stroke"),
						new Grandeza("CONTADOR_STROKE_01", "vazao"),
						new Grandeza("CONTADOR_STROKE_01", "volumeAcumulado"));
	}

	@Test
	void osDemaisTiposRendemUmaGrandezaSemSerie() {
		for (Tipo tipo : List.of(Tipo.PESO, Tipo.TORQUE, Tipo.PRESSAO, Tipo.TEMPERATURA, Tipo.NIVEL_TANQUE)) {
			assertThat(GrandezasDeCard.de(card(tipo.name() + "_01", tipo, true)))
					.singleElement()
					.satisfies(g -> assertThat(g.serie()).isNull());
		}
	}

	/**
	 * A chave e o que distingue as tres series na mesma colecao. Chavear so pelo
	 * {@code dispositivoId} faria vazao sobrescrever stroke.
	 */
	@Test
	void aChaveIncluiASerieQuandoElaExiste() {
		assertThat(new Grandeza("PRESSAO_01", null).chave()).isEqualTo("PRESSAO_01");
		assertThat(new Grandeza("CONTADOR_STROKE_01", "vazao").chave()).isEqualTo("CONTADOR_STROKE_01|vazao");
		assertThat(Grandeza.chave("PRESSAO_01", "   ")).isEqualTo("PRESSAO_01");
	}

	/**
	 * ⚠️ As duas listas existem porque respondem perguntas diferentes.
	 *
	 * <p>O vocabulario de limites e o <b>declarado</b>: card desativado mantem o limite hibernando
	 * (RN-091). O que a avaliacao percorre e o <b>ativo</b>: card desativado nao produz leitura.
	 */
	@Test
	void declaradasIncluiCardDesativadoEAtivasNao() {
		var cards = List.of(
				card("PRESSAO_01", Tipo.PRESSAO, true),
				card("TEMPERATURA_01", Tipo.TEMPERATURA, false));

		assertThat(GrandezasDeCard.declaradas(cards)).extracting(Grandeza::dispositivoId)
				.containsExactly("PRESSAO_01", "TEMPERATURA_01");
		assertThat(GrandezasDeCard.ativas(cards)).extracting(Grandeza::dispositivoId)
				.containsExactly("PRESSAO_01");
	}

	/** Unidade sem cards nao declara grandeza nenhuma — estado normal, RN-088. */
	@Test
	void unidadeSemCardsNaoDeclaraNada() {
		assertThat(GrandezasDeCard.declaradas(List.of())).isEmpty();
		assertThat(GrandezasDeCard.declaradas(null)).isEmpty();
		assertThat(GrandezasDeCard.de(null)).isEmpty();
		assertThat(GrandezasDeCard.de(card("  ", Tipo.PRESSAO, true))).isEmpty();
	}
}

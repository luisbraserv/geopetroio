package com.geopetro.desktop.calculos;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

/**
 * RN-090 — uma unidade pode ter várias bombas, e cada card de stroke tem seu próprio estado.
 *
 * <p>Antes disto os dois calculadores guardavam estado único, escritos quando a unidade tinha uma
 * bomba só. Com duas, os deltas se trocariam e a janela de 60 s somaria strokes de bombas
 * diferentes — as duas vazões sairiam plausíveis e erradas, que é o desfecho mais caro aqui.
 */
class CalculadoresPorCardTest {

	private static final String BOMBA_A = "CONTADOR_STROKE_01";
	private static final String BOMBA_B = "CONTADOR_STROKE_02";

	@Nested
	@DisplayName("contagem de stroke")
	class Stroke {

		private final StrokeCalculatorService calculador = new StrokeCalculatorService();

		@Test
		@DisplayName("a primeira leitura de cada card devolve zero")
		void primeiraLeituraPorCard() {
			assertEquals(0, calculador.calculateCurrentStroke(BOMBA_A, 1_000));
			// A bomba B estreia depois, com o contador dela em outro ponto: tambem comeca do zero.
			assertEquals(0, calculador.calculateCurrentStroke(BOMBA_B, 500_000));
		}

		@Test
		@DisplayName("duas bombas nao trocam deltas entre si")
		void duasBombasNaoSeMisturam() {
			calculador.calculateCurrentStroke(BOMBA_A, 1_000);
			calculador.calculateCurrentStroke(BOMBA_B, 500_000);

			// Com estado unico, a leitura de B subtrairia o cumulativo de A e vice-versa.
			assertEquals(10, calculador.calculateCurrentStroke(BOMBA_A, 1_010));
			assertEquals(25, calculador.calculateCurrentStroke(BOMBA_B, 500_025));
			assertEquals(5, calculador.calculateCurrentStroke(BOMBA_A, 1_015));
		}

		@Test
		@DisplayName("contador que reinicia nao vira delta negativo")
		void contadorQueReinicia() {
			calculador.calculateCurrentStroke(BOMBA_A, 1_000);

			assertEquals(0, calculador.calculateCurrentStroke(BOMBA_A, 5),
					"delta negativo significa contador reiniciado, nao bombeio");
			assertEquals(3, calculador.calculateCurrentStroke(BOMBA_A, 8),
					"e a contagem segue a partir do novo ponto");
		}

		@Test
		@DisplayName("reset de um card nao apaga o outro")
		void resetSeletivo() {
			calculador.calculateCurrentStroke(BOMBA_A, 1_000);
			calculador.calculateCurrentStroke(BOMBA_B, 2_000);

			calculador.reset(BOMBA_A);

			assertEquals(0, calculador.calculateCurrentStroke(BOMBA_A, 1_010), "A recomeça");
			assertEquals(10, calculador.calculateCurrentStroke(BOMBA_B, 2_010), "B continua");
		}

		@Test
		@DisplayName("reset geral zera tudo — é o que acontece ao reconectar o CLP")
		void resetGeral() {
			calculador.calculateCurrentStroke(BOMBA_A, 1_000);
			calculador.calculateCurrentStroke(BOMBA_B, 2_000);

			calculador.reset();

			assertEquals(0, calculador.calculateCurrentStroke(BOMBA_A, 1_010));
			assertEquals(0, calculador.calculateCurrentStroke(BOMBA_B, 2_010));
		}
	}

	@Nested
	@DisplayName("vazão")
	class Vazao {

		private long agora = 1_000_000;
		private final FlowRateCalculatorService calculador = new FlowRateCalculatorService(() -> agora);

		/** Avanca o relogio e le: um ciclo de aquisicao. */
		private double ciclo(String bomba, long strokes, double constante, long passoMs) {
			agora += passoMs;
			return calculador.calculateBblPerMinute(bomba, strokes, constante);
		}

		@Test
		@DisplayName("ritmo constante dá exatamente strokes/min × constante, com a janela cheia")
		void ritmoConstante() {
			// 2 strokes/s = 120 strokes/min; × 0,1 bbl/stroke = 12 bbl/min.
			calculador.calculateBblPerMinute(BOMBA_A, 0, 0.1);
			double vazao = 0;
			for (int i = 0; i < 120; i++) {
				vazao = ciclo(BOMBA_A, 2, 0.1, 1_000);
			}

			// Somar os strokes da leitura mais antiga dava 61 deltas sobre 60 s: 12,2 bbl/min.
			assertEquals(12.0, vazao, 1e-9);
		}

		@Test
		@DisplayName("ritmo constante também é exato com a janela ainda enchendo")
		void ritmoConstanteJanelaEnchendo() {
			calculador.calculateBblPerMinute(BOMBA_A, 0, 0.1);
			ciclo(BOMBA_A, 2, 0.1, 1_000);
			assertEquals(12.0, ciclo(BOMBA_A, 2, 0.1, 1_000), 1e-9);
		}

		@Test
		@DisplayName("depois de mais de 60 s sem leitura, a vazão é zero — não a constante da bomba")
		void voltaDepoisDeLacuna() {
			calculador.calculateBblPerMinute(BOMBA_A, 0, 0.125);
			ciclo(BOMBA_A, 2, 0.125, 1_000);

			// A janela esvazia e fica so a leitura nova: sem intervalo nao ha vazao. Antes saia
			// 0,125 — bbl/stroke exibido como bbl/min.
			assertEquals(0.0, ciclo(BOMBA_A, 300, 0.125, 90_000));
			// E o ciclo seguinte ja mede normalmente.
			assertEquals(0.125 * 2 * 60, ciclo(BOMBA_A, 2, 0.125, 1_000), 1e-9);
		}

		@Test
		@DisplayName("duas leituras no mesmo instante não produzem vazão")
		void intervaloZero() {
			calculador.calculateBblPerMinute(BOMBA_A, 0, 0.1);

			assertEquals(0.0, calculador.calculateBblPerMinute(BOMBA_A, 10, 0.1));
		}

		@Test
		@DisplayName("a primeira leitura de cada card devolve zero: sem intervalo não há vazão")
		void primeiraLeitura() {
			assertEquals(0.0, calculador.calculateBblPerMinute(BOMBA_A, 10, 0.1));
			assertEquals(0.0, calculador.calculateBblPerMinute(BOMBA_B, 10, 0.1));
		}

		@Test
		@DisplayName("uma bomba parada não é afetada pela outra bombeando")
		void bombaParadaNaoHerdaVazaoDaOutra() {
			calculador.calculateBblPerMinute(BOMBA_A, 0, 0.1);
			calculador.calculateBblPerMinute(BOMBA_B, 0, 0.1);

			// A bombeia forte; B segue parada.
			for (int i = 0; i < 5; i++) {
				ciclo(BOMBA_A, 50, 0.1, 1_000);
			}
			double vazaoDeB = 0;
			for (int i = 0; i < 5; i++) {
				vazaoDeB = ciclo(BOMBA_B, 0, 0.1, 1_000);
			}

			// Com uma janela compartilhada, os strokes de A entrariam na conta de B.
			assertEquals(0.0, vazaoDeB, "bomba parada tem vazao zero");
		}

		@Test
		@DisplayName("constantes de bomba diferentes não se contaminam")
		void constantesDiferentes() {
			calculador.calculateBblPerMinute(BOMBA_A, 0, 0.10);
			calculador.calculateBblPerMinute(BOMBA_B, 0, 0.50);

			double a = 0;
			double b = 0;
			for (int i = 0; i < 4; i++) {
				a = ciclo(BOMBA_A, 10, 0.10, 1_000);
				b = ciclo(BOMBA_B, 10, 0.50, 0);
			}

			assertTrue(a > 0 && b > 0, "as duas bombeando");
			// Mesmos strokes, constante 5x maior: a vazao de B tem de ficar proporcionalmente maior.
			assertEquals(5.0, b / a, 0.001);
		}

		@Test
		@DisplayName("reset de um card não apaga a janela do outro")
		void resetSeletivo() {
			calculador.calculateBblPerMinute(BOMBA_A, 0, 0.1);
			calculador.calculateBblPerMinute(BOMBA_B, 0, 0.1);
			ciclo(BOMBA_A, 10, 0.1, 1_000);
			ciclo(BOMBA_B, 10, 0.1, 0);

			calculador.reset(BOMBA_A);

			assertEquals(0.0, ciclo(BOMBA_A, 10, 0.1, 1_000),
					"A recomeca e a primeira leitura devolve zero");
			assertTrue(ciclo(BOMBA_B, 10, 0.1, 0) > 0, "B continua com janela");
		}

		@Test
		@DisplayName("sem stroke nenhum na janela, a vazão é zero e não divide por zero")
		void janelaSemStroke() {
			calculador.calculateBblPerMinute(BOMBA_A, 0, 0.1);

			assertEquals(0.0, ciclo(BOMBA_A, 0, 0.1, 1_000));
		}
	}
}

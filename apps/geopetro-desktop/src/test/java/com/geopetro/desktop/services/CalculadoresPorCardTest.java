package com.geopetro.desktop.services;

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

		private final FlowRateCalculatorService calculador = new FlowRateCalculatorService();

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
				calculador.calculateBblPerMinute(BOMBA_A, 50, 0.1);
			}
			double vazaoDeB = 0;
			for (int i = 0; i < 5; i++) {
				vazaoDeB = calculador.calculateBblPerMinute(BOMBA_B, 0, 0.1);
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
				a = calculador.calculateBblPerMinute(BOMBA_A, 10, 0.10);
				b = calculador.calculateBblPerMinute(BOMBA_B, 10, 0.50);
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
			calculador.calculateBblPerMinute(BOMBA_A, 10, 0.1);
			calculador.calculateBblPerMinute(BOMBA_B, 10, 0.1);

			calculador.reset(BOMBA_A);

			assertEquals(0.0, calculador.calculateBblPerMinute(BOMBA_A, 10, 0.1),
					"A recomeca e a primeira leitura devolve zero");
			assertTrue(calculador.calculateBblPerMinute(BOMBA_B, 10, 0.1) > 0, "B continua com janela");
		}

		@Test
		@DisplayName("sem stroke nenhum na janela, a vazão é zero e não divide por zero")
		void janelaSemStroke() {
			calculador.calculateBblPerMinute(BOMBA_A, 0, 0.1);

			assertEquals(0.0, calculador.calculateBblPerMinute(BOMBA_A, 0, 0.1));
		}
	}
}

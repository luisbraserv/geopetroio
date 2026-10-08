package com.geopetro.desktop.conversao;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

import com.geopetro.desktop.cards.CardsDaUnidade.FormaTanque;
import com.geopetro.desktop.cards.CardsDaUnidade.Parametros;

/**
 * Volume do tanque a partir da distância medida no topo — RN-084, RN-085.
 *
 * <p>⚠️ É o cálculo de maior consequência da feature: o volume é o que se grava e se alarma, por
 * cinco anos, e um erro de geometria produz um número <b>plausível</b> o tempo todo.
 */
class ConversaoTanqueTest {

	/** Ax que corresponde a uma fração da faixa −250..750 do amplificador. */
	private static double ax(double fracao) {
		return ConversaoSinalAnalogico.AX_MIN
				+ fracao * (ConversaoSinalAnalogico.AX_MAX - ConversaoSinalAnalogico.AX_MIN);
	}

	private static Parametros vertical(double raio, double altura, double dMin, double dMax) {
		return new Parametros(null, null, null, null, FormaTanque.CILINDRICO_VERTICAL,
				raio, altura, null, null, dMin, dMax, null);
	}

	private static Parametros horizontal(double raio, double comprimento, double dMin, double dMax) {
		return new Parametros(null, null, null, null, FormaTanque.CILINDRICO_HORIZONTAL,
				raio, null, comprimento, null, dMin, dMax, null);
	}

	private static Parametros retangular(double c, double l, double altura, double dMin, double dMax) {
		return new Parametros(null, null, null, null, FormaTanque.RETANGULAR,
				null, altura, c, l, dMin, dMax, null);
	}

	@Nested
	@DisplayName("o sensor mede distância, não nível")
	class Distancia {

		/** Tanque de 3 m: sensor lê 0 m com ele cheio e 3 m com ele vazio. */
		private final Parametros p = vertical(1.0, 3.0, 0.0, 3.0);

		@Test
		@DisplayName("⚠️ 4 mA é o tanque CHEIO, não vazio")
		void quatroMaEhCheio() {
			// Distancia minima = superficie perto do sensor = cheio. Ler ao contrario daria um
			// tanque que enche quando esvazia, e o numero seria plausivel o tempo todo.
			assertEquals(3.0, ConversaoTanque.alturaDoLiquidoM(ax(0.0), p), 0.0001);
			assertEquals(0.0, ConversaoTanque.alturaDoLiquidoM(ax(1.0), p), 0.0001);
		}

		@Test
		@DisplayName("meia faixa é meia altura")
		void meiaFaixa() {
			assertEquals(1.5, ConversaoTanque.alturaDoLiquidoM(ax(0.5), p), 0.0001);
		}

		@Test
		@DisplayName("fora da faixa do transmissor a altura é limitada, não negativa")
		void foraDaFaixa() {
			// Abaixo de -250 significa laco aberto ou sensor sem alimentacao. Um volume negativo
			// nao existe; propagar seria pior que limitar.
			assertEquals(3.0, ConversaoTanque.alturaDoLiquidoM(-300, p), 0.0001);
			assertEquals(0.0, ConversaoTanque.alturaDoLiquidoM(2000, p), 0.0001);
		}

		@Test
		@DisplayName("distâncias trocadas não convertem")
		void distanciasTrocadas() {
			// dMax <= dMin significa configuracao invertida: o tanque leria ao contrario.
			assertNull(ConversaoTanque.alturaDoLiquidoM(ax(0.5), vertical(1.0, 3.0, 3.0, 0.5)));
			assertNull(ConversaoTanque.alturaDoLiquidoM(ax(0.5), vertical(1.0, 3.0, 2.0, 2.0)));
		}

		@Test
		@DisplayName("o sensor pode ficar acima do nível máximo do líquido")
		void sensorAcimaDoNivelMaximo() {
			// Tanque de 3 m com o sensor 0,5 m acima da boca: cheio le 0,5 e vazio le 3,5.
			var p = vertical(1.0, 3.0, 0.5, 3.5);

			assertEquals(3.0, ConversaoTanque.alturaDoLiquidoM(ax(0.0), p), 0.0001, "cheio");
			assertEquals(0.0, ConversaoTanque.alturaDoLiquidoM(ax(1.0), p), 0.0001, "vazio");
		}
	}

	@Nested
	@DisplayName("volume por forma")
	class Volume {

		@Test
		@DisplayName("cilíndrico vertical: π r² h")
		void cilindricoVertical() {
			var p = vertical(1.5, 3.0, 0.0, 3.0);

			// Cheio: pi * 1,5^2 * 3 = 21,206 m3
			double esperado = Math.PI * 1.5 * 1.5 * 3.0 * ConversaoTanque.BBL_POR_M3;

			assertEquals(esperado, ConversaoTanque.volumeBbl(ax(0.0), p), 0.001);
			assertEquals(esperado / 2, ConversaoTanque.volumeBbl(ax(0.5), p), 0.001,
					"no vertical, meia altura E meio volume");
		}

		@Test
		@DisplayName("retangular: C × L × h")
		void retangularSimples() {
			var p = retangular(6.0, 2.0, 2.0, 0.0, 2.0);

			assertEquals(6.0 * 2.0 * 2.0 * ConversaoTanque.BBL_POR_M3,
					ConversaoTanque.volumeBbl(ax(0.0), p), 0.001);
		}

		@Test
		@DisplayName("⚠️ cilíndrico HORIZONTAL não é proporcional à altura")
		void horizontalNaoEhProporcional() {
			var p = horizontal(1.0, 5.0, 0.0, 2.0);

			double cheio = ConversaoTanque.volumeBbl(ax(0.0), p);
			double metade = ConversaoTanque.volumeBbl(ax(0.5), p);
			double umQuarto = ConversaoTanque.volumeBbl(ax(0.75), p);

			// Metade da altura E metade do volume: o circulo e simetrico no meio.
			assertEquals(cheio / 2, metade, 0.001);

			// Mas um quarto da ALTURA nao e um quarto do VOLUME. Com r=1 e h=0,5 o segmento vale
			//   A = acos(0,5) − 0,5·√0,75 = 0,61418 m²
			// e o volume, A × 5 m = 3,0709 m³ = 19,315 bbl.
			double segmento = Math.acos(0.5) - 0.5 * Math.sqrt(0.75);
			assertEquals(segmento * 5.0 * ConversaoTanque.BBL_POR_M3, umQuarto, 0.001);

			// A regra de tres daria 24,70 bbl: 22% a mais. Tratar o deitado como vertical erraria
			// justamente no fim do tanque, onde se decide se esta acabando.
			double proporcional = cheio / 4;
			assertTrue(umQuarto < proporcional * 0.80,
					"o segmento da menos que a regra de tres: %.2f contra %.2f".formatted(umQuarto, proporcional));
		}

		@Test
		@DisplayName("cilíndrico horizontal cheio é π r² L")
		void horizontalCheio() {
			var p = horizontal(1.0, 5.0, 0.0, 2.0);

			assertEquals(Math.PI * 1.0 * 1.0 * 5.0 * ConversaoTanque.BBL_POR_M3,
					ConversaoTanque.volumeBbl(ax(0.0), p), 0.001);
		}

		@Test
		@DisplayName("no cilíndrico deitado a altura útil é o diâmetro, não a altura declarada")
		void alturaUtilDoDeitado() {
			// Aquela dimensao nem existe nessa forma; o liquido sobe ate o diametro.
			assertEquals(2.0, ConversaoTanque.alturaUtilM(horizontal(1.0, 5.0, 0.0, 2.0)), 0.0001);
			assertEquals(3.0, ConversaoTanque.alturaUtilM(vertical(1.0, 3.0, 0.0, 3.0)), 0.0001);
		}

		@Test
		@DisplayName("tanque vazio dá volume zero, não nulo")
		void vazioEhZero() {
			// Zero aqui e uma medicao legitima: o tanque esta vazio. O nulo e reservado para
			// "nao da para calcular".
			assertEquals(0.0, ConversaoTanque.volumeBbl(ax(1.0), vertical(1.5, 3.0, 0.0, 3.0)), 0.0001);
		}
	}

	@Nested
	@DisplayName("configuração incompleta não vira zero")
	class SemConfiguracao {

		@Test
		@DisplayName("sem forma, sem dimensão ou sem distância devolve nulo")
		void faltando() {
			// ⚠️ Zero entraria no historico como "tanque vazio", e um alarme de volume baixo
			// poderia disparar sobre um tanque cheio.
			assertNull(ConversaoTanque.volumeBbl(ax(0.5), null));
			assertNull(ConversaoTanque.volumeBbl(ax(0.5), Parametros.vazio()));
			assertNull(ConversaoTanque.volumeBbl(ax(0.5), vertical(0, 3.0, 0.0, 3.0)), "raio zero");
			assertNull(ConversaoTanque.volumeBbl(ax(0.5),
					new Parametros(null, null, null, null, FormaTanque.CILINDRICO_VERTICAL,
							1.0, 3.0, null, null, null, null, null)),
					"sem distancias");
		}
	}

	@Nested
	@DisplayName("apoio ao desenho")
	class Desenho {

		@Test
		@DisplayName("a fração cheia vai de 0 a 1")
		void fracaoCheia() {
			var p = vertical(1.0, 3.0, 0.0, 3.0);

			assertEquals(1.0, ConversaoTanque.fracaoCheia(3.0, p), 0.0001);
			assertEquals(0.5, ConversaoTanque.fracaoCheia(1.5, p), 0.0001);
			assertEquals(0.0, ConversaoTanque.fracaoCheia(0.0, p), 0.0001);
		}

		@Test
		@DisplayName("a capacidade serve de escala para o desenho")
		void capacidade() {
			var p = vertical(1.0, 3.0, 0.0, 3.0);

			assertEquals(Math.PI * 3.0 * ConversaoTanque.BBL_POR_M3,
					ConversaoTanque.capacidadeBbl(FormaTanque.CILINDRICO_VERTICAL, p), 0.001);
		}
	}
}

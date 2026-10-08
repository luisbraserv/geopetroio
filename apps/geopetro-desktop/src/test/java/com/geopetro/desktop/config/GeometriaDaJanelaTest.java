package com.geopetro.desktop.config;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

import javafx.geometry.Rectangle2D;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * O bug de campo: "em telas pequenas o menu ta sumindo".
 *
 * <p>Nao era o layout — a barra sempre esteve desenhada, com 60px, em y=0 da janela. Era a
 * <b>janela</b> que abria acima da borda do monitor, porque 1200x800 fixo mais o
 * {@code centerOnScreen()} implicito do {@code show()} dao y negativo em qualquer area util com
 * menos de 800px de altura.
 *
 * <p>Estes casos rodam a aritmetica em telas que a maquina de desenvolvimento nao tem. So
 * {@link Rectangle2D} do JavaFX e usado, e ele nao precisa do toolkit grafico: o teste roda em CI
 * headless, que e onde uma regressao dessas precisa ser pega.
 */
class GeometriaDaJanelaTest {

	/** A altura da barra de marca/navegacao no {@code main-view.fxml}. */
	private static final double ALTURA_DA_BARRA = 60;

	/** Barra de titulo do Windows, aproximada — o que some junto quando y fica negativo. */
	private static final double BARRA_DE_TITULO = 31;

	@Nested
	@DisplayName("a janela nunca abre fora da area util")
	class DentroDaTela {

		@Test
		@DisplayName("1366x768 a 125%: a area util logica nao chega aos 800px pedidos")
		void telaEscalonada() {
			// 1366x768 com escala de 125% e a barra de tarefas: ~1093x614 logicos.
			var g = GeometriaDaJanela.paraTela(new Rectangle2D(0, 0, 1093, 614));

			assertEquals(614, g.altura(), "a janela nao pode pedir mais altura do que a tela tem");
			assertEquals(0, g.y(), "com y=0 a barra de titulo e o menu ficam visiveis");
			assertTrue(g.y() + BARRA_DE_TITULO + ALTURA_DA_BARRA <= 614,
					"os 60px do menu precisam caber abaixo da borda de cima");
		}

		@Test
		@DisplayName("1366x768 a 100%: cabe a largura, nao cabe a altura")
		void notebookComum() {
			var g = GeometriaDaJanela.paraTela(new Rectangle2D(0, 0, 1366, 728));

			assertEquals(1200, g.largura(), "1200 cabe em 1366, entao mantem o tamanho confortavel");
			assertEquals(728, g.altura());
			assertEquals(83, g.x(), "sobra largura: centraliza");
			assertEquals(0, g.y(), "nao sobra altura: encosta no topo em vez de subir para fora");
		}

		@Test
		@DisplayName("painel industrial pequeno: os minimos cedem junto")
		void telaMenorQueOMinimo() {
			var g = GeometriaDaJanela.paraTela(new Rectangle2D(0, 0, 800, 500));

			assertEquals(800, g.largura());
			assertEquals(500, g.altura());
			// ⚠️ O ponto que faz o conserto valer: sem baixar o minimo, o gerenciador de janelas
			// obedece ao setMinHeight(600) e devolve a janela a um tamanho que nao cabe — e o
			// estouro volta pela porta dos fundos.
			assertEquals(800, g.larguraMinima(), "minimo de 1000 estouraria uma tela de 800");
			assertEquals(500, g.alturaMinima(), "minimo de 600 estouraria uma tela de 500");
			assertEquals(0, g.x());
			assertEquals(0, g.y());
		}

		@Test
		@DisplayName("monitor secundario a esquerda do principal: a origem negativa e respeitada")
		void monitorComOrigemNegativa() {
			var g = GeometriaDaJanela.paraTela(new Rectangle2D(-1920, -200, 1280, 700));

			assertTrue(g.x() >= -1920, "nunca antes da borda esquerda da area util");
			assertTrue(g.y() >= -200, "nunca acima da borda de cima da area util");
			assertEquals(-1920 + 40, g.x());
			assertEquals(-200, g.y(), "700 < 800: encosta no topo daquele monitor");
		}
	}

	@Test
	@DisplayName("tela grande: nada muda em relacao ao que ja funcionava")
	void telaGrandeSegueIgual() {
		var g = GeometriaDaJanela.paraTela(new Rectangle2D(0, 0, 1920, 1040));

		assertEquals(1200, g.largura());
		assertEquals(800, g.altura());
		assertEquals(1000, g.larguraMinima());
		assertEquals(600, g.alturaMinima());
		assertEquals(360, g.x());
		assertEquals(80, g.y(), "sobra altura: mantem o terco superior do JavaFX");
	}

	/**
	 * Varredura: em nenhuma tela plausivel a janela pode comecar fora da area util nem pedir mais
	 * espaco do que existe. Um caso pontual passa por sorte; uma varredura, nao.
	 */
	@Test
	@DisplayName("em qualquer tela, a janela cabe e comeca dentro")
	void invariantes() {
		for (int largura = 640; largura <= 2560; largura += 37) {
			for (int altura = 400; altura <= 1440; altura += 29) {
				var area = new Rectangle2D(0, 0, largura, altura);
				var g = GeometriaDaJanela.paraTela(area);

				assertTrue(g.x() >= 0 && g.y() >= 0, largura + "x" + altura + " abriu fora da tela");
				assertTrue(g.x() + g.largura() <= largura + 0.5, largura + "x" + altura + " estourou a direita");
				assertTrue(g.y() + g.altura() <= altura + 0.5, largura + "x" + altura + " estourou embaixo");
				assertTrue(g.larguraMinima() <= largura && g.alturaMinima() <= altura,
						largura + "x" + altura + ": minimo maior que a tela");
			}
		}
	}
}

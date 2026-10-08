package com.geopetro.desktop.app;

import javafx.geometry.Rectangle2D;

/**
 * Onde e de que tamanho a janela principal abre, dada a area util do monitor.
 *
 * <h2>Por que isto existe</h2>
 * A janela abria sempre com 1200x800 e deixava o {@code show()} posicionar. O JavaFX centraliza pela
 * formula {@code y = telaMinY + (alturaDaTela - alturaDaJanela) / 3} — que devolve <b>negativo</b>
 * quando a janela e mais alta que a area util. Ai o topo da janela sobe para fora do monitor, e o que
 * fica de fora e justamente a barra de titulo e a barra de menu.
 *
 * <p>Num 1366x768 com escala de 125% do Windows a area util logica e ~1093x614:
 * {@code (614 - 800) / 3 = -62}, e some metade dos 60px da barra. A 150% a barra some inteira. Foi o
 * relato de campo — "em telas pequenas o menu ta sumindo" — e nao havia nada de errado com o layout
 * do FXML: a barra estava desenhada, so que acima da borda da tela.
 *
 * <p>Regra: a janela nunca comeca antes da origem da area util, e nunca pede mais espaco do que o
 * monitor tem. Os minimos acompanham — de nada adianta limitar a altura a 500px se o
 * {@code setMinHeight(600)} manda o gerenciador de janelas devolver 600.
 *
 * <p>Calculo separado da tela de proposito: assim da para conferir a aritmetica em telas que esta
 * maquina nao tem.
 */
public record GeometriaDaJanela(
        double x, double y, double largura, double altura, double larguraMinima, double alturaMinima) {

	/** O tamanho confortavel: cabe o monitoramento com dois cards por linha sem rolagem. */
	static final double LARGURA_DESEJADA = 1200;
	static final double ALTURA_DESEJADA = 800;

	/** Abaixo disto a tela fica apertada — mas apertada ainda e melhor que fora do monitor. */
	static final double LARGURA_MINIMA = 1000;
	static final double ALTURA_MINIMA = 600;

	public static GeometriaDaJanela paraTela(Rectangle2D areaUtil) {
		double largura = Math.min(LARGURA_DESEJADA, areaUtil.getWidth());
		double altura = Math.min(ALTURA_DESEJADA, areaUtil.getHeight());

		// O minimo nunca pode passar do que a tela oferece: o gerenciador de janelas obedece ao
		// minimo, nao ao tamanho pedido, e a janela voltaria a estourar a borda.
		double larguraMinima = Math.min(LARGURA_MINIMA, largura);
		double alturaMinima = Math.min(ALTURA_MINIMA, altura);

		// Centralizado quando sobra espaco; encostado na origem quando nao sobra. O max(0, ...) e o
		// conserto: sem ele a divisao devolve negativo e joga o topo para fora.
		double x = areaUtil.getMinX() + Math.max(0, (areaUtil.getWidth() - largura) / 2);
		double y = areaUtil.getMinY() + Math.max(0, (areaUtil.getHeight() - altura) / 3);

		return new GeometriaDaJanela(x, y, largura, altura, larguraMinima, alturaMinima);
	}
}

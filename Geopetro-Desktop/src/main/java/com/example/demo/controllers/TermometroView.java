package com.example.demo.controllers;

import javafx.scene.canvas.Canvas;
import javafx.scene.canvas.GraphicsContext;
import javafx.scene.paint.Color;
import javafx.scene.text.Font;
import javafx.scene.text.TextAlignment;

/**
 * Termômetro desenhado com a escala configurada no card — §6 de {@code cards-configuraveis.md}.
 *
 * <h2>Por que desenhar em vez de mostrar só o número</h2>
 * Um número sozinho não diz se 85 °C é normal ou perto do limite. O termômetro mostra a
 * <b>posição na escala</b>, e a escala é a do transmissor daquele card — um sensor de motor
 * (0..150 °C) e um de lama (−20..80 °C) desenham diferente para a mesma temperatura.
 *
 * <p>⚠️ <b>A escala desenhada é a configurada, não uma fixa.</b> Desenhar sempre 0..100 faria uma
 * leitura de 120 °C aparecer no topo como se fosse o máximo — plausível e errado.
 */
public class TermometroView extends Canvas {

	private static final double LARGURA = 58;
	private static final double ALTURA = 132;

	/** Proporções do desenho, em fração da altura útil. */
	private static final double RAIO_BULBO = 13;
	private static final double LARGURA_TUBO = 12;

	private final double minimo;
	private final double maximo;
	private final String unidade;

	private Double valor;

	public TermometroView(double minimo, double maximo, String unidade) {
		super(LARGURA, ALTURA);
		this.minimo = minimo;
		this.maximo = maximo;
		this.unidade = unidade == null ? "°C" : unidade;
		desenhar();
	}

	/** {@code null} desenha o termômetro vazio — card sem escala ou sem leitura. */
	public void setValor(Double valor) {
		this.valor = valor;
		desenhar();
	}

	public void redimensionar(double largura, double altura) {
        largura = Math.max(60, largura); altura = Math.max(60, altura);
        if (getWidth() == largura && getHeight() == altura) return;
        setWidth(largura); setHeight(altura); desenhar();
    }

    private void desenhar() {
		GraphicsContext g = getGraphicsContext2D();
		g.clearRect(0, 0, getWidth(), getHeight());

		double centroX = getWidth() * 0.38;
		double baseBulbo = getHeight() - RAIO_BULBO - 2;
		double topoTubo = 14;
		double alturaTubo = baseBulbo - topoTubo;

		// Corpo: tubo com cantos arredondados e bulbo, em cinza claro.
		g.setFill(Color.web("#e8edf5"));
		g.fillRoundRect(centroX - LARGURA_TUBO / 2, topoTubo, LARGURA_TUBO, alturaTubo,
				LARGURA_TUBO, LARGURA_TUBO);
		g.fillOval(centroX - RAIO_BULBO, baseBulbo - RAIO_BULBO, RAIO_BULBO * 2, RAIO_BULBO * 2);

		double fracao = fracao();
		Color cor = corDaFracao(fracao);

		// O bulbo sempre aparece cheio: e o reservatorio, nao parte da escala.
		g.setFill(cor);
		g.fillOval(centroX - RAIO_BULBO + 3, baseBulbo - RAIO_BULBO + 3,
				(RAIO_BULBO - 3) * 2, (RAIO_BULBO - 3) * 2);

		if (valor != null) {
			double alturaColuna = alturaTubo * fracao;
			g.fillRoundRect(centroX - (LARGURA_TUBO - 4) / 2, baseBulbo - alturaColuna,
					LARGURA_TUBO - 4, alturaColuna, LARGURA_TUBO - 4, LARGURA_TUBO - 4);
		}

		// Marcas de minimo e maximo: sem elas o desenho nao diz de que escala se trata.
		g.setStroke(Color.web("#94a3b8"));
		g.setLineWidth(1);
		g.strokeLine(centroX + LARGURA_TUBO / 2 + 2, topoTubo, centroX + LARGURA_TUBO / 2 + 8, topoTubo);
		g.strokeLine(centroX + LARGURA_TUBO / 2 + 2, baseBulbo, centroX + LARGURA_TUBO / 2 + 8, baseBulbo);

		g.setFill(Color.web("#64748b"));
		g.setFont(Font.font(Math.min(13, Math.max(9, getWidth() * .10))));
		g.setTextAlign(TextAlignment.LEFT);
		g.fillText(formatar(maximo), centroX + LARGURA_TUBO / 2 + 10, topoTubo + 3);
		g.fillText(formatar(minimo), centroX + LARGURA_TUBO / 2 + 10, baseBulbo + 3);

		g.setTextAlign(TextAlignment.CENTER);
		g.setFont(Font.font(Math.min(13, Math.max(9, getWidth() * .10))));
		g.fillText(unidade, centroX, 9);
	}

	/** Onde o valor cai na escala, de 0 a 1. Fora dela, encosta no extremo — e a cor denuncia. */
	private double fracao() {
		if (valor == null || !(maximo > minimo)) {
			return 0;
		}
		return Math.clamp((valor - minimo) / (maximo - minimo), 0.0, 1.0);
	}

	/**
	 * Frio ao quente, do azul ao vermelho.
	 *
	 * <p>⚠️ A cor é <b>posição na escala</b>, não julgamento: quem decide o que é quente demais é o
	 * limite de alarme, que é outra configuração. Aqui o vermelho no topo significa "no fim da faixa
	 * do sensor", que num sensor de −20..80 °C acontece bem antes de qualquer problema.
	 */
	private static Color corDaFracao(double fracao) {
		return Color.web("#2563eb").interpolate(Color.web("#dc2626"), fracao);
	}

	private static String formatar(double valor) {
		return valor == Math.floor(valor) ? String.valueOf((long) valor) : String.format("%.1f", valor);
	}
}

package com.geopetro.desktop.monitoramento.componentes;

import com.geopetro.desktop.cards.CardsDaUnidade.FormaTanque;

import javafx.scene.canvas.Canvas;
import javafx.scene.canvas.GraphicsContext;
import javafx.scene.paint.Color;
import javafx.scene.text.Font;
import javafx.scene.text.TextAlignment;

/**
 * Tanque desenhado na forma configurada, com o sensor no topo — §7 de
 * {@code cards-configuraveis.md}.
 *
 * <h2>O desenho é a conferência visual mais barata da configuração</h2>
 * ⚠️ O erro mais provável desta feature é <b>distância trocada por nível</b>: o sensor mede a
 * distância até a superfície, e ler isso como nível dá um tanque que <b>enche quando esvazia</b>. O
 * número seria plausível o tempo todo; o desenho não — um tanque que esvazia enquanto a operação
 * enche denuncia na hora.
 *
 * <p>Por isso o sensor aparece explicitamente no topo, com o traço da distância medida: o desenho
 * conta de onde o número veio.
 */
public class TanqueView extends Canvas {

	private static final double LARGURA = 108;
	private static final double ALTURA = 132;

	/** Espaço reservado ao sensor acima do corpo do tanque. */
	private static final double TOPO = 22;
	private static final double MARGEM = 10;

	private final FormaTanque forma;

	private double fracaoCheia;
	private boolean temLeitura;

	public TanqueView(FormaTanque forma) {
		super(LARGURA, ALTURA);
		this.forma = forma == null ? FormaTanque.CILINDRICO_VERTICAL : forma;
		desenhar();
	}

	/**
	 * @param fracaoCheia 0 a 1
	 * @param temLeitura  {@code false} desenha o tanque vazio e sem o traço da distância — card sem
	 *                    configuração completa, onde fingir "vazio" seria mentir
	 */
	public void atualizar(double fracaoCheia, boolean temLeitura) {
		this.fracaoCheia = Math.clamp(fracaoCheia, 0.0, 1.0);
		this.temLeitura = temLeitura;
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

		double x = MARGEM;
		double y = TOPO;
		double largura = getWidth() - 2 * MARGEM;
		double altura = getHeight() - TOPO - MARGEM;

		switch (forma) {
			case CILINDRICO_VERTICAL -> desenharVertical(g, x, y, largura, altura);
			case CILINDRICO_HORIZONTAL -> desenharHorizontal(g, x, y, largura, altura);
			case RETANGULAR -> desenharRetangular(g, x, y, largura, altura);
		}

		desenharSensor(g, y, altura);
	}

	// ============================================================ formas

	private void desenharVertical(GraphicsContext g, double x, double y, double largura, double altura) {
		double raioTopo = largura * 0.16;
		corpo(g, () -> {
			g.fillRoundRect(x, y, largura, altura, raioTopo, raioTopo);
		});
		liquido(g, x, y, largura, altura, () -> {
			double h = altura * fracaoCheia;
			g.fillRoundRect(x + 2, y + altura - h, largura - 4, h - 2 < 0 ? 0 : h - 2, raioTopo, raioTopo);
		});
	}

	private void desenharRetangular(GraphicsContext g, double x, double y, double largura, double altura) {
		corpo(g, () -> g.fillRect(x, y, largura, altura));
		liquido(g, x, y, largura, altura, () -> {
			double h = altura * fracaoCheia;
			g.fillRect(x + 2, y + altura - h, largura - 4, h);
		});
	}

	/**
	 * Deitado: um cilindro visto de lado, desenhado como oval.
	 *
	 * <p>⚠️ O líquido é recortado pela oval, e não um retângulo — é o que mostra que <b>metade da
	 * altura não é metade do volume</b> nesta forma. Desenhar um retângulo aqui contradiria a
	 * conversão, que usa a área do segmento circular.
	 */
	private void desenharHorizontal(GraphicsContext g, double x, double y, double largura, double altura) {
		double alturaOval = Math.min(altura, largura * 0.62);
		double topoOval = y + (altura - alturaOval) / 2;

		corpo(g, () -> g.fillOval(x, topoOval, largura, alturaOval));

		g.save();
		g.beginPath();
		g.moveTo(x, topoOval);
		g.appendSVGPath("M %f %f a %f %f 0 1 0 %f 0 a %f %f 0 1 0 %f 0"
				.formatted(x, topoOval + alturaOval / 2, largura / 2, alturaOval / 2, largura,
						largura / 2, alturaOval / 2, -largura));
		g.clip();
		g.setFill(corDoLiquido());
		double h = alturaOval * fracaoCheia;
		g.fillRect(x, topoOval + alturaOval - h, largura, h);
		g.restore();

		g.setStroke(Color.web("#94a3b8"));
		g.setLineWidth(1.5);
		g.strokeOval(x, topoOval, largura, alturaOval);
	}

	private void corpo(GraphicsContext g, Runnable forma) {
		g.setFill(Color.web("#eef2f7"));
		forma.run();
		g.setStroke(Color.web("#94a3b8"));
		g.setLineWidth(1.5);
	}

	private void liquido(GraphicsContext g, double x, double y, double largura, double altura, Runnable forma) {
		if (fracaoCheia > 0) {
			g.setFill(corDoLiquido());
			forma.run();
		}
		g.setStroke(Color.web("#94a3b8"));
		g.setLineWidth(1.5);
		g.strokeRect(x, y, largura, altura);
	}

	private Color corDoLiquido() {
		// Marrom-esverdeado de lama; nao muda com o nivel, porque nivel baixo nao e alarme por si.
		return temLeitura ? Color.web("#8a6d3b") : Color.web("#cbd5e1");
	}

	// ============================================================ sensor

	/**
	 * O sensor no topo, com o traço da distância que ele mede.
	 *
	 * <p>É a parte do desenho que explica o cálculo: a seta aponta para a superfície, não para o
	 * fundo. Quem olhar entende que <b>o que se mede é o vazio acima do líquido</b>.
	 */
	private void desenharSensor(GraphicsContext g, double topoTanque, double alturaTanque) {
		double centroX = getWidth() / 2;

		g.setFill(Color.web("#334155"));
		g.fillRect(centroX - 9, TOPO - 12, 18, 10);
		g.setFill(Color.web("#f8fafc"));
		g.setFont(Font.font(7));
		g.setTextAlign(TextAlignment.CENTER);
		g.fillText("4-20", centroX, TOPO - 4.5);

		if (!temLeitura) {
			return;
		}

		// Traco pontilhado do sensor ate a superficie: a distancia medida.
		double superficie = topoTanque + alturaTanque * (1 - fracaoCheia);
		g.setStroke(Color.web("#64748b"));
		g.setLineWidth(1);
		g.setLineDashes(3, 3);
		g.strokeLine(centroX, TOPO, centroX, superficie);
		g.setLineDashes();

		// Ponta de seta na superficie.
		g.setFill(Color.web("#64748b"));
		g.fillPolygon(new double[] { centroX - 3.5, centroX + 3.5, centroX },
				new double[] { superficie - 5, superficie - 5, superficie }, 3);
	}
}

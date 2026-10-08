package com.example.demo.services;

import com.example.demo.models.CardsDaUnidade.FormaTanque;
import com.example.demo.models.CardsDaUnidade.Parametros;

/**
 * Volume de um tanque a partir do sensor de distância no topo — RN-084.
 *
 * <h2>⚠️ O sensor não mede nível</h2>
 * Ele fica <b>sempre no topo</b> e mede a <b>distância até a superfície do líquido</b>. O nível é o
 * que sobra. Ler o valor do transmissor como se fosse o nível daria um tanque que <b>enche quando
 * esvazia</b> — e o número seria plausível o tempo todo.
 *
 * <pre>
 * fracao    = (Ax − (−250)) / 1000        posição no laço 4-20 mA
 * distancia = distanciaMinima + fracao × (distanciaMaxima − distanciaMinima)
 * altura    = distanciaMaxima − distancia
 * volume    = f(forma, dimensões, altura)
 * </pre>
 *
 * <p>{@code distanciaMinima} é a leitura com o tanque <b>cheio</b> (superfície perto do sensor);
 * {@code distanciaMaxima}, com ele <b>vazio</b>.
 *
 * <h2>A geometria entra no dado, não só no desenho</h2>
 * ⚠️ O que se grava e se alarma é o <b>volume em bbl</b> (RN-085). Forma ou dimensões erradas
 * produzem volume errado gravado por cinco anos — e o número continua plausível. É o parâmetro de
 * configuração de maior consequência desta feature.
 */
public final class ConversaoTanque {

	/** 1 m³ = 6,28981 barris de petróleo (42 gal US). */
	public static final double BBL_POR_M3 = 6.2898107704;

	private ConversaoTanque() {
	}

	/**
	 * Volume em bbl, ou {@code null} se a configuração não permite calcular.
	 *
	 * <p>Devolver {@code null} em vez de zero é deliberado: zero é um número, entraria no histórico
	 * como "tanque vazio" e um alarme de volume baixo poderia disparar sobre um tanque cheio.
	 */
	public static Double volumeBbl(double ax, Parametros p) {
		Double altura = alturaDoLiquidoM(ax, p);
		if (altura == null) {
			return null;
		}
		Double m3 = volumeM3(altura, p);
		return m3 == null ? null : m3 * BBL_POR_M3;
	}

	/**
	 * Altura do líquido em metros, ou {@code null} se as distâncias não foram configuradas.
	 *
	 * <p>É intermediária para o volume e serve ao desenho, que precisa saber até onde preencher.
	 */
	public static Double alturaDoLiquidoM(double ax, Parametros p) {
		if (p == null || p.distanciaMinima() == null || p.distanciaMaxima() == null) {
			return null;
		}
		double minima = p.distanciaMinima();
		double maxima = p.distanciaMaxima();
		if (!(maxima > minima)) {
			// Distancias trocadas ou iguais: o tanque leria ao contrario, ou nao leria.
			return null;
		}

		double distancia = ConversaoSinalAnalogico.axParaValorLinear(ax, minima, maxima);
		double altura = maxima - distancia;

		// Fora da faixa do transmissor a fracao passa de 0..1 e a altura sairia negativa ou acima
		// do tanque. Limitar e mais honesto que propagar: um volume negativo nao existe.
		return Math.clamp(altura, 0.0, alturaUtilM(p));
	}

	/**
	 * Altura que o líquido pode alcançar, em metros.
	 *
	 * <p>No cilindro deitado é o <b>diâmetro</b>, não a altura declarada — aquela dimensão nem
	 * existe nessa forma.
	 */
	public static double alturaUtilM(Parametros p) {
		if (p == null || p.forma() == null) {
			return 0;
		}
		return switch (p.forma()) {
			case CILINDRICO_HORIZONTAL -> p.raio() == null ? 0 : 2 * p.raio();
			case CILINDRICO_VERTICAL, RETANGULAR -> p.altura() == null ? 0 : p.altura();
		};
	}

	/** Volume em m³ até a altura informada, pela forma configurada. */
	static Double volumeM3(double alturaM, Parametros p) {
		if (p == null || p.forma() == null || alturaM < 0) {
			return null;
		}
		return switch (p.forma()) {
			case CILINDRICO_VERTICAL -> positivos(p.raio(), p.altura())
					? Math.PI * p.raio() * p.raio() * alturaM
					: null;
			case RETANGULAR -> positivos(p.comprimento(), p.largura(), p.altura())
					? p.comprimento() * p.largura() * alturaM
					: null;
			case CILINDRICO_HORIZONTAL -> positivos(p.raio(), p.comprimento())
					? segmentoCircular(alturaM, p.raio()) * p.comprimento()
					: null;
		};
	}

	/**
	 * Área do segmento circular preenchido até a altura {@code h} num círculo de raio {@code r}.
	 *
	 * <pre>
	 * A = r² · acos((r − h) / r) − (r − h) · √(2rh − h²)
	 * </pre>
	 *
	 * <p>⚠️ <b>O cilindro deitado não é proporcional à altura.</b> Metade da altura é metade do
	 * volume, mas um quarto da altura <b>não</b> é um quarto do volume. Tratá-lo como o vertical
	 * erraria mais no começo e no fim do tanque — justamente onde a leitura importa, porque é ali
	 * que se decide se está acabando.
	 */
	static double segmentoCircular(double h, double r) {
		if (h <= 0) {
			return 0;
		}
		if (h >= 2 * r) {
			return Math.PI * r * r;
		}
		double d = r - h;
		// O radicando pode ficar levemente negativo por arredondamento perto dos extremos.
		double raiz = Math.sqrt(Math.max(0, 2 * r * h - h * h));
		return r * r * Math.acos(Math.clamp(d / r, -1.0, 1.0)) - d * raiz;
	}

	private static boolean positivos(Double... valores) {
		for (Double valor : valores) {
			if (valor == null || !Double.isFinite(valor) || valor <= 0) {
				return false;
			}
		}
		return true;
	}

	/** Quanto do tanque está cheio, de 0 a 1 — para o desenho. */
	public static double fracaoCheia(double alturaM, Parametros p) {
		double util = alturaUtilM(p);
		return util <= 0 ? 0 : Math.clamp(alturaM / util, 0.0, 1.0);
	}

	/** Volume total do tanque em bbl, para a escala do desenho. */
	public static Double capacidadeBbl(FormaTanque forma, Parametros p) {
		if (forma == null) {
			return null;
		}
		Double m3 = volumeM3(alturaUtilM(p), p);
		return m3 == null ? null : m3 * BBL_POR_M3;
	}
}

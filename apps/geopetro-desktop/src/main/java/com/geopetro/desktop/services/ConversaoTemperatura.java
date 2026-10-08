package com.geopetro.desktop.services;

import com.geopetro.desktop.models.CardsDaUnidade.Parametros;

/**
 * Temperatura a partir do laço 4-20 mA — RN-083.
 *
 * <pre>
 * fracao = (Ax − (−250)) / 1000
 * valor  = minimoEscala + fracao × (maximoEscala − minimoEscala)
 * </pre>
 *
 * <h2>Por que mínimo E máximo</h2>
 * Transmissores de temperatura raramente começam em zero — uma faixa {@code −50..+200 °C} é comum.
 * Assumir base zero produziria erro proporcional em <b>toda</b> a faixa, e o número continuaria
 * plausível.
 *
 * <h2>⚠️ A pressão é o caso particular com mínimo zero — e não se unifica</h2>
 * {@code pressao = fracao × range} equivale a {@code 0 + fracao × (range − 0)}. Unificar as duas
 * seria elegante e <b>errado agora</b>: mexer na fórmula da pressão alteraria toda leitura já
 * gravada, e o histórico passaria a ter dois significados para a mesma série.
 *
 * <h2>O mesmo card serve a fluido e a equipamento</h2>
 * Lama e pasta, motor e bomba: muda a escala configurada, não a conversão. ⚠️ <b>O que difere é o
 * significado do alarme</b> — temperatura de fluido é variável de processo, ligada a reologia e tempo
 * de pega; a de equipamento é saúde de máquina. Quem configura o limite precisa saber qual dos dois
 * está olhando, e é o <b>nome do card</b> que carrega essa informação.
 */
public final class ConversaoTemperatura {

	private ConversaoTemperatura() {
	}

	/** Unidade padrão quando o card não a declara. */
	public static final String UNIDADE_PADRAO = "°C";

	/**
	 * Temperatura na escala configurada, ou {@code null} se a escala não foi preenchida.
	 *
	 * <p>Zero seria um valor de leitura perfeitamente comum numa escala que começa em −50: não há
	 * como distinguir "sem escala" de "zero grau" se o retorno for numérico.
	 */
	public static Double valor(double ax, Parametros p) {
		if (p == null || p.minimoEscala() == null || p.maximoEscala() == null) {
			return null;
		}
		double minimo = p.minimoEscala();
		double maximo = p.maximoEscala();
		if (!(maximo > minimo)) {
			// Escala invertida ou de amplitude zero: converter daria um numero sem significado.
			return null;
		}
		return ConversaoSinalAnalogico.axParaValorLinear(ax, minimo, maximo);
	}

	public static String unidade(Parametros p) {
		return p == null || p.unidade() == null || p.unidade().isBlank() ? UNIDADE_PADRAO : p.unidade();
	}
}

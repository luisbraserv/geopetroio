package com.example.demo.services;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import com.example.demo.models.CardsDaUnidade.Parametros;
import com.example.demo.models.SensorPressaoConfig;

/** Temperatura a partir do laço 4-20 mA — RN-083. */
class ConversaoTemperaturaTest {

	private static double ax(double fracao) {
		return ConversaoPressao.AX_MIN + fracao * (ConversaoPressao.AX_MAX - ConversaoPressao.AX_MIN);
	}

	private static Parametros escala(Double minimo, Double maximo, String unidade) {
		return new Parametros(null, minimo, maximo, unidade, null, null, null, null, null, null, null, null);
	}

	@Test
	@DisplayName("4 mA é o mínimo da escala e 20 mA o máximo")
	void extremos() {
		var p = escala(-20.0, 150.0, "°C");

		assertEquals(-20.0, ConversaoTemperatura.valor(ax(0.0), p), 0.0001);
		assertEquals(150.0, ConversaoTemperatura.valor(ax(1.0), p), 0.0001);
	}

	@Test
	@DisplayName("⚠️ escala com mínimo negativo não é tratada como base zero")
	void minimoNegativo() {
		// Assumir base zero daria 75 no meio da faixa, quando o correto e 65. O erro seria
		// proporcional em TODA a faixa, e o numero continuaria plausivel.
		var p = escala(-20.0, 150.0, "°C");

		assertEquals(65.0, ConversaoTemperatura.valor(ax(0.5), p), 0.0001);
	}

	@Test
	@DisplayName("a pressão é o caso particular com mínimo zero — mas as duas seguem separadas")
	void pressaoEhCasoParticular() {
		// pressao = fracao x range equivale a 0 + fracao x (range - 0). Unificar seria elegante e
		// errado agora: mexer na formula da pressao alteraria toda leitura ja gravada.
		var comoPressao = escala(0.0, 400.0, "bar");
		var sensor = new SensorPressaoConfig();
		sensor.setRangeBar(400.0);
		sensor.setSensibilidade(1.0);

		double porTemperatura = ConversaoTemperatura.valor(ax(0.37), comoPressao);
		double porPressao = ConversaoPressao.axParaBar(ax(0.37), 400.0);

		assertEquals(porPressao, porTemperatura, 0.0001, "as duas formulas concordam quando o minimo e zero");
	}

	@Test
	@DisplayName("sem escala não converte, e não devolve zero")
	void semEscala() {
		// Zero e uma leitura perfeitamente comum numa escala que comeca em -50: nao haveria como
		// distinguir "sem escala" de "zero grau" se o retorno fosse numerico.
		assertNull(ConversaoTemperatura.valor(ax(0.5), null));
		assertNull(ConversaoTemperatura.valor(ax(0.5), Parametros.vazio()));
		assertNull(ConversaoTemperatura.valor(ax(0.5), escala(20.0, null, "°C")));
		assertNull(ConversaoTemperatura.valor(ax(0.5), escala(null, 150.0, "°C")));
	}

	@Test
	@DisplayName("escala invertida ou de amplitude zero não converte")
	void escalaInvalida() {
		assertNull(ConversaoTemperatura.valor(ax(0.5), escala(150.0, -20.0, "°C")));
		assertNull(ConversaoTemperatura.valor(ax(0.5), escala(50.0, 50.0, "°C")));
	}

	@Test
	@DisplayName("a unidade vem do card, com °C como padrão")
	void unidade() {
		assertEquals("°F", ConversaoTemperatura.unidade(escala(32.0, 300.0, "°F")));
		assertEquals("°C", ConversaoTemperatura.unidade(escala(0.0, 100.0, null)));
		assertEquals("°C", ConversaoTemperatura.unidade(escala(0.0, 100.0, "  ")));
		assertEquals("°C", ConversaoTemperatura.unidade(null));
	}

	@Test
	@DisplayName("fora da faixa do amplificador a escala extrapola, e isso é dito no log pelo chamador")
	void foraDaFaixa() {
		var p = escala(0.0, 100.0, "°C");

		// Nao limita: abaixo de -50 significa laco aberto, e um valor claramente fora da escala
		// denuncia isso melhor que um zero limitado, que pareceria medicao real.
		assertEquals(-12.5, ConversaoTemperatura.valor(-150, p), 0.0001);
	}
}

package com.geopetro.desktop.services;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

import com.geopetro.desktop.services.AvaliadorLocalDeAlarme.Faixa;
import com.geopetro.desktop.services.AvaliadorLocalDeAlarme.Estado;
import com.geopetro.desktop.services.AvaliadorLocalDeAlarme.Severidade;

/**
 * A regra do alarme na borda — RN-068, RN-071.
 *
 * <p>⚠️ <b>Estas sequencias sao as MESMAS de {@code AvaliadorDeAlarmeTest} no Geopetro-Backend.</b>
 * A regra vale nos dois lados, e os projetos sao repositorios independentes sem biblioteca comum:
 * o que impede a deriva e exercitar aqui exatamente o que se exercita la. Mexer num sem mexer no
 * outro faria o operador na sonda ver um estado e a supervisao ver outro.
 *
 * <p>A diferenca esperada e o que NAO existe aqui: episodio, evento e gravacao. A estacao
 * sinaliza; quem registra e o Backend.
 */
class AvaliadorLocalDeAlarmeTest {

	private static final Instant T0 = Instant.parse("2026-09-09T12:00:00Z");

	/** Pressao: atencao acima de 100, critico acima de 120. Abre em 3 s, fecha em 5 s. */
	private static Faixa pressao() {
		return new Faixa(null, 100.0, null, 120.0, 3, 5);
	}

	/** Roda leituras de segundo em segundo e guarda cada severidade confirmada. */
	private static class Excursao {
		Estado estado = Estado.inicial();
		final List<Severidade> confirmadas = new ArrayList<>();
		final Faixa faixa;
		int segundo;

		Excursao(Faixa faixa) {
			this.faixa = faixa;
		}

		Excursao ler(double valor, int vezes) {
			for (int i = 0; i < vezes; i++) {
				estado = AvaliadorLocalDeAlarme.avaliar(estado, faixa, valor, T0.plusSeconds(segundo++));
				confirmadas.add(estado.confirmada());
			}
			return this;
		}

		Severidade atual() {
			return estado.confirmada();
		}

		/** Quantas vezes a severidade confirmada mudou — o equivalente aos fatos do servidor. */
		long transicoes() {
			long total = 0;
			Severidade anterior = null;
			for (Severidade severidade : confirmadas) {
				if (severidade != anterior) {
					total++;
					anterior = severidade;
				}
			}
			return total;
		}
	}

	@Nested
	@DisplayName("o tempo minimo, nas duas direcoes")
	class TempoMinimo {

		/**
		 * ⚠️ O ruido na fronteira e o motivo do tempo minimo: um destaque que acende e apaga a cada
		 * segundo ensina o operador a ignorar a tela.
		 */
		@Test
		void valorQueOscilaNaFronteiraNaoAcendeNada() {
			var excursao = new Excursao(pressao());
			for (int i = 0; i < 10; i++) {
				excursao.ler(105, 1).ler(95, 1);
			}
			assertNull(excursao.atual());
			assertEquals(0, excursao.transicoes());
		}

		@Test
		void acendeDepoisDeTresSegundosForaDaFaixaENaoAntes() {
			var excursao = new Excursao(pressao()).ler(105, 3);
			assertNull(excursao.atual(), "no terceiro a contagem completa 2 s; ainda nao");

			excursao.ler(105, 1);
			assertEquals(Severidade.ATENCAO, excursao.atual());
		}

		@Test
		void apagaComOTempoDeFecharENaoComODeAbrir() {
			var excursao = new Excursao(pressao()).ler(105, 4);
			assertEquals(Severidade.ATENCAO, excursao.atual());

			excursao.ler(90, 5);
			assertEquals(Severidade.ATENCAO, excursao.atual(), "5 s dentro da faixa, nao 3");

			excursao.ler(90, 1);
			assertNull(excursao.atual());
		}

		@Test
		void voltarAFaixaPorPoucoTempoNaoApaga() {
			var excursao = new Excursao(pressao()).ler(105, 4).ler(90, 3).ler(105, 3);
			assertEquals(Severidade.ATENCAO, excursao.atual());
		}
	}

	@Nested
	@DisplayName("a escalada")
	class Escalada {

		@Test
		void escalaEReduzNaMesmaExcursao() {
			var excursao = new Excursao(pressao()).ler(105, 4);
			assertEquals(Severidade.ATENCAO, excursao.atual());

			excursao.ler(130, 4);
			assertEquals(Severidade.CRITICO, excursao.atual());

			excursao.ler(105, 6);
			assertEquals(Severidade.ATENCAO, excursao.atual());

			excursao.ler(90, 6);
			assertNull(excursao.atual());

			assertEquals(4, excursao.transicoes(), "abriu, escalou, reduziu e fechou");
		}

		/** ⚠️ Salto direto para alem do critico e uma transicao so, ja em critico. */
		@Test
		void saltoDiretoParaCriticoNaoPassaPelaAtencao() {
			var excursao = new Excursao(pressao()).ler(200, 4);
			assertEquals(Severidade.CRITICO, excursao.atual());
			assertEquals(1, excursao.transicoes());
		}

		@Test
		void escalarEsperaOTempoDeAbrir() {
			var excursao = new Excursao(pressao()).ler(105, 4).ler(130, 3);
			assertEquals(Severidade.ATENCAO, excursao.atual());
			excursao.ler(130, 1);
			assertEquals(Severidade.CRITICO, excursao.atual());
		}
	}

	@Nested
	@DisplayName("casos de borda da configuracao")
	class Configuracao {

		@Test
		void limiteDeMinimoAcendePorBaixo() {
			var faixa = new Faixa(5000.0, null, 2000.0, null, 2, 2);
			var excursao = new Excursao(faixa).ler(1500, 3);
			assertEquals(Severidade.CRITICO, excursao.atual());
		}

		@Test
		void tempoZeroAcendeNaPrimeiraLeitura() {
			var faixa = new Faixa(null, 100.0, null, null, 0, 0);
			assertEquals(Severidade.ATENCAO, new Excursao(faixa).ler(105, 1).atual());
		}

		@Test
		void limiteDeUmLadoSoNaoAlarmaDoOutro() {
			var faixa = new Faixa(null, 100.0, null, null, 0, 0);
			assertNull(new Excursao(faixa).ler(-9999, 5).atual());
		}

		/** Valor nao finito nao e medicao: tratar como dentro da faixa apagaria um alarme aceso. */
		@Test
		void valorNaoFinitoNaoTemSeveridade() {
			assertNull(AvaliadorLocalDeAlarme.severidadeDe(pressao(), Double.NaN));
			assertNull(AvaliadorLocalDeAlarme.severidadeDe(pressao(), Double.POSITIVE_INFINITY));
		}
	}
}

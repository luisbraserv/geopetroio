package com.geopetro.desktop.calculos;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.OptionalDouble;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

/**
 * RN-120, RN-121 — pulsos por minuto do cardã pelo contador acumulado do LOGO!, e o RPM e a vazão
 * que saem deles.
 *
 * <p>O defeito mais caro aqui é o pico falso: uma virada ou um reinício do contador virando
 * milhares de RPM por um minuto inteiro, com alarme disparando sobre uma bomba normal.
 */
class VazaoCardaCalculatorServiceTest {

	private static final String BOMBA_A = "VAZAO_CARDA_01";
	private static final String BOMBA_B = "VAZAO_CARDA_02";

	private long agora = 1_000_000;
	private final VazaoCardaCalculatorService calculador = new VazaoCardaCalculatorService(() -> agora);

	/** Avança o relógio e lê: um ciclo de aquisição. */
	private OptionalDouble ciclo(String bomba, long contador, long passoMs) {
		agora += passoMs;
		return calculador.pulsosPorMinuto(bomba, contador);
	}

	/** Bombeia {@code pulsosPorSegundo} durante {@code segundos}, a 1 leitura/s, a partir de {@code inicio}. */
	private OptionalDouble bombear(String bomba, long inicio, int pulsosPorSegundo, int segundos) {
		OptionalDouble ppm = OptionalDouble.empty();
		for (int s = 1; s <= segundos; s++) {
			ppm = ciclo(bomba, (inicio + (long) s * pulsosPorSegundo) % VazaoCardaCalculatorService.MODULO_CONTADOR, 1_000);
		}
		return ppm;
	}

	@Nested
	@DisplayName("pulsos por minuto")
	class PulsosPorMinuto {

		@Test
		@DisplayName("600 pulsos em 60 s são 600 pulsos/min")
		void conferencia() {
			ciclo(BOMBA_A, 0, 0);

			assertEquals(600.0, bombear(BOMBA_A, 0, 10, 60).orElseThrow(), 1e-9);
		}

		@Test
		@DisplayName("sem 60 s de janela não há número: 'Coletando dados'")
		void coletando() {
			assertTrue(ciclo(BOMBA_A, 0, 0).isEmpty(), "a primeira leitura só semeia");
			assertTrue(bombear(BOMBA_A, 0, 10, 59).isEmpty(), "59 s ainda não é janela");
			assertTrue(ciclo(BOMBA_A, 600, 1_000).isPresent(), "com 60 s, sai o número");
		}

		@Test
		@DisplayName("usa o tempo real: uma leitura atrasada não infla o resultado")
		void tempoReal() {
			// 10 pulsos/s constantes, mas a ultima leitura chega 1,3 s depois da anterior.
			ciclo(BOMBA_A, 0, 0);
			bombear(BOMBA_A, 0, 10, 59);
			OptionalDouble ppm = ciclo(BOMBA_A, 603, 1_300);

			// 603 pulsos em 60,3 s: 600/min. Dividir por 60 fixo daria 603.
			assertEquals(600.0, ppm.orElseThrow(), 1e-9);
		}

		@Test
		@DisplayName("a janela anda: a referência é a leitura mais recente com 60 s de idade")
		void janelaMovel() {
			ciclo(BOMBA_A, 0, 0);
			bombear(BOMBA_A, 0, 10, 60);
			// Agora a bomba dobra o ritmo por um minuto inteiro.
			assertEquals(1200.0, bombear(BOMBA_A, 600, 20, 60).orElseThrow(), 1e-9);
		}

		@Test
		@DisplayName("contador parado com a janela completa dá 0,00 — não 'sem valor'")
		void bombaParada() {
			ciclo(BOMBA_A, 4_321, 0);

			assertEquals(0.0, bombear(BOMBA_A, 4_321, 0, 60).orElseThrow());
		}

		@Test
		@DisplayName("depois que a bomba para, o resultado chega a zero em até 60 s")
		void paradaLevaAteUmMinuto() {
			ciclo(BOMBA_A, 0, 0);
			bombear(BOMBA_A, 0, 10, 60);

			assertEquals(300.0, bombear(BOMBA_A, 600, 0, 30).orElseThrow(), 1e-9,
					"metade da janela ainda tem pulsos");
			assertEquals(0.0, bombear(BOMBA_A, 600, 0, 30).orElseThrow(), 1e-9);
		}

		@Test
		@DisplayName("falha de leitura não é bomba parada: a próxima leitura conta os pulsos do intervalo")
		void lacunaDeLeitura() {
			ciclo(BOMBA_A, 0, 0);
			bombear(BOMBA_A, 0, 10, 40);
			// 20 s sem leitura; o contador seguiu contando.
			assertEquals(600.0, ciclo(BOMBA_A, 600, 20_000).orElseThrow(), 1e-9);
		}

		@Test
		@DisplayName("duas bombas não misturam janelas")
		void duasBombas() {
			ciclo(BOMBA_A, 0, 0);
			calculador.pulsosPorMinuto(BOMBA_B, 500_000);
			OptionalDouble a = OptionalDouble.empty();
			OptionalDouble b = OptionalDouble.empty();
			for (int s = 1; s <= 60; s++) {
				a = ciclo(BOMBA_A, s * 10L, 1_000);
				b = calculador.pulsosPorMinuto(BOMBA_B, 500_000 + s * 5L);
			}

			assertEquals(600.0, a.orElseThrow(), 1e-9);
			assertEquals(300.0, b.orElseThrow(), 1e-9);
		}

		@Test
		@DisplayName("reconexão recomeça a janela")
		void reconexao() {
			ciclo(BOMBA_A, 0, 0);
			bombear(BOMBA_A, 0, 10, 60);

			calculador.reset();

			assertTrue(ciclo(BOMBA_A, 610, 1_000).isEmpty());
			assertTrue(bombear(BOMBA_A, 610, 10, 59).isEmpty(), "reconstruindo a janela");
		}
	}

	@Nested
	@DisplayName("virada e reinício — RN-121")
	class ContadorDoLogo {

		@Test
		@DisplayName("a virada em 999.999 conta normalmente, sem pico e sem perder a janela")
		void virada() {
			long inicio = 999_700;
			ciclo(BOMBA_A, inicio, 0);
			// 60 s a 10 pulsos/s passam pela virada no meio da janela.
			assertEquals(600.0, bombear(BOMBA_A, inicio, 10, 60).orElseThrow(), 1e-9);
		}

		@Test
		@DisplayName("contador zerado no CLP é reinício: a janela recomeça, sem pico")
		void reinicio() {
			ciclo(BOMBA_A, 500_000, 0);
			bombear(BOMBA_A, 500_000, 10, 60);

			// De ~500.600 para 3: modulo 1.000.000 seriam ~499.403 pulsos em 1 s.
			assertTrue(ciclo(BOMBA_A, 3, 1_000).isEmpty(), "reinício não vira pico");
			assertTrue(bombear(BOMBA_A, 3, 10, 59).isEmpty());
			assertEquals(600.0, ciclo(BOMBA_A, 603, 1_000).orElseThrow(), 1e-9);
		}

		@Test
		@DisplayName("valor fora de 0..999.999 não é contador LOGO!: a janela recomeça")
		void valorInvalido() {
			ciclo(BOMBA_A, 0, 0);
			bombear(BOMBA_A, 0, 10, 60);

			assertTrue(ciclo(BOMBA_A, -1, 1_000).isEmpty());
			assertTrue(ciclo(BOMBA_A, 1_000_000, 1_000).isEmpty());
			assertTrue(ciclo(BOMBA_A, 620, 1_000).isEmpty(), "recomeça do zero");
		}
	}

	@Nested
	@DisplayName("RPM e vazão")
	class RpmEVazao {

		@Test
		@DisplayName("RPM = (N × 60) / (t × P): 600 pulsos/min com 1 pulso por volta são 600 RPM")
		void rpmUmPulsoPorVolta() {
			assertEquals(600.0, VazaoCardaCalculatorService.rpmDoCarda(600.0, 1), 1e-12);
		}

		@Test
		@DisplayName("com 4 alvos por volta, 2.400 pulsos/min continuam sendo 600 RPM")
		void rpmQuatroPulsosPorVolta() {
			assertEquals(600.0, VazaoCardaCalculatorService.rpmDoCarda(2_400.0, 4), 1e-12);
		}

		@Test
		@DisplayName("vazão = (N × K × 60) / t, com K de 8 casas")
		void vazao() {
			assertEquals(600.0 * 0.00012345, VazaoCardaCalculatorService.vazaoBblPorMinuto(600.0, 0.00012345), 1e-15);
		}

		@Test
		@DisplayName("⚠️ a vazão não passa por P: K já é por pulso")
		void vazaoNaoDividePorP() {
			// 4 alvos por volta: 2.400 pulsos/min. A vazao e 2.400 × K, nao 600 × K.
			double vazao = VazaoCardaCalculatorService.vazaoBblPorMinuto(2_400.0, 0.001);

			assertEquals(2.4, vazao, 1e-12);
		}

		@Test
		@DisplayName("sem P ou K válidos, a grandeza correspondente fica sem valor")
		void semParametros() {
			assertNull(VazaoCardaCalculatorService.rpmDoCarda(600.0, null));
			assertNull(VazaoCardaCalculatorService.rpmDoCarda(600.0, 0));
			assertNull(VazaoCardaCalculatorService.vazaoBblPorMinuto(600.0, null));
			assertNull(VazaoCardaCalculatorService.vazaoBblPorMinuto(600.0, 0.0));
			assertNull(VazaoCardaCalculatorService.vazaoBblPorMinuto(600.0, -0.001));
		}
	}
}

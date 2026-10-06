package com.geopetro.alarmes;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

import com.geopetro.alarmes.AvaliadorDeAlarme.Estado;
import com.geopetro.alarmes.EventoAlarme.LimiteViolado;
import com.geopetro.alarmes.EventoAlarme.Severidade;
import com.geopetro.alarmes.EventoAlarme.Tipo;
import com.geopetro.configuracaosonda.ConfiguracaoSonda.Limite;

/**
 * A regra do alarme, exercitada como sequencia de leituras num relogio de mentira — RN-068, RN-071.
 *
 * <p>Cada teste e uma excursao inteira. Assertar so o estado final esconderia o que importa: <b>o
 * que virou fato pelo caminho</b>, que e exatamente o que o operador vai ler no historico.
 */
class AvaliadorDeAlarmeTest {

	private static final Instant T0 = Instant.parse("2026-09-09T12:00:00Z");
	private static final long UNIDADE = 7L;

	/** Pressao: atencao acima de 100, critico acima de 120. Abre em 3 s, fecha em 5 s. */
	private static Limite pressao() {
		return new Limite("PRESSAO_01", null, null, 100.0, null, 120.0, 3, 5, true);
	}

	/** Roda uma sequencia de leituras, uma por segundo, e devolve os fatos que ela produziu. */
	private static class Excursao {
		Estado estado = Estado.inicial();
		final List<EventoAlarme> fatos = new ArrayList<>();
		final Limite limite;
		int segundo;

		Excursao(Limite limite) {
			this.limite = limite;
		}

		Excursao ler(double valor, int vezes) {
			for (int i = 0; i < vezes; i++) {
				var resultado = AvaliadorDeAlarme.avaliar(estado, limite, UNIDADE, valor,
						T0.plusSeconds(segundo++));
				estado = resultado.estado();
				if (resultado.evento() != null) {
					fatos.add(resultado.evento());
				}
			}
			return this;
		}

		List<Tipo> tipos() {
			return fatos.stream().map(EventoAlarme::tipo).toList();
		}
	}

	@Nested
	@DisplayName("o tempo minimo, nas duas direcoes")
	class TempoMinimo {

		/**
		 * ⚠️ O ruido na fronteira e o motivo de a feature existir com tempo minimo: um alarme que
		 * abre e fecha a cada segundo ensina o operador a ignora-lo.
		 */
		@Test
		void valorQueOscilaNaFronteiraNaoGeraFatoNenhum() {
			var excursao = new Excursao(pressao());
			for (int i = 0; i < 10; i++) {
				excursao.ler(105, 1).ler(95, 1);
			}
			assertThat(excursao.fatos).isEmpty();
			assertThat(excursao.estado.temEpisodioAberto()).isFalse();
		}

		@Test
		void abreDepoisDeTresSegundosForaDaFaixaENaoAntes() {
			var excursao = new Excursao(pressao()).ler(105, 3);
			// T0, T0+1, T0+2: no terceiro a contagem completa 2 s. Ainda nao.
			assertThat(excursao.fatos).isEmpty();

			excursao.ler(105, 1);
			assertThat(excursao.tipos()).containsExactly(Tipo.ABRIU);
			assertThat(excursao.fatos.get(0).ocorridoEm()).isEqualTo(T0.plusSeconds(3));
			assertThat(excursao.fatos.get(0).severidade()).isEqualTo(Severidade.ATENCAO);
			assertThat(excursao.fatos.get(0).limiteViolado()).isEqualTo(LimiteViolado.MAX);
		}

		/** Fechar espera o SEU tempo, que e outro: 5 s dentro da faixa, nao 3. */
		@Test
		void fechaComOTempoDeFecharENaoComODeAbrir() {
			var excursao = new Excursao(pressao()).ler(105, 4);
			assertThat(excursao.tipos()).containsExactly(Tipo.ABRIU);

			excursao.ler(90, 5);
			assertThat(excursao.tipos()).containsExactly(Tipo.ABRIU);

			excursao.ler(90, 1);
			assertThat(excursao.tipos()).containsExactly(Tipo.ABRIU, Tipo.FECHOU);
			assertThat(excursao.estado.temEpisodioAberto()).isFalse();
		}

		/** Uma volta rapida a faixa nao fecha nada: a contagem recomeca quando a leitura muda. */
		@Test
		void voltarAFaixaPorPoucoTempoNaoFechaOEpisodio() {
			var excursao = new Excursao(pressao()).ler(105, 4).ler(90, 3).ler(105, 3);
			assertThat(excursao.tipos()).containsExactly(Tipo.ABRIU);
			assertThat(excursao.estado.temEpisodioAberto()).isTrue();
		}
	}

	@Nested
	@DisplayName("o episodio que escala")
	class Escalada {

		/** A escalada e mais um fato do MESMO episodio — e por isso o episodioId sobrevive. */
		@Test
		void escalaEReduzDentroDoMesmoEpisodio() {
			var excursao = new Excursao(pressao()).ler(105, 4);
			String episodio = excursao.fatos.get(0).episodioId();

			excursao.ler(130, 4);
			excursao.ler(105, 6);
			excursao.ler(90, 6);

			assertThat(excursao.tipos()).containsExactly(Tipo.ABRIU, Tipo.ESCALOU, Tipo.REDUZIU, Tipo.FECHOU);
			assertThat(excursao.fatos).allSatisfy(f -> assertThat(f.episodioId()).isEqualTo(episodio));
			assertThat(excursao.fatos.get(3).severidade())
					.as("o FECHOU diz em que severidade o episodio terminou")
					.isEqualTo(Severidade.ATENCAO);
		}

		/**
		 * ⚠️ Um salto direto para alem do critico e UM fato, nao dois. Inventar o ABRIU em atencao
		 * registraria uma escalada que nunca houve.
		 */
		@Test
		void saltoDiretoParaCriticoAbreUmaVezSoEmCritico() {
			var excursao = new Excursao(pressao()).ler(200, 4);
			assertThat(excursao.tipos()).containsExactly(Tipo.ABRIU);
			assertThat(excursao.fatos.get(0).severidade()).isEqualTo(Severidade.CRITICO);
		}

		/** Escalar e subir: espera o tempo de ABRIR, nao o de fechar. */
		@Test
		void escalarEsperaOTempoDeAbrir() {
			var excursao = new Excursao(pressao()).ler(105, 4).ler(130, 3);
			assertThat(excursao.tipos()).containsExactly(Tipo.ABRIU);
			excursao.ler(130, 1);
			assertThat(excursao.tipos()).containsExactly(Tipo.ABRIU, Tipo.ESCALOU);
		}
	}

	@Nested
	@DisplayName("qual lado da faixa, e o pior valor")
	class LadoEExtremo {

		@Test
		void limiteDeMinimoViolaPorBaixo() {
			var limite = new Limite("PESO_01", null, 5000.0, null, 2000.0, null, 2, 2, true);
			var excursao = new Excursao(limite).ler(1500, 3);
			assertThat(excursao.tipos()).containsExactly(Tipo.ABRIU);
			assertThat(excursao.fatos.get(0).severidade()).isEqualTo(Severidade.CRITICO);
			assertThat(excursao.fatos.get(0).limiteViolado()).isEqualTo(LimiteViolado.MIN);
		}

		@Test
		void oValorExtremoEOPiorDoEpisodio() {
			var excursao = new Excursao(pressao()).ler(105, 4).ler(180, 1).ler(130, 4);
			assertThat(excursao.estado.valorExtremo()).isEqualTo(180.0);
		}

		/**
		 * O extremo recomeca quando o lado violado troca: o pico antigo ja nao descreve o que esta
		 * acontecendo agora.
		 */
		@Test
		void trocarDeLadoRecomecaOExtremo() {
			var limite = new Limite("PRESSAO_01", null, 20.0, 100.0, 10.0, 120.0, 2, 30, true);
			var excursao = new Excursao(limite).ler(150, 3).ler(5, 1);
			assertThat(excursao.estado.limiteViolado()).isEqualTo(LimiteViolado.MIN);
			assertThat(excursao.estado.valorExtremo()).isEqualTo(5.0);
		}
	}

	@Nested
	@DisplayName("casos de borda da configuracao")
	class Configuracao {

		/** Tempo zero e imediato: quem configurou assim quer o fato na primeira leitura. */
		@Test
		void tempoZeroAbreNaPrimeiraLeitura() {
			var limite = new Limite("PRESSAO_01", null, null, 100.0, null, null, 0, 0, true);
			var excursao = new Excursao(limite).ler(105, 1);
			assertThat(excursao.tipos()).containsExactly(Tipo.ABRIU);
		}

		/** So um lado configurado nao inventa o outro: nada abaixo de faixa nenhuma. */
		@Test
		void limiteDeUmLadoSoNaoAlarmaDoOutro() {
			var limite = new Limite("PRESSAO_01", null, null, 100.0, null, null, 0, 0, true);
			var excursao = new Excursao(limite).ler(-9999, 5);
			assertThat(excursao.fatos).isEmpty();
		}

		/**
		 * Desativar o limite fecha o que estava aberto. ⚠️ Deixa-lo aberto o manteria na tela para
		 * sempre, sobre um limite que ja nao existe, e nada o fecharia.
		 */
		@Test
		void encerrarFechaOEpisodioSemEsperarTempoNenhum() {
			var excursao = new Excursao(pressao()).ler(105, 4).ler(180, 1);
			var resultado = AvaliadorDeAlarme.encerrar(excursao.estado, UNIDADE, "PRESSAO_01", null,
					T0.plusSeconds(60));

			assertThat(resultado.evento().tipo()).isEqualTo(Tipo.FECHOU);
			assertThat(resultado.evento().valor())
					.as("o FECHOU registra o extremo do episodio: nao houve leitura nova")
					.isEqualTo(180.0);
			assertThat(resultado.estado().temEpisodioAberto()).isFalse();
		}

		@Test
		void encerrarSemEpisodioAbertoNaoProduzFato() {
			assertThat(AvaliadorDeAlarme.encerrar(Estado.inicial(), UNIDADE, "PRESSAO_01", null, T0).evento())
					.isNull();
			assertThat(AvaliadorDeAlarme.encerrar(null, UNIDADE, "PRESSAO_01", null, T0).evento()).isNull();
		}
	}
}

package com.geopetro.cards;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.List;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

import com.geopetro.cards.ConfiguracaoCards.Alteracao;
import com.geopetro.cards.ConfiguracaoCards.Card;
import com.geopetro.cards.ConfiguracaoCards.Conexao;
import com.geopetro.cards.ConfiguracaoCards.FormaTanque;
import com.geopetro.cards.ConfiguracaoCards.Parametros;
import com.geopetro.cards.ConfiguracaoCards.Tipo;
import com.geopetro.core.exception.BusinessException;

/** RN-080, RN-081, RN-091 — o que o documento de cards aceita e o que recusa. */
class ConfiguracaoCardsTest {

	private static final Conexao CONEXAO = new Conexao("10.0.0.5", 0, 1, 1, 1000);

	private static Card card(String id, Tipo tipo, int byteInicial, int ordem, Parametros p) {
		return new Card(id, "Card " + ordem, tipo, byteInicial, true, true, ordem, p);
	}

	private static Parametros pressao() {
		return new Parametros(400.0, null, null, null, null, null, null, null, null, null, null, null);
	}

	private static Alteracao alteracao(List<Card> cards) {
		return new Alteracao(0, CONEXAO, cards);
	}

	@Nested
	@DisplayName("identidade — RN-081")
	class Identidade {

		@Test
		@DisplayName("card novo recebe id gerado no formato TIPO_NN")
		void geraId() {
			var cards = ConfiguracaoCards.validarEIdentificar(
					alteracao(List.of(card(null, Tipo.PRESSAO, 10, 0, pressao()))), List.of());

			assertThat(cards).singleElement().extracting(Card::dispositivoId).isEqualTo("PRESSAO_01");
		}

		@Test
		@DisplayName("numeracao e por tipo, dentro da unidade")
		void numeraPorTipo() {
			var cards = ConfiguracaoCards.validarEIdentificar(alteracao(List.of(
					card(null, Tipo.PRESSAO, 10, 0, pressao()),
					card(null, Tipo.PRESSAO, 12, 1, pressao()),
					card(null, Tipo.TEMPERATURA, 14, 2, escala(-50, 200)))), List.of());

			assertThat(cards).extracting(Card::dispositivoId)
					.containsExactly("PRESSAO_01", "PRESSAO_02", "TEMPERATURA_01");
		}

		@Test
		@DisplayName("numero nao se reaproveita: card desativado continua ocupando o seu")
		void naoReaproveitaNumero() {
			// TEMPERATURA_02 desativado permanece no documento (RN-091), entao o proximo e o 03.
			var existentes = List.of(
					card("TEMPERATURA_01", Tipo.TEMPERATURA, 14, 0, escala(-50, 200)),
					new Card("TEMPERATURA_02", "Antigo", Tipo.TEMPERATURA, 16, false, false, 1, escala(0, 100)));

			var cards = ConfiguracaoCards.validarEIdentificar(alteracao(List.of(
					existentes.get(0), existentes.get(1),
					card(null, Tipo.TEMPERATURA, 18, 2, escala(0, 150)))), existentes);

			assertThat(cards).extracting(Card::dispositivoId)
					.containsExactly("TEMPERATURA_01", "TEMPERATURA_02", "TEMPERATURA_03");
		}

		@Test
		@DisplayName("id inventado pelo cliente e recusado")
		void recusaIdInventado() {
			assertThatThrownBy(() -> ConfiguracaoCards.validarEIdentificar(
					alteracao(List.of(card("PRESSAO_99", Tipo.PRESSAO, 10, 0, pressao()))), List.of()))
					.isInstanceOf(BusinessException.class)
					.hasMessageContaining("gerado pelo servidor");
		}
	}

	@Nested
	@DisplayName("card nao se exclui — RN-091")
	class SemExclusao {

		@Test
		@DisplayName("omitir um card existente e recusado")
		void recusaRemocao() {
			var existentes = List.of(card("PRESSAO_01", Tipo.PRESSAO, 10, 0, pressao()));

			assertThatThrownBy(() -> ConfiguracaoCards.validarEIdentificar(alteracao(List.of()), existentes))
					.isInstanceOf(BusinessException.class)
					.hasMessageContaining("apenas desativado");
		}

		@Test
		@DisplayName("desativar e permitido, e preserva a identidade")
		void permiteDesativar() {
			var existentes = List.of(card("PRESSAO_01", Tipo.PRESSAO, 10, 0, pressao()));
			var desativado = new Card("PRESSAO_01", "Pressao", Tipo.PRESSAO, 10, false, false, 0, pressao());

			var cards = ConfiguracaoCards.validarEIdentificar(alteracao(List.of(desativado)), existentes);

			assertThat(cards).singleElement()
					.satisfies(c -> assertThat(c.dispositivoId()).isEqualTo("PRESSAO_01"))
					.satisfies(c -> assertThat(c.ativo()).isFalse());
		}
	}

	@Nested
	@DisplayName("parametros por tipo")
	class Parametrizacao {

		@Test
		@DisplayName("pressao exige o range do sensor")
		void pressaoExigeRange() {
			assertThatThrownBy(() -> ConfiguracaoCards.validarEIdentificar(
					alteracao(List.of(card(null, Tipo.PRESSAO, 10, 0, null))), List.of()))
					.hasMessageContaining("range do sensor");
		}

		@Test
		@DisplayName("temperatura exige minimo menor que maximo — RN-083")
		void temperaturaExigeEscalaCoerente() {
			assertThatCode(() -> ConfiguracaoCards.validarEIdentificar(
					alteracao(List.of(card(null, Tipo.TEMPERATURA, 10, 0, escala(-50, 200)))), List.of()))
					.doesNotThrowAnyException();

			assertThatThrownBy(() -> ConfiguracaoCards.validarEIdentificar(
					alteracao(List.of(card(null, Tipo.TEMPERATURA, 10, 0, escala(200, -50)))), List.of()))
					.hasMessageContaining("menor que o maximo");
		}

		@Test
		@DisplayName("tanque exige as dimensoes da forma escolhida — RN-084")
		void tanqueExigeDimensoesDaForma() {
			// Cilindrico vertical pede raio e altura; comprimento nao supre.
			var semAltura = new Parametros(null, null, null, null, FormaTanque.CILINDRICO_VERTICAL,
					2.0, null, 5.0, null, 0.2, 3.0, null);
			assertThatThrownBy(() -> ConfiguracaoCards.validarEIdentificar(
					alteracao(List.of(card(null, Tipo.NIVEL_TANQUE, 10, 0, semAltura))), List.of()))
					.hasMessageContaining("altura do tanque");

			var completo = new Parametros(null, null, null, null, FormaTanque.CILINDRICO_VERTICAL,
					2.0, 5.0, null, null, 0.2, 3.0, null);
			assertThatCode(() -> ConfiguracaoCards.validarEIdentificar(
					alteracao(List.of(card(null, Tipo.NIVEL_TANQUE, 10, 0, completo))), List.of()))
					.doesNotThrowAnyException();
		}

		@Test
		@DisplayName("a distancia minima do sensor deve ser menor que a maxima")
		void tanqueExigeDistanciaCoerente() {
			var invertido = new Parametros(null, null, null, null, FormaTanque.RETANGULAR,
					null, 3.0, 4.0, 2.0, 3.0, 0.2, null);
			assertThatThrownBy(() -> ConfiguracaoCards.validarEIdentificar(
					alteracao(List.of(card(null, Tipo.NIVEL_TANQUE, 10, 0, invertido))), List.of()))
					.hasMessageContaining("distancia minima");
		}

		@Test
		@DisplayName("contador de stroke exige a constante da bomba — RN-090")
		void strokeExigeConstante() {
			assertThatThrownBy(() -> ConfiguracaoCards.validarEIdentificar(
					alteracao(List.of(card(null, Tipo.CONTADOR_STROKE, 0, 0, null))), List.of()))
					.hasMessageContaining("constante da bomba");
		}

		@Test
		@DisplayName("peso e torque exigem o range do sensor: eles tambem leem um 4-20 mA")
		void pesoETorqueExigemRange() {
			// Sem o range nao ha como traduzir a posicao no laco em pressao, e e dela que a
			// geometria do sargento e da chave partem. Um default silencioso daria um peso
			// plausivel e errado.
			assertThatThrownBy(() -> ConfiguracaoCards.validarEIdentificar(
					alteracao(List.of(card(null, Tipo.PESO, 4, 0, null))), List.of()))
					.hasMessageContaining("range do sensor");

			assertThatThrownBy(() -> ConfiguracaoCards.validarEIdentificar(
					alteracao(List.of(card(null, Tipo.TORQUE, 6, 0, null))), List.of()))
					.hasMessageContaining("range do sensor");
		}

		@Test
		@DisplayName("com o range, peso e torque passam — a geometria fica na estacao")
		void pesoETorqueComRange() {
			var range = new ConfiguracaoCards.Parametros(400.0, null, null, null, null, null, null,
					null, null, null, null, null);

			assertThatCode(() -> ConfiguracaoCards.validarEIdentificar(alteracao(List.of(
					card(null, Tipo.PESO, 4, 0, range),
					card(null, Tipo.TORQUE, 6, 1, range))), List.of()))
					.doesNotThrowAnyException();
		}
	}

	@Nested
	@DisplayName("tamanho da leitura vem do tipo")
	class TamanhoPorTipo {

		@Test
		@DisplayName("analogico le Word e o contador le DWord")
		void tamanhoPorSinal() {
			assertThat(Tipo.PRESSAO.tamanhoEmBytes()).isEqualTo(2);
			assertThat(Tipo.TEMPERATURA.tamanhoEmBytes()).isEqualTo(2);
			assertThat(Tipo.NIVEL_TANQUE.tamanhoEmBytes()).isEqualTo(2);
			// Ler dois bytes de um contador de quatro daria um numero plausivel e errado.
			assertThat(Tipo.CONTADOR_STROKE.tamanhoEmBytes()).isEqualTo(4);
		}
	}

	@Nested
	@DisplayName("conexao e regras gerais")
	class Gerais {

		@Test
		@DisplayName("dois cards no mesmo endereco sao permitidos — RN-094")
		void permiteMesmoEndereco() {
			assertThatCode(() -> ConfiguracaoCards.validarEIdentificar(alteracao(List.of(
					card(null, Tipo.PRESSAO, 10, 0, pressao()),
					card(null, Tipo.PRESSAO, 10, 1, pressao()))), List.of()))
					.doesNotThrowAnyException();
		}

		@Test
		@DisplayName("duas posicoes iguais na tela sao recusadas")
		void recusaOrdemRepetida() {
			assertThatThrownBy(() -> ConfiguracaoCards.validarEIdentificar(alteracao(List.of(
					card(null, Tipo.PRESSAO, 10, 0, pressao()),
					card(null, Tipo.PRESSAO, 12, 0, pressao()))), List.of()))
					.hasMessageContaining("posicoes iguais");
		}

		@Test
		@DisplayName("conexao exige IP, e recusa rack, slot ou DB negativos")
		void validaConexao() {
			assertThatThrownBy(() -> ConfiguracaoCards.validarEIdentificar(
					new Alteracao(0, new Conexao("  ", 0, 1, 1, 1000), List.of()), List.of()))
					.hasMessageContaining("IP do CLP");

			assertThatThrownBy(() -> ConfiguracaoCards.validarEIdentificar(
					new Alteracao(0, new Conexao("10.0.0.5", -1, 1, 1, 1000), List.of()), List.of()))
					.hasMessageContaining("negativos");

			assertThatThrownBy(() -> ConfiguracaoCards.validarEIdentificar(
					new Alteracao(0, new Conexao("10.0.0.5", 0, 1, 1, 50), List.of()), List.of()))
					.hasMessageContaining("100 ms");
		}

		@Test
		@DisplayName("endereco negativo e recusado")
		void recusaEnderecoNegativo() {
			assertThatThrownBy(() -> ConfiguracaoCards.validarEIdentificar(
					alteracao(List.of(card(null, Tipo.PRESSAO, -1, 0, pressao()))), List.of()))
					.hasMessageContaining("Endereco negativo");
		}

		@Test
		@DisplayName("lista vazia e valida numa unidade sem cards — a frota nasce vazia")
		void listaVaziaEValida() {
			assertThatCode(() -> ConfiguracaoCards.validarEIdentificar(alteracao(List.of()), List.of()))
					.doesNotThrowAnyException();
		}
	}

	private static Parametros escala(double minimo, double maximo) {
		return new Parametros(null, minimo, maximo, "°C", null, null, null, null, null, null, null, null);
	}
}

package com.example.demo.models;

import java.util.List;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonInclude;

/**
 * O documento de cards de uma Unidade/Sonda, do lado do Desktop — RN-080.
 *
 * <p>Espelha {@code com.geopetro.cards.ConfiguracaoCards} do backend. São dois modelos porque são
 * dois processos: o backend usa Jackson 3 e valida como dono do dado; aqui a mesma forma existe
 * apenas para ler e devolver o JSON. Manter uma classe compartilhada exigiria um módulo comum entre
 * um Spring Boot 4 e um JavaFX, e acoplaria a versão do Jackson dos dois.
 *
 * <p>⚠️ <b>Se um campo mudar no backend, muda aqui.</b> {@code @JsonIgnoreProperties} evita que um
 * campo novo derrube a leitura, mas não avisa que ele existe — o contrato vive em
 * {@code specs/features/cards-configuraveis.md §5}.
 */
@JsonIgnoreProperties(ignoreUnknown = true)
public record CardsDaUnidade(int schemaVersion, long unidadeSondaId, long revisao,
		Conexao conexao, List<Card> cards, String atualizadoPor, String atualizadoEm)
		implements DocumentoDaUnidade {

	public CardsDaUnidade {
		cards = cards == null ? List.of() : List.copyOf(cards);
	}

	/** Documento de unidade ainda não configurada: revisão 0, nenhum card (RN-092). */
	public static CardsDaUnidade vazio(long unidadeSondaId) {
		return new CardsDaUnidade(1, unidadeSondaId, 0, null, List.of(), null, null);
	}

	public boolean configurada() {
		return !cards.isEmpty();
	}

	/** O que o PUT envia. Autoria e instante são do servidor, e por isso não vão daqui. */
	@JsonIgnoreProperties(ignoreUnknown = true)
	public record Alteracao(long revisao, Conexao conexao, List<Card> cards) {
	}

	public Alteracao paraAlteracao() {
		return new Alteracao(revisao, conexao, cards);
	}

	/** Endereçamento do CLP por unidade — encerra OQ-017 e OQ-018. */
	@JsonIgnoreProperties(ignoreUnknown = true)
	public record Conexao(String ip, int rack, int slot, int dbNumero, int intervaloLeituraMs) {

		/** O que a tela oferece antes de alguém digitar: os valores que hoje são constantes. */
		public static Conexao padrao() {
			return new Conexao("", 0, 1, 1, 1000);
		}
	}

	/**
	 * Um card.
	 *
	 * <p>{@code dispositivoId} vem do servidor e é imutável (RN-081). Card novo vai com
	 * {@code null} — quem numera é o backend, que enxerga todos os ids já usados na unidade.
	 */
	@JsonInclude(JsonInclude.Include.NON_NULL)
	@JsonIgnoreProperties(ignoreUnknown = true)
	public record Card(String dispositivoId, String nome, Tipo tipo, int byteInicial,
			boolean ativo, boolean visivel, int ordem, Parametros parametros) {

		public boolean novo() {
			return dispositivoId == null || dispositivoId.isBlank();
		}

		/** Como aparece na lista: o id quando existe, "(novo)" enquanto o servidor não numerou. */
		public String identificacao() {
			return novo() ? "(novo)" : dispositivoId;
		}

		public Card comOrdem(int novaOrdem) {
			return new Card(dispositivoId, nome, tipo, byteInicial, ativo, visivel, novaOrdem, parametros);
		}

		public Card comAtivo(boolean novoAtivo) {
			return new Card(dispositivoId, nome, tipo, byteInicial, novoAtivo, visivel, ordem, parametros);
		}
	}

	/** Vocabulário fechado — RN-080. Tipo novo exige desenvolvimento, não configuração. */
	public enum Tipo {
		PESO("Peso", 2),
		TORQUE("Torque", 2),
		PRESSAO("Pressão", 2),
		TEMPERATURA("Temperatura", 2),
		NIVEL_TANQUE("Nível do tanque", 2),
		CONTADOR_STROKE("Contador de stroke", 4);

		private final String rotulo;
		private final int tamanhoEmBytes;

		Tipo(String rotulo, int tamanhoEmBytes) {
			this.rotulo = rotulo;
			this.tamanhoEmBytes = tamanhoEmBytes;
		}

		public String rotulo() {
			return rotulo;
		}

		/**
		 * O tamanho vem do tipo, não é escolhido na tela. Deixá-lo livre permitiria ler dois bytes
		 * de um contador de quatro e obter um número plausível e errado.
		 */
		public int tamanhoEmBytes() {
			return tamanhoEmBytes;
		}

		/** Como o endereço aparece na tela: {@code DBW10} para Word, {@code DBD0} para DWord. */
		public String enderecoLegivel(int byteInicial) {
			return (tamanhoEmBytes == 4 ? "DBD" : "DBW") + byteInicial;
		}

		@Override
		public String toString() {
			return rotulo;
		}
	}

	/** Forma do tanque — RN-084. O cilindro horizontal não é proporcional à altura. */
	public enum FormaTanque {
		CILINDRICO_VERTICAL("Cilíndrico vertical"),
		CILINDRICO_HORIZONTAL("Cilíndrico horizontal"),
		RETANGULAR("Retangular ou cúbico");

		private final String rotulo;

		FormaTanque(String rotulo) {
			this.rotulo = rotulo;
		}

		@Override
		public String toString() {
			return rotulo;
		}
	}

	/**
	 * Parâmetros de escala do sinal — todos opcionais porque cada tipo usa os seus.
	 *
	 * <p>⚠️ <b>Calibração de peso e torque não está aqui</b>, e sim na configuração local do
	 * Desktop, medida na unidade. O card de peso ou torque diz <b>onde ler</b>; quem converte é o
	 * {@code PesoColunaCalculator} com os parâmetros que já tem.
	 */
	@JsonInclude(JsonInclude.Include.NON_NULL)
	@JsonIgnoreProperties(ignoreUnknown = true)
	public record Parametros(
			Double rangeSensorBar,
			Double minimoEscala, Double maximoEscala, String unidade,
			FormaTanque forma, Double raio, Double altura, Double comprimento, Double largura,
			Double distanciaMinima, Double distanciaMaxima,
			Double constanteBomba) {

		public static Parametros vazio() {
			return new Parametros(null, null, null, null, null, null, null, null, null, null, null, null);
		}
	}
}

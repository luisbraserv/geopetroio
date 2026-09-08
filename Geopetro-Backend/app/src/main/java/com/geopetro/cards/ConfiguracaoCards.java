package com.geopetro.cards;

import java.time.Instant;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;

import com.geopetro.core.exception.BusinessException;

/**
 * Documento de cards de uma Unidade/Sonda — RN-080.
 *
 * <p><b>Separado do documento de limites</b>, com revisão própria e endpoint próprio (RN-089).
 * Num documento só, o cliente que ajusta um limite devolveria o documento inteiro — cards
 * inclusive — e a autorização viraria uma comparação campo a campo.
 *
 * <p>Este documento diz <b>o que a unidade lê</b>: onde no CLP, com que regra de conversão e com
 * que nome na tela. Sem ele a unidade não produz telemetria (RN-088).
 */
public record ConfiguracaoCards(int schemaVersion, long unidadeSondaId, long revisao,
		Conexao conexao, List<Card> cards, String atualizadoPor, Instant atualizadoEm) {

	public ConfiguracaoCards {
		cards = List.copyOf(cards);
	}

	/** O que o PUT recebe. Autoria e instante vêm do servidor. */
	public record Alteracao(long revisao, Conexao conexao, List<Card> cards) {
	}

	/**
	 * Endereçamento do CLP, por unidade — encerra OQ-017 e OQ-018.
	 *
	 * <p>Rack, slot e número do DB saíam do código; com o modelo de CLP variando por unidade,
	 * deixam de ser premissa global.
	 */
	public record Conexao(String ip, int rack, int slot, int dbNumero, int intervaloLeituraMs) {
	}

	/**
	 * Um card.
	 *
	 * <p>O {@code dispositivoId} é <b>gerado pelo servidor</b> e imutável (RN-081): o cliente envia
	 * {@code null} ao criar. O {@code nome} é rótulo de tela e nunca entra no histórico.
	 */
	public record Card(String dispositivoId, String nome, Tipo tipo, int byteInicial,
			boolean ativo, boolean visivel, int ordem, Parametros parametros) {
	}

	/** Vocabulário fechado — RN-080. Tipo novo exige desenvolvimento, não configuração. */
	public enum Tipo {
		PESO(Sinal.ANALOGICO),
		TORQUE(Sinal.ANALOGICO),
		PRESSAO(Sinal.ANALOGICO),
		TEMPERATURA(Sinal.ANALOGICO),
		NIVEL_TANQUE(Sinal.ANALOGICO),
		CONTADOR_STROKE(Sinal.DIGITAL);

		private final Sinal sinal;

		Tipo(Sinal sinal) {
			this.sinal = sinal;
		}

		/**
		 * O tamanho da leitura vem do tipo, não do payload. Deixá-lo livre permitiria ler dois
		 * bytes de um contador de quatro e obter um número plausível e errado.
		 */
		public int tamanhoEmBytes() {
			return sinal == Sinal.ANALOGICO ? 2 : 4;
		}
	}

	public enum Sinal {
		ANALOGICO, DIGITAL
	}

	/** Forma do tanque — RN-084. O cilindro horizontal não é proporcional à altura. */
	public enum FormaTanque {
		CILINDRICO_VERTICAL, CILINDRICO_HORIZONTAL, RETANGULAR
	}

	/**
	 * Parâmetros de escala do sinal.
	 *
	 * <h2>O que fica aqui e o que fica na estação</h2>
	 * A linha é <b>valor de placa</b> contra <b>medição de campo</b>:
	 *
	 * <table>
	 *   <tr><th>Aqui, no documento</th><th>Na estação, por {@code dispositivoId}</th></tr>
	 *   <tr><td>{@code rangeSensorBar} — fundo de escala do transmissor 4-20 mA, impresso nele</td>
	 *       <td>Sensibilidade: trim ajustado na unidade</td></tr>
	 *   <tr><td>Escala de temperatura, forma e dimensões do tanque — decisões de projeto</td>
	 *       <td>Geometria do sargento (8 parâmetros) e da chave hidráulica, medidas na unidade</td></tr>
	 * </table>
	 *
	 * <p>⚠️ <b>{@code rangeSensorBar} vale para peso e torque também</b>, não só para pressão: os
	 * três leem um transmissor 4-20 mA, e sem o range não há como traduzir a posição no laço em
	 * pressão — que é de onde a geometria parte.
	 *
	 * <p>⚠️ <b>A geometria não está aqui de propósito.</b> Trazê-la seria migração de valores
	 * calibrados, não acréscimo de campo. O card declara <b>onde ler e em que escala</b>; a estação
	 * aplica a calibração que mediu.
	 */
	public record Parametros(
			Double rangeSensorBar,
			Double minimoEscala, Double maximoEscala, String unidade,
			FormaTanque forma, Double raio, Double altura, Double comprimento, Double largura,
			Double distanciaMinima, Double distanciaMaxima,
			Double constanteBomba) {
	}

	private static final int MAXIMO_CARDS = 100;

	/**
	 * Valida a alteração e devolve os cards com id atribuído.
	 *
	 * @param existentes cards já gravados, para preservar id e impedir remoção
	 */
	public static List<Card> validarEIdentificar(Alteracao update, List<Card> existentes) {
		if (update == null || update.revisao() < 0 || update.cards() == null) {
			throw new BusinessException("Configuracao de cards invalida.");
		}
		if (update.cards().size() > MAXIMO_CARDS) {
			throw new BusinessException("Limite de " + MAXIMO_CARDS + " cards por unidade.");
		}
		validarConexao(update.conexao());

		Set<String> conhecidos = new HashSet<>();
		for (Card existente : existentes) {
			conhecidos.add(existente.dispositivoId());
		}

		List<Card> resultado = new ArrayList<>();
		Set<String> vistos = new HashSet<>();
		Set<Integer> ordens = new HashSet<>();
		for (Card card : update.cards()) {
			validarCard(card);
			String id = card.dispositivoId() == null || card.dispositivoId().isBlank()
					? proximoId(card.tipo(), existentes, resultado)
					: card.dispositivoId();
			if (card.dispositivoId() != null && !card.dispositivoId().isBlank() && !conhecidos.contains(id)) {
				throw new BusinessException("Card desconhecido: " + id + ". O id e gerado pelo servidor.");
			}
			if (!vistos.add(id)) {
				throw new BusinessException("Card repetido: " + id + ".");
			}
			if (!ordens.add(card.ordem())) {
				throw new BusinessException("Duas posicoes iguais na tela: ordem " + card.ordem() + ".");
			}
			resultado.add(new Card(id, card.nome().trim(), card.tipo(), card.byteInicial(),
					card.ativo(), card.visivel(), card.ordem(), card.parametros()));
		}

		// RN-091: card nao se exclui, se desativa. Sumir com um deixaria a serie no InfluxDB sem
		// nada que a explicasse.
		Set<String> removidos = new HashSet<>(conhecidos);
		removidos.removeAll(vistos);
		if (!removidos.isEmpty()) {
			throw new BusinessException("Card nao pode ser removido, apenas desativado: "
					+ String.join(", ", removidos) + ".");
		}
		return List.copyOf(resultado);
	}

	private static void validarConexao(Conexao conexao) {
		if (conexao == null || conexao.ip() == null || conexao.ip().isBlank()) {
			throw new BusinessException("Informe o IP do CLP.");
		}
		if (conexao.rack() < 0 || conexao.slot() < 0 || conexao.dbNumero() < 0) {
			throw new BusinessException("Rack, slot e numero do DB nao podem ser negativos.");
		}
		if (conexao.intervaloLeituraMs() < 100) {
			throw new BusinessException("O intervalo de leitura deve ser de ao menos 100 ms.");
		}
	}

	private static void validarCard(Card card) {
		if (card == null || card.tipo() == null) {
			throw new BusinessException("Card sem tipo.");
		}
		if (card.nome() == null || card.nome().isBlank()) {
			throw new BusinessException("Card sem nome.");
		}
		if (card.byteInicial() < 0) {
			throw new BusinessException("Endereco negativo no card " + card.nome() + ".");
		}
		if (card.ordem() < 0) {
			throw new BusinessException("Posicao negativa no card " + card.nome() + ".");
		}
		validarParametros(card);
	}

	private static void validarParametros(Card card) {
		Parametros p = card.parametros();
		switch (card.tipo()) {
			// Peso e torque tambem leem um transmissor 4-20 mA: sem o range nao ha como traduzir a
			// posicao no laco em pressao, e e dela que a geometria parte. O range e valor de placa
			// do transmissor, nao medicao de campo — por isso vive aqui, ao contrario da geometria.
			case PRESSAO, PESO, TORQUE -> exigirPositivo(p == null ? null : p.rangeSensorBar(),
					"Informe o range do sensor, em bar, no card " + card.nome() + ".");
			case TEMPERATURA -> {
				Double minimo = p == null ? null : p.minimoEscala();
				Double maximo = p == null ? null : p.maximoEscala();
				exigirFinito(minimo, "Informe o minimo da escala no card " + card.nome() + ".");
				exigirFinito(maximo, "Informe o maximo da escala no card " + card.nome() + ".");
				if (minimo >= maximo) {
					throw new BusinessException("O minimo da escala deve ser menor que o maximo no card "
							+ card.nome() + ".");
				}
			}
			case NIVEL_TANQUE -> validarTanque(card, p);
			case CONTADOR_STROKE -> exigirPositivo(p == null ? null : p.constanteBomba(),
					"Informe a constante da bomba no card " + card.nome() + ".");
		}
	}

	private static void validarTanque(Card card, Parametros p) {
		if (p == null || p.forma() == null) {
			throw new BusinessException("Informe a forma do tanque no card " + card.nome() + ".");
		}
		switch (p.forma()) {
			case CILINDRICO_VERTICAL -> {
				exigirPositivo(p.raio(), "Informe o raio do tanque no card " + card.nome() + ".");
				exigirPositivo(p.altura(), "Informe a altura do tanque no card " + card.nome() + ".");
			}
			case CILINDRICO_HORIZONTAL -> {
				exigirPositivo(p.raio(), "Informe o raio do tanque no card " + card.nome() + ".");
				exigirPositivo(p.comprimento(), "Informe o comprimento do tanque no card " + card.nome() + ".");
			}
			case RETANGULAR -> {
				exigirPositivo(p.comprimento(), "Informe o comprimento do tanque no card " + card.nome() + ".");
				exigirPositivo(p.largura(), "Informe a largura do tanque no card " + card.nome() + ".");
				exigirPositivo(p.altura(), "Informe a altura do tanque no card " + card.nome() + ".");
			}
		}
		exigirFinito(p.distanciaMinima(), "Informe a distancia minima do sensor no card " + card.nome() + ".");
		exigirFinito(p.distanciaMaxima(), "Informe a distancia maxima do sensor no card " + card.nome() + ".");
		if (p.distanciaMinima() >= p.distanciaMaxima()) {
			throw new BusinessException("A distancia minima deve ser menor que a maxima no card "
					+ card.nome() + ".");
		}
	}

	private static void exigirPositivo(Double valor, String mensagem) {
		if (valor == null || !Double.isFinite(valor) || valor <= 0) {
			throw new BusinessException(mensagem);
		}
	}

	private static void exigirFinito(Double valor, String mensagem) {
		if (valor == null || !Double.isFinite(valor)) {
			throw new BusinessException(mensagem);
		}
	}

	/**
	 * Próximo id do tipo, no formato {@code <TIPO>_<NN>} — RN-081.
	 *
	 * <p><b>Número não se reaproveita.</b> Como card não se exclui (RN-091), o maior número
	 * presente é o maior já usado: basta somar um.
	 */
	private static String proximoId(Tipo tipo, List<Card> existentes, List<Card> novos) {
		int maior = 0;
		String prefixo = tipo.name() + "_";
		for (List<Card> lista : List.of(existentes, novos)) {
			for (Card card : lista) {
				String id = card.dispositivoId();
				if (id != null && id.startsWith(prefixo)) {
					try {
						maior = Math.max(maior, Integer.parseInt(id.substring(prefixo.length())));
					} catch (NumberFormatException ignorado) {
						// Id fora do formato nao participa da numeracao.
					}
				}
			}
		}
		return String.format(Locale.ROOT, "%s%02d", prefixo, maior + 1);
	}
}

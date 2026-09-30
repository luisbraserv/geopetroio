package com.geopetro.cards;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

import com.geopetro.cards.ConfiguracaoCards.Card;
import com.geopetro.cards.ConfiguracaoCards.Tipo;

/**
 * As grandezas que um card produz — RN-090, RN-098.
 *
 * <h2>Por que isto precisa existir do lado do servidor</h2>
 * Um card não é uma grandeza. Um {@code CONTADOR_STROKE} produz <b>três</b> — contagem, vazão e
 * volume acumulado — sob o mesmo {@code dispositivoId}, separadas pelo campo {@code serie}
 * (RN-098). Todo outro tipo produz uma, com {@code serie} nula.
 *
 * <p>Enquanto o servidor só retransmitia leituras, essa diferença não o alcançava: cada mensagem já
 * vinha descrita (RN-097). Ela passa a importar quando o servidor precisa dizer <b>o que a unidade
 * mede</b> sem ter uma leitura em mãos — que é exatamente o que a configuração de um limite de
 * alarme pergunta.
 *
 * <h2>⚠️ Chavear por {@code dispositivoId} sozinho não serve</h2>
 * Um limite em cima de um card de stroke seria ambíguo: "acima de 8" é alarme plausível para vazão
 * e não quer dizer nada para volume acumulado, que só cresce. É o mesmo motivo que obrigou o filtro
 * {@code serie} na consulta ao histórico — sem ele as três séries voltavam misturadas na mesma
 * linha do tempo.
 *
 * <p>Espelha {@code services/grandezas-de-card.ts} no Front e {@code LeituraDeCards} no
 * Geopetro-Desktop, que é onde a regra nasce. Aqui interessa só <b>quais</b> grandezas existem;
 * rótulo, cor e unidade são assunto de tela, e conversão é assunto da borda.
 */
public final class GrandezasDeCard {

	/** As três séries de um contador de stroke — RN-098. */
	public static final String SERIE_STROKE = "stroke";
	public static final String SERIE_VAZAO = "vazao";
	public static final String SERIE_VOLUME = "volumeAcumulado";

	private GrandezasDeCard() {
	}

	/**
	 * Uma grandeza declarada pela unidade.
	 *
	 * @param serie {@code null} para card de uma grandeza só — o campo é ausente, não vazio
	 */
	public record Grandeza(String dispositivoId, String serie) {

		/**
		 * Identidade da grandeza numa coleção.
		 *
		 * <p>Precisa incluir a série porque as três de um contador <b>compartilham o
		 * {@code dispositivoId}</b>: chavear só por ele faria vazão sobrescrever stroke.
		 */
		public String chave() {
			return chave(dispositivoId, serie);
		}

		public static String chave(String dispositivoId, String serie) {
			return serie == null || serie.isBlank() ? dispositivoId : dispositivoId + "|" + serie;
		}
	}

	/**
	 * O vocabulário de limites da unidade: <b>tudo que ela declara</b>, ativo ou não.
	 *
	 * <p>⚠️ Inclui card desativado de propósito. Desativar para de ler e de publicar (RN-091), mas o
	 * limite correspondente <b>hiberna junto</b>, sem ser apagado — quem reativa o card no dia
	 * seguinte encontra o limite que já tinha ajustado.
	 */
	public static List<Grandeza> declaradas(List<Card> cards) {
		return grandezas(cards, false);
	}

	/**
	 * O que a unidade efetivamente lê agora — o que a avaliação de alarme percorre.
	 *
	 * <p>Filtra por {@code ativo} e não por {@code visivel}: visibilidade controla publicação na
	 * tela, não leitura (RN-037).
	 */
	public static List<Grandeza> ativas(List<Card> cards) {
		return grandezas(cards, true);
	}

	/** As grandezas de um card só. */
	public static List<Grandeza> de(Card card) {
		if (card == null || card.tipo() == null || card.dispositivoId() == null
				|| card.dispositivoId().isBlank()) {
			return List.of();
		}
		List<Grandeza> resultado = new ArrayList<>();
		for (String serie : seriesDe(card.tipo())) {
			resultado.add(new Grandeza(card.dispositivoId(), serie));
		}
		return List.copyOf(resultado);
	}

	private static List<Grandeza> grandezas(List<Card> cards, boolean somenteAtivos) {
		if (cards == null || cards.isEmpty()) {
			return List.of();
		}
		List<Grandeza> resultado = new ArrayList<>();
		for (Card card : cards) {
			if (card != null && (!somenteAtivos || card.ativo())) {
				resultado.addAll(de(card));
			}
		}
		return List.copyOf(resultado);
	}

	/** Um contador de stroke rende três séries; os demais tipos, uma sem série. */
	private static List<String> seriesDe(Tipo tipo) {
		return tipo == Tipo.CONTADOR_STROKE
				? List.of(SERIE_STROKE, SERIE_VAZAO, SERIE_VOLUME)
				: Collections.singletonList(null);
	}
}

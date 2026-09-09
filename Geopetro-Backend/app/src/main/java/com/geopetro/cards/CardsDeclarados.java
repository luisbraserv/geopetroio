package com.geopetro.cards;

import java.util.Arrays;
import java.util.List;

import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import com.geopetro.cards.ConfiguracaoCards.Card;

import tools.jackson.databind.json.JsonMapper;

/**
 * Lê o documento de cards de uma unidade, para quem <b>já verificou o acesso</b>.
 *
 * <h2>⚠️ Esta classe não autoriza nada</h2>
 * {@link ConfiguracaoCardsService} é a porta de entrada com autorização — use-a para atender
 * requisição de usuário. Esta existe para o caminho interno em que a autorização <b>já aconteceu</b>
 * e repeti-la aplicaria a regra errada: quem grava um limite de alarme é quem enxerga a sonda,
 * inclusive {@code CLIENTE} (RN-069), enquanto o documento de cards se escreve só com {@code ADMIN}
 * ou {@code SUPORTE} (RN-086). Passar pela outra porta faria a regra mais estrita valer sobre uma
 * leitura que só serve para saber <b>o que a unidade mede</b>.
 *
 * <p>Unidade sem documento devolve lista vazia — estado normal, não erro: a frota nasce vazia
 * (RN-092) e unidade sem card não lê nada (RN-088).
 */
@Component
public class CardsDeclarados {

	private static final JsonMapper JSON = JsonMapper.builder().build();

	private final ConfiguracaoCardsRepository repository;

	public CardsDeclarados(ConfiguracaoCardsRepository repository) {
		this.repository = repository;
	}

	@Transactional(readOnly = true)
	public List<Card> de(long unidadeSondaId) {
		return repository.findById(unidadeSondaId).map(CardsDeclarados::cards).orElseGet(List::of);
	}

	/** Um só lugar desserializa a coluna, para os dois caminhos não divergirem. */
	static List<Card> cards(ConfiguracaoCardsEntity entity) {
		return Arrays.asList(JSON.readValue(entity.cardsJson, Card[].class));
	}
}

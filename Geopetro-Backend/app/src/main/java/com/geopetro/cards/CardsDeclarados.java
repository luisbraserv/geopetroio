package com.geopetro.cards;

import java.time.Instant;
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

	/**
	 * Quantos cards cada unidade declara — sem carregar o documento inteiro para quem chama.
	 *
	 * <p>Uma consulta para a frota toda, e não uma por unidade: a tela de prontidão pergunta por
	 * todas de uma vez, e {@code N} idas ao banco cresceriam com a frota sem necessidade.
	 *
	 * @param ativos cards que a unidade realmente lê; {@code declarados} inclui os desativados,
	 *               porque eles continuam no documento (RN-091)
	 */
	public record Resumo(long unidadeSondaId, long revisao, int ativos, int declarados,
			String atualizadoPor, Instant atualizadoEm) {
	}

	@Transactional(readOnly = true)
	public List<Resumo> resumos() {
		return repository.findAll().stream().map(entity -> {
			List<Card> cards = cards(entity);
			int ativos = (int) cards.stream().filter(Card::ativo).count();
			return new Resumo(entity.unidadeSondaId, entity.version + 1, ativos, cards.size(),
					entity.atualizadoPor, entity.atualizadoEm);
		}).toList();
	}

	/** Um só lugar desserializa a coluna, para os dois caminhos não divergirem. */
	static List<Card> cards(ConfiguracaoCardsEntity entity) {
		return Arrays.asList(JSON.readValue(entity.cardsJson, Card[].class));
	}
}
